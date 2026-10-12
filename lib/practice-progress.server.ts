import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  GET_PRACTICE_LIBRARY_STUDENT_PROGRESS_RPC,
  GET_PRACTICE_STUDENT_QUESTION_PROGRESS_RPC,
  isUuid,
} from '@/lib/practice-library-contracts'
import {
  assertSafePracticeProgressDto,
  PRACTICE_PROGRESS_PAGE_SIZE,
  type PracticeQuestionProgressSummary,
  type PracticeProgressSearchState,
  type PracticeStudentProgressSummary,
} from '@/lib/practice-progress'

type AdminClient = ReturnType<typeof createAdminClient>

type AuthorizedPracticeLibrary = Readonly<{
  id: string
  title: string
  classroom_id: string
  status: 'draft' | 'published' | 'closed'
}>

export type PracticeProgressOverview = Readonly<{
  library: AuthorizedPracticeLibrary
  total_question_count: number
  students: readonly PracticeStudentProgressSummary[]
}>

export type PracticeStudentProgress = Readonly<{
  library: AuthorizedPracticeLibrary
  student: Readonly<{
    id: string
    display_name: string
    class_number: number | null
  }>
  questions: readonly PracticeQuestionProgressSummary[]
  query: string
  total_question_count: number
  total_pages: number
  canonical_page: number
}>

function fail(operation: string, error: { message?: string } | null): never {
  throw new Error(`${operation}: ${error?.message ?? 'unknown database error'}`)
}

function safeCount(value: unknown): number | null {
  const count = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(count) && count >= 0 ? count : null
}

async function readAuthorizedLibrary(
  admin: AdminClient,
  libraryId: string,
  actorId: string,
): Promise<AuthorizedPracticeLibrary | null> {
  const { data: library, error: libraryError } = await admin
    .from('practice_libraries')
    .select('id, title, org_id, classroom_id, status')
    .eq('id', libraryId)
    .maybeSingle()

  if (libraryError) fail('read practice library for progress', libraryError)
  if (!library) return null

  const [actorResult, classroomResult, coTeacherResult] = await Promise.all([
    admin
      .from('users')
      .select('id, role, status')
      .eq('id', actorId)
      .maybeSingle(),
    admin
      .from('classrooms')
      .select('teacher_id, org_id, status, classroom_type')
      .eq('id', library.classroom_id)
      .maybeSingle(),
    admin
      .from('classroom_co_teachers')
      .select('permission')
      .eq('classroom_id', library.classroom_id)
      .eq('user_id', actorId)
      .in('permission', ['admin', 'manage'])
      .maybeSingle(),
  ])

  if (actorResult.error) fail('read practice progress actor', actorResult.error)
  if (classroomResult.error) fail('read practice classroom owner', classroomResult.error)
  if (coTeacherResult.error) fail('read practice co-teacher access', coTeacherResult.error)
  const actor = actorResult.data
  const classroom = classroomResult.data
  const coTeacher = coTeacherResult.data
  if (
    !actor
    || actor.status !== 'active'
    || (actor.role !== 'teacher' && actor.role !== 'admin')
    || !classroom
    || classroom.org_id !== library.org_id
    || classroom.status !== 'active'
    || classroom.classroom_type !== 'subject'
    || (classroom.teacher_id !== actorId && !coTeacher)
  ) return null

  return Object.freeze({
    id: library.id as string,
    title: library.title as string,
    classroom_id: library.classroom_id as string,
    status: library.status as AuthorizedPracticeLibrary['status'],
  })
}

export async function readPracticeProgressOverview(
  libraryId: string,
  actorId: string,
): Promise<PracticeProgressOverview | null> {
  if (!isUuid(libraryId) || !isUuid(actorId)) return null
  const admin = createAdminClient()
  const library = await readAuthorizedLibrary(admin, libraryId, actorId)
  if (!library) return null

  const [progressResult, questionCountResult] = await Promise.all([
    admin.rpc(GET_PRACTICE_LIBRARY_STUDENT_PROGRESS_RPC, {
      p_actor_id: actorId,
      p_library_id: library.id,
    }),
    admin
      .from('practice_library_questions')
      .select('question_id', { count: 'exact', head: true })
      .eq('library_id', library.id),
  ])

  if (progressResult.error) fail('read practice progress aggregate', progressResult.error)
  if (questionCountResult.error) fail('count practice questions', questionCountResult.error)
  if (!Array.isArray(progressResult.data)) fail('read practice progress aggregate', null)
  const students = (progressResult.data as unknown[]).map((raw) => {
    if (!raw || typeof raw !== 'object') fail('parse practice progress aggregate', null)
    const row = raw as Record<string, unknown>
    const attemptedQuestionCount = safeCount(row.attempted_question_count)
    const totalAttemptCount = safeCount(row.total_attempt_count)
    if (!isUuid(row.student_id) || typeof row.display_name !== 'string'
      || (row.class_number !== null && safeCount(row.class_number) === null)
      || attemptedQuestionCount === null || totalAttemptCount === null) {
      fail('parse practice progress aggregate', null)
    }
    return Object.freeze({
      student_id: row.student_id,
      display_name: row.display_name,
      class_number: row.class_number === null ? null : safeCount(row.class_number),
      attempted_question_count: attemptedQuestionCount,
      total_attempt_count: totalAttemptCount,
    }) satisfies PracticeStudentProgressSummary
  })
  const overview = Object.freeze({
    library,
    total_question_count: questionCountResult.count ?? 0,
    students,
  })
  assertSafePracticeProgressDto(overview)
  return overview
}

export async function readPracticeStudentProgress(
  libraryId: string,
  studentId: string,
  actorId: string,
  state: PracticeProgressSearchState = { q: '', page: 1 },
): Promise<PracticeStudentProgress | null> {
  if (!isUuid(libraryId) || !isUuid(studentId) || !isUuid(actorId)) return null
  const admin = createAdminClient()
  const library = await readAuthorizedLibrary(admin, libraryId, actorId)
  if (!library) return null

  const readQuestionPage = (page: number) => admin.rpc(
    GET_PRACTICE_STUDENT_QUESTION_PROGRESS_RPC,
    {
      p_actor_id: actorId,
      p_library_id: library.id,
      p_student_id: studentId,
      p_query: state.q,
      p_limit: PRACTICE_PROGRESS_PAGE_SIZE,
      p_offset: (page - 1) * PRACTICE_PROGRESS_PAGE_SIZE,
    },
  )
  let canonicalPage = state.page
  const [membershipResult, profileResult, initialQuestionResult] = await Promise.all([
    admin
      .from('classroom_students')
      .select('student_id, users!inner(full_name)')
      .eq('classroom_id', library.classroom_id)
      .eq('student_id', studentId)
      .maybeSingle(),
    admin
      .from('student_profiles')
      .select('class_number')
      .eq('student_id', studentId)
      .maybeSingle(),
    readQuestionPage(canonicalPage),
  ])

  if (membershipResult.error) fail('read practice student membership', membershipResult.error)
  if (profileResult.error) fail('read practice student profile', profileResult.error)
  if (initialQuestionResult.error) fail('read practice question progress aggregate', initialQuestionResult.error)
  if (!membershipResult.data) return null

  let questionData = Array.isArray(initialQuestionResult.data)
    ? initialQuestionResult.data as unknown[]
    : null
  if (!questionData) fail('parse practice question progress aggregate', null)
  if (questionData.length === 0 && canonicalPage > 1) {
    const fallback = await readQuestionPage(1)
    if (fallback.error || !Array.isArray(fallback.data)) {
      fail('read fallback practice question progress aggregate', fallback.error)
    }
    questionData = fallback.data as unknown[]
    canonicalPage = 1
  }

  const membership = membershipResult.data as unknown as {
    student_id: string
    users: { full_name: string }
  }
  let totalQuestionCount = 0
  const questions = questionData.map((raw) => {
    if (!raw || typeof raw !== 'object') fail('parse practice question progress aggregate', null)
    const row = raw as Record<string, unknown>
    const attemptCount = safeCount(row.attempt_count)
    const totalCount = safeCount(row.total_count)
    if (!isUuid(row.question_id) || typeof row.title !== 'string'
      || !Array.isArray(row.tags) || row.tags.some(tag => typeof tag !== 'string')
      || attemptCount === null || totalCount === null) {
      fail('parse practice question progress aggregate', null)
    }
    totalQuestionCount = totalCount
    return Object.freeze({
      question_id: row.question_id,
      title: row.title,
      tags: Object.freeze(row.tags.slice(0, 20)) as readonly string[],
      attempt_count: attemptCount,
    }) satisfies PracticeQuestionProgressSummary
  })
  const result = Object.freeze({
    library,
    student: Object.freeze({
      id: membership.student_id,
      display_name: membership.users.full_name,
      class_number: (profileResult.data?.class_number as number | null | undefined) ?? null,
    }),
    questions,
    query: state.q,
    total_question_count: totalQuestionCount,
    total_pages: Math.max(1, Math.ceil(totalQuestionCount / PRACTICE_PROGRESS_PAGE_SIZE)),
    canonical_page: canonicalPage,
  })
  assertSafePracticeProgressDto(result)
  return result
}
