'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Notification } from '@/lib/types'
import { canManageAssignment } from '@/lib/auth/assignment-access'
import { linkReachesGroup } from '@/lib/classroom-groups'
import { fetchAllRows, SUPABASE_IN_FILTER_CHUNK_SIZE } from '@/lib/supabase/fetch-all-rows'
import {
  isAssignmentReminderId, isFinishedReminderSubmission, latestAssignmentReminderRecords,
  missingSubmissionStudentIds, reminderAssignmentIsPublished,
  type AssignmentReminderRecord, type PendingAssignmentReminder, type ReminderSubmission,
} from '@/lib/assignment-reminders'

async function getAuthUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getMyNotifications(limit = 20): Promise<Notification[]> {
  const supabase = await createClient()
  // RLS scopes the list to auth.uid(), so auth validation and the read can run
  // together instead of paying two serial network round trips.
  const [userRes, listRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit),
  ])
  if (!userRes.data.user) return []

  return (listRes.data ?? []) as Notification[]
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient()
  // Recipient RLS makes the count query safe to start before getUser returns.
  const [userRes, countRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false),
  ])
  if (!userRes.data.user) return 0

  return countRes.count ?? 0
}

export async function markNotificationRead(id: string) {
  const supabase = await createClient()
  const user = await getAuthUser(supabase)
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('recipient_id', user.id)

  if (error) return { error: error.message }
  return { success: true }
}

export async function markAllNotificationsRead() {
  const supabase = await createClient()
  const user = await getAuthUser(supabase)
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', user.id)
    .eq('is_read', false)

  if (error) return { error: error.message }
  return { success: true }
}

export async function notifyNonSubmitters(assignmentId: string, classroomId: string) {
  if (!isAssignmentReminderId(assignmentId) || !isAssignmentReminderId(classroomId)) return { error: 'ข้อมูลงานหรือห้องเรียนไม่ถูกต้อง' }
  let notified = 0
  try {
    const session = await reminderSession('sender')
    if ('error' in session) return { error: session.error }
    const { supabase, user } = session
    if (!await canManageAssignment(assignmentId, user.id)) return { error: 'ไม่มีสิทธิ์เตือนงานนี้' }

    // Reading assignment metadata does not grant reminder delivery. Require
    // exact assignment management AND this classroom's owner/manage role
    // before any privileged roster read.
    const [assignmentResult, classroomResult, linkResult] = await Promise.all([
      supabase.from('assignments').select('id, title, org_id, status, mode, type').eq('id', assignmentId).maybeSingle(),
      supabase.from('classrooms').select('id, teacher_id, status').eq('id', classroomId).maybeSingle(),
      supabase.from('assignment_classrooms').select('group_ids').eq('assignment_id', assignmentId).eq('classroom_id', classroomId).maybeSingle(),
    ])
    if (assignmentResult.error || classroomResult.error || linkResult.error) return { error: REMINDER_SEND_ERROR }
    const assignment = assignmentResult.data, classroom = classroomResult.data, link = linkResult.data
    if (!assignment || !classroom || !link || classroom.status !== 'active'
      || !reminderAssignmentIsPublished(assignment) || !isAssignmentReminderId(assignment.org_id)
      || !validReminderGroups(link.group_ids)) return { error: 'งานนี้ไม่พร้อมแจ้งเตือนในห้องเรียนนี้' }
    if (classroom.teacher_id !== user.id) {
      const { data: coTeacher, error } = await supabase.from('classroom_co_teachers')
        .select('permission').eq('classroom_id', classroomId).eq('user_id', user.id)
        .in('permission', ['admin', 'manage']).maybeSingle()
      if (error || !coTeacher) return { error: 'ไม่มีสิทธิ์เตือนนักเรียนในห้องนี้' }
    }

    const admin = createAdminClient()
    const roster = await fetchAllRows<{ student_id: string }>((from, to) => admin.from('classroom_students')
      .select('student_id').eq('classroom_id', classroomId).order('student_id').range(from, to))
    if (roster.error) return { error: REMINDER_SEND_ERROR }
    let rosterIds = [...new Set(roster.rows.map(row => row.student_id))]
    if (rosterIds.some(id => !isAssignmentReminderId(id))) return { error: REMINDER_SEND_ERROR }
    const activeStudents = await reminderRowsForIds<{ id: string }>(rosterIds, (chunk, from, to) => admin.from('users')
      .select('id').in('id', chunk).eq('role', 'student').eq('status', 'active').order('id').range(from, to))
    if (activeStudents.error) return { error: REMINDER_SEND_ERROR }
    const activeIds = new Set(activeStudents.rows.map(row => row.id))
    rosterIds = rosterIds.filter(id => activeIds.has(id))
    if (link.group_ids !== null) {
      const memberships = await reminderRowsForIds<{ student_id: string; group_id: string }>(rosterIds, (chunk, from, to) => admin.from('classroom_group_members')
        .select('student_id, group_id').eq('classroom_id', classroomId).in('student_id', chunk).order('student_id').range(from, to))
      if (memberships.error) return { error: REMINDER_SEND_ERROR }
      const groups = new Map(memberships.rows.map(row => [row.student_id, row.group_id]))
      rosterIds = rosterIds.filter(id => linkReachesGroup(link.group_ids, groups.get(id)))
    }
    if (rosterIds.length === 0) return { success: true as const, notified: 0 }

    // This preserves the existing 24h unread suppression. It is deliberately
    // not an exactly-once guarantee across concurrent senders (no new schema).
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const recent = await reminderRowsForIds<{ recipient_id: string }>(rosterIds, (chunk, from, to) => admin.from('notifications')
      .select('recipient_id').eq('related_assignment_id', assignmentId).eq('type', 'assignment_reminder')
      .eq('is_read', false).gte('created_at', since).in('recipient_id', chunk).order('id').range(from, to))
    if (recent.error) return { error: REMINDER_SEND_ERROR }
    const recentlyNotified = new Set(recent.rows.map(row => row.recipient_id))
    const candidates = rosterIds.filter(id => !recentlyNotified.has(id))
    // Check every finished attempt immediately before sending, independently
    // of latest/best/average and of whether its score is zero or still pending.
    const submitted = await reminderRowsForIds<{ student_id: string; status: string }>(candidates, (chunk, from, to) => admin.from('submissions')
      .select('student_id, status').eq('assignment_id', assignmentId).in('student_id', chunk)
      .in('status', ['submitted', 'graded']).order('id').range(from, to))
    if (submitted.error) return { error: REMINDER_SEND_ERROR }
    const targets = missingSubmissionStudentIds(candidates, submitted.rows)
    for (let offset = 0; offset < targets.length; offset += SUPABASE_IN_FILTER_CHUNK_SIZE) {
      const batch = targets.slice(offset, offset + SUPABASE_IN_FILTER_CHUNK_SIZE)
      const { data, error } = await admin.from('notifications').insert(batch.map(recipient_id => ({
        org_id: assignment.org_id, recipient_id, actor_id: user.id, type: 'assignment_reminder' as const,
        title: `อย่าลืมส่ง "${assignment.title}"`, body: 'ครูแจ้งเตือนงานที่ยังไม่ได้ส่ง คุณกลับมาทำต่อได้',
        link: `/assignments/${assignmentId}/take`, related_assignment_id: assignmentId, related_classroom_id: classroomId,
      }))).select('id')
      if (error || !data || data.length !== batch.length) return { error: notified > 0
        ? `แจ้งเตือนสำเร็จแล้ว ${notified} คน แต่ยังส่งไม่ครบ กรุณาลองใหม่` : REMINDER_SEND_ERROR }
      notified += data.length
    }
    return { success: true as const, notified }
  } catch { return { error: notified > 0 ? `แจ้งเตือนสำเร็จแล้ว ${notified} คน แต่ยังส่งไม่ครบ กรุณาลองใหม่` : REMINDER_SEND_ERROR } }
}

const REMINDER_SEND_ERROR = 'แจ้งเตือนไม่สำเร็จ กรุณาลองใหม่'
const REMINDER_READ_ERROR = 'โหลดงานที่ครูแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่'
type ReminderSession = { supabase: Awaited<ReturnType<typeof createClient>>; user: { id: string } }

async function reminderSession(kind: 'sender' | 'student'): Promise<ReminderSession | { error: string }> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { error: 'กรุณาเข้าสู่ระบบใหม่' }
  const { data: profile, error: profileError } = await supabase.from('users').select('role, status').eq('id', user.id).maybeSingle()
  if (profileError || !profile || profile.status !== 'active'
    || (kind === 'student' ? profile.role !== 'student' : profile.role !== 'teacher' && profile.role !== 'admin')) {
    return { error: 'บัญชีนี้ไม่มีสิทธิ์ใช้การแจ้งเตือนนี้' }
  }
  return { supabase, user }
}

function validReminderGroups(value: unknown): value is string[] | null {
  return value === null || (Array.isArray(value) && value.every(isAssignmentReminderId))
}

async function reminderRowsForIds<T>(ids: string[], query: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = []
  for (let offset = 0; offset < ids.length; offset += SUPABASE_IN_FILTER_CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + SUPABASE_IN_FILTER_CHUNK_SIZE)
    const result = await fetchAllRows<T>((from, to) => query(chunk, from, to))
    if (result.error) return { rows: [] as T[], error: result.error }
    rows.push(...result.rows)
  }
  return { rows, error: null }
}

/** The notification row is recipient-owned but mutable by that recipient. Its
 * related IDs, title and link never authorize privileged assignment reads. */
export async function getPendingAssignmentReminders(): Promise<{ reminders: PendingAssignmentReminder[]; error?: string }> {
  try {
    const session = await reminderSession('student')
    if ('error' in session) return { reminders: [], error: session.error }
    const { supabase, user } = session
    const [history, roster] = await Promise.all([
      fetchAllRows<AssignmentReminderRecord>((from, to) => supabase.from('notifications')
        .select('id, related_assignment_id, related_classroom_id, is_read, created_at')
        .eq('recipient_id', user.id).eq('type', 'assignment_reminder')
        .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)),
      fetchAllRows<{ classroom_id: string }>((from, to) => supabase.from('classroom_students')
        .select('classroom_id').eq('student_id', user.id).order('classroom_id').range(from, to)),
    ])
    if (history.error || roster.error) return { reminders: [], error: REMINDER_READ_ERROR }
    const enrolled = new Set(roster.rows.map(row => row.classroom_id))
    const pending = latestAssignmentReminderRecords(history.rows).filter(row => enrolled.has(row.related_classroom_id!))
    if (pending.length === 0) return { reminders: [] }
    const roomIds = [...new Set(pending.map(row => row.related_classroom_id!))]
    const rooms = await reminderRowsForIds<{ id: string; name: string }>(roomIds, (chunk, from, to) => supabase.from('classrooms')
      .select('id, name').in('id', chunk).eq('status', 'active').order('id').range(from, to))
    if (rooms.error) return { reminders: [], error: REMINDER_READ_ERROR }
    const roomById = new Map(rooms.rows.map(row => [row.id, row]))
    const activePending = pending.filter(row => roomById.has(row.related_classroom_id!))
    const assignmentIds = [...new Set(activePending.map(row => row.related_assignment_id!))]
    type ReminderLink = { assignment_id: string; classroom_id: string; group_ids: string[] | null }
    const links: ReminderLink[] = []
    // Bound both filters: a long recipient history may span many classrooms.
    for (let offset = 0; offset < roomIds.length; offset += SUPABASE_IN_FILTER_CHUNK_SIZE) {
      const roomChunk = roomIds.slice(offset, offset + SUPABASE_IN_FILTER_CHUNK_SIZE)
      const result = await reminderRowsForIds<ReminderLink>(assignmentIds, (chunk, from, to) => supabase.from('assignment_classrooms')
        .select('assignment_id, classroom_id, group_ids').in('assignment_id', chunk)
        .in('classroom_id', roomChunk).order('assignment_id').order('classroom_id').range(from, to))
      if (result.error || result.rows.some(row => !validReminderGroups(row.group_ids))) return { reminders: [], error: REMINDER_READ_ERROR }
      links.push(...result.rows)
    }
    const linkByPair = new Map(links.map(row => [`${row.assignment_id}:${row.classroom_id}`, row]))
    const linked = activePending.filter(row => linkByPair.has(`${row.related_assignment_id}:${row.related_classroom_id}`))
    if (linked.length === 0) return { reminders: [] }

    const admin = createAdminClient()
    const groupRooms = [...new Set(linked.filter(row => linkByPair.get(`${row.related_assignment_id}:${row.related_classroom_id}`)!.group_ids !== null)
      .map(row => row.related_classroom_id!))]
    // Group RLS is teacher-only. Read solely this verified student's own group
    // in classrooms already proven through their recipient/session membership.
    const groups = await reminderRowsForIds<{ classroom_id: string; group_id: string }>(groupRooms, (chunk, from, to) => admin.from('classroom_group_members')
      .select('classroom_id, group_id').eq('student_id', user.id).in('classroom_id', chunk).order('classroom_id').range(from, to))
    if (groups.error) return { reminders: [], error: REMINDER_READ_ERROR }
    const groupOf = new Map(groups.rows.map(row => [row.classroom_id, row.group_id]))
    const reachable = linked.filter(row => linkReachesGroup(linkByPair.get(`${row.related_assignment_id}:${row.related_classroom_id}`)!.group_ids, groupOf.get(row.related_classroom_id!)))
    const reachableIds = [...new Set(reachable.map(row => row.related_assignment_id!))]
    if (reachableIds.length === 0) return { reminders: [] }
    // Direct student assignment SELECT was intentionally removed by the
    // plaintext-access-code hardening migration. Current own roster, active
    // classroom, exact assignment link and group reach above authorize this
    // narrowly projected admin read; never select access codes or whole rows.
    const [assignments, submissions] = await Promise.all([
      reminderRowsForIds<{ id: string; title: string; end_at: string | null; created_by: string }>(reachableIds, (chunk, from, to) => admin.from('assignments')
        .select('id, title, end_at, created_by').in('id', chunk).eq('status', 'published').eq('mode', 'online')
        .in('type', ['exercise', 'exam']).order('id').range(from, to)),
      reminderRowsForIds<ReminderSubmission>(reachableIds, (chunk, from, to) => admin.from('submissions')
        .select('assignment_id, status').eq('student_id', user.id).in('assignment_id', chunk).order('id').range(from, to)),
    ])
    if (assignments.error || submissions.error) return { reminders: [], error: REMINDER_READ_ERROR }
    const finished = new Set(submissions.rows.filter(row => isFinishedReminderSubmission(row.status)).map(row => row.assignment_id))
    const inProgress = new Set(submissions.rows.filter(row => row.status === 'in_progress').map(row => row.assignment_id))
    const assignmentById = new Map(assignments.rows.map(row => [row.id, row]))
    const remaining = reachable.filter(row => assignmentById.has(row.related_assignment_id!) && !finished.has(row.related_assignment_id!))
    const authorIds = [...new Set(remaining.map(row => assignmentById.get(row.related_assignment_id!)!.created_by))]
    const authors = await reminderRowsForIds<{ id: string; full_name: string }>(authorIds, (chunk, from, to) => admin.from('users')
      .select('id, full_name').in('id', chunk).order('id').range(from, to))
    if (authors.error) return { reminders: [], error: REMINDER_READ_ERROR }
    const authorById = new Map(authors.rows.map(row => [row.id, row.full_name]))
    return { reminders: remaining.map(row => {
      const assignment = assignmentById.get(row.related_assignment_id!)!
      return {
        id: row.id, assignmentId: assignment.id, classroomId: row.related_classroom_id!,
        assignmentTitle: assignment.title, classroomName: roomById.get(row.related_classroom_id!)!.name,
        teacherName: authorById.get(assignment.created_by) ?? null, createdAt: row.created_at,
        endAt: assignment.end_at, href: `/assignments/${assignment.id}/take`, inProgress: inProgress.has(assignment.id),
      }
    }) }
  } catch { return { reminders: [], error: REMINDER_READ_ERROR } }
}

export async function acknowledgeAssignmentReminder(id: string): Promise<{ success?: true; error?: string }> {
  if (!isAssignmentReminderId(id)) return { error: 'รายการแจ้งเตือนไม่ถูกต้อง' }
  try {
    const session = await reminderSession('student')
    if ('error' in session) return { error: session.error }
    const { data, error } = await session.supabase.from('notifications').update({ is_read: true })
      .eq('id', id).eq('recipient_id', session.user.id).eq('type', 'assignment_reminder')
      .select('id').maybeSingle()
    if (error || !data || data.id !== id) return { error: 'รับทราบการแจ้งเตือนไม่สำเร็จ กรุณาโหลดรายการล่าสุดแล้วลองใหม่' }
    return { success: true }
  } catch { return { error: 'รับทราบการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่' } }
}
