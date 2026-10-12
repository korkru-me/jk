import { completionAttemptLimit, completionChoiceFor } from '@/lib/assignment-completion'
import type { Assignment } from '@/lib/types'

export interface ExerciseWaitingDetails {
  completion: 'complete' | 'threshold' | 'streak'
  maxAttempts: number | null
  scoreStrategy: 'best' | 'average' | 'latest'
  passingType: 'score' | 'percent' | null
  passingValue: number | null
  streakTarget: number | null
  streakQuestionCap: number | null
  retryWrongOnly: boolean
  instantCheck: boolean
  revealCheckAnswer: boolean
  requireWorkImage: boolean
}

/** Public settings only; use the same completion policy as the start gate.
 * Never return an assignment row, code, question content or answer key. */
export function exerciseWaitingDetails(assignment: Pick<Assignment, 'type' | 'completion_rule'
  | 'max_attempts' | 'passing_type' | 'passing_value' | 'score_strategy' | 'streak_target'
  | 'streak_question_cap' | 'retry_scope' | 'instant_check' | 'instant_check_answer_key' | 'require_work_image'>): ExerciseWaitingDetails | undefined {
  if (assignment.type !== 'exercise') return undefined
  const completion = completionChoiceFor(assignment)
  return {
    completion,
    maxAttempts: completionAttemptLimit(assignment),
    scoreStrategy: assignment.score_strategy === 'average' || assignment.score_strategy === 'latest'
      ? assignment.score_strategy : 'best',
    passingType: completion === 'threshold' ? assignment.passing_type : null,
    passingValue: completion === 'threshold' ? assignment.passing_value : null,
    streakTarget: completion === 'streak' ? assignment.streak_target : null,
    streakQuestionCap: completion === 'streak' ? assignment.streak_question_cap ?? null : null,
    retryWrongOnly: assignment.retry_scope === 'wrong_only',
    instantCheck: assignment.instant_check === true,
    revealCheckAnswer: assignment.instant_check === true && assignment.instant_check_answer_key === true,
    requireWorkImage: assignment.require_work_image === true,
  }
}

/** Question-free, explicitly allowlisted metadata. Never spread an assignment
 * or submission row into this DTO: both contain protected student/answer data. */
export interface ExamWaitingSummary {
  assignmentType?: 'exam' | 'exercise'
  exerciseDetails?: ExerciseWaitingDetails
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
