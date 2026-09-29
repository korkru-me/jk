export type ScoreMatrixSortKey =
  | { type: 'name' }
  | { type: 'assignment'; assignmentId: string }

export interface ScoreMatrixSort {
  key: ScoreMatrixSortKey
  dir: 'asc' | 'desc'
}

interface ScoreMatrixStudent {
  id: string
  full_name: string
}

function sameKey(a: ScoreMatrixSortKey, b: ScoreMatrixSortKey): boolean {
  return a.type === b.type
    && (a.type !== 'assignment' || (b.type === 'assignment' && a.assignmentId === b.assignmentId))
}

/** A new header starts high-to-low; pressing the same header toggles direction. */
export function nextScoreMatrixSort(
  current: ScoreMatrixSort | null,
  key: ScoreMatrixSortKey,
): ScoreMatrixSort {
  if (!current || !sameKey(current.key, key)) return { key, dir: 'desc' }
  return { key, dir: current.dir === 'desc' ? 'asc' : 'desc' }
}

export function sortScoreMatrixStudents<T extends ScoreMatrixStudent>(
  students: T[],
  manualOrder: string[],
  sort: ScoreMatrixSort | null,
  scoreFor: (studentId: string, assignmentId: string) => number | null,
): T[] {
  const manualIndex = new Map(manualOrder.map((id, index) => [id, index]))
  const fallbackIndex = (id: string) => manualIndex.get(id) ?? Number.MAX_SAFE_INTEGER
  const ordered = [...students]

  if (!sort) return ordered.sort((a, b) => fallbackIndex(a.id) - fallbackIndex(b.id))

  const direction = sort.dir === 'asc' ? 1 : -1
  const collator = new Intl.Collator('th', { numeric: true, sensitivity: 'base' })

  return ordered.sort((a, b) => {
    let result = 0
    if (sort.key.type === 'name') {
      result = collator.compare(a.full_name, b.full_name)
    } else {
      const aScore = scoreFor(a.id, sort.key.assignmentId)
      const bScore = scoreFor(b.id, sort.key.assignmentId)
      if (aScore === null && bScore === null) return fallbackIndex(a.id) - fallbackIndex(b.id)
      // An unsubmitted score is lower than a submitted score. Applying the
      // direction below therefore makes the second click visibly reverse a
      // column even when only one student has submitted: missing scores lead
      // in ascending order and trail in descending order.
      if (aScore === null) result = -1
      else if (bScore === null) result = 1
      else result = aScore - bScore
    }

    return result === 0 ? fallbackIndex(a.id) - fallbackIndex(b.id) : result * direction
  })
}
