import { describe, expect, it } from 'vitest'
import { nextScoreMatrixSort, sortScoreMatrixStudents } from './classroom-score-sort'

const students = [
  { id: 'a', full_name: 'กานต์', grade_level: 'ม.4', section_number: 2, class_number: 10, student_code: 'ST-10' },
  { id: 'b', full_name: 'บัว', grade_level: 'ม.3', section_number: 1, class_number: 2, student_code: 'ST-2' },
  { id: 'c', full_name: 'อิง', grade_level: null, section_number: null, class_number: null, student_code: null },
]

describe('nextScoreMatrixSort', () => {
  it('starts a new column high-to-low and toggles the same column', () => {
    const first = nextScoreMatrixSort(null, { type: 'assignment', assignmentId: 'work-1' })
    expect(first.dir).toBe('desc')
    const second = nextScoreMatrixSort(first, { type: 'assignment', assignmentId: 'work-1' })
    expect(second.dir).toBe('asc')
    expect(nextScoreMatrixSort(second, { type: 'assignment', assignmentId: 'work-1' }).dir).toBe('desc')
  })

  it('starts roster columns low-to-high like the student table', () => {
    expect(nextScoreMatrixSort(null, { type: 'number' })).toEqual({ key: { type: 'number' }, dir: 'asc' })
  })
})

describe('sortScoreMatrixStudents', () => {
  it('uses name order by default instead of the manual roster order', () => {
    expect(sortScoreMatrixStudents(students, null, () => null).map(s => s.id))
      .toEqual(['a', 'b', 'c'])
  })

  it('sorts the compact roster columns and keeps missing values last', () => {
    expect(sortScoreMatrixStudents(
      students,
      { key: { type: 'number' }, dir: 'asc' },
      () => null,
    ).map(s => s.id)).toEqual(['b', 'a', 'c'])
    expect(sortScoreMatrixStudents(
      students,
      { key: { type: 'code' }, dir: 'desc' },
      () => null,
    ).map(s => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts assignment scores in both directions, treating missing scores as lower', () => {
    const score = (id: string) => ({ a: 4, b: 9 }[id as 'a' | 'b'] ?? null)
    expect(sortScoreMatrixStudents(
      students,
      { key: { type: 'assignment', assignmentId: 'work-1' }, dir: 'desc' },
      score,
    ).map(s => s.id)).toEqual(['b', 'a', 'c'])
    expect(sortScoreMatrixStudents(
      students,
      { key: { type: 'assignment', assignmentId: 'work-1' }, dir: 'asc' },
      score,
    ).map(s => s.id)).toEqual(['c', 'a', 'b'])
  })
})
