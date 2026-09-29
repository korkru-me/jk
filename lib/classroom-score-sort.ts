export type ScoreMatrixSortKey =
  | { type: 'roster' }
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
    if (sort.key.type === 'roster') {
      result = fallbackIndex(a.id) - fallbackIndex(b.id)
    } else if (sort.key.type === 'name') {
      result = collator.compare(a.full_name, b.full_name)
    } else {
      const aScore = scoreFor(a.id, sort.key.assignmentId)
      const bScore = scoreFor(b.id, sort.key.assignmentId)
      if (aScore === null && bScore === null) return fallbackIndex(a.id) - fallbackIndex(b.id)
      if (aScore === null) return 1
      if (bScore === null) return -1
      result = aScore - bScore
    }

    return result === 0 ? fallbackIndex(a.id) - fallbackIndex(b.id) : result * direction
  })
}
