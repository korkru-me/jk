import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssignmentAttemptSkeleton } from '@/lib/assignment-attempt'

/** Private server input. The caller must authenticate studentId, authorize the
 * exact assignment, verify the SEB session, and verify its signed start intent.
 * This adapter neither authenticates nor creates any claim/cookie/credential. */
export interface AtomicSebStartInput {
  assignmentId: string
  studentId: string
  releaseId: string
  configRevision: number
  verifiedAt: string
  validUntil: string
  platform: 'windows' | 'macos' | 'ios'
  version: string
  /** Null identifies first start; a signed completed predecessor identifies a retry. */
  predecessorId: string | null
  assignmentUpdatedAt: string
  questionVersions: readonly { questionId: string; updatedAt: string }[]
  freshAnswers: readonly AssignmentAttemptSkeleton[]
  carriedAnswerIds: readonly string[]
}

export type AtomicSebStartResult =
  | {
      ok: true
      submissionId: string
      startedAt: string
      status: 'in_progress' | 'submitted' | 'graded'
      attemptNumber: number
      configRevision: number
      created: boolean
    }
  | { ok: false; code: 'invalid_input' | 'denied' | 'conflict' | 'expired' | 'failed' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RELEASE = /^asr-[0-9a-f]{32}-r[1-9][0-9]{0,9}-[0-9a-f]{16}$/
const SNAPSHOT_KEYS = ['question_id', 'random_values', 'correct_answer', 'max_score', 'order_index', 'option_order']
const RESULT_KEYS = ['submission_id', 'started_at', 'submission_status', 'attempt_number', 'seb_config_revision', 'created']

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}

function timestamp(value: unknown): value is string {
  // Retain database microseconds. Converting updated_at through Date would lose
  // precision and make a correct optimistic concurrency token fail in SQL.
  return typeof value === 'string' && value.length <= 50
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value))
}

function freshAnswer(value: unknown): value is AssignmentAttemptSkeleton {
  if (!record(value) || !exactKeys(value, SNAPSHOT_KEYS)
    || typeof value.question_id !== 'string' || !UUID.test(value.question_id)
    || typeof value.correct_answer !== 'string'
    || typeof value.max_score !== 'number' || !Number.isFinite(value.max_score) || value.max_score < 0
    || typeof value.order_index !== 'number' || !Number.isSafeInteger(value.order_index)
    || value.order_index < 0 || value.order_index > 2_147_483_647
    || !record(value.random_values)
    || !Object.values(value.random_values).every(v => typeof v === 'number' && Number.isFinite(v))) return false
  return value.option_order === null || (Array.isArray(value.option_order)
    && value.option_order.every(v => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0)
    && new Set(value.option_order).size === value.option_order.length)
}

function validInput(value: AtomicSebStartInput) {
  return record(value)
    && typeof value.assignmentId === 'string' && UUID.test(value.assignmentId)
    && typeof value.studentId === 'string' && UUID.test(value.studentId)
    && typeof value.releaseId === 'string' && RELEASE.test(value.releaseId)
    && Number.isInteger(value.configRevision) && value.configRevision >= 1 && value.configRevision <= 2_147_483_646
    && ['windows', 'macos', 'ios'].includes(value.platform)
    && typeof value.version === 'string' && value.version.length >= 5 && value.version.length <= 240
    && !/[\u0000-\u001f\u007f]/.test(value.version)
    && timestamp(value.verifiedAt) && timestamp(value.validUntil) && timestamp(value.assignmentUpdatedAt)
    && (value.predecessorId === null || (typeof value.predecessorId === 'string' && UUID.test(value.predecessorId)))
    && Array.isArray(value.questionVersions) && value.questionVersions.every(v => record(v)
      && exactKeys(v, ['questionId', 'updatedAt']) && typeof v.questionId === 'string'
      && UUID.test(v.questionId) && timestamp(v.updatedAt))
    && new Set(value.questionVersions.map(v => v.questionId.toLowerCase())).size === value.questionVersions.length
    && Array.isArray(value.freshAnswers) && value.freshAnswers.every(freshAnswer)
    && Array.isArray(value.carriedAnswerIds) && value.carriedAnswerIds.every(v => typeof v === 'string' && UUID.test(v))
    && new Set(value.carriedAnswerIds.map(v => v.toLowerCase())).size === value.carriedAnswerIds.length
}

function failureCode(code: string | undefined): Extract<AtomicSebStartResult, { ok: false }>['code'] {
  if (code === '42501') return 'denied'
  if (code === '40001' || code === '23505' || code === '40P01') return 'conflict'
  if (code === 'PT410') return 'expired'
  if (code === '22023' || code === '22P02' || code === '22003' || code === '22007') return 'invalid_input'
  return 'failed'
}

export async function startSebSubmissionAtomic(
  admin: Pick<SupabaseClient, 'rpc'>,
  input: AtomicSebStartInput,
): Promise<AtomicSebStartResult> {
  if (!validInput(input)) return { ok: false, code: 'invalid_input' }
  try {
    const response = await admin.rpc('start_seb_submission_atomic', {
      p_assignment_id: input.assignmentId,
      p_student_id: input.studentId,
      p_release_id: input.releaseId,
      p_config_revision: input.configRevision,
      p_verified_at: input.verifiedAt,
      p_valid_until: input.validUntil,
      p_platform: input.platform,
      p_version: input.version,
      p_expected_predecessor_id: input.predecessorId,
      p_assignment_updated_at: input.assignmentUpdatedAt,
      p_question_versions: input.questionVersions.map(v => ({ question_id: v.questionId, updated_at: v.updatedAt })),
      p_fresh_answers: input.freshAnswers.map(v => ({
        question_id: v.question_id, random_values: v.random_values, correct_answer: v.correct_answer,
        max_score: v.max_score, order_index: v.order_index, option_order: v.option_order,
      })),
      p_carried_answer_ids: [...input.carriedAnswerIds],
    })
    if (response.error) return { ok: false, code: failureCode(response.error.code) }
    const row: unknown = Array.isArray(response.data) && response.data.length === 1 ? response.data[0] : null
    if (!record(row) || !exactKeys(row, RESULT_KEYS)
      || typeof row.submission_id !== 'string' || !UUID.test(row.submission_id)
      || !timestamp(row.started_at) || typeof row.submission_status !== 'string'
      || !['in_progress', 'submitted', 'graded'].includes(row.submission_status)
      || typeof row.attempt_number !== 'number' || !Number.isInteger(row.attempt_number) || row.attempt_number < 1
      || row.attempt_number > 2_147_483_646 || row.seb_config_revision !== input.configRevision
      || typeof row.created !== 'boolean' || (row.created && row.submission_status !== 'in_progress')) {
      return { ok: false, code: 'failed' }
    }
    return {
      ok: true, submissionId: row.submission_id, startedAt: row.started_at,
      status: row.submission_status as 'in_progress' | 'submitted' | 'graded',
      attemptNumber: row.attempt_number, configRevision: input.configRevision, created: row.created,
    }
  } catch {
    // RPC errors may contain SQL, answer snapshots or identifiers. None cross
    // this private adapter's narrow failure surface; reconciliation stays exact.
    return { ok: false, code: 'failed' }
  }
}
