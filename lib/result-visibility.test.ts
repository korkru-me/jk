import { describe, expect, it } from 'vitest'
import { canStudentReviewAnswers, canStudentViewScore } from './result-visibility'

const now = Date.parse('2026-08-24T12:00:00Z')

describe('student result visibility', () => {
  it('releases immediate results and score-only scores', () => {
    expect(canStudentViewScore('immediate', null, now)).toBe(true)
    expect(canStudentReviewAnswers('immediate', null, now)).toBe(true)
    expect(canStudentViewScore('score_only', null, now)).toBe(true)
    expect(canStudentReviewAnswers('score_only', null, now)).toBe(false)
  })

  it('keeps after-due results private until the deadline passes', () => {
    expect(canStudentViewScore('after_due', '2026-08-25T12:00:00Z', now)).toBe(false)
    expect(canStudentReviewAnswers('after_due', '2026-08-25T12:00:00Z', now)).toBe(false)
    expect(canStudentViewScore('after_due', '2026-08-23T12:00:00Z', now)).toBe(true)
    expect(canStudentReviewAnswers('after_due', '2026-08-23T12:00:00Z', now)).toBe(true)
  })

  it('never releases scores or answers under never', () => {
    expect(canStudentViewScore('never', null, now)).toBe(false)
    expect(canStudentReviewAnswers('never', null, now)).toBe(false)
  })
})
