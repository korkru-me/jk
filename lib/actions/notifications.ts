'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Notification } from '@/lib/types'
import { loadStudentBell, saveDeadlineReadReceipts } from '@/lib/student-bell.server'
import { isSystemDeadlineNotice } from '@/lib/student-bell'
import { canManageAssignment } from '@/lib/auth/assignment-access'
import { linkReachesGroup } from '@/lib/classroom-groups'
import { fetchAllRows, SUPABASE_IN_FILTER_CHUNK_SIZE } from '@/lib/supabase/fetch-all-rows'
import {
  assignmentNoticeKind, isAssignmentReminderId, isFinishedReminderSubmission, latestAssignmentNoticeRecords,
  missingSubmissionStudentIds, reminderAssignmentIsPublished,
  type AssignmentNoticeKind, type AssignmentNoticeRecord, type PendingAssignmentNotice,
  type PendingAssignmentReminder, type ReminderSubmission,
} from '@/lib/assignment-reminders'

async function getAuthUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function bellSession() {
  const supabase = await createClient()
  const user = await getAuthUser(supabase)
  if (!user) return null
  const { data: profile, error } = await supabase.from('users').select('role, status').eq('id', user.id).maybeSingle()
  if (error) throw new Error('โหลดการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่')
  if (!profile || profile.status !== 'active') return null
  return { supabase, user, student: profile.role === 'student' }
}

export async function getMyNotifications(limit = 20): Promise<Notification[]> {
  const session = await bellSession()
  if (!session) return []
  const take = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 100)) : 20
  if (session.student) return (await loadStudentBell(session.supabase, createAdminClient(), session.user.id)).slice(0, take)
  const result = await session.supabase.from('notifications').select('*').eq('recipient_id', session.user.id)
    .order('created_at', { ascending: false }).limit(take)
  if (result.error) throw new Error('โหลดการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่')
  return (result.data ?? []) as Notification[]
}

export async function getUnreadNotificationCount(): Promise<number> {
  const session = await bellSession()
  if (!session) return 0
  if (session.student) return (await loadStudentBell(session.supabase, createAdminClient(), session.user.id)).filter(row => !row.is_read).length
  const result = await session.supabase.from('notifications').select('id', { count: 'exact', head: true })
    .eq('recipient_id', session.user.id).eq('is_read', false)
  if (result.error) throw new Error('โหลดการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่')
  return result.count ?? 0
}

export async function markNotificationRead(id: string) {
  if (!isAssignmentReminderId(id)) return { error: 'รายการแจ้งเตือนไม่ถูกต้อง' }
  try {
    const session = await bellSession()
    if (!session) return { error: 'ไม่ได้เข้าสู่ระบบ' }
    if (session.student) {
      const admin = createAdminClient()
      const notice = (await loadStudentBell(session.supabase, admin, session.user.id)).find(row => row.id === id)
      if (!notice) return { error: 'ไม่พบการแจ้งเตือนนี้แล้ว กรุณาโหลดข้อมูลล่าสุด' }
      if (isSystemDeadlineNotice(notice)) {
        await saveDeadlineReadReceipts(admin, [notice])
        return { success: true }
      }
    }
    const { data, error } = await session.supabase.from('notifications').update({ is_read: true })
      .eq('id', id).eq('recipient_id', session.user.id).select('id').maybeSingle()
    if (error || !data) return { error: 'บันทึกการอ่านไม่สำเร็จ กรุณาลองใหม่' }
    return { success: true }
  } catch { return { error: 'บันทึกการอ่านไม่สำเร็จ กรุณาลองใหม่' } }
}

export async function markAllNotificationsRead() {
  try {
    const session = await bellSession()
    if (!session) return { error: 'ไม่ได้เข้าสู่ระบบ' }
    if (session.student) {
      const admin = createAdminClient()
      const notices = await loadStudentBell(session.supabase, admin, session.user.id)
      await saveDeadlineReadReceipts(admin, notices.filter(row => !row.is_read && isSystemDeadlineNotice(row)))
    }
    const query = session.supabase.from('notifications').update({ is_read: true })
      .eq('recipient_id', session.user.id).eq('is_read', false)
    // Hidden announcement/new-work rows must stay unread for their own popups.
    const result = await (session.student ? query.eq('type', 'grade_published') : query)
    if (result.error) return { error: 'บันทึกการอ่านไม่สำเร็จ กรุณาลองใหม่' }
    return { success: true }
  } catch { return { error: 'บันทึกการอ่านไม่สำเร็จ กรุณาลองใหม่' } }
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
async function pendingAssignmentNotices(kinds: readonly AssignmentNoticeKind[]): Promise<{ notices: PendingAssignmentNotice[]; error?: string }> {
  try {
    const session = await reminderSession('student')
    if ('error' in session) return { notices: [], error: session.error }
    const { supabase, user } = session
    const types = kinds.map(kind => kind === 'assigned' ? 'classroom_post' : 'assignment_reminder')
    const [history, roster] = await Promise.all([
      fetchAllRows<AssignmentNoticeRecord>((from, to) => {
        const query = supabase.from('notifications')
          .select('id, type, actor_id, related_assignment_id, related_classroom_id, is_read, created_at').eq('recipient_id', user.id)
        const scoped = types.length === 1 ? query.eq('type', types[0]) : query.in('type', types)
        return scoped.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
      }),
      fetchAllRows<{ classroom_id: string }>((from, to) => supabase.from('classroom_students')
        .select('classroom_id').eq('student_id', user.id).order('classroom_id').range(from, to)),
    ])
    if (history.error || roster.error) return { notices: [], error: REMINDER_READ_ERROR }
    const enrolled = new Set(roster.rows.map(row => row.classroom_id))
    const pending = latestAssignmentNoticeRecords(history.rows.filter(row => !isSystemDeadlineNotice(row))).filter(row => enrolled.has(row.related_classroom_id!))
    if (pending.length === 0) return { notices: [] }
    const roomIds = [...new Set(pending.map(row => row.related_classroom_id!))]
    const rooms = await reminderRowsForIds<{ id: string; name: string }>(roomIds, (chunk, from, to) => supabase.from('classrooms')
      .select('id, name').in('id', chunk).eq('status', 'active').order('id').range(from, to))
    if (rooms.error) return { notices: [], error: REMINDER_READ_ERROR }
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
      if (result.error || result.rows.some(row => !validReminderGroups(row.group_ids))) return { notices: [], error: REMINDER_READ_ERROR }
      links.push(...result.rows)
    }
    const linkByPair = new Map(links.map(row => [`${row.assignment_id}:${row.classroom_id}`, row]))
    const linked = activePending.filter(row => linkByPair.has(`${row.related_assignment_id}:${row.related_classroom_id}`))
    if (linked.length === 0) return { notices: [] }

    const admin = createAdminClient()
    const groupRooms = [...new Set(linked.filter(row => linkByPair.get(`${row.related_assignment_id}:${row.related_classroom_id}`)!.group_ids !== null)
      .map(row => row.related_classroom_id!))]
    // Group RLS is teacher-only. Read solely this verified student's own group
    // in classrooms already proven through their recipient/session membership.
    const groups = await reminderRowsForIds<{ classroom_id: string; group_id: string }>(groupRooms, (chunk, from, to) => admin.from('classroom_group_members')
      .select('classroom_id, group_id').eq('student_id', user.id).in('classroom_id', chunk).order('classroom_id').range(from, to))
    if (groups.error) return { notices: [], error: REMINDER_READ_ERROR }
    const groupOf = new Map(groups.rows.map(row => [row.classroom_id, row.group_id]))
    const reachable = linked.filter(row => linkReachesGroup(linkByPair.get(`${row.related_assignment_id}:${row.related_classroom_id}`)!.group_ids, groupOf.get(row.related_classroom_id!)))
    const reachableIds = [...new Set(reachable.map(row => row.related_assignment_id!))]
    if (reachableIds.length === 0) return { notices: [] }
    // Direct student assignment SELECT was intentionally removed by the
    // plaintext-access-code hardening migration. Current own roster, active
    // classroom, exact assignment link and group reach above authorize this
    // narrowly projected admin read; never select access codes or whole rows.
    const [assignments, submissions] = await Promise.all([
      reminderRowsForIds<{ id: string; title: string; end_at: string | null; due_at: string | null; start_at: string | null; created_by: string; type: 'exercise' | 'exam'; mode: 'online' }>(reachableIds, (chunk, from, to) => admin.from('assignments')
        .select('id, title, end_at, due_at, start_at, created_by, type, mode').in('id', chunk).eq('status', 'published').eq('mode', 'online')
        .in('type', ['exercise', 'exam']).order('id').range(from, to)),
      reminderRowsForIds<ReminderSubmission>(reachableIds, (chunk, from, to) => admin.from('submissions')
        .select('assignment_id, status').eq('student_id', user.id).in('assignment_id', chunk).order('id').range(from, to)),
    ])
    if (assignments.error || submissions.error) return { notices: [], error: REMINDER_READ_ERROR }
    const finished = new Set(submissions.rows.filter(row => isFinishedReminderSubmission(row.status)).map(row => row.assignment_id))
    const inProgress = new Set(submissions.rows.filter(row => row.status === 'in_progress').map(row => row.assignment_id))
    const assignmentById = new Map(assignments.rows.map(row => [row.id, row]))
    const remaining = reachable.filter(row => assignmentById.has(row.related_assignment_id!) && !finished.has(row.related_assignment_id!))
    const authorIds = [...new Set(remaining.map(row => assignmentById.get(row.related_assignment_id!)!.created_by))]
    const authors = await reminderRowsForIds<{ id: string; full_name: string }>(authorIds, (chunk, from, to) => admin.from('users')
      .select('id, full_name').in('id', chunk).order('id').range(from, to))
    if (authors.error) return { notices: [], error: REMINDER_READ_ERROR }
    const authorById = new Map(authors.rows.map(row => [row.id, row.full_name]))
    return { notices: remaining.map(row => {
      const assignment = assignmentById.get(row.related_assignment_id!)!
      const kind = assignmentNoticeKind(row)!
      return {
        id: row.id, assignmentId: assignment.id, classroomId: row.related_classroom_id!,
        assignmentTitle: assignment.title, classroomName: roomById.get(row.related_classroom_id!)!.name,
        teacherName: authorById.get(assignment.created_by) ?? null, createdAt: row.created_at,
        endAt: assignment.end_at, href: kind === 'assigned' ? `/classrooms/${row.related_classroom_id}` : `/assignments/${assignment.id}/take`,
        inProgress: inProgress.has(assignment.id), kind, assignmentType: assignment.type, mode: assignment.mode,
        dueAt: assignment.due_at ?? null, startAt: assignment.start_at ?? null,
      }
    }) }
  } catch { return { notices: [], error: REMINDER_READ_ERROR } }
}

export async function getPendingAssignmentNotices(): Promise<{ notices: PendingAssignmentNotice[]; error?: string }> {
  return pendingAssignmentNotices(['assigned', 'reminder'])
}

/** Kept for older callers/fixtures; it neither consumes new-work notices nor
 * changes their separate newest-per-assignment receipt history. */
export async function getPendingAssignmentReminders(): Promise<{ reminders: PendingAssignmentReminder[]; error?: string }> {
  const result = await pendingAssignmentNotices(['reminder'])
  return {
    reminders: result.notices.map(({ id, assignmentId, classroomId, assignmentTitle, classroomName, teacherName, createdAt, endAt, href, inProgress }) => ({
      id, assignmentId, classroomId, assignmentTitle, classroomName, teacherName, createdAt, endAt, href, inProgress,
    })),
    ...(result.error ? { error: result.error } : {}),
  }
}

export async function acknowledgeAssignmentReminder(id: string): Promise<{ success?: true; error?: string }> {
  return acknowledgeWorkNotice(id, ['assignment_reminder'])
}

export async function acknowledgeAssignmentNotice(id: string): Promise<{ success?: true; error?: string }> {
  return acknowledgeWorkNotice(id, ['assignment_reminder', 'classroom_post'])
}

async function acknowledgeWorkNotice(id: string, types: string[]): Promise<{ success?: true; error?: string }> {
  if (!isAssignmentReminderId(id)) return { error: 'รายการแจ้งเตือนไม่ถูกต้อง' }
  try {
    const session = await reminderSession('student')
    if ('error' in session) return { error: session.error }
    const query = session.supabase.from('notifications').update({ is_read: true })
      .eq('id', id).eq('recipient_id', session.user.id)
    const scoped = types.length === 1 ? query.eq('type', types[0]) : query.in('type', types)
    const { data, error } = await scoped.not('related_assignment_id', 'is', null)
      .select('id').maybeSingle()
    if (error || !data || data.id !== id) return { error: 'รับทราบการแจ้งเตือนไม่สำเร็จ กรุณาโหลดรายการล่าสุดแล้วลองใหม่' }
    return { success: true }
  } catch { return { error: 'รับทราบการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่' } }
}
