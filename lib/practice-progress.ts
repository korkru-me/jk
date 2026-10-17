export type PracticeProgressAttemptRow = Readonly<{
  student_id: string
  question_id: string
}>

export type PracticeProgressStudent = Readonly<{
  id: string
  display_name: string
  class_number: number | null
}>

export type PracticeProgressQuestion = Readonly<{
  id: string
  title: string
  tags: readonly string[]
}>

export type PracticeStudentProgressSummary = Readonly<{
  student_id: string
  display_name: string
  class_number: number | null
  attempted_question_count: number
  total_attempt_count: number
}>

export type PracticeQuestionProgressSummary = Readonly<{
  question_id: string
  title: string
  tags: readonly string[]
  attempt_count: number
}>

export const PRACTICE_PROGRESS_PAGE_SIZE = 50

export type PracticeProgressSearchState = Readonly<{
  q: string
  page: number
}>

type ProgressSearchParam = string | string[] | undefined

export function parsePracticeProgressSearchParams(
  params: Record<string, ProgressSearchParam>,
): PracticeProgressSearchState {
  const rawQuery = Array.isArray(params.q) ? (params.q[0] ?? '') : (params.q ?? '')
  const q = rawQuery.replace(/\s+/g, ' ').trim().slice(0, 160)
  const rawPageText = Array.isArray(params.page) ? params.page[0] : params.page
  const rawPage = Number.parseInt(rawPageText ?? '', 10)
  return Object.freeze({
    q,
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100_000) : 1,
  })
}

export function buildPracticeProgressHref(
  libraryId: string,
  studentId: string,
  state: PracticeProgressSearchState,
  page: number,
  baseHref?: string,
): string {
  const params = new URLSearchParams({ tab: 'progress', student: studentId })
  if (state.q) params.set('q', state.q)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  const path = baseHref ?? `/practice/${encodeURIComponent(libraryId)}/edit`
  return `${path}${query ? `?${query}` : ''}`
}

/** Sort the full safe aggregate before slicing: a practiced question on a later
 * database page must precede every unpracticed question. Preserve library order
 * within each group; counts measure activity, not correctness or ranking. */
export function pagePracticeQuestionProgress(rows: readonly PracticeQuestionProgressSummary[], requestedPage: number) {
  const ordered = rows.filter(row => row.attempt_count > 0).concat(rows.filter(row => row.attempt_count === 0))
  const totalPages = Math.max(1, Math.ceil(ordered.length / PRACTICE_PROGRESS_PAGE_SIZE))
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= totalPages ? requestedPage : 1
  return { questions: ordered.slice((page - 1) * PRACTICE_PROGRESS_PAGE_SIZE, page * PRACTICE_PROGRESS_PAGE_SIZE), totalPages, page }
}

/**
 * Builds the teacher overview in roster order. Deliberately do not sort by
 * activity: practice is not a leaderboard and the counts are not grades.
 */
export function buildPracticeStudentProgress(
  students: readonly PracticeProgressStudent[],
  attempts: readonly PracticeProgressAttemptRow[],
): PracticeStudentProgressSummary[] {
  const counts = new Map<string, { total: number; questions: Set<string> }>()

  for (const attempt of attempts) {
    const current = counts.get(attempt.student_id) ?? {
      total: 0,
      questions: new Set<string>(),
    }
    current.total += 1
    current.questions.add(attempt.question_id)
    counts.set(attempt.student_id, current)
  }

  return students.map((student) => {
    const activity = counts.get(student.id)
    return Object.freeze({
      student_id: student.id,
      display_name: student.display_name,
      class_number: student.class_number,
      attempted_question_count: activity?.questions.size ?? 0,
      total_attempt_count: activity?.total ?? 0,
    })
  })
}

/**
 * Builds one student's detail rows in library-question order. Questions with
 * no accepted check remain visible so "ยังไม่เคยตอบ" is distinguishable from
 * a missing question. Only identity, tags, and the count leave this boundary.
 */
export function buildPracticeQuestionProgress(
  studentId: string,
  questions: readonly PracticeProgressQuestion[],
  attempts: readonly PracticeProgressAttemptRow[],
): PracticeQuestionProgressSummary[] {
  const counts = new Map<string, number>()

  for (const attempt of attempts) {
    if (attempt.student_id !== studentId) continue
    counts.set(attempt.question_id, (counts.get(attempt.question_id) ?? 0) + 1)
  }

  return questions.map((question) => Object.freeze({
    question_id: question.id,
    title: question.title,
    tags: Object.freeze([...question.tags]),
    attempt_count: counts.get(question.id) ?? 0,
  }))
}

const FORBIDDEN_PROGRESS_KEYS = new Set([
  'answer',
  'answers',
  'answer_key',
  'correct_answer',
  'correctness',
  'is_correct',
  'score',
  'points',
  'verdict',
  'solution',
  'checked_at',
])

/** Defense-in-depth guard for server DTO assembly and regression tests. */
export function assertSafePracticeProgressDto(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertSafePracticeProgressDto)
    return
  }
  if (!value || typeof value !== 'object') return

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PROGRESS_KEYS.has(key.toLowerCase())) {
      throw new Error(`Forbidden practice progress field: ${key}`)
    }
    assertSafePracticeProgressDto(nested)
  }
}
