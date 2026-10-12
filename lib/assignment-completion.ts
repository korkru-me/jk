import { computePassed, type PassingType } from '@/lib/grading'
import type { AssignmentType, ScoreStrategy } from '@/lib/types'

export interface CompletionAssignment {
  type?: AssignmentType
  completion_rule?: string | null
  passing_type?: PassingType | null
  passing_value?: number | null
  display_max_score?: number | null
  max_attempts: number | null
}

export interface CompletionAttempt {
  status: string
  total_score?: number | null
  max_score?: number
  score_adjustment?: number | null
  streak_reached?: boolean | null
}

export const STREAK_RANDOM_SUBSET_REQUIRED_ERROR = 'ถูกติดกันจึงจบใช้ได้เมื่อเลือกสุ่มโจทย์จากคลังเท่านั้น'

/** Product rule: a streak is the variable-length practice flow and is offered
 * only after the teacher chooses a random subset. Doing every selected
 * question is the fixed-set flow and cannot be combined with a streak. */
export function streakRandomSubsetError(
  completionRule: string | null | undefined,
  randomQuestionCount: number | null | undefined,
): string | null {
  return completionRule === 'streak' && randomQuestionCount == null
    ? STREAK_RANDOM_SUBSET_REQUIRED_ERROR
    : null
}

export function completionChoiceFor(assignment: Pick<CompletionAssignment, 'completion_rule' | 'passing_type' | 'passing_value'>) {
  if (assignment.completion_rule === 'streak') return 'streak'
  return assignment.passing_type && assignment.passing_value != null ? 'threshold' : 'complete'
}

/** Mastery modes have no attempt quota: the first passing run ends the work.
 * Preserve legacy unlimited exercises in complete mode; only new work defaults
 * to one attempt. This is shared by server gates, student buttons and solutions. */
export function completionAttemptLimit(assignment: CompletionAssignment): number | null {
  if (completionChoiceFor(assignment) !== 'complete') return null
  return assignment.max_attempts ?? (assignment.type === 'exam' ? 1 : null)
}

/** Read every finished run, not just the latest/official score. A later failed
 * legacy run must never undo a previous pass. Only server-scored fields count. */
export function findPassingCompletion<T extends CompletionAttempt>(assignment: CompletionAssignment, attempts: readonly T[]): T | null {
  const choice = completionChoiceFor(assignment)
  if (choice === 'complete') return null
  return attempts.find(attempt => {
    if (attempt.status !== 'submitted' && attempt.status !== 'graded') return false
    if (choice === 'streak') return attempt.streak_reached === true
    const rawScore = attempt.total_score ?? null
    const rawMax = attempt.max_score ?? 0
    const displayMax = assignment.display_max_score
    const scaledScore = rawScore != null && displayMax != null && rawMax > 0
      ? Math.round(rawScore * displayMax / rawMax * 100) / 100
      : rawScore
    const max = displayMax ?? rawMax
    const score = scaledScore == null
      ? null
      : Math.round(Math.min(max, Math.max(0, scaledScore + (attempt.score_adjustment ?? 0))) * 100) / 100
    return computePassed(score, max, assignment.passing_type ?? null, assignment.passing_value ?? null) === true
  }) ?? null
}

/** Normalize on create/update too; hiding a field cannot be the write gate. */
export function completionAttemptSettings(assignment: CompletionAssignment, strategy: ScoreStrategy = 'best') {
  if (assignment.completion_rule !== 'streak' && assignment.passing_type != null
    && (!['score', 'percent'].includes(assignment.passing_type)
      || assignment.passing_value == null || !Number.isFinite(assignment.passing_value)
      || assignment.passing_value < 0 || (assignment.passing_type === 'percent' && assignment.passing_value > 100))) {
    return { max_attempts: assignment.max_attempts, score_strategy: strategy, error: 'กรุณากรอกเกณฑ์ผ่านให้ถูกต้อง' }
  }
  if (completionChoiceFor(assignment) !== 'complete') {
    return { max_attempts: null, score_strategy: 'best' as const, error: null }
  }
  const limit = assignment.max_attempts
  if (limit != null && (!Number.isSafeInteger(limit) || limit < 1)) {
    return { max_attempts: limit, score_strategy: strategy, error: 'จำนวนครั้งที่ทำได้ต้องเป็นจำนวนเต็มตั้งแต่ 1 ครั้งขึ้นไป' }
  }
  return { max_attempts: limit, score_strategy: strategy, error: null }
}
