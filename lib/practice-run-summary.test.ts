import { describe, expect, it } from 'vitest'
import { practiceRunSummary } from './practice-run-summary'

describe('practice run summary', () => {
  it('counts only the current exercise and keeps partial, pending and unchecked separate', () => {
    expect(practiceRunSummary(['a', 'b', 'c', 'd', 'e', 'f'], {
      a: { answered: true, verdict: 'correct' }, b: { answered: true, verdict: 'wrong' },
      c: { answered: true, verdict: 'partial' }, d: { answered: true, verdict: 'pending' },
      e: { answered: true }, outside: { answered: true, verdict: 'correct' },
    })).toEqual({ total: 6, answered: 5, correct: 1, wrong: 1, partial: 1, pending: 1, unchecked: 1, unanswered: 1 })
  })
  it('does not retain a verdict on a cleared answer, or divide by zero for an empty exercise', () => {
    expect(practiceRunSummary(['a'], { a: { answered: false, verdict: 'correct' } })).toMatchObject({ correct: 0, unanswered: 1 })
    expect(practiceRunSummary([], {})).toMatchObject({ total: 0, answered: 0, correct: 0 })
  })
})
