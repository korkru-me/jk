/**
 * Pure contracts for the self-practice domain.
 *
 * These definitions deliberately stay independent from assignments and
 * submissions. They are also the allowlist used at the service boundary: a
 * practice check may persist identity metadata, but never the student's
 * answer, correctness, score, or client supplied time.
 */

export const PRACTICE_LIBRARY_STATUSES = [
  'draft',
  'published',
  'closed',
] as const

export type PracticeLibraryStatus = (typeof PRACTICE_LIBRARY_STATUSES)[number]

export const PRACTICE_LIBRARY_COLUMNS = [
  'id',
  'org_id',
  'classroom_id',
  'created_by',
  'title',
  'description',
  'status',
  'reveal_answer_key',
  'access_code',
  'calculator_enabled',
  'scratchpad_enabled',
  'shuffle_questions',
  'shuffle_options',
  'published_at',
  'closed_at',
  'created_at',
  'updated_at',
] as const

export type PracticeLibraryRow = Readonly<{
  id: string
  org_id: string
  classroom_id: string
  created_by: string
  title: string
  description: string | null
  status: PracticeLibraryStatus
  reveal_answer_key: boolean
  access_code: string | null
  calculator_enabled: boolean
  scratchpad_enabled: boolean
  shuffle_questions: boolean
  shuffle_options: boolean
  published_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}>

export const PRACTICE_LIBRARY_QUESTION_COLUMNS = [
  'library_id',
  'question_id',
  'position',
  'created_at',
] as const

export type PracticeLibraryQuestionRow = Readonly<{
  library_id: string
  question_id: string
  position: number
  created_at: string
}>

/** The complete and only durable payload for an accepted answer check. */
export const PRACTICE_ANSWER_ATTEMPT_COLUMNS = [
  'library_id',
  'student_id',
  'question_id',
  'checked_at',
  'idempotency_key',
] as const

export type PracticeAnswerAttemptRow = Readonly<{
  library_id: string
  student_id: string
  question_id: string
  checked_at: string
  idempotency_key: string
}>

export const RECORD_PRACTICE_ANSWER_ATTEMPT_RPC = 'record_practice_answer_attempt' as const
export const SEARCH_PRACTICE_LIBRARY_QUESTIONS_RPC = 'search_practice_library_questions' as const
export const GET_PRACTICE_QUESTION_FOR_STUDENT_RPC = 'get_practice_question_for_student' as const
export const GET_PRACTICE_LIBRARY_QUESTIONS_FOR_MANAGER_RPC = 'get_practice_library_questions_for_manager' as const
export const GET_PRACTICE_LIBRARY_STUDENT_PROGRESS_RPC = 'get_practice_library_student_progress' as const
export const GET_PRACTICE_STUDENT_QUESTION_PROGRESS_RPC = 'get_practice_student_question_progress' as const
export const BULK_UPDATE_PRACTICE_QUESTION_TAGS_RPC = 'bulk_update_practice_question_tags' as const
export const REPLACE_DRAFT_PRACTICE_LIBRARY_QUESTIONS_RPC = 'replace_draft_practice_library_questions' as const
export const CREATE_PRACTICE_LIBRARY_RPC = 'create_practice_library' as const
export const CREATE_PRACTICE_LIBRARIES_FOR_CLASSROOMS_RPC = 'create_practice_libraries_for_classrooms' as const
export const UPDATE_PRACTICE_LIBRARY_DRAFT_RPC = 'update_practice_library_draft' as const
export const DUPLICATE_PRACTICE_LIBRARY_RPC = 'duplicate_practice_library' as const

/**
 * The browser input intentionally omits actor_id, student_id, and checked_at.
 * The server session supplies p_actor_id; the database rechecks that actor and
 * supplies checked_at from its own clock.
 */
export type RecordPracticeAnswerAttemptInput = Readonly<{
  library_id: string
  question_id: string
  idempotency_key: string
}>

export type RecordPracticeAnswerAttemptRpcArgs = Readonly<{
  p_actor_id: string
  p_library_id: string
  p_question_id: string
  p_idempotency_key: string
}>

export type RecordPracticeAnswerAttemptRpcResult = PracticeAnswerAttemptRow &
  Readonly<{ created: boolean }>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/**
 * Reject, rather than silently discard, extra fields at the append boundary.
 * This prevents a future caller from assuming answer-bearing data is stored.
 */
export function parseRecordPracticeAnswerAttemptInput(
  value: unknown,
): RecordPracticeAnswerAttemptInput {
  if (!isRecord(value)) throw new Error('practice attempt input must be an object')

  const keys = Object.keys(value).sort()
  const expected = ['idempotency_key', 'library_id', 'question_id']
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error('practice attempt input contains unsupported fields')
  }

  if (!isUuid(value.library_id)) throw new Error('library_id must be a UUID')
  if (!isUuid(value.question_id)) throw new Error('question_id must be a UUID')
  if (!isUuid(value.idempotency_key)) throw new Error('idempotency_key must be a UUID')

  return Object.freeze({
    library_id: value.library_id,
    question_id: value.question_id,
    idempotency_key: value.idempotency_key,
  })
}

export function toRecordPracticeAnswerAttemptRpcArgs(
  actorId: string,
  input: RecordPracticeAnswerAttemptInput,
): RecordPracticeAnswerAttemptRpcArgs {
  if (!isUuid(actorId)) throw new Error('actor_id must be a UUID')

  return Object.freeze({
    p_actor_id: actorId,
    p_library_id: input.library_id,
    p_question_id: input.question_id,
    p_idempotency_key: input.idempotency_key,
  })
}

export const PRACTICE_CLASSROOM_ACCESS = [
  'classroom_owner',
  'co_teacher_admin',
  'co_teacher_manage',
  'co_teacher_view',
  'student_member',
  'none',
] as const

export type PracticeClassroomAccess = (typeof PRACTICE_CLASSROOM_ACCESS)[number]

const TEACHER_READ_ACCESS = new Set<PracticeClassroomAccess>([
  'classroom_owner',
  'co_teacher_admin',
  'co_teacher_manage',
  'co_teacher_view',
])

const TEACHER_MANAGE_ACCESS = new Set<PracticeClassroomAccess>([
  'classroom_owner',
  'co_teacher_admin',
  'co_teacher_manage',
])

const TEACHER_PROGRESS_ACCESS = TEACHER_MANAGE_ACCESS

export function canReadPracticeLibrary(
  access: PracticeClassroomAccess,
  status: PracticeLibraryStatus,
): boolean {
  if (TEACHER_READ_ACCESS.has(access)) return true
  return access === 'student_member' && status === 'published'
}

export function canManagePracticeLibrary(access: PracticeClassroomAccess): boolean {
  return TEACHER_MANAGE_ACCESS.has(access)
}

export function canReadAllPracticeProgress(access: PracticeClassroomAccess): boolean {
  return TEACHER_PROGRESS_ACCESS.has(access)
}

export function canReadOwnPracticeProgress(
  access: PracticeClassroomAccess,
  status: PracticeLibraryStatus,
): boolean {
  return access === 'student_member' && status === 'published'
}

export function canRecordPracticeAnswerAttempt(
  access: PracticeClassroomAccess,
  status: PracticeLibraryStatus,
): boolean {
  return access === 'student_member' && status === 'published'
}
