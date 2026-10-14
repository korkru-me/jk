import { expect, it } from 'vitest'
import { sortStudentWork } from './student-work-sort'

const items = [
  { id: 'no-date', endAt: null, assignedAt: null },
  { id: 'latest', endAt: '2026-10-20', assignedAt: '2026-10-14' },
  { id: 'overdue', endAt: '2026-10-01', assignedAt: '2026-09-30' },
  { id: 'soon', endAt: '2026-10-15', assignedAt: '2026-10-12' },
]
it('sorts deadlines with overdue first and undated work last without changing input', () => {
  expect(sortStudentWork(items, 'due').map(w => w.id)).toEqual(['overdue', 'soon', 'latest', 'no-date'])
  expect(items[0].id).toBe('no-date')
})
it('sorts newest assignments first, independently of their deadlines', () => {
  expect(sortStudentWork(items, 'latest').map(w => w.id)).toEqual(['latest', 'soon', 'overdue', 'no-date'])
})
it('handles invalid and equal timestamps deterministically', () => {
  const rows = [{ id: 'b', endAt: 'invalid', assignedAt: null }, { id: 'a', endAt: null, assignedAt: 'invalid' }]
  expect(sortStudentWork(rows, 'due').map(w => w.id)).toEqual(['a', 'b'])
  expect(sortStudentWork(rows, 'latest').map(w => w.id)).toEqual(['a', 'b'])
})
