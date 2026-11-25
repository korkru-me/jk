import { describe, expect, it } from 'vitest'
import { jitterDelayMs, readAttemptClockFromRows } from './attempt-clock'

const NOW = new Date('2026-11-25T03:30:00.000Z')
const open = { status: 'in_progress', started_at: '2026-11-25T03:00:00.000Z', closed_at: null }

describe('readAttemptClockFromRows', () => {
  it('reports the timed close and the server clock for an open round', () => {
    expect(readAttemptClockFromRows({ submission: open, durationMinutes: 60, endAt: null, extendedEndAt: null }, NOW))
      .toEqual({ open: true, expiresAt: '2026-11-25T04:00:00.000Z', serverNow: NOW.toISOString() })
  })

  it('uses the shared close when it comes before the timer', () => {
    expect(readAttemptClockFromRows({ submission: open, durationMinutes: 60, endAt: '2026-11-25T03:45:00.000Z', extendedEndAt: null }, NOW))
      .toMatchObject({ open: true, expiresAt: '2026-11-25T03:45:00.000Z' })
  })

  it('lets a per-student extension override the shared close', () => {
    expect(readAttemptClockFromRows({
      submission: open, durationMinutes: 60,
      endAt: '2026-11-25T03:45:00.000Z', extendedEndAt: '2026-11-25T03:55:00.000Z',
    }, NOW)).toMatchObject({ open: true, expiresAt: '2026-11-25T03:55:00.000Z' })
  })

  it('reports an untimed round without a close as open with no expiry', () => {
    expect(readAttemptClockFromRows({ submission: open, durationMinutes: null, endAt: null, extendedEndAt: null }, NOW))
      .toEqual({ open: true, expiresAt: null, serverNow: NOW.toISOString() })
  })

  it.each([
    ['missing', null],
    ['submitted', { ...open, status: 'submitted' }],
    ['closed by the server or teacher', { ...open, closed_at: '2026-11-25T03:20:00.000Z' }],
  ])('reports a %s round as not open', (_label, submission) => {
    expect(readAttemptClockFromRows({ submission, durationMinutes: 60, endAt: null, extendedEndAt: null }, NOW))
      .toEqual({ open: false })
  })

  it('reports an elapsed round as not open', () => {
    expect(readAttemptClockFromRows({ submission: open, durationMinutes: 30, endAt: null, extendedEndAt: null }, NOW))
      .toEqual({ open: false })
  })
})

describe('jitterDelayMs', () => {
  it('stays within [0, max)', () => {
    expect(jitterDelayMs(5000, () => 0)).toBe(0)
    expect(jitterDelayMs(5000, () => 0.5)).toBe(2500)
    expect(jitterDelayMs(5000, () => 0.9999)).toBe(4999)
  })

  it('clamps out-of-range inputs', () => {
    expect(jitterDelayMs(-10, () => 0.5)).toBe(0)
    expect(jitterDelayMs(1000, () => 2)).toBe(1000)
    expect(jitterDelayMs(1000, () => -1)).toBe(0)
  })
})
