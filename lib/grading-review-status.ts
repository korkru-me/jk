import type { GradingScoreParts } from './grading-workspace'

/** Required method review stays pending while its point allocation is unset.
 * This describes review work only; it never changes stored weights or scores. */
export function pendingWorkForReview(parts: GradingScoreParts): boolean {
  return parts.work.pending || parts.needsAllocation
}

export function gradingReviewPresentation(parts: GradingScoreParts) {
  const pendingAnswer = parts.answer.pending
  const pendingWork = pendingWorkForReview(parts)
  return {
    pendingAnswer,
    pendingWork,
    automatic: parts.answer.source === 'automatic' && !pendingAnswer && !pendingWork,
    teacher: parts.answer.source === 'teacher' || parts.work.source === 'teacher',
  }
}
