import { describe, expect, it } from 'vitest'
import { sortAssignmentRoster } from './assignment-roster-sort'

function row(student_id: string, overrides: Partial<Parameters<typeof sortAssignmentRoster>[0][number]> = {}) {
  return {
    student_id,
    status: 'submitted',
    total_score: 1 as number | null,
    submitted_at: '2026-10-10T10:00:00Z' as string | null,
    started_at: '2026-10-10T09:00:00Z',
    users: { full_name: student_id } as { full_name: string } | null,
    ...overrides,
  }
}
const ids = (rows: ReturnType<typeof row>[]) => rows.map(item => item.student_id)

describe('assignment overview student sorting', () => {
  it('orders scores high to low, retaining zero ahead of missing scores without mutating the input', () => {
    const rows = [row('missing', { total_score: null }), row('zero', { total_score: 0 }), row('high', { total_score: 9 })]
    expect(ids(sortAssignmentRoster(rows, 'score'))).toEqual(['high', 'zero', 'missing'])
    expect(ids(rows)).toEqual(['missing', 'zero', 'high'])
  })

  it('orders latest submission or start first and safely falls back from invalid submission dates', () => {
    const rows = [
      row('old'),
      row('active', { status: 'in_progress', submitted_at: null, started_at: '2026-10-12T10:00:00Z' }),
      row('fallback', { submitted_at: 'invalid', started_at: '2026-10-11T10:00:00Z' }),
      row('unknown', { submitted_at: null, started_at: 'invalid' }),
    ]
    expect(ids(sortAssignmentRoster(rows, 'time'))).toEqual(['active', 'fallback', 'old', 'unknown'])
  })

  it('orders Thai names before using a stable student identity for equal names', () => {
    const rows = [
      row('b', { users: { full_name: 'กานต์' } }),
      row('c', { users: { full_name: 'ขวัญ' } }),
      row('a', { users: { full_name: 'กานต์' } }),
    ]
    expect(ids(sortAssignmentRoster(rows, 'name'))).toEqual(['a', 'b', 'c'])
  })

  const mixed = [
    row('not-started', { status: 'not_started', total_score: null, submitted_at: null, started_at: '1970-01-01T00:00:00Z' }),
    row('graded', { status: 'graded', submitted_at: '2026-10-11T10:00:00Z' }),
    row('active', { status: 'in_progress', total_score: null, submitted_at: null, started_at: '2026-10-12T10:00:00Z' }),
    row('submitted'),
  ]

  it('puts both completed statuses first, with latest activity within each group', () => {
    expect(ids(sortAssignmentRoster(mixed, 'submitted'))).toEqual(['graded', 'submitted', 'active', 'not-started'])
  })

  it('puts active and not-started students first without hiding submitted students', () => {
    expect(ids(sortAssignmentRoster(mixed, 'unsubmitted'))).toEqual(['active', 'not-started', 'graded', 'submitted'])
  })

  it('uses stable name and identity ties for equally missing dates and scores', () => {
    const rows = [
      row('b', { users: null, total_score: null, submitted_at: null, started_at: '' }),
      row('a', { users: null, total_score: null, submitted_at: null, started_at: '' }),
    ]
    expect(ids(sortAssignmentRoster(rows, 'score'))).toEqual(['a', 'b'])
    expect(ids(sortAssignmentRoster(rows, 'time'))).toEqual(['a', 'b'])
  })
})
