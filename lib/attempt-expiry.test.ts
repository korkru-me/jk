import { describe, expect, it } from 'vitest'
import { attemptExpiresAt, attemptHasExpired, attemptSecondsLeft } from './attempt-expiry'

describe('attempt hard close', () => {
  const start = '2026-10-14T07:00:00Z'
  it('uses the earlier timer or hard close, for either assignment type', () => {
    expect(attemptExpiresAt(start, 30, '2026-10-14T07:15:00Z')).toBe('2026-10-14T07:15:00.000Z')
    expect(attemptExpiresAt(start, 30, '2026-10-14T08:00:00Z')).toBe('2026-10-14T07:30:00.000Z')
  })
  it('honours an individual extension without extending the attempt timer', () => {
    expect(attemptExpiresAt(start, 30, '2026-10-14T09:00:00Z')).toBe('2026-10-14T07:30:00.000Z')
  })
  it('handles untimed attempts with and without a hard close', () => {
    expect(attemptExpiresAt(start, null, null)).toBeNull()
    expect(attemptExpiresAt(start, null, '2026-10-14T08:00:00Z')).toBe('2026-10-14T08:00:00.000Z')
  })
  it('closes at the boundary, not a second later, and never yields a negative clock', () => {
    const end = '2026-10-14T07:30:00.000Z'
    expect(attemptHasExpired(end, Date.parse(end))).toBe(true)
    expect(attemptSecondsLeft(end, Date.parse(end) + 10000)).toBe(0)
    expect(attemptSecondsLeft(end, Date.parse(end) - 1001)).toBe(2)
  })
})
