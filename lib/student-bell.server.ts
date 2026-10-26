import 'server-only'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows, fetchRowsInChunks } from '@/lib/supabase/fetch-all-rows'
import { assignmentReachesStudent, type AssignmentLinkReach } from '@/lib/classroom-groups'
import { studentDeadlineNotice, type BellDeadline, type BellExtension } from '@/lib/student-bell'
import type { Notification } from '@/lib/types'

type Work = BellDeadline & { id: string; org_id: string; title: string; type: string; mode: string }
type Link = AssignmentLinkReach & { assignment_id: string }
const READ_ERROR = 'โหลดการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่'

async function rows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const result = await fetchAllRows(query)
  if (result.error) throw new Error(READ_ERROR)
  return result.rows
}
async function chunks<T>(ids: string[], query: (ids: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const result = await fetchRowsInChunks(ids, async ids => {
    const result = await fetchAllRows<T>((from, to) => query(ids, from, to))
    return { data: result.rows, error: result.error }
  })
  if (result.error) throw new Error(READ_ERROR)
  return result.rows
}

export function deadlineBellId(studentId: string, assignmentId: string, deadline: string, kind: string): string {
  const hex = createHash('sha256').update(JSON.stringify(['student-deadline-v1', studentId, assignmentId, deadline, kind])).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`
}

/** Caller must first verify Auth and an active student profile. Read-only: read
 * receipts are stored only when the student explicitly marks a notice read. */
export async function loadStudentBell(supabase: SupabaseClient, admin: SupabaseClient, studentId: string, now = Date.now()): Promise<Notification[]> {
  const [history, memberships] = await Promise.all([
    rows<Notification>((from, to) => supabase.from('notifications').select('*').eq('recipient_id', studentId)
      .in('type', ['grade_published', 'assignment_reminder']).order('id').range(from, to)),
    rows<{ classroom_id: string }>((from, to) => supabase.from('classroom_students').select('classroom_id')
      .eq('student_id', studentId).order('classroom_id').range(from, to)),
  ])
  const grades = history.filter(row => row.type === 'grade_published')
  const rooms = await chunks<{ id: string; name: string }>(memberships.map(row => row.classroom_id), (ids, from, to) => supabase.from('classrooms')
    .select('id, name').in('id', ids).eq('status', 'active').eq('classroom_type', 'subject').order('id').range(from, to))
  if (!rooms.length) return grades.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  const roomIds = rooms.map(row => row.id)
  // Relationships and own roster authorize the narrow privileged assignment read.
  const links = await chunks<Link>(roomIds, (ids, from, to) => supabase.from('assignment_classrooms')
    .select('assignment_id, classroom_id, group_ids').in('classroom_id', ids).order('assignment_id').order('classroom_id').range(from, to))
  if (links.some(link => link.group_ids !== null && (!Array.isArray(link.group_ids) || link.group_ids.some(id => typeof id !== 'string')))) throw new Error(READ_ERROR)
  const assignmentIds = [...new Set(links.map(link => link.assignment_id))]
  const [groups, submissions] = await Promise.all([
    chunks<{ classroom_id: string; group_id: string }>(roomIds, (ids, from, to) => admin.from('classroom_group_members')
      .select('classroom_id, group_id').eq('student_id', studentId).in('classroom_id', ids).order('classroom_id').range(from, to)),
    chunks<{ assignment_id: string; status: string }>(assignmentIds, (ids, from, to) => supabase.from('submissions')
      .select('assignment_id, status').eq('student_id', studentId).in('assignment_id', ids).order('id').range(from, to)),
  ])
  const groupOf = new Map(groups.map(row => [row.classroom_id, row.group_id]))
  const enrolled = new Set(roomIds)
  const attempted = new Set(submissions.map(row => row.assignment_id))
  const finished = new Set(submissions.filter(row => row.status === 'submitted' || row.status === 'graded').map(row => row.assignment_id))
  const linksByAssignment = new Map<string, Link[]>()
  for (const link of links) linksByAssignment.set(link.assignment_id, [...(linksByAssignment.get(link.assignment_id) ?? []), link])
  const reachable = assignmentIds.filter(id => !finished.has(id) && assignmentReachesStudent(linksByAssignment.get(id)!, enrolled, groupOf, attempted.has(id)))
  const [work, extensions] = await Promise.all([
    chunks<Work>(reachable, (ids, from, to) => admin.from('assignments')
      .select('id, org_id, title, type, mode, status, start_at, due_at, end_at').in('id', ids)
      .in('status', ['published', 'closed']).eq('mode', 'online').in('type', ['exercise', 'exam']).order('id').range(from, to)),
    chunks<BellExtension & { assignment_id: string }>(reachable, (ids, from, to) => supabase.from('assignment_extensions')
      .select('assignment_id, extended_due_at, extended_end_at').eq('student_id', studentId).in('assignment_id', ids).order('assignment_id').range(from, to)),
  ])
  const extensionOf = new Map(extensions.map(row => [row.assignment_id, row]))
  const receipts = new Map(history.map(row => [row.id, row]))
  const notices = work.flatMap((assignment): Notification[] => {
    const notice = studentDeadlineNotice(assignment, extensionOf.get(assignment.id), now)
    if (!notice) return []
    const id = deadlineBellId(studentId, assignment.id, notice.deadline, notice.kind)
    const classroomId = linksByAssignment.get(assignment.id)!.find(link =>
      assignmentReachesStudent([link], enrolled, groupOf, attempted.has(assignment.id)))!.classroom_id
    const deadlineLabel = new Date(notice.deadline).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    return [{ id, org_id: assignment.org_id, recipient_id: studentId, actor_id: null, type: 'assignment_reminder',
      title: notice.kind === 'overdue' ? 'เลยกำหนดส่งงานแล้ว' : 'งานใกล้ถึงกำหนดส่ง',
      body: `${assignment.title} · กำหนดส่ง ${deadlineLabel}`, link: `/classrooms/${classroomId}?tab=assignments`,
      related_assignment_id: assignment.id, related_classroom_id: classroomId,
      is_read: receipts.get(id)?.is_read === true, created_at: notice.occurredAt }]
  })
  return [...grades, ...notices].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id))
}

/** Only pass freshly rebuilt notices for this verified recipient. */
export async function saveDeadlineReadReceipts(admin: SupabaseClient, notices: Notification[]) {
  if (!notices.length) return
  const recipientId = notices[0].recipient_id
  if (notices.some(row => row.recipient_id !== recipientId)) throw new Error('รายการแจ้งเตือนไม่ถูกต้อง')
  for (let offset = 0; offset < notices.length; offset += 200) {
    const batch = notices.slice(offset, offset + 200)
    // Recipient-owned notification IDs are mutable. A conflicting UUID must
    // never let service-role upsert overwrite another recipient's row.
    const inserted = await admin.from('notifications').upsert(batch.map(row => ({ ...row, is_read: true })), { onConflict: 'id', ignoreDuplicates: true })
    if (inserted.error) throw new Error('บันทึกการอ่านไม่สำเร็จ กรุณาลองใหม่')
    const updated = await admin.from('notifications').update({ is_read: true })
      .eq('recipient_id', recipientId).in('id', batch.map(row => row.id)).select('id')
    if (updated.error || updated.data?.length !== batch.length) throw new Error('บันทึกการอ่านไม่สำเร็จ กรุณาลองใหม่')
  }
}
