export type ResultVisibility = 'immediate' | 'after_due' | 'score_only' | 'never' | string | null | undefined

export function canStudentViewScore(
  visibility: ResultVisibility,
  endAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (visibility === 'immediate' || visibility === 'score_only') return true
  if (visibility !== 'after_due') return false
  return !endAt || new Date(endAt).getTime() < now
}

export function canStudentReviewAnswers(
  visibility: ResultVisibility,
  endAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (visibility === 'immediate') return true
  if (visibility !== 'after_due') return false
  return !endAt || new Date(endAt).getTime() < now
}
