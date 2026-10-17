import { describe, expect, it, vi } from 'vitest'

// Opening a non-numeric preview must not pull in the expression evaluator.
// Fail even for a transitive import, rather than checking filenames in source.
vi.mock('mathjs', () => { throw new Error('Scoring metadata must not load mathjs') })

import { gradeValue, naturalMaxScore } from './question-scoring'

describe('lightweight preview scoring', () => {
  it('counts structural points without the maths engine', () => {
    expect(naturalMaxScore('matching', undefined, null, 5)).toBe(5)
    expect(naturalMaxScore('true_false', {
      statements: [{}, {}], score_answer: 2, explanation_mode: 'none',
    }, null)).toBe(6)
    expect(naturalMaxScore('composite', { parts: [{ score: 2 }, {}] }, null)).toBe(3)
  })

  it('keeps absolute and percentage tolerances identical to the grader', () => {
    expect(gradeValue(105, 100, -5)).toBe(true)
    expect(gradeValue(106, 100, -5)).toBe(false)
    expect(gradeValue(105, 100, 1)).toBe(false)
  })
})
