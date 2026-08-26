import { describe, it, expect } from 'vitest'
import { computeQuestionStats, type GradedAnswerRow } from './question-stats'

/**
 * Written when the คลัง learned to order by item analysis: the list is ranked
 * from exactly these numbers, so "ยากจริงสุดก่อน" is only as honest as they are.
 * Covers `lastUsedAt`, which was added for that ordering, plus the parts of the
 * existing computation the ranking reads.
 */

const answer = (over: Partial<GradedAnswerRow> & { question_id: string }): GradedAnswerRow => ({
  score: 1,
  max_score: 1,
  submission_total: 10,
  assignment_id: 'a1',
  ...over,
})

describe('computeQuestionStats', () => {
  it('leaves a question with no graded answer out entirely', () => {
    expect(computeQuestionStats([]).get('q1')).toBeUndefined()
    // A question worth no points cannot have a fraction scored.
    expect(computeQuestionStats([answer({ question_id: 'q1', max_score: 0 })]).size).toBe(0)
  })

  it('reads p as the mean fraction earned, so a low p is a hard question', () => {
    const stats = computeQuestionStats([
      answer({ question_id: 'q1', score: 0, max_score: 2 }),
      answer({ question_id: 'q1', score: 1, max_score: 2 }),
      answer({ question_id: 'q1', score: 2, max_score: 2 }),
    ])
    expect(stats.get('q1')?.pValue).toBeCloseTo(0.5)
    expect(stats.get('q1')?.attempts).toBe(3)
  })

  it('counts the assignments a question appeared in, not the attempts', () => {
    const stats = computeQuestionStats([
      answer({ question_id: 'q1', assignment_id: 'a1' }),
      answer({ question_id: 'q1', assignment_id: 'a1' }),
      answer({ question_id: 'q1', assignment_id: 'a2' }),
    ])
    expect(stats.get('q1')?.usedIn).toBe(2)
    expect(stats.get('q1')?.attempts).toBe(3)
  })

  it('withholds a discrimination it cannot honestly compute', () => {
    // Fewer attempts than the minimum, so the correlation would describe the
    // sample rather than the question.
    const few = computeQuestionStats([
      answer({ question_id: 'q1', submission_total: 3 }),
      answer({ question_id: 'q1', submission_total: 9 }),
    ])
    expect(few.get('q1')?.discrimination).toBeNull()

    // Enough attempts, but every attempt scored the same overall — no variance
    // left to correlate with.
    const flat = computeQuestionStats(
      Array.from({ length: 6 }, () => answer({ question_id: 'q1', submission_total: 7 })),
    )
    expect(flat.get('q1')?.discrimination).toBeNull()
  })

  it('reports the most recent attempt as when the question was last used', () => {
    const stats = computeQuestionStats([
      answer({ question_id: 'q1', submitted_at: '2026-03-01T00:00:00Z' }),
      answer({ question_id: 'q1', submitted_at: '2026-08-14T00:00:00Z' }),
      answer({ question_id: 'q1', submitted_at: '2026-05-20T00:00:00Z' }),
    ])
    expect(stats.get('q1')?.lastUsedAt).toBe('2026-08-14T00:00:00Z')
  })

  it('ignores answers with no date rather than treating them as the newest', () => {
    const stats = computeQuestionStats([
      answer({ question_id: 'q1', submitted_at: null }),
      answer({ question_id: 'q1', submitted_at: '2026-02-02T00:00:00Z' }),
    ])
    expect(stats.get('q1')?.lastUsedAt).toBe('2026-02-02T00:00:00Z')
  })

  it('says null when nothing carried a date, so the ranking calls it unmeasured', () => {
    const stats = computeQuestionStats([answer({ question_id: 'q1' })])
    expect(stats.get('q1')?.lastUsedAt).toBeNull()
  })
})
