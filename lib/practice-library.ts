import { matchesTags } from '@/lib/question-search'
import type { SearchableQuestion } from '@/lib/question-search'

/**
 * Practice-library tags use the question bank's existing whole-tag rule:
 * every selected tag must be present after trimming and case-folding. Keeping
 * this as a thin wrapper prevents the practice flow from growing a second set
 * of aliases or fuzzy matching rules.
 */
export function matchesPracticeTags(
  question: SearchableQuestion,
  selectedTags: string[],
): boolean {
  return matchesTags(question, selectedTags)
}

export const PRACTICE_INTERACTION_KINDS = [
  'view',
  'draft',
  'autosave',
  'check_answer',
  'view_solution',
] as const

export type PracticeInteractionKind = (typeof PRACTICE_INTERACTION_KINDS)[number]

export interface PracticeInteraction {
  kind: PracticeInteractionKind
  answer?: unknown
}

/** Whether an answer contains something the student deliberately supplied. */
export function hasPracticeAnswer(answer: unknown): boolean {
  if (answer == null) return false
  if (typeof answer === 'string') return answer.trim().length > 0
  if (typeof answer === 'number') return Number.isFinite(answer)
  if (typeof answer === 'boolean') return true
  if (Array.isArray(answer)) return answer.some(hasPracticeAnswer)
  if (typeof answer === 'object') {
    return Object.values(answer as Record<string, unknown>).some(hasPracticeAnswer)
  }
  return false
}

/**
 * Only the student's explicit ตรวจคำตอบ action counts as an attempt. Merely
 * seeing a question or solution, editing a draft, and autosaving stay outside
 * teacher-visible progress even if an answer happens to be present.
 */
export function countsAsPracticeAnswerAttempt(
  interaction: PracticeInteraction,
): boolean {
  return interaction.kind === 'check_answer' && hasPracticeAnswer(interaction.answer)
}

/**
 * The only durable record produced by a practice check. It is intentionally
 * metadata-only: answers, correctness, and scores never enter this contract.
 */
export type PracticeAnswerAttemptMetadata = Readonly<{
  library_id: string
  student_id: string
  question_id: string
  checked_at: string
  idempotency_key: string
}>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A retry key is one complete UUID, with no trimming or coercion. */
export function isPracticeIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function requireText(value: string, field: string): void {
  if (value.trim().length === 0) throw new Error(`${field} must not be empty`)
}

/**
 * Whitelists the append-only event shape and preserves the caller's retry key.
 * A caller must create one key per explicit check and reuse it for every retry;
 * this function never manufactures a replacement key.
 */
export function createPracticeAnswerAttemptMetadata(
  metadata: PracticeAnswerAttemptMetadata,
): PracticeAnswerAttemptMetadata {
  requireText(metadata.library_id, 'library_id')
  requireText(metadata.student_id, 'student_id')
  requireText(metadata.question_id, 'question_id')
  requireText(metadata.checked_at, 'checked_at')
  if (!isPracticeIdempotencyKey(metadata.idempotency_key)) {
    throw new Error('idempotency_key must be a UUID')
  }

  return Object.freeze({
    library_id: metadata.library_id,
    student_id: metadata.student_id,
    question_id: metadata.question_id,
    checked_at: metadata.checked_at,
    idempotency_key: metadata.idempotency_key,
  })
}
