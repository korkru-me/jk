import { describe, expect, it } from 'vitest'
import { scoreParts, type GradingAnswer } from './grading-workspace'
import { gradingReviewPresentation, pendingWorkForReview } from './grading-review-status'
import type { Question } from './types'

const question = (overrides: Partial<Question> = {}) => ({
  id: 'q', question_type: 'written', requires_work_image: true, ...overrides,
} as Question)
const answer = (overrides: Partial<GradingAnswer> = {}): GradingAnswer => ({
  id: 'answer', submissionId: 'submission', studentId: 'student', questionId: 'q',
  randomValues: {}, correctAnswer: '42', studentAnswer: '42', isCorrect: true,
  score: 8, maxScore: 8, optionOrder: null, orderIndex: 0, workImages: [],
  scoreEditedBy: null, scoreEditedAt: null, ...overrides,
})

describe('grading review status presentation', () => {
  it('shows unallocated required method review as pending even before a work score component exists', () => {
    const parts = scoreParts(answer({ gradingPartsConfigured: false }), question())
    expect(parts).toMatchObject({ hasWork: false, needsAllocation: true, total: 8, maxScore: 8 })
    expect(pendingWorkForReview(parts)).toBe(true)
    expect(gradingReviewPresentation(parts)).toEqual({ pendingAnswer: false, pendingWork: true, automatic: false, teacher: false })
  })
  it('does not mark an unallocated zero-work projection as completed merely because its default work weight is zero', () => {
    const parts = scoreParts(answer({ answerMaxScore: 8, workMaxScore: 0, gradingPartsConfigured: false }), question())
    expect(gradingReviewPresentation(parts)).toMatchObject({ pendingWork: true, automatic: false })
  })
  it('suppresses the completed automatic count while configured work awaits teacher review', () => {
    const parts = scoreParts(answer({ gradingPartsConfigured: true, answerMaxScore: 3, answerScore: 3, workMaxScore: 5 }), question())
    expect(parts.answer).toMatchObject({ source: 'automatic', pending: false })
    expect(gradingReviewPresentation(parts)).toEqual({ pendingAnswer: false, pendingWork: true, automatic: false, teacher: false })
  })
  it('preserves a completed teacher review, including zero points awarded to the method', () => {
    const parts = scoreParts(answer({ gradingPartsConfigured: true, answerMaxScore: 3, answerScore: 3,
      workMaxScore: 5, workScore: 0, workReviewedAt: 'now', scoreEditedBy: 'teacher' }), question())
    expect(gradingReviewPresentation(parts)).toEqual({ pendingAnswer: false, pendingWork: false, automatic: true, teacher: true })
  })
  it('treats an explicitly configured zero-point work allocation as complete', () => {
    const parts = scoreParts(answer({ gradingPartsConfigured: true, answerMaxScore: 8, answerScore: 8, workMaxScore: 0, workScore: 0 }), question())
    expect(gradingReviewPresentation(parts)).toEqual({ pendingAnswer: false, pendingWork: false, automatic: true, teacher: false })
  })
  it('does not invent pending method review for a question without that requirement', () => {
    const parts = scoreParts(answer({ gradingPartsConfigured: false }), question({ requires_work_image: false }))
    expect(gradingReviewPresentation(parts)).toEqual({ pendingAnswer: false, pendingWork: false, automatic: true, teacher: false })
  })
  it.each(['essay', 'file_upload'] as const)('preserves pending teacher answer review for %s', question_type => {
    const parts = scoreParts(answer({ gradingPartsConfigured: false }), question({ question_type }))
    expect(gradingReviewPresentation(parts)).toEqual({ pendingAnswer: true, pendingWork: false, automatic: false, teacher: false })
  })
  it('preserves independent answer and method work when both require review', () => {
    const parts = scoreParts(answer({ isCorrect: null, gradingPartsConfigured: false }), question())
    expect(gradingReviewPresentation(parts)).toMatchObject({ pendingAnswer: true, pendingWork: true, automatic: false })
  })
  it('keeps void answers outside every pending and completed review count', () => {
    const parts = scoreParts(answer({ isVoid: true, maxScore: 0, voidOriginalMaxScore: 8, gradingPartsConfigured: false }), question())
    expect(gradingReviewPresentation(parts)).toEqual({ pendingAnswer: false, pendingWork: false, automatic: false, teacher: false })
  })
  it('does not modify score values, weights, allocation requirements, or component sources', () => {
    const parts = scoreParts(answer({ gradingPartsConfigured: false }), question())
    const before = structuredClone(parts)
    gradingReviewPresentation(parts)
    expect(parts).toEqual(before)
  })
})
