import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageAssignment } from '@/lib/auth/assignment-access'
import { linkReachesGroup } from '@/lib/classroom-groups'
import { fetchAllRows, SUPABASE_IN_FILTER_CHUNK_SIZE } from '@/lib/supabase/fetch-all-rows'
import { isAssignmentReminderId, missingSubmissionStudentIds, reminderAssignmentIsPublished } from '@/lib/assignment-reminders'

const SEND_ERROR = 'เผยแพร่งานแล้ว แต่แจ้งนักเรียนไม่สำเร็จ กรุณาลองเผยแพร่หรือบันทึกการมอบหมายอีกครั้ง'
type PublicationResult = { success: true; notified: number } | { error: string }
type PublicationLink = { classroom_id: string; group_ids: string[] | null }

async function rowsForIds<T>(ids: string[], query: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = []
  for (let offset = 0; offset < ids.length; offset += SUPABASE_IN_FILTER_CHUNK_SIZE) {
    const result = await fetchAllRows<T>((from, to) => query(ids.slice(offset, offset + SUPABASE_IN_FILTER_CHUNK_SIZE), from, to))
    if (result.error) return { rows: [] as T[], error: result.error }
    rows.push(...result.rows)
  }
  return { rows, error: null }
}

/** Called only after a successful publish/audience write. This is server-only,
 * but still verifies its own actor rather than trusting a caller-supplied ID.
 * Existing classroom_post rows without a related assignment remain ordinary
 * posts. Lifetime recipient+assignment dedupe spans read and unread notices;
 * the lookup/insert is not an exactly-once protocol across concurrent hooks. */
export async function notifyAssignmentPublished(assignmentId: string, actorId: string): Promise<PublicationResult> {
  if (!isAssignmentReminderId(assignmentId) || !isAssignmentReminderId(actorId)) return { error: SEND_ERROR }
  let notified = 0
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user || user.id !== actorId) return { error: SEND_ERROR }
    const { data: profile, error: profileError } = await supabase.from('users').select('role, status').eq('id', user.id).maybeSingle()
    if (profileError || !profile || profile.status !== 'active' || !['teacher', 'admin'].includes(profile.role)) return { error: SEND_ERROR }
    if (!await canManageAssignment(assignmentId, user.id)) return { error: SEND_ERROR }
    const { data: assignment, error: assignmentError } = await supabase.from('assignments')
      .select('id, title, org_id, status, mode, type').eq('id', assignmentId).maybeSingle()
    if (assignmentError || !assignment || !isAssignmentReminderId(assignment.org_id)
      || !reminderAssignmentIsPublished(assignment)) return { error: SEND_ERROR }

    const admin = createAdminClient()
    // A co-teacher's session can hide links to other classrooms. Enumerate the
    // full canonical link set only after exact assignment authority, then
    // require management of every room before reading any learner roster.
    const links = await fetchAllRows<PublicationLink>((from, to) => admin.from('assignment_classrooms')
      .select('classroom_id, group_ids').eq('assignment_id', assignmentId).order('classroom_id').range(from, to))
    if (links.error || links.rows.some(link => !isAssignmentReminderId(link.classroom_id)
      || (link.group_ids !== null && (!Array.isArray(link.group_ids) || !link.group_ids.every(isAssignmentReminderId))))) return { error: SEND_ERROR }
    const roomIds = [...new Set(links.rows.map(link => link.classroom_id))]
    if (roomIds.length === 0) return { success: true, notified: 0 }
    const [rooms, coTeachers] = await Promise.all([
      rowsForIds<{ id: string; teacher_id: string; status: string }>(roomIds, (chunk, from, to) => supabase.from('classrooms')
        .select('id, teacher_id, status').in('id', chunk).order('id').range(from, to)),
      rowsForIds<{ classroom_id: string }>(roomIds, (chunk, from, to) => supabase.from('classroom_co_teachers')
        .select('classroom_id').eq('user_id', user.id).in('classroom_id', chunk).in('permission', ['admin', 'manage'])
        .order('classroom_id').range(from, to)),
    ])
    if (rooms.error || coTeachers.error) return { error: SEND_ERROR }
    const roomById = new Map(rooms.rows.map(room => [room.id, room]))
    const coManaged = new Set(coTeachers.rows.map(row => row.classroom_id))
    if (roomIds.some(id => {
      const room = roomById.get(id)
      return !room || room.status !== 'active' || (room.teacher_id !== user.id && !coManaged.has(id))
    })) return { error: SEND_ERROR }

    const recipientRoom = new Map<string, string>()
    // Stable classroom ordering makes one shared-roster student's notice use
    // a single deterministic, currently authorized classroom link.
    for (const link of links.rows) {
      const roster = await fetchAllRows<{ student_id: string }>((from, to) => admin.from('classroom_students')
        .select('student_id').eq('classroom_id', link.classroom_id).order('student_id').range(from, to))
      if (roster.error) return { error: SEND_ERROR }
      const rosterIds = [...new Set(roster.rows.map(row => row.student_id))]
      if (rosterIds.some(id => !isAssignmentReminderId(id))) return { error: SEND_ERROR }
      const active = await rowsForIds<{ id: string }>(rosterIds, (chunk, from, to) => admin.from('users')
        .select('id').in('id', chunk).eq('role', 'student').eq('status', 'active').order('id').range(from, to))
      if (active.error) return { error: SEND_ERROR }
      const activeIds = active.rows.map(row => row.id)
      const groupOf = new Map<string, string>()
      if (link.group_ids !== null) {
        const memberships = await rowsForIds<{ student_id: string; group_id: string }>(activeIds, (chunk, from, to) => admin.from('classroom_group_members')
          .select('student_id, group_id').eq('classroom_id', link.classroom_id).in('student_id', chunk).order('student_id').range(from, to))
        if (memberships.error) return { error: SEND_ERROR }
        for (const row of memberships.rows) groupOf.set(row.student_id, row.group_id)
      }
      for (const id of activeIds) if (!recipientRoom.has(id) && linkReachesGroup(link.group_ids, groupOf.get(id))) recipientRoom.set(id, link.classroom_id)
    }
    const recipientIds = [...recipientRoom.keys()]
    if (recipientIds.length === 0) return { success: true, notified: 0 }
    const prior = await rowsForIds<{ recipient_id: string }>(recipientIds, (chunk, from, to) => admin.from('notifications')
      .select('recipient_id').eq('type', 'classroom_post').eq('related_assignment_id', assignmentId)
      .in('recipient_id', chunk).order('id').range(from, to))
    if (prior.error) return { error: SEND_ERROR }
    const alreadyNotified = new Set(prior.rows.map(row => row.recipient_id))
    const candidates = recipientIds.filter(id => !alreadyNotified.has(id))
    const submitted = await rowsForIds<{ student_id: string; status: string }>(candidates, (chunk, from, to) => admin.from('submissions')
      .select('student_id, status').eq('assignment_id', assignmentId).in('student_id', chunk)
      .in('status', ['submitted', 'graded']).order('id').range(from, to))
    if (submitted.error) return { error: SEND_ERROR }
    const targets = missingSubmissionStudentIds(candidates, submitted.rows)
    for (let offset = 0; offset < targets.length; offset += SUPABASE_IN_FILTER_CHUNK_SIZE) {
      const batch = targets.slice(offset, offset + SUPABASE_IN_FILTER_CHUNK_SIZE)
      const { data, error } = await admin.from('notifications').insert(batch.map(recipient_id => ({
        recipient_id, org_id: assignment.org_id, actor_id: user.id, type: 'classroom_post' as const,
        related_assignment_id: assignmentId, related_classroom_id: recipientRoom.get(recipient_id)!,
        title: `${assignment.type === 'exam' ? 'มีข้อสอบใหม่' : 'มีแบบฝึกหัดใหม่'}: ${assignment.title}`,
        body: 'ครูมอบหมายงานใหม่ให้คุณ กรุณาตรวจรายละเอียดและกำหนดส่งในห้องเรียน',
        link: `/classrooms/${recipientRoom.get(recipient_id)}`,
      }))).select('id')
      if (error || !data || data.length !== batch.length) return { error: notified > 0
        ? `เผยแพร่งานแล้วและแจ้งนักเรียนสำเร็จ ${notified} คน แต่ยังแจ้งไม่ครบ กรุณาบันทึกการมอบหมายอีกครั้ง` : SEND_ERROR }
      notified += data.length
    }
    return { success: true, notified }
  } catch {
    return { error: notified > 0 ? `เผยแพร่งานแล้วและแจ้งนักเรียนสำเร็จ ${notified} คน แต่ยังแจ้งไม่ครบ กรุณาบันทึกการมอบหมายอีกครั้ง` : SEND_ERROR }
  }
}
