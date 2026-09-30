import { describe, expect, it } from 'vitest'
import { shouldClearExpiredEndAt } from './assignment-status'

const now = Date.parse('2026-09-29T12:00:00.000Z')

describe('shouldClearExpiredEndAt', () => {
  it('clears an expired deadline when reopening a closed assignment', () => {
    expect(shouldClearExpiredEndAt({
      currentStatus: 'closed',
      endAt: '2026-09-29T11:59:59.000Z',
      now,
    })).toBe(true)
  })

  it('clears a deadline that expires exactly when the assignment is reopened', () => {
    expect(shouldClearExpiredEndAt({
      currentStatus: 'closed',
      endAt: '2026-09-29T12:00:00.000Z',
      now,
    })).toBe(true)
  })

  it.each([
    { currentStatus: 'closed' as const, endAt: null },
    { currentStatus: 'closed' as const, endAt: '2026-09-29T12:00:01.000Z' },
    { currentStatus: 'closed' as const, endAt: 'not-a-date' },
    { currentStatus: 'draft' as const, endAt: '2026-09-29T11:59:59.000Z' },
    { currentStatus: 'published' as const, endAt: '2026-09-29T11:59:59.000Z' },
  ])('keeps the deadline for $currentStatus with endAt $endAt', ({ currentStatus, endAt }) => {
    expect(shouldClearExpiredEndAt({ currentStatus, endAt, now })).toBe(false)
  })
})
