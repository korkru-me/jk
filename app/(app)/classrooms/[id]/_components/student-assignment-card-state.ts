import { computePassed } from '@/lib/grading'
import { completionAttemptLimit, completionChoiceFor } from '@/lib/assignment-completion'
import { canStudentReviewAnswers, canStudentViewScore } from '@/lib/result-visibility'
import { isCompleted, type StudentAssignmentRow } from './assignment-status'

/** Keep whole-card navigation tied to the same attempt rules as the old CTA. */
export function studentAssignmentCardState(a: StudentAssignmentRow, now = Date.now()) {
  const finished = a.submission?.status === 'submitted' || a.submission?.status === 'graded'
  const canShowScore = canStudentViewScore(a.show_results, a.end_at, now)
  const limit = completionAttemptLimit({ ...a, type: a.type === 'exam' ? 'exam' : 'exercise' })
  const remaining = limit == null ? null : Math.max(0, limit - a.attempts_used)
  const masteryComplete = completionChoiceFor(a) !== 'complete' && isCompleted(a)
  const canRetry = !a.has_in_progress && finished && (remaining == null || remaining > 0) && !masteryComplete
  const passed = finished ? computePassed(a.submission?.total_score ?? null, a.submission?.max_score ?? 0, a.passing_type, a.passing_value) : null
  const href = a.has_in_progress || canRetry || !finished
    ? `/assignments/${a.id}/take` : `/submissions/${a.submission!.id}`
  const actionLabel = a.has_in_progress ? 'ทำต่อ'
    : canRetry ? a.retry_scope === 'wrong_only' ? 'แก้ข้อที่ยังไม่เต็ม' : 'ลองใหม่'
    : !finished ? 'เปิดงาน'
    : canStudentReviewAnswers(a.show_results, a.end_at, now) ? 'ดูผลและเฉลย' : canShowScore ? 'ดูคะแนน' : 'ดูสถานะ'
  const statusLabel = a.has_in_progress ? 'กำลังทำ'
    : !finished ? '' : !canShowScore ? 'ส่งแล้ว'
    : masteryComplete ? 'ผ่านเงื่อนไขแล้ว'
    : passed === false ? 'ยังไม่ผ่านเกณฑ์' : passed === true ? 'ผ่านเกณฑ์' : 'ส่งแล้ว'

  return {
    href, actionLabel, finished, canRetry, remaining, canShowScore, statusLabel,
    statusVariant: a.has_in_progress ? 'statusWarning' as const
      : canShowScore && passed === false && !masteryComplete ? 'statusDestructive' as const : 'statusSuccess' as const,
    score: finished && canShowScore && a.submission?.total_score != null
      ? { total: a.submission.total_score, max: a.submission.max_score } : null,
  }
}
