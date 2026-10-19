import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Question } from '@/lib/types'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), session: vi.fn(), admin: vi.fn(), manage: vi.fn(), questions: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/server', () => ({ getAuthUser: mocks.auth }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
vi.mock('@/lib/auth/assignment-access', () => ({ canManageAssignment: mocks.manage }))
vi.mock('@/lib/assignment-question-access.server', () => ({ loadAssignmentQuestionsByProvenance: mocks.questions }))
import { loadGradingWorkspace } from './grading-workspace.server'

type Row = Record<string, unknown>
interface QueryLog { table: string; columns: string; eq: [string, unknown][]; in: [string, unknown[]][]; order: string; descending: boolean; from: number; to: number; single: boolean }
function uuid(value: number) { return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}` }
const assignmentId = uuid(1), actorId = uuid(2), questionId = uuid(3), secondQuestionId = uuid(4)
const studentId = uuid(10), submissionId = uuid(20), answerId = uuid(30), uploadId = uuid(40)
const now = '2026-10-18T01:00:00.000Z'

function question(overrides: Partial<Question> = {}): Question {
  return { id: questionId, question_type: 'mcq', title: 'โจทย์', question_text: 'โจทย์ตัวอย่าง', requires_work_image: false,
    answer_formula: '', answer_parts: null, answer_tolerance: 0, extra_data: {}, mcq_options: [], variables: [],
    ...overrides } as Question
}
function assignment(overrides: Row = {}): Row {
  return { id: assignmentId, created_by: actorId, org_id: uuid(5), classroom_id: uuid(6), title: 'แบบฝึกหัด', status: 'published', type: 'exercise', mode: 'online',
    question_ids: [questionId], random_question_count: null, completion_rule: 'fixed', streak_target: null, score_strategy: 'best', display_max_score: null,
    question_points: null, require_work_image: false, due_at: null, end_at: null, late_bands: [], classrooms: { name: 'ฟิสิกส์', description: null },
    access_code: 'NEVER_SERIALIZE_ACCESS_CODE', ...overrides }
}
function submission(overrides: Row = {}): Row {
  return { id: submissionId, assignment_id: assignmentId, student_id: studentId, status: 'graded', closed_at: null, total_score: 1, score_adjustment: 0,
    max_score: 1, voided_max_score: 0, submitted_at: now, started_at: now, attempt_number: 1, best_streak: 0, streak_reached: false,
    users: { full_name: 'นักเรียน ก', email: 'private@example.test' }, ...overrides }
}
function answer(overrides: Row = {}): Row {
  return { id: answerId, submission_id: submissionId, question_id: questionId, is_correct: true, score: 1, max_score: 1,
    score_edited_by: null, score_edited_at: null, order_index: 0, grading_config: null, is_void: false, void_original_max_score: 0,
    answer_score: null, answer_max_score: null, work_score: null, work_max_score: null, answer_reviewed_at: null, work_reviewed_at: null,
    random_values: { x: 17 }, correct_answer: 'PRIVATE_CORRECT_KEY', student_answer: 'PRIVATE_RESPONSE', option_order: [1, 0], work_images: [], math_input_modes: { '0': 'deg' }, ...overrides }
}

interface FakeOptions { missingPolicies?: boolean; missingRegrading?: boolean; failTable?: string; signingFails?: boolean; superAdmin?: boolean; missingDrafts?: boolean; draftRows?: unknown[]; draftPermissionDenied?: boolean }
function client(tables: Record<string, Row[]>, options: FakeOptions = {}) {
  const queries: QueryLog[] = []
  const sign = vi.fn(async (paths: string[], expires: number) => ({ data: options.signingFails ? null : paths.map(path => ({ path, signedUrl: `https://signed.test/${path}?token=local`, error: null })), error: options.signingFails ? { message: 'failed' } : null, expires }))
  const fake = {
    rpc: vi.fn(async (name: string) => name === 'read_grading_drafts' ? ({ data: options.missingDrafts || options.draftPermissionDenied ? null : options.draftRows ?? [], error: options.draftPermissionDenied ? { code: '42501' } : options.missingDrafts ? { code: 'PGRST202' } : null }) : ({ data: options.superAdmin === true, error: null })),
    storage: { from: vi.fn(() => ({ createSignedUrls: sign })) },
    from(table: string) {
      const log: QueryLog = { table, columns: '', eq: [], in: [], order: '', descending: false, from: 0, to: Infinity, single: false }
      queries.push(log)
      const q = {
        select(columns: string) { log.columns = columns; return q },
        eq(key: string, value: unknown) { log.eq.push([key, value]); return q },
        in(key: string, values: unknown[]) { log.in.push([key, values]); return q },
        order(key: string, value?: { ascending?: boolean }) { log.order = key; log.descending = value?.ascending === false; return q },
        range(from: number, to: number) { log.from = from; log.to = to; return q },
        limit(count: number) { log.to = count - 1; return q },
        maybeSingle() { log.single = true; return q },
        returns() { return q },
        then(resolve: (value: { data: Row[] | Row | null; error: { code: string } | null }) => unknown, reject?: (reason: unknown) => unknown) {
          let code: string | null = options.failTable === table ? 'failed' : null
          if (options.missingPolicies && table === 'assignment_question_grading_parts') code = '42P01'
          if (options.missingRegrading && table === 'assignment_void_questions') code = 'PGRST205'
          if (options.missingRegrading && log.columns.includes('voided_max_score')) code = '42703'
          let rows = (tables[table] ?? []).filter(row => log.eq.every(([key, value]) => row[key] === value) && log.in.every(([key, values]) => values.includes(row[key])))
          if (log.order) rows = [...rows].sort((left, right) => String(left[log.order]).localeCompare(String(right[log.order]), 'en', { numeric: true }) * (log.descending ? -1 : 1))
          rows = rows.slice(log.from, log.to === Infinity ? undefined : log.to + 1)
          return Promise.resolve({ data: code ? null : log.single ? rows[0] ?? null : rows, error: code ? { code } : null }).then(resolve, reject)
        },
      }
      return q
    },
  }
  return { value: fake as unknown as SupabaseClient, queries, sign, storage: fake.storage }
}

let sessionTables: Record<string, Row[]>, adminTables: Record<string, Row[]>
function install(options: FakeOptions = {}, profile: Row = { role: 'teacher', status: 'active' }) {
  const session = client({ ...sessionTables, users: [{ id: actorId, ...profile }] }, options)
  const admin = client(adminTables, options)
  mocks.session.mockResolvedValue(session.value)
  mocks.admin.mockReturnValue(admin.value)
  return { session, admin }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.test')
  sessionTables = { assignments: [assignment()] }
  adminTables = { submissions: [submission()], submission_answers: [answer()], student_profiles: [{ student_id: studentId, grade_level: 'ม.4', section_number: 1, class_number: 2, student_code: '00123', health_notes: 'PRIVATE_HEALTH' }],
    assignment_question_grading_parts: [], assignment_void_questions: [], assignment_extensions: [], assignment_score_adjustment_batches: [], student_work_artifacts: [], users: [] }
  mocks.auth.mockResolvedValue({ id: actorId })
  mocks.manage.mockResolvedValue(true)
  mocks.questions.mockResolvedValue({ questions: [question()], missingQuestionIds: [], duplicateQuestionCount: 0 })
})

describe('authenticated grading workspace reader', () => {
  it.each(['anonymous', 'inactive', 'student', 'no_manage'])('denies %s before constructing the service reader', async kind => {
    const { admin } = install({}, { role: kind === 'student' ? 'student' : 'teacher', status: kind === 'inactive' ? 'suspended' : 'active' })
    if (kind === 'anonymous') mocks.auth.mockResolvedValue(null)
    if (kind === 'no_manage') mocks.manage.mockResolvedValue(false)
    expect(await loadGradingWorkspace(assignmentId)).toBeNull()
    expect(mocks.admin).not.toHaveBeenCalled()
    expect(admin.queries).toHaveLength(0)
  })
  it('keeps trusted active super-admin access behind the same exact assignment check', async () => {
    const { session } = install({ superAdmin: true }, { role: 'student', status: 'active' })
    expect(await loadGradingWorkspace(assignmentId)).not.toBeNull()
    expect(session.value.rpc).toHaveBeenCalledWith('is_super_admin')
    expect(mocks.manage).toHaveBeenCalledWith(assignmentId, actorId)
  })
  it('reads only the authorized assignment and strips student bodies, keys, private metadata and access codes from overview', async () => {
    const { admin, session } = install()
    const result = await loadGradingWorkspace(assignmentId)
    expect(result?.data.students[0]).toMatchObject({ id: studentId, name: 'นักเรียน ก', studentCode: '00123', score: 1, maxScore: 1 })
    expect(result?.data.answers[0]).toMatchObject({ studentAnswer: null, correctAnswer: '', randomValues: {}, workImages: [] })
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_RESPONSE|PRIVATE_CORRECT_KEY|PRIVATE_HEALTH|private@example|NEVER_SERIALIZE_ACCESS_CODE/)
    expect(session.queries.find(query => query.table === 'assignments')?.eq).toEqual([['id', assignmentId]])
    expect(admin.queries.filter(query => query.table === 'submissions' && !query.columns.includes('voided_max_score')).every(query => query.eq.some(([key, value]) => key === 'assignment_id' && value === assignmentId))).toBe(true)
    const summary = admin.queries.filter(query => query.table === 'submission_answers')
    expect(summary.every(query => !query.columns.split(',').map(column => column.trim()).includes('student_answer'))).toBe(true)
    expect(admin.queries.find(query => query.table === 'student_profiles')?.columns).toBe('student_id, grade_level, section_number, class_number, student_code')
  })
  it('loads private drafts only through the verified actor and exact assignment, preserving public grades', async () => {
    const saved = { answerId, expectedScoreEditedAt: null, updatedAt: now, answerScore: 0 }
    const { admin } = install({ draftRows: [saved, { ...saved, answerId: uuid(999) }] })
    const result = await loadGradingWorkspace(assignmentId)
    expect(admin.value.rpc).toHaveBeenCalledWith('read_grading_drafts', { p_actor_id: actorId, p_assignment_id: assignmentId })
    expect(result?.data).toMatchObject({ viewerId: actorId, draftsAvailable: true, savedDrafts: [saved] })
    expect(result?.data.answers[0].score).toBe(1)
    expect(result?.data.students[0].score).toBe(1)
  })
  it('keeps older schemas readable and clearly marks private-draft mutations unavailable', async () => {
    install({ missingDrafts: true })
    const result = await loadGradingWorkspace(assignmentId)
    expect(result?.data).toMatchObject({ draftsAvailable: false, savedDrafts: [], reviewAvailable: true })
  })
  it('does not return a teacher page when the repeated draft authorization detects revoked access', async () => {
    install({ draftPermissionDenied: true })
    expect(await loadGradingWorkspace(assignmentId)).toBeNull()
  })
  it('rejects an unassigned question before any service learner reads', async () => {
    install()
    expect(await loadGradingWorkspace(assignmentId, { kind: 'question', questionId: secondQuestionId })).toBeNull()
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it('projects legacy automatic file credit to pending zero without writing any database row', async () => {
    mocks.questions.mockResolvedValue({ questions: [question({ question_type: 'file_upload' })], missingQuestionIds: [], duplicateQuestionCount: 0 })
    const { admin } = install()
    const result = await loadGradingWorkspace(assignmentId)
    expect(result?.data.students[0].score).toBe(0)
    expect(result?.pendingCount).toBe(1)
    expect(admin.queries.every(query => !/student_answer|correct_answer|random_values|work_images/.test(query.columns))).toBe(true)
  })
  it('retains teacher scores and chooses best only among finished attempts after score projection', async () => {
    sessionTables.assignments = [assignment({ question_ids: [questionId, secondQuestionId] })]
    mocks.questions.mockResolvedValue({ questions: [question({ question_type: 'file_upload' }), question({ id: secondQuestionId })], missingQuestionIds: [], duplicateQuestionCount: 0 })
    adminTables.submissions = [submission({ total_score: 10, max_score: 10 }), submission({ id: uuid(21), attempt_number: 2, total_score: 4, max_score: 10 }), submission({ id: uuid(22), status: 'in_progress', attempt_number: 3, total_score: 99, max_score: 100 })]
    adminTables.submission_answers = [answer({ max_score: 10, score: 10 }), answer({ id: uuid(31), submission_id: uuid(21), question_id: secondQuestionId, max_score: 10, score: 4, score_edited_by: actorId })]
    install()
    const result = await loadGradingWorkspace(assignmentId, { kind: 'student', studentId })
    expect(result?.data.students[0]).toMatchObject({ submissionId: uuid(21), score: 4, maxScore: 10 })
    expect(result?.data.answers.map(row => row.submissionId)).toEqual([uuid(21)])
    expect(result?.data.inProgressCount).toBe(1)
  })
  it.each([{ strategy: 'latest', score: 4 }, { strategy: 'average', score: 6 }])('preserves $strategy strategy and repeated occurrences in the selected official attempt', async ({ strategy, score }) => {
    sessionTables.assignments = [assignment({ score_strategy: strategy })]
    adminTables.submissions = [submission({ total_score: 8, max_score: 10 }), submission({ id: uuid(21), attempt_number: 2, total_score: 4, max_score: 10 })]
    adminTables.submission_answers = [answer({ max_score: 10, score: 8 }), answer({ id: uuid(31), submission_id: uuid(21), max_score: 5, score: 2 }), answer({ id: uuid(32), submission_id: uuid(21), max_score: 5, score: 2, order_index: 1 })]
    install()
    const result = await loadGradingWorkspace(assignmentId, { kind: 'student', studentId })
    expect(result?.data.students[0]).toMatchObject({ submissionId: uuid(21), score, maxScore: 10 })
    expect(result?.data.answers.map(row => row.id)).toEqual([uuid(31), uuid(32)])
    expect(result?.data.answers.every(row => row.studentAnswer === 'PRIVATE_RESPONSE')).toBe(true)
  })
  it('opens an older pending average contributor with its own bodies and drafts without changing the aggregate score', async () => {
    const latestSubmissionId = uuid(21), latestAnswerId = uuid(31)
    const saved = { answerId, expectedScoreEditedAt: null, updatedAt: now, workScore: 0 }
    sessionTables.assignments = [assignment({ score_strategy: 'average' })]
    adminTables.submissions = [submission({ total_score: 0.5 }),
      submission({ id: latestSubmissionId, attempt_number: 2, total_score: 1 })]
    adminTables.assignment_question_grading_parts = [{ assignment_id: assignmentId, question_id: questionId, work_share: 0.5, updated_at: now }]
    adminTables.submission_answers = [
      answer({ score: 0.5, answer_score: 0.5, answer_max_score: 0.5, work_score: 0, work_max_score: 0.5,
        student_answer: 'OLDER_PRIVATE_RESPONSE', correct_answer: 'OLDER_PRIVATE_KEY' }),
      answer({ id: latestAnswerId, submission_id: latestSubmissionId,
        answer_score: 0.5, answer_max_score: 0.5, work_score: 0.5, work_max_score: 0.5,
        work_reviewed_at: now, score_edited_by: actorId, score_edited_at: now,
        student_answer: 'LATEST_PRIVATE_RESPONSE', correct_answer: 'LATEST_PRIVATE_KEY' }),
    ]
    const { admin } = install({ draftRows: [saved, { ...saved, answerId: latestAnswerId }] })

    const overview = await loadGradingWorkspace(assignmentId)
    expect(overview?.data.students[0]).toMatchObject({ submissionId, attemptNumber: 1, score: 0.75, maxScore: 1 })
    expect(overview?.pendingCount).toBe(1)
    expect(overview?.data.answers.map(row => row.id)).toEqual([answerId])
    expect(overview?.data.savedDrafts).toEqual([saved])
    expect(JSON.stringify(overview)).not.toMatch(/OLDER_PRIVATE_RESPONSE|OLDER_PRIVATE_KEY|LATEST_PRIVATE_RESPONSE|LATEST_PRIVATE_KEY/)

    for (const scope of [{ kind: 'student' as const, studentId }, { kind: 'question' as const, questionId }]) {
      const detail = await loadGradingWorkspace(assignmentId, scope)
      expect(detail?.data.students[0]).toMatchObject({ submissionId, attemptNumber: 1, score: 0.75, maxScore: 1 })
      expect(detail?.data.answers).toHaveLength(1)
      expect(detail?.data.answers[0]).toMatchObject({ id: answerId, submissionId,
        studentAnswer: 'OLDER_PRIVATE_RESPONSE', correctAnswer: 'OLDER_PRIVATE_KEY' })
      expect(detail?.data.savedDrafts).toEqual([saved])
      expect(JSON.stringify(detail)).not.toMatch(/LATEST_PRIVATE_RESPONSE|LATEST_PRIVATE_KEY/)
    }
    const fullBodyReads = admin.queries.filter(query => query.table === 'submission_answers' && query.columns.includes('student_answer'))
    expect(fullBodyReads).toHaveLength(2)
    expect(fullBodyReads.every(query => query.in.some(([column, ids]) => column === 'submission_id'
      && ids.length === 1 && ids[0] === submissionId))).toBe(true)

    // A published explicit zero settles the missing work review while leaving
    // both attempt totals, and therefore the official average, unchanged.
    adminTables.submission_answers[0] = { ...adminTables.submission_answers[0],
      work_reviewed_at: now, score_edited_by: actorId, score_edited_at: now }
    install({ draftRows: [saved] })
    const complete = await loadGradingWorkspace(assignmentId, { kind: 'student', studentId })
    expect(complete?.data.students[0]).toMatchObject({ submissionId: latestSubmissionId, attemptNumber: 2, score: 0.75, maxScore: 1 })
    expect(complete?.pendingCount).toBe(0)
    expect(complete?.data.answers.map(row => row.id)).toEqual([latestAnswerId])
    expect(complete?.data.answers[0]).toMatchObject({ studentAnswer: 'LATEST_PRIVATE_RESPONSE', correctAnswer: 'LATEST_PRIVATE_KEY' })
    expect(complete?.data.savedDrafts).toEqual([])
  })
  it('rejects students with only active or unrelated attempts before reading profiles and answer bodies', async () => {
    adminTables.submissions = [submission({ status: 'in_progress' }), submission({ id: uuid(21), assignment_id: uuid(999) })]
    const { admin } = install()
    expect(await loadGradingWorkspace(assignmentId, { kind: 'student', studentId })).toBeNull()
    expect(admin.queries.some(query => query.table === 'student_profiles' || query.table === 'submission_answers')).toBe(false)
  })
  it('retains automatic partial scores in mixed manual questions and frozen no-explanation classification', async () => {
    sessionTables.assignments = [assignment({ question_ids: [questionId, secondQuestionId] })]
    mocks.questions.mockResolvedValue({ questions: [question({ question_type: 'fill_blank' }), question({ id: secondQuestionId, question_type: 'true_false' })], missingQuestionIds: [], duplicateQuestionCount: 0 })
    adminTables.submission_answers = [answer({ max_score: 2, score: 1, is_correct: null,
      grading_config: { question_type: 'fill_blank', answer_tolerance: 0, answer_parts: null, extra_data: { blanks: [{ type: 'fixed', answer: 'PRIVATE_KEY' }, { type: 'text' }] } } }),
    answer({ id: uuid(31), question_id: secondQuestionId, max_score: 1, score: 1,
      grading_config: { question_type: 'true_false', answer_tolerance: 0, answer_parts: null, extra_data: { explanation_mode: 'none', statements: [{ correct: true }] } } })]
    install()
    const result = await loadGradingWorkspace(assignmentId)
    expect(result?.data.students[0]).toMatchObject({ score: 2, maxScore: 3 })
    expect(result?.pendingCount).toBe(1)
    expect(JSON.stringify(result?.data.answers)).not.toContain('PRIVATE_KEY')
    expect(result?.data.answers[1].gradingConfig?.extra_data).toEqual({ explanation_mode: 'none' })
  })
  it('paginates submissions beyond 1000 and bounds summary/profile queries to authorized IDs', async () => {
    adminTables.submissions = Array.from({ length: 1005 }, (_, index) => submission({ id: uuid(2000 + index), student_id: uuid(4000 + index) }))
    adminTables.submission_answers = Array.from({ length: 1005 }, (_, index) => answer({ id: uuid(6000 + index), submission_id: uuid(2000 + index), is_correct: null }))
    adminTables.student_profiles = []
    const { admin } = install()
    const result = await loadGradingWorkspace(assignmentId)
    expect(result?.data.students).toHaveLength(1005)
    expect(result?.data.answers).toHaveLength(1005)
    expect(result?.pendingCount).toBe(1005)
    expect(admin.queries.filter(query => query.table === 'submissions' && query.columns.includes('assignment_id')).map(query => query.from)).toEqual([0, 1000])
    expect(admin.queries.filter(query => query.table === 'submission_answers').every(query => query.in[0][1].length <= 100)).toBe(true)
  })
  it('paginates over 1000 answers within one submission rather than silently truncating a streak', async () => {
    adminTables.submission_answers = Array.from({ length: 1005 }, (_, index) => answer({ id: uuid(5000 + index), order_index: index }))
    const { admin } = install()
    const result = await loadGradingWorkspace(assignmentId)
    expect(result?.data.answers).toHaveLength(1005)
    expect(result?.data.students[0]).toMatchObject({ score: 1005, maxScore: 1005 })
    expect(admin.queries.filter(query => query.table === 'submission_answers').map(query => query.from)).toEqual([0, 1000])
  })
  it('hydrates only the selected question and 30 students using the same name sorting and filter as detail', async () => {
    adminTables.submissions = Array.from({ length: 40 }, (_, index) => submission({ id: uuid(1000 + index), student_id: uuid(2000 + index), users: { full_name: `นักเรียน ${String(40 - index).padStart(3, '0')}` } }))
    adminTables.submission_answers = Array.from({ length: 40 }, (_, index) => answer({ id: uuid(3000 + index), submission_id: uuid(1000 + index), student_answer: `PRIVATE_RESPONSE_${index}` }))
    adminTables.student_profiles = Array.from({ length: 40 }, (_, index) => ({ student_id: uuid(2000 + index), grade_level: 'ม.4', section_number: 1, class_number: index + 1, student_code: String(index) }))
    const { admin } = install()
    const result = await loadGradingWorkspace(assignmentId, { kind: 'question', questionId, query: { sort: 'name', dir: 'asc', classroom: 'ม.4/1', page: 1 } })
    expect(result?.data.answers.filter(row => row.studentAnswer !== null)).toHaveLength(30)
    const bodyQueries = admin.queries.filter(query => query.table === 'submission_answers' && query.columns.includes('student_answer'))
    expect(bodyQueries).toHaveLength(1)
    expect(bodyQueries[0].eq).toEqual([['question_id', questionId]])
    expect(bodyQueries[0].in).toEqual([['submission_id', Array.from({ length: 30 }, (_, index) => uuid(1039 - index))]])
    expect(result?.data.answers.find(row => row.submissionId === uuid(1000))?.studentAnswer).toBeNull()
  })
  it('keeps old schemas readable without requesting unavailable split/regrade columns', async () => {
    const { admin } = install({ missingPolicies: true, missingRegrading: true })
    const result = await loadGradingWorkspace(assignmentId)
    expect(result?.data).toMatchObject({ reviewAvailable: false, gradingParts: {}, voidedQuestionIds: [] })
    expect(admin.queries.filter(query => query.table === 'submission_answers').every(query => !/answer_score|grading_config|is_void/.test(query.columns))).toBe(true)
  })
  it('normalizes required written work and preserves current configured weights', async () => {
    sessionTables.assignments = [assignment({ require_work_image: true, question_points: { [questionId]: 7 } })]
    mocks.questions.mockResolvedValue({ questions: [question({ question_type: 'written', requires_work_image: false })], missingQuestionIds: [], duplicateQuestionCount: 2 })
    install()
    const result = await loadGradingWorkspace(assignmentId)
    expect(result?.data.questions[0].requires_work_image).toBe(true)
    expect(result?.data.questionMaxScores).toEqual({ [questionId]: 7 })
    expect(result?.duplicateQuestionCount).toBe(2)
    expect(result?.data.answers[0].gradingPartsConfigured).toBe(false)
    expect(result?.pendingCount).toBe(1)
  })
  it('carries explicit allocation and independent work-review status into summary and hydrated answers', async () => {
    mocks.questions.mockResolvedValue({ questions: [question({ question_type: 'written', requires_work_image: true })], missingQuestionIds: [], duplicateQuestionCount: 0 })
    adminTables.assignment_question_grading_parts = [{ assignment_id: assignmentId, question_id: questionId, work_share: 0.6, updated_at: now }]
    adminTables.submission_answers = [answer({ max_score: 10, score: 10, answer_score: 4, answer_max_score: 4, work_score: 6, work_max_score: 6 })]
    install()
    const result = await loadGradingWorkspace(assignmentId, { kind: 'student', studentId })
    expect(result?.data.gradingParts).toEqual({ [questionId]: { workShare: 0.6, updatedAt: now } })
    expect(result?.data.answers[0]).toMatchObject({ gradingPartsConfigured: true, answerScore: 4, answerMaxScore: 4, workScore: 6, workMaxScore: 6 })
    expect(result?.data.students[0]).toMatchObject({ score: 4, maxScore: 10 })
    expect(result?.pendingCount).toBe(1)
  })
  it('signs only exact owned selected-answer preview namespaces and never leaks private paths', async () => {
    const prefix = `students/${studentId}/${submissionId}/${answerId}/`
    const good = `${prefix}${uploadId}/preview.webp`
    adminTables.student_work_artifacts = [
      { id: uuid(50), submission_answer_id: answerId, student_id: studentId, part_key: 'answer', source_type: 'scratchpad', preview_path: good },
      { id: uuid(51), submission_answer_id: answerId, student_id: studentId, part_key: 'bad', source_type: 'photo', preview_path: `students/${uuid(999)}/${submissionId}/${answerId}/${uploadId}/preview.webp` },
      { id: uuid(52), submission_answer_id: answerId, student_id: studentId, part_key: 'bad2', source_type: 'photo', preview_path: `${prefix}../preview.webp` },
      { id: uuid(53), submission_answer_id: uuid(999), student_id: studentId, part_key: 'bad3', source_type: 'photo', preview_path: good },
    ]
    adminTables.submission_answers[0].work_images = [`https://project.test/storage/v1/object/public/work-images/${studentId}/${submissionId}/${answerId}/${uploadId}.webp`, `https://evil.test/storage/v1/object/public/work-images/${studentId}/${submissionId}/${answerId}/${uploadId}.webp`]
    const { admin } = install()
    const result = await loadGradingWorkspace(assignmentId, { kind: 'student', studentId })
    expect(admin.storage.from).toHaveBeenCalledWith('math-work-artifacts')
    expect(admin.sign).toHaveBeenCalledWith([good], 300)
    expect(result?.data.answers[0].workArtifacts).toHaveLength(1)
    expect(result?.data.answers[0].workImages[1]).toBeNull()
    expect(JSON.stringify(result)).not.toMatch(/preview_path|scene_path|students\/.*\.\.\/preview/)
  })
  it('keeps a failed signed preview unavailable instead of exposing its storage path', async () => {
    adminTables.student_work_artifacts = [{ id: uuid(50), submission_answer_id: answerId, student_id: studentId, part_key: 'answer', source_type: 'photo', preview_path: `students/${studentId}/${submissionId}/${answerId}/${uploadId}/preview.png` }]
    install({ signingFails: true })
    const result = await loadGradingWorkspace(assignmentId, { kind: 'student', studentId })
    expect(result?.data.answers[0].workArtifacts?.[0].previewUrl).toBeNull()
  })
  it('fails closed on summary pagination errors instead of reporting incomplete review counts', async () => {
    install({ failTable: 'submission_answers' })
    await expect(loadGradingWorkspace(assignmentId)).rejects.toThrow('โหลดข้อมูลการตรวจให้คะแนนไม่สำเร็จ')
  })
})
