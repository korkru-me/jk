import { describe, expect, it } from 'vitest'
import { rescaleToDisplayMax, selectOfficialAttempt } from './scoring'

describe('teacher score adjustments', () => {
  it('applies display points after rescaling and clamps to the visible range', () => {
    const rows = rescaleToDisplayMax([
      { total_score: 8, max_score: 20, score_adjustment: -2 },
      { total_score: 19, max_score: 20, score_adjustment: 3 },
      { total_score: 1, max_score: 20, score_adjustment: -3 },
    ], () => 10)
    expect(rows.map(row => row.total_score)).toEqual([2, 10, 0])
    expect(rows.map(row => row.max_score)).toEqual([10, 10, 10])
  })

  it('keeps an unscored attempt null and preserves all score strategies', () => {
    expect(rescaleToDisplayMax([
      { total_score: null, max_score: 10, score_adjustment: -2 },
    ], () => 10)[0].total_score).toBeNull()

    const attempts = rescaleToDisplayMax([
      { status: 'graded', total_score: 8, max_score: 10, score_adjustment: -2, attempt_number: 1 },
      { status: 'graded', total_score: 6, max_score: 10, score_adjustment: -2, attempt_number: 2 },
    ], () => null)
    expect(selectOfficialAttempt(attempts, 'best')?.total_score).toBe(6)
    expect(selectOfficialAttempt(attempts, 'latest')?.total_score).toBe(4)
    expect(selectOfficialAttempt(attempts, 'average')?.total_score).toBe(5)
  })
})
