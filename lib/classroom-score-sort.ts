export type ScoreMatrixSortKey =
  | { type: 'name' }
  | { type: 'grade' }
  | { type: 'section' }
  | { type: 'number' }
  | { type: 'code' }
  | { type: 'assignment'; assignmentId: string }

export interface ScoreMatrixSort {
  key: ScoreMatrixSortKey
  dir: 'asc' | 'desc'
}

interface ScoreMatrixStudent {
  id: string
  full_name: string
  grade_level?: string | null
  section_number?: number | null
  class_number?: number | null
  student_code?: string | null
}

function sameKey(a: ScoreMatrixSortKey, b: ScoreMatrixSortKey): boolean {
  return a.type === b.type
    && (a.type !== 'assignment' || (b.type === 'assignment' && a.assignmentId === b.assignmentId))
}

/**
 * Roster columns follow the student table and start low-to-high. Score columns
 * start high-to-low because that is the useful first view for a teacher.
 */
export function nextScoreMatrixSort(
  current: ScoreMatrixSort | null,
  key: ScoreMatrixSortKey,
): ScoreMatrixSort {
  if (!current || !sameKey(current.key, key)) {
    return { key, dir: key.type === 'assignment' ? 'desc' : 'asc' }
  }
  return { key, dir: current.dir === 'desc' ? 'asc' : 'desc' }
}

function compareNullable<T>(
  a: T | null | undefined,
  b: T | null | undefined,
  compare: (left: T, right: T) => number,
) {
  const aMissing = a == null || (typeof a === 'string' && a.trim() === '')
  const bMissing = b == null || (typeof b === 'string' && b.trim() === '')
  if (aMissing && bMissing) return 0
  if (aMissing) return 1
  if (bMissing) return -1
  return compare(a as T, b as T)
}

export function sortScoreMatrixStudents<T extends ScoreMatrixStudent>(
  students: T[],
  sort: ScoreMatrixSort | null,
  scoreFor: (studentId: string, assignmentId: string) => number | null,
): T[] {
  const ordered = [...students]
  const collator = new Intl.Collator('th', { numeric: true, sensitivity: 'base' })
  const activeSort = sort ?? { key: { type: 'name' } as const, dir: 'asc' as const }
  const direction = activeSort.dir === 'asc' ? 1 : -1

  return ordered.sort((a, b) => {
    let result = 0
    let keepMissingLast = false
    if (activeSort.key.type === 'name') {
      result = collator.compare(a.full_name, b.full_name)
    } else if (activeSort.key.type === 'grade') {
      keepMissingLast = true
      result = compareNullable(a.grade_level, b.grade_level, collator.compare)
    } else if (activeSort.key.type === 'section') {
      keepMissingLast = true
      result = compareNullable(a.section_number, b.section_number, (left, right) => left - right)
    } else if (activeSort.key.type === 'number') {
      keepMissingLast = true
      result = compareNullable(a.class_number, b.class_number, (left, right) => left - right)
    } else if (activeSort.key.type === 'code') {
      keepMissingLast = true
      result = compareNullable(a.student_code, b.student_code, collator.compare)
    } else {
      const aScore = scoreFor(a.id, activeSort.key.assignmentId)
      const bScore = scoreFor(b.id, activeSort.key.assignmentId)
      if (aScore === null && bScore === null) {
        return collator.compare(a.full_name, b.full_name) || a.id.localeCompare(b.id)
      }
      // An unsubmitted score is lower than a submitted score. Applying the
      // direction below therefore makes the second click visibly reverse a
      // column even when only one student has submitted: missing scores lead
      // in ascending order and trail in descending order.
      if (aScore === null) result = -1
      else if (bScore === null) result = 1
      else result = aScore - bScore
    }

    if (result === 0) return collator.compare(a.full_name, b.full_name) || a.id.localeCompare(b.id)
    // Roster data that is not filled in remains at the bottom in either
    // direction, matching the student table's behaviour.
    if (keepMissingLast) {
      const aValue = activeSort.key.type === 'grade' ? a.grade_level
        : activeSort.key.type === 'section' ? a.section_number
          : activeSort.key.type === 'number' ? a.class_number
            : a.student_code
      const bValue = activeSort.key.type === 'grade' ? b.grade_level
        : activeSort.key.type === 'section' ? b.section_number
          : activeSort.key.type === 'number' ? b.class_number
            : b.student_code
      const aMissing = aValue == null || (typeof aValue === 'string' && aValue.trim() === '')
      const bMissing = bValue == null || (typeof bValue === 'string' && bValue.trim() === '')
      if (aMissing || bMissing) return result
    }
    return result * direction
  })
}
