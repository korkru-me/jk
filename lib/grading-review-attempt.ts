import type { AttemptRow, OfficialScore } from './scoring'

interface ReviewAttempt extends AttemptRow {
  id: string
  student_id: string
}

/**
 * An average can include an older, unfinished review. Keep its official mean
 * and maximum, but open the latest pending contributor so a teacher can finish
 * every counted attempt through the existing grading workspace.
 * Call only for the average strategy, with already authorized attempt rows.
 */
export function preferPendingAverageReviewAttempts<T extends ReviewAttempt>(
  official: ReadonlyMap<string, OfficialScore<T>>,
  attempts: readonly T[],
  pendingSubmissionIds: ReadonlySet<string>,
): Map<string, OfficialScore<T>> {
  const pendingByStudent = new Map<string, T>()
  for (const row of attempts) {
    if ((row.status !== 'submitted' && row.status !== 'graded')
      || row.total_score === null || !pendingSubmissionIds.has(row.id)
      || !official.has(row.student_id)) continue
    const previous = pendingByStudent.get(row.student_id)
    if (!previous || row.attempt_number > previous.attempt_number) {
      pendingByStudent.set(row.student_id, row)
    }
  }
  return new Map([...official].map(([studentId, score]) => {
    const representative = pendingByStudent.get(studentId)
    return [studentId, representative ? { ...score, representative } : score]
  }))
}
