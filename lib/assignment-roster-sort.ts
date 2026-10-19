export type AssignmentRosterSort = 'time' | 'score' | 'name' | 'submitted' | 'unsubmitted'

interface AssignmentRosterRow {
  student_id: string
  status: string
  total_score: number | null
  submitted_at: string | null
  started_at: string
  users: { full_name: string } | null
}

function latestTime(row: AssignmentRosterRow): number {
  const submitted = Date.parse(row.submitted_at ?? '')
  if (Number.isFinite(submitted)) return submitted
  const started = Date.parse(row.started_at)
  return Number.isFinite(started) ? started : -Infinity
}

function isSubmitted(row: AssignmentRosterRow): boolean {
  return row.status === 'submitted' || row.status === 'graded'
}

/** Sorts the existing official-score roster without changing attempts or scores. */
export function sortAssignmentRoster<T extends AssignmentRosterRow>(rows: readonly T[], order: AssignmentRosterSort): T[] {
  return [...rows].sort((left, right) => {
    const nameOrder = (left.users?.full_name ?? '').localeCompare(right.users?.full_name ?? '', 'th')
    const tie = nameOrder || left.student_id.localeCompare(right.student_id)
    if (order === 'name') return tie

    if (order === 'submitted' || order === 'unsubmitted') {
      const submittedOrder = Number(isSubmitted(right)) - Number(isSubmitted(left))
      if (submittedOrder) return order === 'submitted' ? submittedOrder : -submittedOrder
    }

    if (order === 'score') {
      const leftScore = left.total_score != null && Number.isFinite(left.total_score) ? left.total_score : -Infinity
      const rightScore = right.total_score != null && Number.isFinite(right.total_score) ? right.total_score : -Infinity
      if (leftScore !== rightScore) return rightScore - leftScore
    }

    const leftTime = latestTime(left)
    const rightTime = latestTime(right)
    return leftTime !== rightTime ? rightTime - leftTime : tie
  })
}
