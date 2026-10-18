import { describe, expect, it } from 'vitest'
import { rescaleToDisplayMax } from './scoring'
import { findPassingCompletion } from './assignment-completion'
import { computePassed } from './grading'
import { summarizeStreakResults } from './streak-results'

describe('voided questions across grade projections', () => {
  it('removes the question weight while preserving the original custom scale and teacher adjustment', () => {
    const [visible] = rescaleToDisplayMax([{ total_score: 4, max_score: 10, voided_max_score: 10, score_adjustment: 1 }], () => 10)
    expect(visible.total_score).toBe(3)
    expect(visible.max_score).toBe(5)
  })
  it('uses each sampled attempt original ceiling, including students who never received the voided question', () => {
    const visible = rescaleToDisplayMax([
      { total_score: 4, max_score: 9, voided_max_score: 1 },
      { total_score: 5, max_score: 10, voided_max_score: 0 },
    ], () => 10)
    expect(visible.map(row => [row.total_score, row.max_score])).toEqual([[4,9],[5,10]])
  })
  it('does not award a passing result when every score-bearing question is void', () => {
    const [visible] = rescaleToDisplayMax([{ total_score: 0, max_score: 0, voided_max_score: 10 }], () => 20)
    expect([visible.total_score,visible.max_score]).toEqual([0,0])
    expect(computePassed(visible.total_score,visible.max_score,'percent',0)).toBeNull()
    expect(findPassingCompletion({ max_attempts: null, passing_type: 'percent', passing_value: 0, display_max_score: 20 },
      [{ status: 'graded', total_score: 0, max_score: 0, voided_max_score: 10 }])).toBeNull()
  })
  it('evaluates point thresholds on the reduced display ceiling', () => {
    const run = { status: 'graded', total_score: 8, max_score: 10, voided_max_score: 10 }
    expect(findPassingCompletion({ max_attempts: null, passing_type: 'score', passing_value: 6, display_max_score: 10 }, [run])).toBeNull()
    expect(findPassingCompletion({ max_attempts: null, passing_type: 'score', passing_value: 4, display_max_score: 10 }, [run])).toBe(run)
  })
  it('excludes voids from streak question counts and correct counts', () => {
    const result = summarizeStreakResults([{ id: 'attempt', best_streak: 1, streak_reached: false }], [
      { submission_id: 'attempt', score: 0, max_score: 0 },
      { submission_id: 'attempt', score: 1, max_score: 1 },
    ])
    expect(result.byId.get('attempt')).toMatchObject({ asked: 1, correct: 1 })
  })
})
