import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuestionFormData } from './actions/questions'
import type { Question } from './types'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), createAdminClient: vi.fn(), canManageAssignment: vi.fn(),
  getAuthUser: vi.fn(), getMyOrgId: vi.fn(), getMyTeamOrgs: vi.fn(),
  revalidatePath: vi.fn(), redirect: vi.fn(), rpc: vi.fn(),
  readerRpc: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/auth/assignment-access', () => ({ canManageAssignment: mocks.canManageAssignment }))
vi.mock('@/lib/auth/server', () => ({ getAuthUser: mocks.getAuthUser }))
vi.mock('@/lib/actions/org', () => ({ getMyOrgId: mocks.getMyOrgId }))
vi.mock('@/lib/actions/team-org', () => ({ getMyTeamOrgs: mocks.getMyTeamOrgs }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

import {
  commitQuestionRegrading, commitVoidQuestion, planQuestionRegrading, planVoidQuestion,
  questionRegradingReceipt, voidQuestionReceipt,
} from './question-regrading.server'
import { prepareQuestionUpdate, prepareVoidQuestion, voidAssignmentQuestion } from './actions/question-regrading'
import { updateQuestion } from './actions/questions'

type Row = Record<string, any>
const uuid = (prefix: string, n = 1) => `${prefix}0000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const ACTOR = uuid('1')
const QUESTION = uuid('2')
const ASSIGNMENT = uuid('3')
const DENIED_ASSIGNMENT = uuid('3', 9999)
const ORG = uuid('6')
const UPDATED = '2026-10-18T00:00:00.000Z'
let db: Record<string, Row[]>
let allowed: Set<string>
let operations: Array<{ client: string; table: string; filters: any[]; range: number[]; selection: string; mutation?: string }>
let failures: Set<string>

function query(client: 'reader' | 'admin', table: string) {
  const filters: Array<[string, string, any]> = []
  let selection = '*'
  let bounds = [0, Number.MAX_SAFE_INTEGER]
  let orderKey: string | undefined
  let mutation: string | undefined
  let update: Row | undefined
  const execute = () => {
    operations.push({ client, table, filters: structuredClone(filters), range: [...bounds], selection, mutation })
    if (failures.has(`${table}:${bounds[0]}`)) return { data: null, error: { message: 'synthetic failure' } }
    let rows = (db[table] ?? []).filter(row => filters.every(([kind, key, value]) => {
      if (kind === 'eq') return row[key] === value
      if (kind === 'in') return value.includes(row[key])
      if (kind === 'contains') return value.every((item: any) => row[key]?.includes(item))
      return false
    }))
    if (orderKey) rows = [...rows].sort((a, b) => String(a[orderKey!]).localeCompare(String(b[orderKey!])))
    rows = rows.slice(bounds[0], bounds[1] + 1)
    if (update) for (const row of rows) Object.assign(row, update)
    const data = rows.map(row => selection === '*' ? row : Object.fromEntries(selection.split(',').map(key => [key.trim(), row[key.trim()]])))
    return { data: structuredClone(data), error: null }
  }
  const chain: any = {
    select: (columns = '*') => { selection = columns; return chain },
    eq: (key: string, value: any) => { filters.push(['eq', key, value]); return chain },
    in: (key: string, value: any) => { filters.push(['in', key, value]); return chain },
    contains: (key: string, value: any) => { filters.push(['contains', key, value]); return chain },
    order: (key: string) => { orderKey = key; return chain },
    range: (start: number, end: number) => { bounds = [start, end]; return chain },
    limit: (count: number) => { bounds = [0, count - 1]; return chain },
    update: (value: Row) => { mutation = 'update'; update = value; return chain },
    delete: () => { mutation = 'delete'; return chain },
    insert: () => { mutation = 'insert'; return chain },
    maybeSingle: () => { const result = execute(); return Promise.resolve({ ...result, data: result.data?.[0] ?? null }) },
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(execute()).then(resolve, reject),
  }
  return chain
}

function question(): Question {
  return {
    id: QUESTION, created_by: ACTOR, org_id: ORG, updated_at: UPDATED,
    question_type: 'mcq', is_research_snapshot: false, team_edit_allowed: true,
    question_text: 'โจทย์', title: 'ทดสอบ', difficulty: 'easy', visibility: 'private',
    category_id: '', grade_level: '', subject: '', is_random: false,
    variables: [], logic_rules: [], answer_parts: null, answer_formula: '', answer_unit: '', answer_tolerance: 0,
    mcq_options: [{ text: 'A', is_correct: true }, { text: 'B', is_correct: false }],
    extra_data: {}, solution_text: '', tags: [], image_urls: [], solution_image_urls: [], requires_work_image: false,
  } as unknown as Question
}

function data(): QuestionFormData {
  return {
    title: 'ทดสอบ', question_text: 'โจทย์', subject: '', question_type: 'mcq', difficulty: 'easy', visibility: 'private',
    category_id: '', grade_level: '', is_random: false, variables: [], logic_rules: [], answer_parts: [],
    answer_formula: '', answer_unit: '', answer_tolerance: 0,
    mcq_options: [{ text: 'A', is_correct: false }, { text: 'B', is_correct: true }],
    extra_data: {}, solution_text: '', tags: [], image_urls: [],
  }
}

function submission(index = 1, assignmentId = ASSIGNMENT): Row {
  return { id: uuid('4', index), assignment_id: assignmentId, answer_revision: 1, status: 'graded', total_score: 0, max_score: 4 }
}

function answer(index = 1, submissionId = uuid('4')): Row {
  return {
    id: uuid('5', index), submission_id: submissionId, question_id: QUESTION,
    student_answer: 'MCQ:1', correct_answer: 'MCQ:0', random_values: {}, option_order: [1, 0],
    math_input_modes: {}, score: 0, max_score: 4, is_correct: false, score_edited_by: null,
    score_edited_at: null, is_void: false, grading_config: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('GRADING_CONFIRMATION_SECRET', 'local-regrading-test-secret-'.repeat(3))
  db = { questions: [question()], assignments: [{ id: ASSIGNMENT, question_ids: [QUESTION] }], submissions: [submission()], submission_answers: [answer()] }
  operations = []
  allowed = new Set([ASSIGNMENT])
  failures = new Set()
  mocks.getAuthUser.mockResolvedValue({ id: ACTOR })
  mocks.getMyOrgId.mockResolvedValue(ORG)
  mocks.getMyTeamOrgs.mockResolvedValue([])
  mocks.canManageAssignment.mockImplementation(async (id, actor) => actor === ACTOR && allowed.has(id))
  mocks.createClient.mockImplementation(async () => ({
    from: (table: string) => query('reader', table), auth: { getUser: async () => ({ data: { user: await mocks.getAuthUser() } }) },
    rpc: mocks.readerRpc,
  }))
  mocks.readerRpc.mockImplementation(async (name: string) => ({
    data: name === 'current_user_can_manage_question_bank' ? true : name === 'get_user_org_ids' ? [ORG] : false,
    error: null,
  }))
  mocks.createAdminClient.mockImplementation(() => ({ from: (table: string) => query('admin', table), rpc: mocks.rpc }))
  mocks.rpc.mockResolvedValue({ data: { batch_id: 'synthetic-batch' }, error: null })
  mocks.redirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
})
afterEach(() => vi.unstubAllEnvs())

const mutations = () => operations.filter(operation => operation.mutation)

describe('server regrading scope and atomic payload', () => {
  it('blocks structural edits when the only existing answers belong to another teacher', async () => {
    db.assignments = [{ id: DENIED_ASSIGNMENT, question_ids: [QUESTION] }]
    db.submissions = [submission(2, DENIED_ASSIGNMENT)]
    db.submission_answers = [answer(2, uuid('4', 2))]
    allowed.clear()
    const changeType = { ...data(), question_type: 'essay' as const }
    const prepared = await prepareQuestionUpdate(QUESTION, changeType)
    expect(prepared).toMatchObject({ error: expect.stringContaining('ประเภทโจทย์') })
    const usageReads = operations.filter(operation => operation.table === 'submission_answers')
    expect(usageReads).toHaveLength(1)
    expect(usageReads[0]).toMatchObject({ client: 'admin', selection: 'id', range: [0, 0], filters: [['eq', 'question_id', QUESTION]] })
    expect(operations.some(operation => operation.table === 'submissions')).toBe(false)
    expect(JSON.stringify(prepared)).not.toContain(uuid('4', 2))
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mutations()).toHaveLength(0)
  })

  it('blocks a changed option layout even with no manageable answers', async () => {
    allowed.clear()
    await expect(planQuestionRegrading(QUESTION, { ...data(), mcq_options: data().mcq_options.reverse() }, ACTOR))
      .rejects.toThrow('ช่องคำตอบ')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('allows a compatible key correction without changing another teacher’s grades', async () => {
    allowed.clear()
    const plan = await planQuestionRegrading(QUESTION, data(), ACTOR)
    expect(plan.requiresUnusedQuestion).toBe(false)
    expect(plan.changes).toEqual([])
    expect(plan.impact.submissionCount).toBe(0)
    expect(operations.some(operation => operation.table === 'submission_answers')).toBe(false)
  })

  it('passes the unused-question precondition to the atomic RPC for a structural edit', async () => {
    db.submission_answers = []
    db.submissions = []
    const plan = await planQuestionRegrading(QUESTION, { ...data(), question_type: 'essay' }, ACTOR)
    expect(plan.requiresUnusedQuestion).toBe(true)
    expect(plan.requiresConfirmation).toBe(true)
    expect(await commitQuestionRegrading(plan, questionRegradingReceipt(plan), { question_type: 'essay' })).toMatchObject({ success: true })
    expect(mocks.rpc).toHaveBeenCalledWith('apply_question_grading_change', expect.objectContaining({ p_requires_unused_question: true }))
  })

  it('fails closed when global answer-use existence cannot be determined', async () => {
    failures.add('submission_answers:0')
    const result = await prepareQuestionUpdate(QUESTION, { ...data(), question_type: 'essay' })
    expect(result).toMatchObject({ error: expect.stringContaining('ตรวจสอบการใช้งาน') })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mutations()).toHaveLength(0)
  })

  it('paginates beyond 500 submissions and beyond 500 same-question answers in each chunk', async () => {
    db.submissions = Array.from({ length: 501 }, (_, index) => submission(index + 1))
    db.submission_answers = db.submissions.flatMap((row, index) => Array.from({ length: 6 }, (_, repeat) => answer(index * 6 + repeat + 1, row.id)))
    const plan = await planQuestionRegrading(QUESTION, data(), ACTOR)
    expect(plan.impact).toMatchObject({ assignmentCount: 1, submissionCount: 501, activeCount: 0 })
    expect(plan.changes[0].submissions).toHaveLength(501)
    expect(plan.changes[0].answers).toHaveLength(3006)
    expect(operations.some(operation => operation.table === 'submissions' && operation.range[0] === 500)).toBe(true)
    expect(operations.some(operation => operation.table === 'submission_answers' && operation.range[0] === 500)).toBe(true)
    expect(plan.changes[0].answers.every(row => row.score === 4 && row.correct_answer === 'MCQ:1')).toBe(true)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mutations()).toHaveLength(0)
  })

  it('paginates all 501 manageable assignments instead of silently dropping the last one', async () => {
    db.assignments = Array.from({ length: 501 }, (_, index) => ({ id: uuid('3', index + 1), question_ids: [QUESTION] }))
    allowed = new Set(db.assignments.map(row => row.id))
    db.submissions = []
    db.submission_answers = []
    const plan = await planQuestionRegrading(QUESTION, data(), ACTOR)
    expect(plan.changes).toHaveLength(501)
    expect(plan.impact.assignmentCount).toBe(501)
    expect(operations.some(operation => operation.client === 'admin' && operation.table === 'assignments' && operation.range[0] === 500)).toBe(true)
  })

  it('never reads sensitive submissions from another teacher’s non-manageable assignment', async () => {
    db.assignments.push({ id: DENIED_ASSIGNMENT, question_ids: [QUESTION] })
    const denied = submission(2, DENIED_ASSIGNMENT)
    db.submissions.push(denied)
    db.submission_answers.push(answer(2, denied.id))
    const plan = await planQuestionRegrading(QUESTION, data(), ACTOR)
    expect(plan.impact).toMatchObject({ assignmentCount: 1, submissionCount: 1 })
    expect(plan.changes.map(row => row.assignment_id)).toEqual([ASSIGNMENT])
    expect(operations.some(operation => operation.table === 'submissions' && operation.filters.some(([, key, value]) => key === 'assignment_id' && value === DENIED_ASSIGNMENT))).toBe(false)
    expect(plan.changes[0].answers.map(row => row.id)).toEqual([uuid('5')])
  })

  it('sends the exact expected snapshot fields required by the atomic RPC and retains teacher scores', async () => {
    Object.assign(db.submission_answers[0], { score: 2, score_edited_by: ACTOR, score_edited_at: UPDATED })
    const plan = await planQuestionRegrading(QUESTION, data(), ACTOR)
    const token = questionRegradingReceipt(plan)
    expect(plan.impact.manualCount).toBe(1)
    expect(plan.changes[0].answers[0]).toMatchObject({ score: 2, max_score: 4, correct_answer: 'MCQ:1', skipped: true, skip_reason: 'teacher_override' })
    expect(await commitQuestionRegrading(plan, token, { title: 'ทดสอบ' })).toMatchObject({ success: true })
    const [name, payload] = mocks.rpc.mock.calls[0]
    expect(name).toBe('apply_question_grading_change')
    expect(payload).toMatchObject({ p_actor_id: ACTOR, p_question_id: QUESTION, p_expected_question_updated_at: UPDATED, p_void_assignment_id: null })
    const expected = payload.p_changes[0].answers[0].expected
    expect(Object.keys(expected).sort()).toEqual([
      'correct_answer', 'score', 'is_correct', 'max_score', 'score_edited_by', 'score_edited_at',
      'student_answer', 'random_values', 'is_void', 'grading_config',
    ].sort())
    expect(expected).toMatchObject({ score: 2, score_edited_by: ACTOR, score_edited_at: UPDATED, correct_answer: 'MCQ:0', grading_config: null })
  })

  it('fails closed if a later page cannot be read', async () => {
    db.submissions = Array.from({ length: 501 }, (_, index) => submission(index + 1))
    failures.add('submissions:500')
    await expect(planQuestionRegrading(QUESTION, data(), ACTOR)).rejects.toThrow('อ่านรอบทำงาน')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mutations()).toHaveLength(0)
  })
})

describe('confirmation and action coupling', () => {
  it('prepares a cancelled edit entirely read-only, without exposing any learner ids or keys', async () => {
    const prepared = await prepareQuestionUpdate(QUESTION, data())
    expect(prepared).toMatchObject({ requiresConfirmation: true, impact: { assignmentCount: 1, submissionCount: 1 }, token: expect.any(String) })
    const response = JSON.stringify(prepared)
    expect(response).not.toContain(uuid('4'))
    expect(response).not.toContain('MCQ:0')
    expect(response).not.toContain('MCQ:1')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mutations()).toHaveLength(0)
  })

  it('rejects a direct key save without its acknowledgement token before any mutation', async () => {
    expect(await updateQuestion(QUESTION, data())).toHaveProperty('error')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mutations()).toHaveLength(0)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('rejects an old token after a teacher changes an affected score', async () => {
    const prepared = await prepareQuestionUpdate(QUESTION, data())
    expect('token' in prepared).toBe(true)
    Object.assign(db.submission_answers[0], { score: 2, score_edited_by: ACTOR, score_edited_at: '2026-10-18T00:01:00.000Z' })
    db.submissions[0].total_score = 2
    const result = await updateQuestion(QUESTION, { ...data(), regrade_confirmation: (prepared as any).token })
    expect(result).toHaveProperty('error')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mutations()).toHaveLength(0)
  })

  it('rejects a receipt after the bank question revision changes', async () => {
    const prepared = await prepareQuestionUpdate(QUESTION, data())
    db.questions[0].updated_at = '2026-10-18T00:02:00.000Z'
    expect(await updateQuestion(QUESTION, { ...data(), regrade_confirmation: (prepared as any).token })).toHaveProperty('error')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mutations()).toHaveLength(0)
  })

  it('binds an acknowledgement to the exact submitted answer-key correction', async () => {
    const prepared = await prepareQuestionUpdate(QUESTION, data())
    const changed = data()
    changed.answer_tolerance = 0.3
    changed.title = 'another submitted draft'
    expect(await updateQuestion(QUESTION, { ...changed, regrade_confirmation: (prepared as any).token })).toHaveProperty('error')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mutations()).toHaveLength(0)
  })

  it('commits one atomic RPC after acknowledgement, with no separate direct question update', async () => {
    const prepared = await prepareQuestionUpdate(QUESTION, data())
    await expect(updateQuestion(QUESTION, { ...data(), regrade_confirmation: (prepared as any).token })).rejects.toThrow('NEXT_REDIRECT')
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mutations().filter(operation => operation.table === 'questions')).toHaveLength(0)
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/assignments/${ASSIGNMENT}/results`)
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/submissions/${uuid('4')}`)
  })

  it('keeps solution-only edits on the normal version-checked save path without a grading receipt', async () => {
    const unchangedKey = { ...data(), mcq_options: question().mcq_options!, solution_text: 'เฉลยแสดงวิธีทำใหม่' }
    expect(await prepareQuestionUpdate(QUESTION, unchangedKey)).toMatchObject({ requiresConfirmation: false })
    await expect(updateQuestion(QUESTION, unchangedKey)).rejects.toThrow('NEXT_REDIRECT')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mutations().filter(operation => operation.table === 'questions')).toHaveLength(1)
    expect(mutations().find(operation => operation.table === 'questions')?.filters).toContainEqual(['eq', 'updated_at', UPDATED])
  })

  it('fails with a migration-needed message and no direct question write when the RPC is unavailable', async () => {
    const prepared = await prepareQuestionUpdate(QUESTION, data())
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'function absent' } })
    const result = await updateQuestion(QUESTION, { ...data(), regrade_confirmation: (prepared as any).token })
    expect(result).toMatchObject({ error: expect.stringContaining('migration') })
    expect(mutations()).toHaveLength(0)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('rejects a bank question whose owner disabled team editing', async () => {
    Object.assign(db.questions[0], { created_by: uuid('1', 2), team_edit_allowed: false })
    expect(await prepareQuestionUpdate(QUESTION, data())).toHaveProperty('error')
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('refuses public-read-only teachers before any privileged usage or assignment read', async () => {
    Object.assign(db.questions[0], { created_by: uuid('1', 2), visibility: 'public', team_edit_allowed: true })
    expect(await prepareQuestionUpdate(QUESTION, { ...data(), question_type: 'essay' })).toHaveProperty('error')
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.canManageAssignment).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('refuses inactive or non-bank-managing actors before privileged reads', async () => {
    mocks.readerRpc.mockImplementation(async () => ({ data: false, error: null }))
    expect(await prepareQuestionUpdate(QUESTION, { ...data(), question_type: 'essay' })).toHaveProperty('error')
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('permits a team editor through current organization membership', async () => {
    Object.assign(db.questions[0], { created_by: uuid('1', 2), visibility: 'organization', org_id: ORG, team_edit_allowed: true })
    expect(await prepareQuestionUpdate(QUESTION, data())).toMatchObject({ requiresConfirmation: true })
    expect(mocks.readerRpc).toHaveBeenCalledWith('get_user_org_ids')
  })

  it('permits an additional-team editor through the existing shared-question RPC', async () => {
    Object.assign(db.questions[0], { created_by: uuid('1', 2), visibility: 'public', team_edit_allowed: true })
    mocks.readerRpc.mockImplementation(async (name: string) => ({
      data: name === 'current_user_can_manage_question_bank' || name === 'question_shared_with_my_orgs', error: null,
    }))
    expect(await prepareQuestionUpdate(QUESTION, data())).toMatchObject({ requiresConfirmation: true })
    expect(mocks.readerRpc).toHaveBeenCalledWith('question_shared_with_my_orgs', { p_question_id: QUESTION })
  })

  it('rejects a key change while any affected assignment has an active attempt', async () => {
    db.submissions[0].status = 'in_progress'
    const plan = await planQuestionRegrading(QUESTION, data(), ACTOR)
    expect(plan.impact.activeCount).toBe(1)
    expect(await commitQuestionRegrading(plan, questionRegradingReceipt(plan), {})).toHaveProperty('error')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('does not create a grading plan for unauthenticated callers', async () => {
    mocks.getAuthUser.mockResolvedValue(null)
    expect(await prepareQuestionUpdate(QUESTION, data())).toEqual({ error: 'ไม่ได้เข้าสู่ระบบ' })
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('assignment-only voiding', () => {
  it('rejects a non-manageable assignment before reading its answers', async () => {
    expect(await prepareVoidQuestion(DENIED_ASSIGNMENT, QUESTION)).toHaveProperty('error')
    expect(operations.filter(operation => operation.table === 'submissions' || operation.table === 'submission_answers')).toHaveLength(0)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('binds the void token to one assignment and removes both earned and possible points', async () => {
    const plan = await planVoidQuestion(ASSIGNMENT, QUESTION, ACTOR)
    const token = voidQuestionReceipt(plan)
    expect(plan.changes[0].answers[0]).toMatchObject({ score: 0, max_score: 0, is_correct: true, is_void: true })
    expect(await commitVoidQuestion(plan, token, 'โจทย์ผิดพลาด')).toMatchObject({ success: true })
    expect(mocks.rpc).toHaveBeenCalledWith('apply_question_grading_change', expect.objectContaining({
      p_void_assignment_id: ASSIGNMENT, p_question_patch: {}, p_reason: 'โจทย์ผิดพลาด',
    }))
  })

  it('rejects missing/stale void receipts and short reasons without mutation', async () => {
    const plan = await planVoidQuestion(ASSIGNMENT, QUESTION, ACTOR)
    expect(await commitVoidQuestion(plan, undefined, 'โจทย์ผิด')).toHaveProperty('error')
    expect(await commitVoidQuestion(plan, voidQuestionReceipt(plan), 'a')).toHaveProperty('error')
    const token = voidQuestionReceipt(plan)
    db.submission_answers[0].score = 1
    expect(await voidAssignmentQuestion(ASSIGNMENT, QUESTION, token, 'โจทย์ผิด')).toHaveProperty('error')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mutations()).toHaveLength(0)
  })
})
