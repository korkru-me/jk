// Shared "roster" sort logic used by both the classroom's "นักเรียน" tab
// (student-table.tsx) and the "คะแนนและการส่งงาน" tab (classroom-scores-matrix.tsx)
// so the two pages can display students in a consistent order. Only fields
// that exist as real data on both pages are supported here — the student
// table's score/status columns are separate, sample-only display columns
// with no counterpart on the scores page, so they're not part of this type.
export type StudentSortKey = 'name' | 'grade' | 'section' | 'number' | 'code'
export type StudentSortDir = 'asc' | 'desc'

export interface StudentSortRule {
  key: StudentSortKey
  dir: StudentSortDir
}

export const STUDENT_SORT_LABEL: Record<StudentSortKey, string> = {
  name: 'ชื่อ (ก-ฮ)',
  grade: 'ระดับชั้น',
  section: 'ห้อง',
  number: 'เลขที่',
  code: 'รหัสนักเรียน',
}

export interface SortableStudentProfile {
  grade_level?: string | null
  section_number?: number | null
  class_number?: number | null
  student_code?: string | null
}

function cmpNullsLast<T>(av: T | null | undefined, bv: T | null | undefined, cmp: (x: T, y: T) => number) {
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1
  return cmp(av, bv)
}

function compareStudentField(
  a: { id: string; full_name: string },
  b: { id: string; full_name: string },
  profiles: Record<string, SortableStudentProfile>,
  sortKey: StudentSortKey,
  sortDir: StudentSortDir,
) {
  if (sortKey === 'name') {
    const result = a.full_name.localeCompare(b.full_name, 'th')
    return sortDir === 'asc' ? result : -result
  }

  const aProfile = profiles[a.id]
  const bProfile = profiles[b.id]
  let av: string | number | null | undefined
  let bv: string | number | null | undefined
  let compare: (x: string | number, y: string | number) => number

  if (sortKey === 'grade') {
    av = aProfile?.grade_level
    bv = bProfile?.grade_level
    compare = (x, y) => String(x).localeCompare(String(y), 'th', { numeric: true })
  } else if (sortKey === 'section') {
    av = aProfile?.section_number
    bv = bProfile?.section_number
    compare = (x, y) => Number(x) - Number(y)
  } else if (sortKey === 'number') {
    av = aProfile?.class_number
    bv = bProfile?.class_number
    compare = (x, y) => Number(x) - Number(y)
  } else {
    av = aProfile?.student_code
    bv = bProfile?.student_code
    compare = (x, y) => String(x).localeCompare(String(y), 'th', { numeric: true })
  }

  // Missing roster data should stay at the bottom in either direction. This
  // is applied per rule so a missing primary value does not jump above valid
  // values merely because the teacher selected descending order.
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1
  const result = compare(av, bv)
  return sortDir === 'asc' ? result : -result
}

/**
 * Makes the most recently clicked column the primary rule while retaining
 * earlier columns as tie-breakers. Clicking the current primary column flips
 * its direction; promoting an older rule keeps the direction chosen for it.
 */
export function nextStudentSortRules(
  current: StudentSortRule[],
  key: StudentSortKey,
): StudentSortRule[] {
  const existingIndex = current.findIndex(rule => rule.key === key)
  if (existingIndex === 0) {
    const [primary, ...rest] = current
    return [{ key, dir: primary.dir === 'asc' ? 'desc' : 'asc' }, ...rest]
  }

  const existing = existingIndex > 0 ? current[existingIndex] : null
  return [
    { key, dir: existing?.dir ?? 'asc' },
    ...current.filter(rule => rule.key !== key),
  ]
}

export function compareStudentsByRules(
  a: { id: string; full_name: string },
  b: { id: string; full_name: string },
  profiles: Record<string, SortableStudentProfile>,
  rules: StudentSortRule[],
) {
  for (const rule of rules) {
    const result = compareStudentField(a, b, profiles, rule.key, rule.dir)
    if (result !== 0) return result
  }

  return a.full_name.localeCompare(b.full_name, 'th') || a.id.localeCompare(b.id)
}

export function sortStudentsByRules<T extends { id: string; full_name: string }>(
  students: T[],
  profiles: Record<string, SortableStudentProfile>,
  rules: StudentSortRule[],
): T[] {
  return students.slice().sort((a, b) => compareStudentsByRules(a, b, profiles, rules))
}

export function compareStudents(
  a: { id: string; full_name: string },
  b: { id: string; full_name: string },
  profiles: Record<string, SortableStudentProfile>,
  sortKey: StudentSortKey,
  sortDir: StudentSortDir,
) {
  let cmp = 0
  if (sortKey === 'name') cmp = a.full_name.localeCompare(b.full_name, 'th')
  if (sortKey === 'grade') {
    cmp = cmpNullsLast(profiles[a.id]?.grade_level, profiles[b.id]?.grade_level, (x, y) => x.localeCompare(y, 'th'))
    if (cmp === 0) cmp = a.full_name.localeCompare(b.full_name, 'th')
  }
  if (sortKey === 'section') {
    cmp = cmpNullsLast(profiles[a.id]?.section_number, profiles[b.id]?.section_number, (x, y) => x - y)
    if (cmp === 0) cmp = a.full_name.localeCompare(b.full_name, 'th')
  }
  if (sortKey === 'number') {
    cmp = cmpNullsLast(profiles[a.id]?.class_number, profiles[b.id]?.class_number, (x, y) => x - y)
    if (cmp === 0) cmp = a.full_name.localeCompare(b.full_name, 'th')
  }
  if (sortKey === 'code') {
    cmp = cmpNullsLast(profiles[a.id]?.student_code, profiles[b.id]?.student_code, (x, y) => x.localeCompare(y, 'th'))
    if (cmp === 0) cmp = a.full_name.localeCompare(b.full_name, 'th')
  }
  return sortDir === 'asc' ? cmp : -cmp
}

export function sortStudents<T extends { id: string; full_name: string }>(
  students: T[],
  profiles: Record<string, SortableStudentProfile>,
  sortKey: StudentSortKey,
  sortDir: StudentSortDir,
): T[] {
  return students.slice().sort((a, b) => compareStudents(a, b, profiles, sortKey, sortDir))
}
