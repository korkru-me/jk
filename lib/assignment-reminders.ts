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

export interface AssignmentReminderRecord {
  id: string
  related_assignment_id: string | null
  related_classroom_id: string | null
  is_read: boolean
  created_at: string
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
export function latestAssignmentReminderRecords(rows: readonly AssignmentReminderRecord[]): AssignmentReminderRecord[] {
  const latest = new Map<string, AssignmentReminderRecord>()
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

export function reminderAssignmentIsPublished(row: { status: string; mode: string; type: string }): boolean {
  return row.status === 'published' && row.mode === 'online' && (row.type === 'exercise' || row.type === 'exam')
}
