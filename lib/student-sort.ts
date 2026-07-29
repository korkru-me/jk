// Shared "roster" sort logic used by both the classroom's "นักเรียน" tab
// (student-table.tsx) and the "คะแนนและการส่งงาน" tab (classroom-scores-matrix.tsx)
// so the two pages can display students in a consistent order. Only fields
// that exist as real data on both pages are supported here — the student
// table's score/status columns are separate, sample-only display columns
// with no counterpart on the scores page, so they're not part of this type.
export type StudentSortKey = 'name' | 'grade' | 'section' | 'number' | 'code'
export type StudentSortDir = 'asc' | 'desc'

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
