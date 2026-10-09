import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), createAdminClient: vi.fn(),
  studentHasAssignment: vi.fn(), pool: vi.fn(),
  context: vi.fn(), intent: vi.fn(), access: vi.fn(), session: vi.fn(), release: vi.fn(), atomic: vi.fn(),
  waitingProfile: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/auth/assignment-access', () => ({ studentHasAssignment: mocks.studentHasAssignment, canManageAssignment: vi.fn() }))
vi.mock('@/lib/assignment-question-access.server', () => ({ loadAssignmentQuestionsByProvenance: mocks.pool }))
vi.mock('@/lib/seb-exam-context.server', () => ({ readSebExamContext: mocks.context, validateSebExamStartIntent: mocks.intent }))
vi.mock('@/lib/seb-session', () => ({ getSebSession: mocks.session, createSebChallenge: vi.fn(), validateSebChallenge: vi.fn() }))
vi.mock('@/lib/exam-access-session', () => ({ getExamAccessSession: mocks.access }))
vi.mock('@/lib/seb-assignment-release.server', () => ({ readCurrentAssignmentSebRelease: mocks.release, createAssignmentSebSignedDownloadUrl: vi.fn() }))
vi.mock('@/lib/seb-start.server', () => ({ startSebSubmissionAtomic: mocks.atomic }))
vi.mock('@/lib/seb-waiting-release-policy', () => ({ WAITING_SEB_RELEASE_PROFILE_ID: 'waiting-room-completion-experimental-v1', readWaitingSebProfile: mocks.waitingProfile }))

import { startSubmission } from './submissions'
import type { CompletionAssignment } from '@/lib/assignment-completion'

const failed = { id: 'failed', status: 'graded', total_score: 6, max_score: 10, streak_reached: false }
const passed = { ...failed, id: 'passed', total_score: 8 }
const baseAssignment: CompletionAssignment & { id: string; status: string } = { id: 'assignment', status: 'published', type: 'exam', completion_rule: 'fixed', passing_type: 'percent', passing_value: 70, max_attempts: 1 }

function database(assignment = baseAssignment, runs = [failed], readError = false) {
  const from = vi.fn((table: string) => {
    const query = {
      select: vi.fn(() => query), eq: vi.fn(() => query), in: vi.fn(() => query),
      order: vi.fn(() => query), limit: vi.fn(() => query),
      range: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: table === 'assignments' ? assignment : table === 'submissions'
        ? { ...failed, attempt_number: 3, started_at: new Date().toISOString() } : null, error: null })),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: runs, error: readError ? { message: 'read failed' } : null }).then(resolve),
    }
    return query
  })
  mocks.createAdminClient.mockReturnValue({ from })
  return from
}

describe('startSubmission completion gate (mocked database)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'student' } } }) } })
    mocks.studentHasAssignment.mockResolvedValue(true)
    mocks.context.mockResolvedValue({ status: 'absent' })
    mocks.waitingProfile.mockReturnValue(null)
    // Stop before writes; reaching this read proves a retry passed the gate.
    mocks.pool.mockResolvedValue({ error: 'retry gate reached' })
  })
  it('allows failed threshold exams beyond a stale quota of one', async () => {
    database()
    expect(await startSubmission('assignment')).toEqual({ error: 'retry gate reached' })
    expect(mocks.pool).toHaveBeenCalledOnce()
  })
  it('returns the passing run even when the latest run failed', async () => {
    database(baseAssignment, [passed, failed])
    expect(await startSubmission('assignment')).toEqual({ submissionId: 'passed', alreadySubmitted: true })
    expect(mocks.pool).not.toHaveBeenCalled()
  })
  it('stops a completed streak without trusting numeric score', async () => {
    database({ ...baseAssignment, completion_rule: 'streak' }, [{ ...failed, streak_reached: true }])
    expect(await startSubmission('assignment')).toEqual({ submissionId: 'failed', alreadySubmitted: true })
    expect(mocks.pool).not.toHaveBeenCalled()
  })
  it('preserves the complete-mode quota', async () => {
    database({ ...baseAssignment, passing_type: null, passing_value: null })
    expect(await startSubmission('assignment')).toEqual({ submissionId: 'failed', alreadySubmitted: true })
    expect(mocks.pool).not.toHaveBeenCalled()
  })
  it('fails closed when completion history cannot be read', async () => {
    database(baseAssignment, [], true)
    expect(await startSubmission('assignment')).toEqual({ error: 'ตรวจสอบผลการทำงานไม่สำเร็จ กรุณาลองใหม่' })
    expect(mocks.pool).not.toHaveBeenCalled()
  })
  it('checks assignment access before reading completion history', async () => {
    const from = database()
    mocks.studentHasAssignment.mockResolvedValue(false)
    expect(await startSubmission('assignment')).toEqual({ error: 'งานนี้ไม่ได้มอบหมายให้คุณ' })
    expect(from.mock.calls.filter(([table]) => table === 'submissions')).toHaveLength(1)
  })
})

const STUDENT = '20000000-0000-4000-8000-000000000001'
const ASSIGNMENT = '30000000-0000-4000-8000-000000000001'
const PREDECESSOR = '40000000-0000-4000-8000-000000000001'
const SUCCESSOR = '40000000-0000-4000-8000-000000000002'
const Q1 = '50000000-0000-4000-8000-000000000001'
const Q2 = '50000000-0000-4000-8000-000000000002'
const VERSION = '2026-10-01T00:00:00.123456+00:00'
const RELEASE = `asr-${ASSIGNMENT.replaceAll('-', '')}-r2-${'a'.repeat(16)}`
const contextClaims = { assignmentId: ASSIGNMENT, userId: STUDENT, revision: 2, releaseId: RELEASE }
const firstIntent = { ...contextClaims, predecessorSubmissionId: null, predecessorAttemptNumber: 0 }
const question = (id: string) => ({ id, updated_at: VERSION, question_type: 'mcq', variables: [], logic_rules: [],
  answer_parts: null, mcq_options: [{ text: 'correct', is_correct: true }], extra_data: {} })
const sebAssignment = { ...baseAssignment, id: ASSIGNMENT, org_id: STUDENT, mode: 'online', secure_browser_mode: 'seb_required',
  android_exam_mode: 'monitored', updated_at: VERSION, question_ids: [Q1, Q2], duration_minutes: 60 }
type Row = Record<string, unknown>
type StartDatabaseOptions = {
  assignment?: Row; latest?: Row | null; receipt?: Row | null; history?: Row[]; previous?: Row[];
  finalizerSubmission?: Row | null; finalizerAnswers?: Row[] | null; finalizerError?: string;
}
function startDatabase(options: StartDatabaseOptions = {}) {
  const writes: { table: string; operation: string; value: unknown }[] = []
  const selects: { table: string; columns: string }[] = []
  const from = vi.fn((table: string) => {
    const filters = new Map<string, unknown>()
    let columns = '', operation = 'read', value: unknown
    const result = () => {
      if (operation === 'insert') return { data: { id: SUCCESSOR }, error: null }
      if (operation === 'update') return { data: null, error: table === 'submissions' && (value as Row)?.status === 'submitted'
        && options.finalizerError ? { message: options.finalizerError } : null }
      const data = table === 'assignments' ? options.assignment ?? sebAssignment
        : table === 'assignment_extensions' ? null
        : table === 'submissions' ? filters.has('attempt_number') ? options.receipt ?? null
          : filters.has('id') ? options.finalizerSubmission ?? null
            : columns.startsWith('id, status, attempt_number') ? options.latest ?? null : options.history ?? []
        : table === 'submission_answers' ? columns.startsWith('*') ? options.finalizerAnswers ?? null : options.previous ?? []
        : null
      return { data, error: null }
    }
    const query = {
      select: vi.fn((selected: string) => { columns = selected; selects.push({ table, columns }); return query }),
      eq: vi.fn((key: string, filter: unknown) => { filters.set(key, filter); return query }),
      in: vi.fn(() => query), order: vi.fn(() => query), limit: vi.fn(() => query), range: vi.fn(() => query),
      insert: vi.fn((inserted: unknown) => { operation = 'insert'; value = inserted; writes.push({ table, operation, value }); return query }),
      update: vi.fn((updated: unknown) => { operation = 'update'; value = updated; writes.push({ table, operation, value }); return query }),
      maybeSingle: vi.fn(async () => result()), single: vi.fn(async () => result()),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    }
    return query
  })
  const admin = { from }
  mocks.createAdminClient.mockReturnValue(admin)
  return { admin, from, writes, selects }
}

describe('startSubmission atomic SEB integration (mocked database)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: STUDENT } } }) } })
    mocks.studentHasAssignment.mockResolvedValue(true)
    mocks.context.mockResolvedValue({ status: 'valid', claims: contextClaims })
    mocks.waitingProfile.mockReturnValue({ profileId: 'waiting-room-completion-experimental-v1' })
    mocks.intent.mockReturnValue(firstIntent)
    mocks.release.mockResolvedValue({ releaseId: RELEASE, revision: 2 })
    mocks.access.mockResolvedValue({ mode: 'seb', assignmentConfigRevision: 2, issuedAt: 1, platform: 'windows', version: 'old-access-metadata' })
    mocks.session.mockResolvedValue({ issuedAt: Date.now() - 1000, expiresAt: Date.now() + 50_000, platform: 'windows', version: 'SEB_Windows_3.10.2.920' })
    mocks.pool.mockResolvedValue({ questions: [question(Q1), question(Q2)], missingQuestionIds: [], duplicateQuestionCount: 0 })
    mocks.atomic.mockResolvedValue({ ok: true, submissionId: SUCCESSOR, startedAt: VERSION, status: 'in_progress',
      attemptNumber: 1, configRevision: 2, created: true })
  })
  it.each([
    { status: 'invalid' },
    { status: 'valid', claims: { ...contextClaims, userId: 'another-user' } },
    { status: 'valid', claims: { ...contextClaims, assignmentId: 'another-assignment' } },
  ])('fails closed for invalid or mismatched restricted marker before privileged reads %#', async context => {
    mocks.context.mockResolvedValue(context)
    expect(await startSubmission(ASSIGNMENT)).toHaveProperty('error')
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })
  it.each([{ revision: 1 }, { releaseId: 'another-release' }])('rejects a stale restricted release %#', async changed => {
    startDatabase()
    mocks.context.mockResolvedValue({ status: 'valid', claims: { ...contextClaims, ...changed } })
    expect(await startSubmission(ASSIGNMENT, undefined, undefined, 'intent')).toHaveProperty('error')
    expect(mocks.access).not.toHaveBeenCalled(); expect(mocks.pool).not.toHaveBeenCalled()
  })
  it('does not allocate or read hidden questions for a waiting GET without an explicit signed start', async () => {
    const { writes } = startDatabase()
    expect(await startSubmission(ASSIGNMENT)).toHaveProperty('requiresExplicitStart', true)
    expect(mocks.pool).not.toHaveBeenCalled(); expect(mocks.atomic).not.toHaveBeenCalled(); expect(writes).toEqual([])
  })
  it('rejects unsupported waiting-profile streak before receipt, pool or atomic mutation', async () => {
    const { writes } = startDatabase({ assignment: { ...sebAssignment, completion_rule: 'streak' } })
    expect(await startSubmission(ASSIGNMENT, undefined, undefined, 'intent')).toHaveProperty('error')
    expect(mocks.pool).not.toHaveBeenCalled(); expect(mocks.atomic).not.toHaveBeenCalled(); expect(writes).toEqual([])
  })
  it('rejects an invalid signed start before privileged reads', async () => {
    mocks.intent.mockReturnValue(null)
    expect(await startSubmission(ASSIGNMENT, undefined, undefined, 'bad-intent')).toHaveProperty('error')
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })
  it('creates SEB header and snapshots only through atomic adapter with actual expiry and original version precision', async () => {
    const { admin, writes } = startDatabase()
    expect(await startSubmission(ASSIGNMENT, undefined, undefined, 'intent')).toEqual({ submissionId: SUCCESSOR })
    const session = mocks.session.mock.results[0].value
    const claims = await session
    expect(mocks.atomic).toHaveBeenCalledExactlyOnceWith(admin, expect.objectContaining({ assignmentId: ASSIGNMENT,
      studentId: STUDENT, releaseId: RELEASE, configRevision: 2, predecessorId: null, assignmentUpdatedAt: VERSION,
      questionVersions: [{ questionId: Q1, updatedAt: VERSION }, { questionId: Q2, updatedAt: VERSION }],
      validUntil: new Date(claims.expiresAt).toISOString(), verifiedAt: new Date(claims.issuedAt).toISOString(),
      version: 'SEB_Windows_3.10.2.920', carriedAnswerIds: [] }))
    expect(mocks.atomic.mock.calls[0][1].freshAnswers).toHaveLength(2)
    expect(writes).toEqual([])
  })
  it.each(['submitted', 'graded'])('reconciles a lost-response %s receipt before newer latest/completion gates without reading keys', async status => {
    const receipt = { id: SUCCESSOR, status, attempt_number: 1, started_at: VERSION }
    const { writes, from } = startDatabase({ receipt,
      latest: { id: PREDECESSOR, status: 'in_progress', attempt_number: 7, exam_access_mode: 'android_monitored', seb_config_revision: 1 },
      history: [{ ...passed, id: PREDECESSOR }] })
    mocks.atomic.mockResolvedValue({ ok: true, submissionId: SUCCESSOR, startedAt: VERSION, status, attemptNumber: 1, configRevision: 2, created: false })
    expect(await startSubmission(ASSIGNMENT, undefined, undefined, 'intent')).toEqual({ submissionId: SUCCESSOR, alreadySubmitted: true })
    expect(mocks.access).toHaveBeenCalledWith(STUDENT, ASSIGNMENT, true, 2, 'seb')
    expect(mocks.atomic.mock.calls[0][1]).toMatchObject({ predecessorId: null, questionVersions: [], freshAnswers: [], carriedAnswerIds: [] })
    expect(mocks.pool).not.toHaveBeenCalled(); expect(from.mock.calls.filter(([table]) => table === 'submission_answers')).toHaveLength(0)
    expect(writes).toEqual([])
  })
  it('returns the same original active receipt without touching audit, timer, or snapshots', async () => {
    const { writes } = startDatabase({ receipt: { id: SUCCESSOR, status: 'in_progress', attempt_number: 1, started_at: VERSION } })
    mocks.atomic.mockResolvedValue({ ok: true, submissionId: SUCCESSOR, startedAt: VERSION, status: 'in_progress', attemptNumber: 1, configRevision: 2, created: false })
    expect(await startSubmission(ASSIGNMENT, undefined, undefined, 'intent')).toEqual({ submissionId: SUCCESSOR })
    expect(writes).toEqual([]); expect(mocks.pool).not.toHaveBeenCalled()
  })
  it('rejects a stale signed predecessor when no receipt exists', async () => {
    startDatabase({ latest: { id: PREDECESSOR, status: 'graded', attempt_number: 3 } })
    expect(await startSubmission(ASSIGNMENT, undefined, undefined, 'intent')).toHaveProperty('error')
    expect(mocks.pool).not.toHaveBeenCalled(); expect(mocks.atomic).not.toHaveBeenCalled()
  })
  it('maps carried source IDs by both question and original slot for repeated legacy questions', async () => {
    const previous = [0, 1, 2].map(order_index => ({ id: `source-${order_index}`, question_id: Q1, order_index,
      random_values: {}, correct_answer: 'MCQ:0', student_answer: 'MCQ:0', is_correct: order_index !== 1,
      score: order_index === 1 ? 0 : 1, max_score: 1, option_order: null, work_images: ['legacy'],
      math_input_modes: { answer: 'rad' }, teacher_feedback: 'teacher', score_edited_by: STUDENT, score_edited_at: VERSION }))
    const { writes, selects } = startDatabase({ assignment: { ...sebAssignment, retry_scope: 'wrong_only' },
      latest: { id: PREDECESSOR, status: 'graded', attempt_number: 3 }, previous })
    mocks.intent.mockReturnValue({ ...firstIntent, predecessorSubmissionId: PREDECESSOR, predecessorAttemptNumber: 3 })
    expect(await startSubmission(ASSIGNMENT, undefined, undefined, 'intent')).toEqual({ submissionId: SUCCESSOR })
    expect(mocks.atomic.mock.calls[0][1]).toMatchObject({ predecessorId: PREDECESSOR, carriedAnswerIds: ['source-0', 'source-2'],
      freshAnswers: [expect.objectContaining({ question_id: Q1, order_index: 1 })] })
    expect(selects.find(read => read.table === 'submission_answers')?.columns).toMatch(/\bid, question_id/)
    expect(writes).toEqual([])
  })
  it('resumes an active restricted attempt without a new signed intent or new snapshot read', async () => {
    const { writes } = startDatabase({ latest: { id: SUCCESSOR, status: 'in_progress', attempt_number: 1,
      started_at: new Date().toISOString(), exam_access_mode: 'seb', seb_config_revision: 2 } })
    expect(await startSubmission(ASSIGNMENT)).toEqual({ submissionId: SUCCESSOR })
    expect(mocks.pool).not.toHaveBeenCalled(); expect(mocks.atomic).not.toHaveBeenCalled()
    expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({ operation: 'update', table: 'submissions' })
    expect(writes[0].value).not.toHaveProperty('started_at')
  })
  it.each([false, true])('handles expired receipt through forced finalizer and fails safely if finalizer fails=%s', async fail => {
    const receipt = { id: SUCCESSOR, status: 'in_progress', attempt_number: 1, started_at: '2000-01-01T00:00:00Z',
      exam_access_mode: 'seb', seb_config_revision: 2 }
    const { writes } = startDatabase({ receipt, finalizerSubmission: { ...receipt, assignment_id: ASSIGNMENT, assignments: {} },
      finalizerAnswers: fail ? null : [] })
    mocks.atomic.mockResolvedValue({ ok: false, code: 'expired' })
    const result = await startSubmission(ASSIGNMENT, undefined, undefined, 'intent')
    if (fail) expect(result).toHaveProperty('error')
    else expect(result).toEqual({ submissionId: SUCCESSOR, alreadySubmitted: true })
    expect(mocks.pool).not.toHaveBeenCalled()
    expect(writes.filter(write => write.operation === 'insert')).toEqual([])
    expect(writes.every(write => !(write.value as Row).started_at)).toBe(true)
  })
  it('does not use an expired session error to finalize a mismatched existing access mode', async () => {
    const { writes } = startDatabase({ receipt: { id: SUCCESSOR, status: 'in_progress', attempt_number: 1,
      started_at: '2000-01-01T00:00:00Z', exam_access_mode: 'android_monitored', seb_config_revision: null } })
    mocks.atomic.mockResolvedValue({ ok: false, code: 'expired' })
    expect(await startSubmission(ASSIGNMENT, undefined, undefined, 'intent')).toHaveProperty('error')
    expect(writes).toEqual([])
  })
  it('fails closed if the actual signed session disappears before atomic creation', async () => {
    const { writes } = startDatabase()
    mocks.session.mockResolvedValue(null)
    expect(await startSubmission(ASSIGNMENT, undefined, undefined, 'intent')).toHaveProperty('error')
    expect(mocks.atomic).not.toHaveBeenCalled(); expect(writes).toEqual([])
  })
  it.each(['conflict', 'expired', 'failed'])('fails safely on atomic %s creation errors without header or answer writes', async code => {
    const { writes } = startDatabase()
    mocks.atomic.mockResolvedValue({ ok: false, code })
    expect(await startSubmission(ASSIGNMENT, undefined, undefined, 'intent')).toHaveProperty('error')
    expect(writes).toEqual([])
  })
  it.each(['browser', 'android_monitored'])('preserves ordinary %s creation and answer insertion without the atomic RPC', async mode => {
    const { writes } = startDatabase({ assignment: mode === 'browser' ? { ...sebAssignment, secure_browser_mode: 'browser' } : sebAssignment })
    mocks.context.mockResolvedValue({ status: 'absent' })
    if (mode === 'android_monitored') mocks.access.mockResolvedValue({ mode, issuedAt: 123, approvedAt: 100, approvedBy: STUDENT })
    expect(await startSubmission(ASSIGNMENT)).toEqual({ submissionId: SUCCESSOR })
    expect(mocks.atomic).not.toHaveBeenCalled()
    expect(writes.map(write => [write.table, write.operation])).toEqual([['submissions', 'insert'], ['submission_answers', 'insert']])
    expect(writes[0].value).toHaveProperty('exam_access_mode', mode)
    if (mode === 'android_monitored') expect(writes[0].value).toHaveProperty('android_approved_by', STUDENT)
  })
  it('uses atomic creation for unrestricted SEB callers too, with authenticated observed predecessor', async () => {
    startDatabase({ latest: { id: PREDECESSOR, status: 'graded', attempt_number: 3 } })
    mocks.context.mockResolvedValue({ status: 'absent' })
    expect(await startSubmission(ASSIGNMENT)).toEqual({ submissionId: SUCCESSOR })
    expect(mocks.atomic.mock.calls[0][1]).toHaveProperty('predecessorId', PREDECESSOR)
  })
  it('never copies the old primary key into ordinary-browser carried answer inserts', async () => {
    const previous = [0, 1].map(order_index => ({ id: `source-${order_index}`, question_id: order_index === 0 ? Q1 : Q2,
      order_index, random_values: {}, correct_answer: 'MCQ:0', student_answer: 'MCQ:0', is_correct: order_index === 0,
      score: order_index === 0 ? 1 : 0, max_score: 1, option_order: null, work_images: ['legacy'],
      math_input_modes: { answer: 'rad' }, teacher_feedback: 'teacher', score_edited_by: STUDENT, score_edited_at: VERSION }))
    const { writes } = startDatabase({ assignment: { ...sebAssignment, secure_browser_mode: 'browser', retry_scope: 'wrong_only' },
      latest: { id: PREDECESSOR, status: 'graded', attempt_number: 3 }, previous })
    mocks.context.mockResolvedValue({ status: 'absent' })
    expect(await startSubmission(ASSIGNMENT)).toEqual({ submissionId: SUCCESSOR })
    const insertedAnswers = writes.find(write => write.table === 'submission_answers')?.value as Row[]
    expect(insertedAnswers).toHaveLength(2)
    expect(insertedAnswers.every(row => !Object.hasOwn(row, 'id'))).toBe(true)
    expect(insertedAnswers.find(row => row.carried_over)).toMatchObject({ work_images: ['legacy'], math_input_modes: { answer: 'rad' }, teacher_feedback: 'teacher' })
  })
})
