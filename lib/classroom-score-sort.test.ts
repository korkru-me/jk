import { describe, expect, it } from 'vitest'
import { nextScoreMatrixSort, sortScoreMatrixStudents } from './classroom-score-sort'

const students = [
  { id: 'a', full_name: 'กานต์' },
  { id: 'b', full_name: 'บัว' },
  { id: 'c', full_name: 'อิง' },
]

describe('nextScoreMatrixSort', () => {
  it('starts a new column high-to-low and toggles the same column', () => {
    const first = nextScoreMatrixSort(null, { type: 'assignment', assignmentId: 'work-1' })
    expect(first.dir).toBe('desc')
    const second = nextScoreMatrixSort(first, { type: 'assignment', assignmentId: 'work-1' })
    expect(second.dir).toBe('asc')
    expect(nextScoreMatrixSort(second, { type: 'assignment', assignmentId: 'work-1' }).dir).toBe('desc')
  })
})

describe('sortScoreMatrixStudents', () => {
  it('keeps manual roster order without an active header sort', () => {
    expect(sortScoreMatrixStudents(students, ['c', 'a', 'b'], null, () => null).map(s => s.id))
      .toEqual(['c', 'a', 'b'])
  })

  it('sorts assignment scores in both directions, treating missing scores as lower', () => {
    const score = (id: string) => ({ a: 4, b: 9 }[id as 'a' | 'b'] ?? null)
    expect(sortScoreMatrixStudents(
      students, ['a', 'b', 'c'],
      { key: { type: 'assignment', assignmentId: 'work-1' }, dir: 'desc' },
      score,
    ).map(s => s.id)).toEqual(['b', 'a', 'c'])
    expect(sortScoreMatrixStudents(
      students, ['a', 'b', 'c'],
      { key: { type: 'assignment', assignmentId: 'work-1' }, dir: 'asc' },
      score,
    ).map(s => s.id)).toEqual(['c', 'a', 'b'])
  })
})
