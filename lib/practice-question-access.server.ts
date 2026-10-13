import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  GET_PRACTICE_QUESTION_FOR_STUDENT_RPC,
  isUuid,
  RECORD_PRACTICE_ANSWER_ATTEMPT_RPC,
  SEARCH_PRACTICE_LIBRARY_QUESTIONS_RPC,
} from '@/lib/practice-library-contracts'
import {
  isPracticeLibraryEnabled,
  PRACTICE_SUPPORTED_QUESTION_TYPES,
  practiceQuestionSupport,
} from '@/lib/practice-question'
import {
  PRACTICE_PAGE_SIZE,
  practiceSearchTerms,
  practiceTotalPages,
  type PracticeSearchState,
} from '@/lib/practice-search'
import type { Question, QuestionType } from '@/lib/types'
import { createHash, timingSafeEqual } from 'node:crypto'

/** Keep planned table/RPC literals in one module while the migration is gated. */
export const PRACTICE_STORAGE = Object.freeze({
  libraries: 'practice_libraries',
  libraryQuestions: 'practice_library_questions',
  attempts: 'practice_answer_attempts',
  recordAttemptRpc: RECORD_PRACTICE_ANSWER_ATTEMPT_RPC,
  searchQuestionsRpc: SEARCH_PRACTICE_LIBRARY_QUESTIONS_RPC,
  studentQuestionRpc: GET_PRACTICE_QUESTION_FOR_STUDENT_RPC,
})

export interface StudentPracticeLibrary {
  id: string
  classroomId: string
  title: string
  description: string | null
  revealAnswerKey: boolean
  requiresAccessCode: boolean
  calculatorEnabled: boolean
  scratchpadEnabled: boolean
  shuffleOptions: boolean
}

export interface PracticeQuestionListItem {
  id: string
  title: string
  questionType: QuestionType
  tags: string[]
  position: number
  attemptCount: number
}

export interface PracticeQuestionSearchResult {
  status: 'ready'
  library: StudentPracticeLibrary
  items: PracticeQuestionListItem[]
  total: number
  totalPages: number
  canonicalPage: number
}

export type PracticeQuestionSearchAccess = PracticeQuestionSearchResult | {
  status: 'disabled' | 'not_found' | 'forbidden' | 'unavailable'
}

export type PracticeLibraryWaitingAccess = {
  status: 'ready'
  library: StudentPracticeLibrary
  questionCount: number
} | {
  status: 'disabled' | 'not_found' | 'forbidden' | 'unavailable'
}

export type PracticeQuestionAccess = {
  status: 'ready'
  library: StudentPracticeLibrary
  question: Question
  position: number
} | {
  status: 'disabled' | 'not_found' | 'forbidden' | 'unsupported' | 'unavailable'
}

type AdminClient = ReturnType<typeof createAdminClient>

type LibraryRow = {
  id: string
  org_id: string
  classroom_id: string
  title: string
  description: string | null
  status: string
  reveal_answer_key: boolean
  access_code: string | null
  calculator_enabled: boolean
  scratchpad_enabled: boolean
  shuffle_options: boolean
}

type StudentLibraryAccess = {
  status: 'ready'
  library: StudentPracticeLibrary
} | {
  status: 'not_found' | 'forbidden' | 'unavailable'
}

function asOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function createPracticeAdmin(): AdminClient | null {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return null
    }
    return createAdminClient()
  } catch {
    return null
  }
}

async function readStudentLibraryAccess(
  admin: AdminClient,
  actorId: string,
  libraryId: string,
): Promise<StudentLibraryAccess> {
  const { data, error } = await admin
    .from(PRACTICE_STORAGE.libraries)
    .select('id, org_id, classroom_id, title, description, status, reveal_answer_key, access_code, calculator_enabled, scratchpad_enabled, shuffle_options')
    .eq('id', libraryId)
    .maybeSingle()
  if (error) return { status: 'unavailable' }
  if (!data) return { status: 'not_found' }
  const row = data as unknown as LibraryRow
  if (row.status !== 'published') return { status: 'forbidden' }

  // This path intentionally uses the admin client to load a trusted grading
  // record, so every boundary normally supplied by RLS must be repeated here.
  const [actorResult, classroomResult, membershipResult] = await Promise.all([
    admin
      .from('users')
      .select('id, role, status')
      .eq('id', actorId)
      .maybeSingle(),
    admin
      .from('classrooms')
      .select('id, org_id, status, classroom_type')
      .eq('id', row.classroom_id)
      .maybeSingle(),
    admin
      .from('classroom_students')
      .select('student_id')
      .eq('classroom_id', row.classroom_id)
      .eq('student_id', actorId)
      .maybeSingle(),
  ])
  if (actorResult.error || classroomResult.error || membershipResult.error) {
    return { status: 'unavailable' }
  }
  if (
    actorResult.data?.status !== 'active'
    || actorResult.data.role !== 'student'
    || classroomResult.data?.org_id !== row.org_id
    || classroomResult.data.status !== 'active'
    || classroomResult.data.classroom_type !== 'subject'
    || !membershipResult.data
  ) {
    return { status: 'forbidden' }
  }

  return {
    status: 'ready',
    library: Object.freeze({
      id: row.id,
      classroomId: row.classroom_id,
      title: row.title,
      description: row.description,
      revealAnswerKey: row.reveal_answer_key === true,
      requiresAccessCode: Boolean(row.access_code),
      calculatorEnabled: row.calculator_enabled === true,
      scratchpadEnabled: row.scratchpad_enabled === true,
      shuffleOptions: row.shuffle_options === true,
    }),
  }
}

export async function verifyPracticeLibraryAccessCode(
  actorId: string,
  libraryId: string,
  suppliedCode: string,
): Promise<'accepted' | 'rejected' | 'unavailable'> {
  if (!isPracticeLibraryEnabled(process.env)
    || !isUuid(actorId)
    || !isUuid(libraryId)
    || typeof suppliedCode !== 'string'
    || suppliedCode.length > 100) return 'rejected'
  const admin = createPracticeAdmin()
  if (!admin) return 'unavailable'
  const access = await readStudentLibraryAccess(admin, actorId, libraryId)
  if (access.status === 'unavailable') return 'unavailable'
  if (access.status !== 'ready') return 'rejected'
  const { data, error } = await admin
    .from(PRACTICE_STORAGE.libraries)
    .select('access_code')
    .eq('id', libraryId)
    .maybeSingle()
  if (error || !data) return 'unavailable'
  const expectedCode = typeof data.access_code === 'string' ? data.access_code.trim() : ''
  if (!expectedCode) return 'accepted'
  const normalize = (value: string) => createHash('sha256')
    .update(value.trim().toLocaleUpperCase('th-TH'))
    .digest()
  return timingSafeEqual(normalize(suppliedCode), normalize(expectedCode)) ? 'accepted' : 'rejected'
}

export async function loadPracticeLibraryWaiting(
  actorId: string,
  libraryId: string,
): Promise<PracticeLibraryWaitingAccess> {
  if (!isPracticeLibraryEnabled(process.env)) return { status: 'disabled' }
  if (!isUuid(actorId) || !isUuid(libraryId)) return { status: 'not_found' }
  const admin = createPracticeAdmin()
  if (!admin) return { status: 'unavailable' }
  const access = await readStudentLibraryAccess(admin, actorId, libraryId)
  if (access.status !== 'ready') return access

  const { count, error } = await admin
    .from(PRACTICE_STORAGE.libraryQuestions)
    .select('question_id', { count: 'exact', head: true })
    .eq('library_id', libraryId)
  if (error || count === null) return { status: 'unavailable' }
  return {
    status: 'ready',
    library: access.library,
    questionCount: count,
  }
}

export async function loadPracticeLibrarySearch(
  actorId: string,
  libraryId: string,
  state: PracticeSearchState,
): Promise<PracticeQuestionSearchAccess> {
  if (!isPracticeLibraryEnabled(process.env)) return { status: 'disabled' }
  if (!isUuid(actorId) || !isUuid(libraryId)) return { status: 'not_found' }
  const admin = createPracticeAdmin()
  if (!admin) return { status: 'unavailable' }
  const access = await readStudentLibraryAccess(admin, actorId, libraryId)
  if (access.status !== 'ready') return access

  try {
    const readPage = (page: number) => admin.rpc(PRACTICE_STORAGE.searchQuestionsRpc, {
        p_actor_id: actorId,
        p_library_id: libraryId,
        p_terms: practiceSearchTerms(state.q),
        p_tags: state.tags,
        p_limit: PRACTICE_PAGE_SIZE,
        p_offset: (page - 1) * PRACTICE_PAGE_SIZE,
      })
    let pageResult = await readPage(state.page)
    if (pageResult.error || !Array.isArray(pageResult.data)) return { status: 'unavailable' }
    let rawRows = pageResult.data as unknown[]
    if (rawRows.length === 0 && state.page > 1) {
      pageResult = await readPage(1)
      if (pageResult.error || !Array.isArray(pageResult.data)) return { status: 'unavailable' }
      rawRows = pageResult.data as unknown[]
    }
    let total = 0
    const seen = new Set<string>()
    const items: PracticeQuestionListItem[] = []
    for (const raw of rawRows) {
      if (!raw || typeof raw !== 'object') return { status: 'unavailable' }
      const row = raw as Record<string, unknown>
      const attemptCount = typeof row.attempt_count === 'number'
        ? row.attempt_count
        : Number(row.attempt_count)
      const rowTotal = typeof row.total_count === 'number'
        ? row.total_count
        : Number(row.total_count)
      if (!isUuid(row.question_id)
        || seen.has(row.question_id)
        || typeof row.title !== 'string'
        || typeof row.position !== 'number'
        || !Number.isSafeInteger(row.position)
        || row.position < 0
        || typeof row.question_type !== 'string'
        || !(PRACTICE_SUPPORTED_QUESTION_TYPES as readonly string[]).includes(row.question_type)
        || !Array.isArray(row.tags)
        || row.tags.some(tag => typeof tag !== 'string')
        || !Number.isSafeInteger(attemptCount)
        || attemptCount < 0
        || !Number.isSafeInteger(rowTotal)
        || rowTotal < 0
        || (items.length > 0 && total !== rowTotal)) return { status: 'unavailable' }
      total = rowTotal
      seen.add(row.question_id)
      items.push({
        id: row.question_id,
        title: row.title,
        questionType: row.question_type as QuestionType,
        tags: row.tags.slice(0, 20) as string[],
        position: row.position,
        attemptCount,
      })
    }
    const totalPages = practiceTotalPages(total)
    const canonicalPage = Math.min(state.page, totalPages)
    return {
      status: 'ready',
      library: access.library,
      items,
      total,
      totalPages,
      canonicalPage,
    }
  } catch {
    return { status: 'unavailable' }
  }
}

export async function loadPracticeQuestionForStudent(
  actorId: string,
  libraryId: string,
  questionId: string,
): Promise<PracticeQuestionAccess> {
  if (!isPracticeLibraryEnabled(process.env)) return { status: 'disabled' }
  if (!isUuid(actorId) || !isUuid(libraryId) || !isUuid(questionId)) {
    return { status: 'not_found' }
  }
  const admin = createPracticeAdmin()
  if (!admin) return { status: 'unavailable' }

  try {
    const { data, error } = await admin.rpc(PRACTICE_STORAGE.studentQuestionRpc, {
      p_actor_id: actorId,
      p_library_id: libraryId,
      p_question_id: questionId,
    })
    if (error) return { status: 'unavailable' }
    if (!Array.isArray(data) || data.length > 1) return { status: 'unavailable' }
    if (data.length === 0) return { status: 'not_found' }
    const row = data[0] as unknown as Record<string, unknown>
    const answerTolerance = typeof row.answer_tolerance === 'number'
      ? row.answer_tolerance
      : Number(row.answer_tolerance)
    if (row.library_id !== libraryId
      || !isUuid(row.classroom_id)
      || typeof row.library_title !== 'string'
      || (row.library_description !== null && typeof row.library_description !== 'string')
      || typeof row.reveal_answer_key !== 'boolean'
      || typeof row.requires_access_code !== 'boolean'
      || typeof row.calculator_enabled !== 'boolean'
      || typeof row.scratchpad_enabled !== 'boolean'
      || typeof row.shuffle_options !== 'boolean'
      || row.question_id !== questionId
      || !Number.isSafeInteger(row.position)
      || (row.position as number) < 0
      || typeof row.title !== 'string'
      || typeof row.question_text !== 'string'
      || typeof row.question_type !== 'string'
      || !Array.isArray(row.variables)
      || !Array.isArray(row.logic_rules)
      || typeof row.answer_formula !== 'string'
      || (row.answer_unit !== null && typeof row.answer_unit !== 'string')
      || !Number.isFinite(answerTolerance)
      || (row.answer_parts !== null && !Array.isArray(row.answer_parts))
      || (row.mcq_options !== null && !Array.isArray(row.mcq_options))
      || !Array.isArray(row.tags)
      || row.tags.some(tag => typeof tag !== 'string')
      || (row.image_urls !== null && (!Array.isArray(row.image_urls)
        || row.image_urls.some(url => typeof url !== 'string')))
      || (row.extra_data !== null
        && (typeof row.extra_data !== 'object' || Array.isArray(row.extra_data)))
      || typeof row.is_random !== 'boolean') return { status: 'unavailable' }

    const question = {
      id: row.question_id,
      title: row.title,
      question_text: row.question_text,
      question_type: row.question_type,
      variables: row.variables,
      logic_rules: row.logic_rules,
      answer_formula: row.answer_formula,
      answer_unit: row.answer_unit,
      answer_tolerance: answerTolerance,
      answer_parts: row.answer_parts,
      mcq_options: row.mcq_options,
      tags: row.tags,
      image_urls: row.image_urls,
      extra_data: row.extra_data,
      is_random: row.is_random,
    } as unknown as Question
    if (!practiceQuestionSupport(question).supported) return { status: 'unsupported' }
    return {
      status: 'ready',
      library: Object.freeze({
        id: libraryId,
        classroomId: row.classroom_id,
        title: row.library_title,
        description: row.library_description,
        revealAnswerKey: row.reveal_answer_key,
        requiresAccessCode: row.requires_access_code,
        calculatorEnabled: row.calculator_enabled,
        scratchpadEnabled: row.scratchpad_enabled,
        shuffleOptions: row.shuffle_options,
      }),
      question,
      position: row.position as number,
    }
  } catch {
    return { status: 'unavailable' }
  }
}
