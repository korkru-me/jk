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

/**
 * "ดูข้อสอบที่ทำเสร็จแล้ว": a ข้อสอบ whose teacher ticked allow_exam_review,
 * opening no earlier than show_results releases the answers. A แบบฝึกหัด never
 * has it — it already shows the เฉลย ข้อ by ข้อ while it is being done.
 */
export function canStudentOpenExamReview(
  assignment: {
    type?: string | null
    allow_exam_review?: boolean | null
    show_results: ResultVisibility
    end_at: string | null | undefined
  },
  now = Date.now(),
): boolean {
  return assignment.type === 'exam'
    && assignment.allow_exam_review === true
    && canStudentReviewAnswers(assignment.show_results, assignment.end_at, now)
}
