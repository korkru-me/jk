/** Question-free, explicitly allowlisted metadata. Never spread an assignment
 * or submission row into this DTO: both contain protected student/answer data. */
export interface ExamWaitingSummary {
  title: string
  description: string | null
  durationMinutes: number | null
  questionCount: number | null
  endAt: string | null
  accessMode: 'browser' | 'seb' | 'android_monitored'
  requiresAccessCode: boolean
  previousSubmissionId: string | null
  activeSubmissionId: string | null
  completedSubmissionId: string | null
  expired: boolean
  startedAt: string | null
  blockedReason: string | null
}

/** A URL is only a request to resume, never permission to allocate an attempt. */
export function waitingResumeId(summary: ExamWaitingSummary, requested: unknown): string | null {
  return !summary.blockedReason && typeof requested === 'string'
    && requested === summary.activeSubmissionId ? summary.activeSubmissionId : null
}
