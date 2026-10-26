export interface PendingAssignmentReminder {
  id: string
  assignmentId: string
  classroomId: string
  assignmentTitle: string
  classroomName: string
  teacherName: string | null
  createdAt: string
  endAt: string | null
  href: string
  inProgress: boolean
}

export type AssignmentNoticeKind = 'assigned' | 'reminder'

export interface PendingAssignmentNotice extends PendingAssignmentReminder {
  kind: AssignmentNoticeKind
  assignmentType: 'exercise' | 'exam'
  /** Print assignments were removed; only the current online model is valid. */
  mode: 'online'
  dueAt: string | null
  startAt: string | null
}

export interface AssignmentReminderRecord {
  id: string
  related_assignment_id: string | null
  related_classroom_id: string | null
  is_read: boolean
  created_at: string
}

export interface AssignmentNoticeRecord extends AssignmentReminderRecord {
  actor_id?: string | null
  type: string
}

export interface ReminderSubmission {
  assignment_id: string
  student_id?: string
  status: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const isAssignmentReminderId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)
export const isFinishedReminderSubmission = (status: string) => status === 'submitted' || status === 'graded'

/** A previous finished attempt settles a missing-hand-in reminder even when a
 * newer attempt is still in progress. Score strategy and pass/fail are unrelated. */
export function missingSubmissionStudentIds(rosterIds: readonly string[], submissions: readonly { student_id: string; status: string }[]): string[] {
  const submitted = new Set(submissions.filter(row => isFinishedReminderSubmission(row.status)).map(row => row.student_id))
  return [...new Set(rosterIds)].filter(id => !submitted.has(id))
}

/** An acknowledged newest reminder suppresses older duplicates. A subsequent
 * explicit reminder is a new row and may appear again. Metadata in these rows
 * remains untrusted until the reader rechecks the student's assignment reach. */
export function latestAssignmentReminderRecords<T extends AssignmentReminderRecord>(rows: readonly T[]): T[] {
  const latest = new Map<string, T>()
  for (const row of rows) {
    if (!isAssignmentReminderId(row.id) || !isAssignmentReminderId(row.related_assignment_id)
      || !isAssignmentReminderId(row.related_classroom_id) || !Number.isFinite(Date.parse(row.created_at))) continue
    const previous = latest.get(row.related_assignment_id)
    const time = Date.parse(row.created_at)
    if (!previous || time > Date.parse(previous.created_at)
      || (time === Date.parse(previous.created_at) && row.id > previous.id)) latest.set(row.related_assignment_id, row)
  }
  return [...latest.values()].filter(row => !row.is_read)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id))
}

/** Ordinary classroom posts have no related assignment and are not work
 * notices. The recipient may edit their own rows, so IDs remain untrusted. */
export function assignmentNoticeKind(row: Pick<AssignmentNoticeRecord, 'type' | 'related_assignment_id'>): AssignmentNoticeKind | null {
  if (!isAssignmentReminderId(row.related_assignment_id)) return null
  return row.type === 'assignment_reminder' ? 'reminder' : row.type === 'classroom_post' ? 'assigned' : null
}

/** A new-work receipt never consumes an independent explicit reminder. */
export function latestAssignmentNoticeRecords(rows: readonly AssignmentNoticeRecord[]): AssignmentNoticeRecord[] {
  const assigned = latestAssignmentReminderRecords(rows.filter(row => assignmentNoticeKind(row) === 'assigned'))
  const reminders = latestAssignmentReminderRecords(rows.filter(row => assignmentNoticeKind(row) === 'reminder'))
  return [...assigned, ...reminders]
}

export function reminderAssignmentIsPublished(row: { status: string; mode: string; type: string }): boolean {
  return row.status === 'published' && row.mode === 'online' && (row.type === 'exercise' || row.type === 'exam')
}
