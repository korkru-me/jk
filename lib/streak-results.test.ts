import { describe, it, expect } from 'vitest'
import {
  elapsedMsBetween,
  formatElapsed,
  medianOf,
  summarizeStreakResults,
  type StreakAnswerInput,
  type StreakAttemptInput,
} from './streak-results'

function attempt(over: Partial<StreakAttemptInput> & { id: string }): StreakAttemptInput {
  return { started_at: null, submitted_at: null, best_streak: 0, streak_reached: false, ...over }
}

/** `n` answer rows for one attempt, the first `correct` of them at full marks. */
function rows(submissionId: string, n: number, correct: number): StreakAnswerInput[] {
  return Array.from({ length: n }, (_, i) => ({
    submission_id: submissionId,
    score: i < correct ? 2 : 0,
    max_score: 2,
  }))
}

describe('elapsedMsBetween', () => {
  it('measures the span between the two timestamps', () => {
    expect(elapsedMsBetween('2026-09-12T10:00:00Z', '2026-09-12T10:12:30Z')).toBe(750_000)
  })

  it('gives nothing when either timestamp is missing', () => {
    expect(elapsedMsBetween(null, '2026-09-12T10:00:00Z')).toBeNull()
    expect(elapsedMsBetween('2026-09-12T10:00:00Z', undefined)).toBeNull()
  })

  // A clock adjustment or a row written out of order would otherwise print
  // "-3:00", which invites a teacher to explain a number that means nothing.
  it('refuses a span that runs backwards', () => {
    expect(elapsedMsBetween('2026-09-12T10:05:00Z', '2026-09-12T10:00:00Z')).toBeNull()
  })

  it('refuses an unparseable timestamp instead of printing NaN', () => {
    expect(elapsedMsBetween('not a date', '2026-09-12T10:00:00Z')).toBeNull()
  })
})

describe('formatElapsed', () => {
  it('shows minutes and seconds under an hour', () => {
    expect(formatElapsed(750_000)).toBe('12:30')
  })

  it('pads the seconds so the column lines up', () => {
    expect(formatElapsed(65_000)).toBe('1:05')
  })

  it('switches to hours once there is an hour to show', () => {
    expect(formatElapsed(3_600_000 + 5 * 60_000)).toBe('1 ชม. 5 นาที')
  })

  it('says nothing rather than zero when the span is unknown', () => {
    expect(formatElapsed(null)).toBe('—')
  })
})

describe('medianOf', () => {
  it('takes the middle of an odd count', () => {
    expect(medianOf([9, 3, 5])).toBe(5)
  })

  it('averages the two middles of an even count', () => {
    expect(medianOf([4, 6, 10, 20])).toBe(8)
  })

  it('rounds an even-count median to a whole ข้อ', () => {
    expect(medianOf([5, 6, 8, 8])).toBe(7)
  })

  it('gives nothing for no attempts', () => {
    expect(medianOf([])).toBeNull()
  })

  // The reason this is not a mean: the one student who kept going must not
  // decide what the page tells the teacher about the whole room.
  it('is not dragged by a single very long attempt', () => {
    expect(medianOf([6, 7, 8, 9, 120])).toBe(8)
  })

  it('does not reorder the caller’s array', () => {
    const input = [9, 3, 5]
    medianOf(input)
    expect(input).toEqual([9, 3, 5])
  })
})

describe('summarizeStreakResults', () => {
  it('counts ข้อ asked and ข้อ at full marks per attempt', () => {
    const summary = summarizeStreakResults(
      [attempt({ id: 's1', best_streak: 4, streak_reached: false })],
      rows('s1', 9, 6),
    )
    expect(summary.byId.get('s1')).toMatchObject({ asked: 9, correct: 6, best: 4, reached: false })
  })

  // "ถูก" has to mean the same thing here as it did when the run advanced, or
  // the column and the count beside it would disagree.
  it('does not count partial credit as ถูก', () => {
    const summary = summarizeStreakResults(
      [attempt({ id: 's1' })],
      [
        { submission_id: 's1', score: 2, max_score: 2 },
        { submission_id: 's1', score: 1, max_score: 2 },
        { submission_id: 's1', score: 0, max_score: 2 },
      ],
    )
    expect(summary.byId.get('s1')?.correct).toBe(1)
  })

  it('does not credit a row worth nothing', () => {
    const summary = summarizeStreakResults(
      [attempt({ id: 's1' })],
      [{ submission_id: 's1', score: 0, max_score: 0 }],
    )
    expect(summary.byId.get('s1')?.correct).toBe(0)
  })

  it('keeps each attempt’s rows to itself', () => {
    const summary = summarizeStreakResults(
      [attempt({ id: 's1' }), attempt({ id: 's2' })],
      [...rows('s1', 4, 4), ...rows('s2', 7, 2)],
    )
    expect(summary.byId.get('s1')).toMatchObject({ asked: 4, correct: 4 })
    expect(summary.byId.get('s2')).toMatchObject({ asked: 7, correct: 2 })
  })

  it('counts how many reached the run and reports the typical length', () => {
    const summary = summarizeStreakResults(
      [
        attempt({ id: 's1', streak_reached: true }),
        attempt({ id: 's2', streak_reached: true }),
        attempt({ id: 's3', streak_reached: false }),
      ],
      [...rows('s1', 5, 5), ...rows('s2', 8, 6), ...rows('s3', 30, 12)],
    )
    expect(summary.reachedCount).toBe(2)
    expect(summary.medianAsked).toBe(8)
  })

  it('handles an attempt with no answer rows yet', () => {
    const summary = summarizeStreakResults([attempt({ id: 's1' })], [])
    expect(summary.byId.get('s1')).toMatchObject({ asked: 0, correct: 0, elapsedMs: null })
    expect(summary.medianAsked).toBe(0)
  })

  it('reports nothing at all for an empty class', () => {
    const summary = summarizeStreakResults([], [])
    expect(summary.reachedCount).toBe(0)
    expect(summary.medianAsked).toBeNull()
    expect(summary.byId.size).toBe(0)
  })

  it('carries the elapsed span through', () => {
    const summary = summarizeStreakResults(
      [attempt({ id: 's1', started_at: '2026-09-12T09:00:00Z', submitted_at: '2026-09-12T09:20:00Z' })],
      rows('s1', 3, 3),
    )
    expect(summary.byId.get('s1')?.elapsedMs).toBe(1_200_000)
  })
})
