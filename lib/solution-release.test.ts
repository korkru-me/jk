import { describe, expect, it } from 'vitest'
import {
  attemptLimitFor,
  resolveSolutionRelease,
  type SolutionReleaseAttempt,
  type SolutionReleaseInput,
} from './solution-release'

const NOW = new Date('2026-09-26T10:00:00Z').getTime()
const HOUR = 60 * 60_000
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()

function attempt(
  number: number,
  status: SolutionReleaseAttempt['status'] = 'submitted',
  startedAt = iso(-2 * HOUR),
): SolutionReleaseAttempt {
  return { id: `attempt-${number}`, status, attempt_number: number, started_at: startedAt }
}

function input(overrides: Partial<SolutionReleaseInput> = {}): SolutionReleaseInput {
  return {
    showSolutions: true,
    status: 'published',
    type: 'exercise',
    endAt: null,
    extendedEndAt: null,
    maxAttempts: null,
    durationMinutes: null,
    attempts: [attempt(1)],
    now: NOW,
    ...overrides,
  }
}

describe('attemptLimitFor', () => {
  it('reads a missing limit the way startSubmission does', () => {
    expect(attemptLimitFor('exercise', null)).toBeNull()
    expect(attemptLimitFor('exam', null)).toBe(1)
    expect(attemptLimitFor('exercise', 3)).toBe(3)
    expect(attemptLimitFor('exam', 2)).toBe(2)
  })
})

describe('resolveSolutionRelease', () => {
  it('stays off when the teacher did not tick it, whatever else is true', () => {
    expect(resolveSolutionRelease(input({ showSolutions: false, status: 'closed' }))).toEqual({ state: 'off' })
  })

  it('opens a one-attempt ข้อสอบ as soon as it is handed in', () => {
    expect(resolveSolutionRelease(input({ type: 'exam', maxAttempts: 1 })).state).toBe('open')
    // An exam saved before max_attempts existed is one attempt too.
    expect(resolveSolutionRelease(input({ type: 'exam', maxAttempts: null })).state).toBe('open')
  })

  it('keeps a ข้อสอบ with attempts left shut until the last one is in', () => {
    const release = resolveSolutionRelease(input({ type: 'exam', maxAttempts: 2 }))
    expect(release).toEqual({
      state: 'locked', unfinished: null, deadline: null, attemptLimit: 2, attemptsUsed: 1,
    })
    expect(resolveSolutionRelease(input({
      type: 'exam', maxAttempts: 2, attempts: [attempt(1), attempt(2, 'graded')],
    })).state).toBe('open')
  })

  it('leaves an unlimited แบบฝึกหัด shut until the teacher closes it', () => {
    expect(resolveSolutionRelease(input())).toMatchObject({ state: 'locked', attemptLimit: null })
    expect(resolveSolutionRelease(input({ status: 'closed' })).state).toBe('open')
  })

  it('opens once the deadline has passed, and not a moment before', () => {
    const ahead = resolveSolutionRelease(input({ endAt: iso(HOUR) }))
    expect(ahead).toMatchObject({ state: 'locked', deadline: iso(HOUR) })
    expect(resolveSolutionRelease(input({ endAt: iso(-1) })).state).toBe('open')
  })

  it('waits for a student’s own extension rather than the class deadline', () => {
    const extended = resolveSolutionRelease(input({ endAt: iso(-HOUR), extendedEndAt: iso(HOUR) }))
    expect(extended).toMatchObject({ state: 'locked', deadline: iso(HOUR) })
    expect(resolveSolutionRelease(input({ endAt: iso(-2 * HOUR), extendedEndAt: iso(-HOUR) })).state)
      .toBe('open')
  })

  it('does not count a draft as closed', () => {
    expect(resolveSolutionRelease(input({ status: 'draft' })).state).toBe('locked')
  })

  it('holds a closed งาน shut while an attempt can still be written to', () => {
    // ปิดการสอบ stops new attempts, but a tab left open on this one can still
    // save — the เฉลย must not reach it.
    const release = resolveSolutionRelease(input({
      status: 'closed',
      attempts: [attempt(1), attempt(2, 'in_progress', iso(-5 * 60_000))],
    }))
    expect(release).toEqual({
      state: 'locked',
      unfinished: { id: 'attempt-2', attemptNumber: 2 },
      deadline: null,
      attemptLimit: null,
      attemptsUsed: 1,
    })
  })

  it('treats an attempt whose time ran out as handed in', () => {
    const expired = attempt(2, 'in_progress', iso(-2 * HOUR))
    expect(resolveSolutionRelease(input({
      status: 'closed', durationMinutes: 30, attempts: [attempt(1), expired],
    })).state).toBe('open')
    // …and as used, when it was the last one allowed.
    expect(resolveSolutionRelease(input({
      maxAttempts: 2, durationMinutes: 30, attempts: [attempt(1), expired],
    })).state).toBe('open')
  })

  it('treats an attempt past the deadline as closed to writing', () => {
    expect(resolveSolutionRelease(input({
      endAt: iso(-HOUR), attempts: [attempt(1), attempt(2, 'in_progress', iso(-3 * HOUR))],
    })).state).toBe('open')
  })

  it('keeps an attempt live through an extension that is still running', () => {
    const release = resolveSolutionRelease(input({
      status: 'closed',
      endAt: iso(-HOUR),
      extendedEndAt: iso(HOUR),
      attempts: [attempt(1), attempt(2, 'in_progress', iso(-10 * 60_000))],
    }))
    expect(release).toMatchObject({ state: 'locked', unfinished: { attemptNumber: 2 } })
  })

  it('counts only handed-in attempts toward the limit', () => {
    const release = resolveSolutionRelease(input({
      maxAttempts: 2,
      attempts: [attempt(1), attempt(2, 'in_progress', iso(-60_000))],
    }))
    expect(release).toMatchObject({ state: 'locked', attemptsUsed: 1, unfinished: { attemptNumber: 2 } })
  })

  it('reads an unnumbered legacy attempt as the first', () => {
    const legacy = { ...attempt(1), attempt_number: null }
    expect(resolveSolutionRelease(input({ type: 'exam', maxAttempts: null, attempts: [legacy] })).state)
      .toBe('open')
  })
})
