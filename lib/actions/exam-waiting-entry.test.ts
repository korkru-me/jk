import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ client: vi.fn(), admin: vi.fn(), membership: vi.fn(), pool: vi.fn(),
  access: vi.fn(), release: vi.fn(), revalidate: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
vi.mock('@/lib/supabase/server', () => ({ createClient: m.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.admin }))
vi.mock('@/lib/auth/assignment-access', () => ({ studentHasAssignment: m.membership, canManageAssignment: vi.fn() }))
vi.mock('@/lib/assignment-question-access.server', () => ({ loadAssignmentQuestionsByProvenance: m.pool }))
vi.mock('@/lib/exam-access-session', () => ({ getExamAccessSession: m.access }))
vi.mock('@/lib/seb-assignment-release.server', () => ({ readCurrentAssignmentSebRelease: m.release, createAssignmentSebSignedDownloadUrl: async () => 'https://synthetic.invalid/seed.seb' }))
vi.mock('@/lib/seb-session', () => ({ createSebChallenge: () => 'challenge', validateSebChallenge: () => null, getSebSession: vi.fn() }))

import { readSubmissionEntry, startAssignmentFromWaiting as startExamFromWaiting } from './submissions'
import { waitingResumeId, type ExamWaitingSummary } from '@/lib/exam-waiting-room'

/** Real entry/action/grading/snapshot code; external Auth/DB/native boundaries
 * are mocked. This is not hosted, RLS, transactional or native-SEB proof. */
type Row = Record<string, unknown>
type Result = { data: Row[] | null; error: { message: string; code?: string } | null }
const A = '30000000-0000-4000-8000-000000000001'
const S = '70000000-0000-4000-8000-000000000001'
const Q = '60000000-0000-4000-8000-000000000001'
const USER = '20000000-0000-4000-8000-000000000001'
const NOW = Date.parse('2026-10-10T03:00:00Z')
let db: Record<string, Row[]>
let writes: { table: string; operation: string; row: Row }[]
let reads: string[]
let readFailure: string | null
let writeFailure: string | null
let revisionColumnMissing = false

class Query implements PromiseLike<Result> {
  private fields = ''
  private filters: [string, unknown][] = []
  private statuses: unknown[] | null = null
  private descending = false
  private take = Infinity
  private rowsToInsert: Row[] | null = null
  private changes: Row | null = null
  constructor(private table: string) { reads.push(table) }
  select(fields: string) { this.fields = fields; return this }
  eq(key: string, value: unknown) { this.filters.push([key, value]); return this }
  in(key: string, values: unknown[]) { if (key === 'status') this.statuses = values; return this }
  order(_key: string, options?: { ascending: boolean }) { this.descending = options?.ascending === false; return this }
  limit(count: number) { this.take = count; return this }
  range(_from: number, _to: number) { return this }
  insert(rows: Row | Row[]) { this.rowsToInsert = Array.isArray(rows) ? rows : [rows]; return this }
  update(row: Row) { this.changes = row; return this }
  private result(): Result {
    if (revisionColumnMissing && this.fields.includes('seb_config_revision')) return { data: null, error: { code: '42703', message: 'column submissions.seb_config_revision does not exist' } }
    if (readFailure === this.table && !this.rowsToInsert && !this.changes) return { data: null, error: { message: 'synthetic read failure' } }
    if (this.rowsToInsert) {
      if (writeFailure === this.table) return { data: null, error: { message: 'synthetic write failure' } }
      const inserted = this.rowsToInsert.map(row => ({ id: S, started_at: new Date().toISOString(), ...row }))
      db[this.table].push(...inserted)
      for (const row of inserted) writes.push({ table: this.table, operation: 'insert', row })
      return { data: inserted, error: null }
    }
    let found = (db[this.table] ?? []).filter(row => this.filters.every(([key, value]) => row[key] === value))
    if (this.statuses) found = found.filter(row => this.statuses!.includes(row.status))
    if (this.descending) found = [...found].sort((a, b) => Number(b.attempt_number) - Number(a.attempt_number))
    found = found.slice(0, this.take)
    if (this.changes) {
      if (writeFailure === this.table) return { data: null, error: { message: 'synthetic write failure' } }
      for (const row of found) { Object.assign(row, this.changes); writes.push({ table: this.table, operation: 'update', row: { ...this.changes } }) }
    }
    if (this.table === 'submissions' && this.fields.includes('assignments(')) {
      found = found.map(row => ({ ...row, assignments: db.assignments[0] }))
    }
    return { data: found, error: null }
  }
  async maybeSingle() { const result = this.result(); return { ...result, data: result.data?.[0] ?? null } }
  async single() { return this.maybeSingle() }
  then<T = Result, R = never>(resolve?: ((value: Result) => T | PromiseLike<T>) | null,
    reject?: ((reason: unknown) => R | PromiseLike<R>) | null): PromiseLike<T | R> {
    return Promise.resolve(this.result()).then(resolve, reject)
  }
}

function attempt(overrides: Row = {}) {
  return { id: S, assignment_id: A, student_id: USER, status: 'in_progress', attempt_number: 1,
    started_at: new Date(NOW - 60_000).toISOString(), exam_access_mode: 'browser', seb_config_revision: null,
    ...overrides }
}
function noExamMutation() {
  expect(writes).toEqual([])
  expect(m.pool).not.toHaveBeenCalled()
  expect(reads).not.toContain('submission_answers')
  expect(reads).not.toContain('questions')
}
async function summary() {
  const result = await readSubmissionEntry(A)
  expect(result.waitingRoom).toBeDefined()
  return result.waitingRoom!
}

beforeEach(() => {
  revisionColumnMissing = false
  vi.clearAllMocks()
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external network') }))
  writes = []; reads = []; readFailure = null; writeFailure = null
  db = {
    assignments: [{ id: A, org_id: 'org', title: 'ทดสอบห้องรอสอบ', description: 'กติกา', status: 'published',
      type: 'exam', mode: 'online', secure_browser_mode: 'browser', android_exam_mode: 'blocked',
      access_code: null, question_ids: [Q], completion_rule: 'fixed', duration_minutes: 30,
      max_attempts: 3, passing_type: null, passing_value: null, start_at: null, end_at: null,
      private_secret: 'must-not-serialize', correct_answer: 'must-not-serialize',
      solution_text: 'must-not-serialize', shuffle_questions: false, shuffle_options: false,
      question_points: null, retry_scope: 'all', random_question_count: null }],
    submissions: [], assignment_extensions: [], submission_answers: [],
    exam_proctor_connections: [], exam_proctor_sessions: [],
  }
  m.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } })
  m.admin.mockReturnValue({ from: (table: string) => new Query(table), rpc: async (name: string, args: Row) => {
    const row = db.submissions.find(s => s.id === args.p_submission_id && s.student_id === args.p_student_id)
    if (!row) return { data: null, error: { code: '42501' } }
    if (writeFailure === 'submissions') return { data: null, error: { message: 'synthetic write failure' } }
    if (row.status !== 'in_progress') return { data: { completed: true, total_score: row.total_score }, error: null }
    if (name === 'claim_submission_close') {
      row.closed_at = new Date(NOW).toISOString()
      writes.push({ table: 'submissions', operation: 'update', row: { closed_at: row.closed_at } })
      return { data: { completed: false }, error: null }
    }
    if (name === 'commit_submission_grade') {
      Object.assign(row, { status: 'submitted', total_score: 0, submitted_at: row.closed_at })
      writes.push({ table: 'submissions', operation: 'update', row: { status: 'submitted' } })
      return { data: { total_score: 0 }, error: null }
    }
    throw new Error('unexpected RPC')
  } })
  m.membership.mockResolvedValue(true)
  m.access.mockResolvedValue(null)
  m.release.mockResolvedValue({ releaseId: 'synthetic-release', revision: 1 })
  m.pool.mockResolvedValue({ questions: [{ id: Q, question_type: 'written', variables: [], logic_rules: [],
    answer_formula: '10', answer_parts: null, extra_data: {}, mcq_options: null }],
    missingQuestionIds: [], duplicateQuestionCount: 0 })
})
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe.each(['exam', 'exercise'])('question-free %s entry', type => {
  beforeEach(() => { db.assignments[0].type = type })
  it('opens the waiting room against the legacy production schema without writes', async () => {
    revisionColumnMissing = true
    expect((await summary()).assignmentType).toBe(type)
    noExamMutation()
  })
  it('retains the SEB gate when revision metadata is unavailable', async () => {
    revisionColumnMissing = true
    db.assignments[0].secure_browser_mode = 'seb_required'
    m.access.mockResolvedValue({ mode: 'seb', assignmentConfigRevision: 1 })
    expect(await readSubmissionEntry(A)).toHaveProperty('error', 'ข้อสอบนี้ยังไม่พร้อมให้เข้า กรุณาแจ้งครูผู้สอน')
    noExamMutation()
    expect(m.access).not.toHaveBeenCalled()
  })
  it('GET/prefetch reads safe metadata without allocating, revealing questions or starting time', async () => {
    const first = await summary()
    vi.setSystemTime(NOW + 20 * 60_000)
    expect(await summary()).toEqual({ ...first, serverNow: new Date(NOW + 20 * 60_000).toISOString() })
    expect(Object.keys(first).sort()).toEqual(['title', 'description', 'durationMinutes', 'questionCount', 'endAt',
      'accessMode', 'requiresAccessCode', 'previousSubmissionId', 'activeSubmissionId', 'completedSubmissionId',
      'expired', 'startedAt', 'blockedReason', 'assignmentType', 'expiresAt', 'serverNow', 'closeReason', 'finishedSubmissionId', ...(type === 'exercise' ? ['exerciseDetails'] : [])].sort())
    expect(first.assignmentType).toBe(type)
    expect(JSON.stringify(first)).not.toMatch(/must-not-serialize|question_ids|correct_answer|private_secret|access_code|total_score/)
    expect(first.startedAt).toBeNull(); expect(db.submissions).toEqual([])
    noExamMutation()
  })
  it('keeps the exact active receipt and server start time, with no audit update', async () => {
    db.submissions = [attempt()]
    const view = await summary()
    expect(view.activeSubmissionId).toBe(S)
    expect(view.startedAt).toBe(new Date(NOW - 60_000).toISOString())
    expect(waitingResumeId(view, S)).toBe(S)
    noExamMutation()
  })
  it('expired GET does not grade or allocate its successor', async () => {
    db.submissions = [attempt({ started_at: new Date(NOW - 31 * 60_000).toISOString() })]
    const view = await summary()
    expect(view.expired).toBe(true); expect(view.activeSubmissionId).toBeNull()
    expect(waitingResumeId(view, S)).toBeNull()
    noExamMutation()
  })
  it('streak GET does not draw a question', async () => {
    db.assignments[0].completion_rule = 'streak'
    db.submissions = [attempt()]
    expect((await summary()).questionCount).toBeNull()
    noExamMutation()
  })
  it('completed quota stays a receipt; failed retry waits for a deliberate start', async () => {
    db.submissions = [attempt({ status: 'submitted', attempt_number: 3 })]
    expect((await summary()).completedSubmissionId).toBe(S)
    db.submissions[0].attempt_number = 1
    expect((await summary()).completedSubmissionId).toBeNull()
    expect((await summary()).finishedSubmissionId).toBe(S)
    noExamMutation()
  })
  it('recognizes an older passing threshold run without exposing scores', async () => {
    Object.assign(db.assignments[0], { passing_type: 'percent', passing_value: 70 })
    db.submissions = [attempt({ status: 'graded', total_score: 8, max_score: 10 }),
      attempt({ id: '70000000-0000-4000-8000-000000000002', status: 'graded', attempt_number: 2, total_score: 3, max_score: 10 })]
    expect((await summary()).completedSubmissionId).toBe(S)
    noExamMutation()
  })
  it('keeps the master score-adjustment threshold policy in waiting metadata', async () => {
    Object.assign(db.assignments[0], { passing_type: 'percent', passing_value: 70 })
    db.submissions = [attempt({ status: 'graded', total_score: 8, score_adjustment: -2, max_score: 10 })]
    expect((await summary()).completedSubmissionId).toBeNull()
    db.submissions[0].total_score = 6
    db.submissions[0].score_adjustment = 2
    expect((await summary()).completedSubmissionId).toBe(S)
    expect(JSON.stringify(await summary())).not.toMatch(/score_adjustment|total_score|max_score/)
    noExamMutation()
  })
  it('future-open and deadline-blocked metadata cannot resume or allocate', async () => {
    db.assignments[0].start_at = new Date(NOW + 60_000).toISOString()
    expect((await summary()).blockedReason).toContain('ยังไม่ถึง')
    db.assignments[0].start_at = null
    db.assignments[0].end_at = new Date(NOW - 60_000).toISOString()
    db.submissions = [attempt()]
    const view = await summary()
    expect(view.expired).toBe(true); expect(view.blockedReason).toBeNull(); expect(waitingResumeId(view, S)).toBeNull()
    noExamMutation()
  })
  it('respects an individual deadline extension', async () => {
    db.assignments[0].end_at = new Date(NOW - 60_000).toISOString()
    db.assignment_extensions = [{ assignment_id: A, student_id: USER, extended_end_at: new Date(NOW + 60_000).toISOString() }]
    expect((await summary()).blockedReason).toBeNull()
    noExamMutation()
  })
  it('returns no metadata without Auth or roster authorization', async () => {
    m.client.mockResolvedValueOnce({ auth: { getUser: async () => ({ data: { user: null } }) } })
    expect(await readSubmissionEntry(A)).toHaveProperty('unauthenticated', true)
    expect(m.admin).not.toHaveBeenCalled()
    m.membership.mockResolvedValue(false)
    expect(await readSubmissionEntry(A)).toEqual({ error: 'งานนี้ไม่ได้มอบหมายให้คุณ' })
    noExamMutation()
  })
  it('fails closed on state/history read failures', async () => {
    readFailure = 'assignments'
    expect(await readSubmissionEntry(A)).toHaveProperty('error')
    readFailure = 'submissions'
    expect(await readSubmissionEntry(A)).toHaveProperty('error')
    noExamMutation()
  })
  it('keeps native SEB gate and immutable active revision checks', async () => {
    db.assignments[0].secure_browser_mode = 'seb_required'
    expect(await readSubmissionEntry(A)).toHaveProperty('requiresSecureBrowser', true)
    m.access.mockResolvedValue({ mode: 'seb', assignmentConfigRevision: 1 })
    expect((await summary()).accessMode).toBe('seb')
    db.submissions = [attempt({ exam_access_mode: 'seb', seb_config_revision: 2 })]
    expect(await readSubmissionEntry(A)).toHaveProperty('error')
    noExamMutation()
  })
})

describe.each(['exam', 'exercise'])('deliberate %s waiting-room POST', type => {
  beforeEach(() => { db.assignments[0].type = type })
  it('starts and resumes browser work after the explicit click on the legacy schema', async () => {
    revisionColumnMissing = true
    await summary(); noExamMutation()
    expect(await startExamFromWaiting(A, null, 'start')).toHaveProperty('submissionId', S)
    expect(await startExamFromWaiting(A, S, 'resume')).toHaveProperty('submissionId', S)
    expect(db.submissions).toHaveLength(1)
    expect(db.submission_answers).toHaveLength(1)
  })
  it('keeps the adjusted passing receipt on explicit start without allocating a retry', async () => {
    Object.assign(db.assignments[0], { passing_type: 'percent', passing_value: 70 })
    db.submissions = [attempt({ status: 'graded', total_score: 6, score_adjustment: 2, max_score: 10 })]
    expect(await startExamFromWaiting(A, S, 'start')).toEqual({ submissionId: S, alreadySubmitted: true })
    noExamMutation()
  })
  it('starts only after the click and reuses the server time on explicit resume', async () => {
    await summary(); noExamMutation()
    expect(await startExamFromWaiting(A, null, 'start')).toHaveProperty('submissionId', S)
    const savedTime = db.submissions[0].started_at
    expect(writes.filter(write => write.table === 'submissions' && write.operation === 'insert')).toHaveLength(1)
    expect(db.submission_answers).toHaveLength(1)
    vi.setSystemTime(NOW + 5 * 60_000)
    expect(await startExamFromWaiting(A, S, 'resume')).toHaveProperty('submissionId', S)
    expect(db.submissions).toHaveLength(1); expect(db.submissions[0].started_at).toBe(savedTime)
  })
  it('malformed/stale predecessors and wrong codes stop before snapshots or writes', async () => {
    expect(await startExamFromWaiting(A, 'not-a-uuid', 'start')).toHaveProperty('error')
    expect(m.client).not.toHaveBeenCalled()
    db.submissions = [attempt()]
    expect(await startExamFromWaiting(A, null, 'start')).toHaveProperty('error')
    db.submissions = []
    db.assignments[0].access_code = 'TEST'
    expect((await summary()).requiresAccessCode).toBe(true)
    expect(await startExamFromWaiting(A, null, 'start', 'WRONG')).toHaveProperty('requiresAccessCode', true)
    noExamMutation()
    expect(await startExamFromWaiting(A, null, 'start', ' test ')).toHaveProperty('submissionId', S)
  })
  it('timer-expired recovery finalizes only the old receipt, never a retry', async () => {
    db.submissions = [attempt({ started_at: new Date(NOW - 31 * 60_000).toISOString() })]
    expect(await startExamFromWaiting(A, S, 'recover')).toEqual({ submissionId: S, alreadySubmitted: true })
    expect(db.submissions).toHaveLength(1)
    expect(db.submissions[0].status).toBe('submitted')
    expect(writes.some(write => write.operation === 'insert')).toBe(false)
    expect(m.pool).not.toHaveBeenCalled()
  })
  it('recovery failure and late deadline never allocate a successor', async () => {
    db.submissions = [attempt({ started_at: new Date(NOW - 31 * 60_000).toISOString() })]
    writeFailure = 'submissions'
    expect(await startExamFromWaiting(A, S, 'recover')).toHaveProperty('error')
    expect(db.submissions[0].status).toBe('in_progress')
    writeFailure = null; writes = []; reads = []
    db.assignments[0].end_at = new Date(NOW - 60_000).toISOString()
    expect(await startExamFromWaiting(A, S, 'recover')).toEqual({ submissionId: S, alreadySubmitted: true })
    expect(db.submissions).toHaveLength(1)
    expect(db.submissions[0].status).toBe('submitted')
  })
  it('rejects unknown assignment types without mutation', async () => {
    db.assignments[0].type = 'unknown'
    expect(await startExamFromWaiting(A, null, 'start')).toHaveProperty('error')
    expect(await readSubmissionEntry(A)).toHaveProperty('error')
    noExamMutation()
  })
  it('initializes the first streak question on POST, not on GET', async () => {
    Object.assign(db.assignments[0], { completion_rule: 'streak', streak_target: 1, streak_recycle_pool: true })
    await summary(); noExamMutation()
    expect(await startExamFromWaiting(A, null, 'start')).toHaveProperty('submissionId', S)
    expect(db.submission_answers).toHaveLength(1)
    const originalStart = db.submissions[0].started_at
    expect(await startExamFromWaiting(A, S, 'resume')).toHaveProperty('submissionId', S)
    expect(db.submission_answers).toHaveLength(1)
    expect(db.submissions[0].started_at).toBe(originalStart)
  })
  it('a stale start replay after completion cannot allocate another generation', async () => {
    db.submissions = [attempt({ status: 'submitted' })]
    expect(await startExamFromWaiting(A, null, 'start')).toHaveProperty('error')
    noExamMutation()
  })
  it.each(['resume', 'recover'] as const)('replaying %s after S committed returns S, not a new attempt', async operation => {
    db.submissions = [attempt({ status: 'submitted' })]
    expect(await startExamFromWaiting(A, S, operation)).toEqual({ submissionId: S, alreadySubmitted: true })
    noExamMutation()
  })
  it('resuming a checked nonempty streak does not draw the next question or change max score', async () => {
    Object.assign(db.assignments[0], { completion_rule: 'streak', streak_target: 2 })
    db.submissions = [attempt({ max_score: 1 })]
    db.submission_answers = [{ id: 'checked', submission_id: S, question_id: Q, check_count: 1, max_score: 1 }]
    expect(await startExamFromWaiting(A, S, 'resume')).toHaveProperty('submissionId', S)
    expect(db.submission_answers).toHaveLength(1)
    expect(db.submissions[0].max_score).toBe(1)
    expect(writes).toEqual([]); expect(m.pool).not.toHaveBeenCalled()
  })
})

describe('URL resume selection', () => {
  it('denies malformed, stale, foreign, absent and blocked receipt hints', async () => {
    db.submissions = [attempt()]
    const view: ExamWaitingSummary = await summary()
    for (const hint of [undefined, null, '', [S], { attempt: S }, 'foreign-or-stale']) expect(waitingResumeId(view, hint)).toBeNull()
    expect(waitingResumeId({ ...view, activeSubmissionId: null }, S)).toBeNull()
    expect(waitingResumeId({ ...view, blockedReason: 'blocked' }, S)).toBeNull()
    noExamMutation()
  })
})

describe('exercise-specific quotas and retry snapshots through explicit start', () => {
  beforeEach(() => { db.assignments[0].type = 'exercise' })
  it('legacy unlimited practice remains unlimited but a retry is allocated only on POST', async () => {
    db.assignments[0].max_attempts = null
    db.submissions = [attempt({ status: 'submitted', attempt_number: 100 })]
    const view = await summary()
    expect(view.exerciseDetails).toMatchObject({ completion: 'complete', maxAttempts: null })
    expect(view.completedSubmissionId).toBeNull(); noExamMutation()
    expect(await startExamFromWaiting(A, S, 'start')).toHaveProperty('submissionId', S)
    expect(db.submissions).toHaveLength(2)
    expect(db.submissions[1].attempt_number).toBe(101)
  })
  it('streak mastery keeps the passing receipt even when a later legacy run failed', async () => {
    Object.assign(db.assignments[0], { completion_rule: 'streak', streak_target: 3, max_attempts: 1 })
    db.submissions = [attempt({ status: 'graded', streak_reached: true }),
      attempt({ id: '70000000-0000-4000-8000-000000000002', status: 'graded', attempt_number: 2, streak_reached: false })]
    expect((await summary()).completedSubmissionId).toBe(S)
    expect((await summary()).exerciseDetails).toMatchObject({ completion: 'streak', maxAttempts: null, streakTarget: 3 })
    expect(await startExamFromWaiting(A, db.submissions[1].id as string, 'start')).toEqual({ submissionId: S, alreadySubmitted: true })
    noExamMutation()
  })
  it('wrong-only retry waits, then carries full marks and re-asks only the missed question', async () => {
    const Q2 = '60000000-0000-4000-8000-000000000002'
    Object.assign(db.assignments[0], { retry_scope: 'wrong_only', question_ids: [Q, Q2] })
    db.submissions = [attempt({ status: 'graded', total_score: 1, max_score: 2 })]
    const question = { question_type: 'mcq', variables: [], logic_rules: [], answer_formula: null,
      answer_parts: null, extra_data: {}, mcq_options: [{ text: 'A', is_correct: true }, { text: 'B', is_correct: false }] }
    m.pool.mockResolvedValue({ questions: [{ ...question, id: Q }, { ...question, id: Q2 }], missingQuestionIds: [], duplicateQuestionCount: 0 })
    const previous = { submission_id: S, random_values: {}, correct_answer: 'MCQ:0', max_score: 1,
      teacher_feedback: null, option_order: [0, 1], work_images: [], math_input_modes: {}, score_edited_by: null, score_edited_at: null }
    db.submission_answers = [{ ...previous, question_id: Q, student_answer: 'MCQ:0', is_correct: true, score: 1, order_index: 0 },
      { ...previous, question_id: Q2, student_answer: 'MCQ:1', is_correct: false, score: 0, order_index: 1 }]
    expect((await summary()).exerciseDetails?.retryWrongOnly).toBe(true); noExamMutation()
    expect(await startExamFromWaiting(A, S, 'start')).toHaveProperty('submissionId', S)
    expect(db.submissions).toHaveLength(2); expect(db.submissions[1].max_score).toBe(2)
    const rows = writes.filter(write => write.table === 'submission_answers').map(write => write.row)
    expect(rows).toHaveLength(2)
    expect(rows.find(row => row.question_id === Q)).toMatchObject({ carried_over: true, score: 1, max_score: 1, student_answer: 'MCQ:0' })
    expect(rows.find(row => row.question_id === Q2)).toMatchObject({ carried_over: false, max_score: 1 })
    // Fresh answer uses the database's NULL default, never the old answer.
    expect(rows.find(row => row.question_id === Q2)).not.toHaveProperty('student_answer')
  })
  it('rechecks roster and schedule on POST even after successful waiting metadata', async () => {
    await summary(); noExamMutation()
    m.membership.mockResolvedValue(false)
    expect(await startExamFromWaiting(A, null, 'start')).toEqual({ error: 'งานนี้ไม่ได้มอบหมายให้คุณ' })
    m.membership.mockResolvedValue(true)
    db.assignments[0].start_at = new Date(NOW + 60_000).toISOString()
    expect(await startExamFromWaiting(A, null, 'start')).toHaveProperty('error')
    noExamMutation()
  })
})
