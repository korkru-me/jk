import { describe, expect, it } from 'vitest'
import { normalizeAssignmentQuestionPoints } from '@/lib/assignment-question-points'

describe('normalizeAssignmentQuestionPoints', () => {
  it('keeps valid per-question weights when every selected question is assigned', () => {
    expect(normalizeAssignmentQuestionPoints(
      ['q1', 'q2'],
      { q1: 2, q2: 3.5, outside: 10, invalid: 0 },
      null,
    )).toEqual({ q1: 2, q2: 3.5 })
  })

  it('returns null when an all-question assignment has no valid overrides', () => {
    expect(normalizeAssignmentQuestionPoints(['q1'], { q1: 0 }, null)).toBeNull()
  })

  it('forces every pool question to one point for a random subset', () => {
    expect(normalizeAssignmentQuestionPoints(
      ['q1', 'q2', 'q3'],
      { q1: 8, q2: 0.5, outside: 20 },
      2,
    )).toEqual({ q1: 1, q2: 1, q3: 1 })
  })
})
