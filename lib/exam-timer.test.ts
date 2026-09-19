import { describe, expect, it } from 'vitest'
import { examSecondsLeft } from './exam-timer'

describe('exam recovery timer', () => {
  const startedAt = '2026-09-20T08:00:00.000Z'

  it('derives remaining time from the original start after reload or timer throttling', () => {
    expect(examSecondsLeft(30, startedAt, Date.parse('2026-09-20T08:12:34.500Z'))).toBe(1_046)
  })

  it('does not grant extra time when the clock is checked before the recorded start', () => {
    expect(examSecondsLeft(30, startedAt, Date.parse('2026-09-20T07:59:00.000Z'))).toBe(1_800)
  })

  it('clamps expired and malformed attempts to zero', () => {
    expect(examSecondsLeft(30, startedAt, Date.parse('2026-09-20T09:00:00.000Z'))).toBe(0)
    expect(examSecondsLeft(30, 'not-a-date')).toBe(0)
    expect(examSecondsLeft(Number.NaN, startedAt)).toBe(0)
  })
})
