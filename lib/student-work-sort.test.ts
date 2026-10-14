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

it('reverses dated items while leaving unknown deadlines at the bottom', () => {
  expect(sortStudentWork(items, 'due', 'desc').map(w => w.id)).toEqual(['latest', 'soon', 'overdue', 'no-date'])
  expect(sortStudentWork(items, 'latest', 'asc').map(w => w.id)).toEqual(['overdue', 'soon', 'latest', 'no-date'])
})

it.each([['due', 'asc'], ['due', 'desc'], ['latest', 'asc'], ['latest', 'desc']] as const)(
  'keeps completed tasks last for %s/%s while reusable libraries stay among active work', (order, direction) => {
    const rows = [
      { id: 'done-old', completed: true, endAt: '2026-01-01', assignedAt: '2026-01-01' },
      { id: 'pending', completed: false, endAt: '2026-10-15', assignedAt: '2026-10-12' },
      { id: 'practice', completed: false, endAt: null, assignedAt: '2026-10-14' },
      { id: 'done-new', completed: true, endAt: '2027-01-01', assignedAt: '2027-01-01' },
    ]
    const result = sortStudentWork(rows, order, direction)
    expect(result.slice(0, 2).map(work => work.id).sort()).toEqual(['pending', 'practice'])
    expect(result.slice(2).every(work => work.completed)).toBe(true)
    expect(rows[0].id).toBe('done-old')
  },
)
it('orders undated items by their publication time in either deadline direction', () => {
  const rows = [
    { id: 'new', endAt: null, assignedAt: '2026-10-14' },
    { id: 'old', endAt: null, assignedAt: '2026-10-01' },
    { id: 'unknown', endAt: null, assignedAt: null },
  ]
  expect(sortStudentWork(rows, 'due', 'asc').map(work => work.id)).toEqual(['new', 'old', 'unknown'])
  expect(sortStudentWork(rows, 'due', 'desc').map(work => work.id)).toEqual(['new', 'old', 'unknown'])
})
