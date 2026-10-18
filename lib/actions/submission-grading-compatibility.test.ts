import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: vi.fn(), admin: vi.fn(), manage: vi.fn(), writable: vi.fn(), saveReview: vi.fn(),
  studentAccess: vi.fn(), questions: vi.fn(), retry: vi.fn(), gradingState: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
vi.mock('@/lib/auth/assignment-access', () => ({ canManageAssignment: mocks.manage, studentHasAssignment: mocks.studentAccess }))
vi.mock('@/lib/exam-write-access', () => ({ getWritableStudentAnswer: mocks.writable }))
vi.mock('@/lib/actions/grading-review', () => ({ saveGradingReview: mocks.saveReview }))
vi.mock('@/lib/assignment-question-access.server', () => ({ loadAssignmentQuestionsByProvenance: mocks.questions }))
vi.mock('@/lib/voided-score-metadata.server', () => ({
  loadAssignmentGradingState: mocks.gradingState,
  withVoidedScoreMetadata: async (_reader: unknown, rows: unknown[]) => rows,
}))
vi.mock('@/lib/assignment-attempt', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/assignment-attempt')>(), buildRetryAttempt: mocks.retry,
}))
import { checkAnswer, startSubmission, updateSubmissionAnswerScore } from './submissions'

type Row = Record<string, unknown>
const actorId = '11111111-1111-4111-8111-111111111111'
const submissionId = '22222222-2222-4222-8222-222222222222'
const answerId = '33333333-3333-4333-8333-333333333333'
const assignmentId = '44444444-4444-4444-8444-444444444444'
const questionId = '55555555-5555-4555-8555-555555555555'
const revision = '2026-10-18T03:00:00.000Z'
function database(answer: Row, previous?: Row[]) {
  const updates: { table: string; payload: unknown }[] = []
  const selections: { table: string; columns: string }[] = []
  const from = vi.fn((table: string) => {
    const query = {
      select(columns: string) { selections.push({ table, columns }); return query },
      eq() { return query }, in() { return query }, order() { return query }, limit() { return query }, range() { return query },
      update(payload: unknown) { updates.push({ table, payload }); return query },
      maybeSingle: async () => ({ data: table === 'assignments' ? {
        id: assignmentId, status: 'published', mode: 'online', type: 'exercise', max_attempts: null,
        retry_scope: 'wrong_only', question_ids: [questionId], completion_rule: 'fixed', passing_type: 'percent', passing_value: 100,
      } : table === 'submissions' ? { id: submissionId, status: 'graded', attempt_number: 1 } : table === 'submission_answers' ? answer : null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: table === 'submission_answers' ? previous ?? [] : table === 'submissions' ? [{ id: submissionId, status: 'graded', total_score: 0, max_score: 10 }] : [], error: null,
      }).then(resolve),
    }
    return query
  })
  mocks.admin.mockReturnValue({ from })
  return { from, updates, selections }
}
function scoreRow(overrides: Row = {}) {
  return { id: answerId, submission_id: submissionId, max_score: 10, score_edited_at: revision,
    submissions: { id: submissionId, assignment_id: assignmentId, status: 'graded' }, ...overrides }
}
function checkedRow(overrides: Row = {}) {
  return { id: answerId, submission_id: submissionId, max_score: 10, correct_answer: '5', student_answer: '5',
    questions: { question_type: 'written', answer_tolerance: 0, answer_unit: null, answer_parts: null, extra_data: null, mcq_options: null }, ...overrides }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.session.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: actorId } } }) } })
  mocks.manage.mockResolvedValue(true)
  mocks.saveReview.mockResolvedValue({ success: true })
  mocks.studentAccess.mockResolvedValue(true)
  mocks.questions.mockResolvedValue({ questions: [{ id: questionId, question_type: 'written' }], missingQuestionIds: [], duplicateQuestionCount: 0 })
  mocks.retry.mockReturnValue({ carried: [], retried: [] })
  mocks.gradingState.mockResolvedValue({ available: true, voidedIds: new Set() })
  mocks.writable.mockResolvedValue({
    answer: { carried_over: false, check_count: 0 }, submission: { id: submissionId },
    assignment: { mode: 'online', type: 'exercise', instant_check: true, instant_check_answer_key: false, completion_rule: 'fixed' },
  })
})

describe('legacy teacher score saves', () => {
  it('delegates an unsplit save with a fresh revision and never performs direct score or total updates', async () => {
    const db = database(scoreRow())
    expect(await updateSubmissionAnswerScore(answerId, 4)).toEqual({ success: true })
    expect(mocks.manage).toHaveBeenCalledWith(assignmentId, actorId)
    expect(mocks.saveReview).toHaveBeenCalledWith({ assignmentId, answerId, answerScore: 4, expectedScoreEditedAt: revision })
    expect(db.updates).toEqual([])
    expect(db.selections).toEqual([{ table: 'submission_answers', columns: '*, submissions(id, status, assignment_id)' }])
  })
  it('supports old rows without split columns but propagates a missing-RPC error with no fallback writes', async () => {
    const db = database(scoreRow({ score_edited_at: null }))
    mocks.saveReview.mockResolvedValue({ error: 'ฐานข้อมูลยังไม่พร้อม' })
    expect(await updateSubmissionAnswerScore(answerId, 0)).toEqual({ error: 'ฐานข้อมูลยังไม่พร้อม' })
    expect(mocks.saveReview).toHaveBeenCalledWith(expect.objectContaining({ expectedScoreEditedAt: null, answerScore: 0 }))
    expect(db.updates).toEqual([])
  })
  it.each([
    { fields: { work_max_score: 6 }, score: 4 },
    { fields: { max_score: 0 }, score: 0 },
    { fields: { is_void: true }, score: 0 },
    { fields: { submissions: { id: submissionId, assignment_id: assignmentId, status: 'in_progress' } }, score: 4 },
    { fields: {}, score: 11 },
  ])('refuses split, void, active or out-of-range edits before delegation ($fields)', async ({ fields, score }) => {
    const db = database(scoreRow(fields))
    expect(await updateSubmissionAnswerScore(answerId, score)).toHaveProperty('error')
    expect(mocks.saveReview).not.toHaveBeenCalled()
    expect(db.updates).toEqual([])
  })
  it('checks exact assignment management before any mutation', async () => {
    const db = database(scoreRow())
    mocks.manage.mockResolvedValue(false)
    expect(await updateSubmissionAnswerScore(answerId, 4)).toHaveProperty('error')
    expect(mocks.saveReview).not.toHaveBeenCalled()
    expect(db.updates).toEqual([])
  })
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])('rejects invalid score %s before the service read', async value => {
    database(scoreRow())
    expect(await updateSubmissionAnswerScore(answerId, value)).toHaveProperty('error')
    expect(mocks.admin).not.toHaveBeenCalled()
  })
})

describe('instant answer feedback with split score ceilings', () => {
  it.each([4, 0])('grades and reports the answer ceiling %s independently from the full raw ceiling', async answerMax => {
    const db = database(checkedRow({ answer_max_score: answerMax, work_max_score: 10 - answerMax }))
    const result = await checkAnswer(answerId)
    expect(result).toMatchObject({ success: true, feedback: { score: answerMax, maxScore: answerMax } })
    expect(db.updates).toEqual([{ table: 'submission_answers', payload: { check_count: 1 } }])
  })
  it.each([{}, { answer_max_score: null, work_max_score: null }, { answer_max_score: 14, work_max_score: -4 }])('falls back to the raw ceiling only for legacy or invalid split values', async fields => {
    database(checkedRow(fields))
    expect(await checkAnswer(answerId)).toMatchObject({ success: true, feedback: { score: 10, maxScore: 10 } })
  })
  it('uses the raw zero ceiling for void refusal', async () => {
    const db = database(checkedRow({ max_score: 0, answer_max_score: 0, work_max_score: 0 }))
    expect(await checkAnswer(answerId)).toHaveProperty('error')
    expect(db.updates).toEqual([])
  })
})

describe('wrong-only retry compatibility', () => {
  it.each([true, false])('carries all six split fields when the column exists (regrading schema available=%s)', async available => {
    const fields = { answer_score: 4, answer_max_score: 4, work_score: 0, work_max_score: 6, answer_reviewed_at: null, work_reviewed_at: revision }
    database({}, [{ question_id: questionId, ...fields }])
    mocks.gradingState.mockResolvedValue({ available, voidedIds: new Set() })
    expect(await startSubmission(assignmentId)).toEqual({ submissionId, alreadySubmitted: true })
    expect(mocks.retry.mock.calls[0][2][0]).toMatchObject(fields)
  })
  it('does not invent nullable split columns when reading an old installation', async () => {
    database({}, [{ question_id: questionId }])
    expect(await startSubmission(assignmentId)).toEqual({ submissionId, alreadySubmitted: true })
    const carriedInput = mocks.retry.mock.calls[0][2][0]
    expect(Object.hasOwn(carriedInput, 'answer_max_score')).toBe(false)
    expect(Object.hasOwn(carriedInput, 'work_max_score')).toBe(false)
  })
})
