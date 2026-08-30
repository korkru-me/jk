import { describe, expect, it } from 'vitest'
import {
  getSebPreflightState,
  normalizeSebPreflightCheckins,
  SEB_PREFLIGHT_VALIDITY_HOURS,
  summarizeSebPreflight,
  type SebPreflightCheckinRow,
} from './seb-preflight'

const ASSIGNMENT_ID = '22222222-2222-4222-8222-222222222222'
const NOW = Date.parse('2026-08-30T08:00:00.000Z')

function checkin(
  studentId: string,
  verifiedAt: string,
  validUntil = '2026-08-30T12:00:00.000Z',
): SebPreflightCheckinRow {
  return {
    assignment_id: ASSIGNMENT_ID,
    student_id: studentId,
    verified_at: verifiedAt,
    valid_until: validUntil,
    platform: 'windows',
    version: 'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser',
  }
}

describe('SEB preflight snapshot normalization', () => {
  it('deduplicates snapshot rows and keeps the newest verification per student', () => {
    const older = checkin('student-a', '2026-08-30T06:00:00.000Z')
    const newer = checkin('student-a', '2026-08-30T07:00:00.000Z')

    expect(normalizeSebPreflightCheckins([older, newer, older])).toEqual([newer])
    expect(normalizeSebPreflightCheckins([newer, older])).toEqual([newer])
  })

  it('does not let an older or malformed duplicate replace a newer check-in', () => {
    const current = checkin('student-a', '2026-08-30T07:00:00.000Z')
    const older = checkin('student-a', '2026-08-30T06:59:59.999Z')
    const malformed = checkin('student-a', 'not-a-time')

    expect(normalizeSebPreflightCheckins([current, older, malformed])).toEqual([current])
  })
})

describe('SEB preflight state', () => {
  it('uses the same 12-hour window as the signed SEB session', () => {
    expect(SEB_PREFLIGHT_VALIDITY_HOURS).toBe(12)
  })

  it('reports ready only inside a coherent verification window', () => {
    expect(getSebPreflightState(
      checkin('student-a', '2026-08-30T07:00:00.000Z'),
      NOW,
    )).toBe('ready')
    expect(getSebPreflightState(
      checkin('student-a', '2026-08-30T07:00:00.000Z', '2026-08-30T08:00:00.001Z'),
      NOW,
    )).toBe('ready')
  })

  it('treats the expiry boundary, an unverified student, and a future verification conservatively', () => {
    expect(getSebPreflightState(
      checkin('student-a', '2026-08-30T07:00:00.000Z', '2026-08-30T08:00:00.000Z'),
      NOW,
    )).toBe('expired')
    expect(getSebPreflightState(undefined, NOW)).toBe('missing')
    expect(getSebPreflightState(null, NOW)).toBe('missing')
    expect(getSebPreflightState(
      checkin('student-a', '2026-08-30T08:00:00.001Z'),
      NOW,
    )).toBe('expired')
  })

  it.each([
    ['invalid verified_at', 'not-a-time', '2026-08-30T12:00:00.000Z', NOW],
    ['invalid valid_until', '2026-08-30T07:00:00.000Z', 'not-a-time', NOW],
    ['reversed window', '2026-08-30T09:00:00.000Z', '2026-08-30T08:00:00.000Z', NOW],
    ['zero-length window', '2026-08-30T07:00:00.000Z', '2026-08-30T07:00:00.000Z', NOW],
    ['overlong window', '2026-08-30T07:00:00.000Z', '2026-08-30T20:00:00.001Z', NOW],
    ['invalid current time', '2026-08-30T07:00:00.000Z', '2026-08-30T12:00:00.000Z', Number.NaN],
  ])('marks %s as expired', (_label, verifiedAt, validUntil, now) => {
    expect(getSebPreflightState(checkin('student-a', verifiedAt, validUntil), now)).toBe('expired')
  })
})

describe('SEB preflight summary', () => {
  it('counts unique roster students and ignores check-ins outside the roster', () => {
    expect(summarizeSebPreflight(
      ['student-a', 'student-b', 'student-c', 'student-a'],
      [
        checkin('student-a', '2026-08-30T07:00:00.000Z'),
        checkin('student-b', '2026-08-29T07:00:00.000Z', '2026-08-29T19:00:00.000Z'),
        checkin('not-in-roster', '2026-08-30T07:30:00.000Z'),
      ],
      NOW,
    )).toEqual({ total: 3, ready: 1, expired: 1, missing: 1 })
  })

  it('uses only the latest duplicate check-in for each roster student', () => {
    expect(summarizeSebPreflight(
      ['student-a'],
      [
        checkin('student-a', '2026-08-29T07:00:00.000Z', '2026-08-29T19:00:00.000Z'),
        checkin('student-a', '2026-08-30T07:00:00.000Z'),
      ],
      NOW,
    )).toEqual({ total: 1, ready: 1, expired: 0, missing: 0 })
  })

  it('returns an empty summary for an empty roster even when check-ins exist', () => {
    expect(summarizeSebPreflight(
      [],
      [checkin('student-a', '2026-08-30T07:00:00.000Z')],
      NOW,
    )).toEqual({ total: 0, ready: 0, expired: 0, missing: 0 })
  })
})
