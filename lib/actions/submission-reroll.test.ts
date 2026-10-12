import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getWritableStudentAnswer: vi.fn(),
  buildFreshRandomQuestion: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/exam-write-access', () => ({
  getWritableStudentAnswer: mocks.getWritableStudentAnswer,
}))
vi.mock('@/lib/assignment-question-access.server', () => ({
  loadAssignmentQuestionsByProvenance: vi.fn(),
}))
vi.mock('@/lib/assignment-attempt', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/assignment-attempt')>(),
  buildFreshRandomQuestion: mocks.buildFreshRandomQuestion,
}))

import { rerollCheckedRandomAnswer } from './submissions'

const ANSWER_ID = '33333333-3333-4333-8333-333333333333'
const SUBMISSION_ID = '22222222-2222-4222-8222-222222222222'

function writable(reveal = true) {
  return {
    answer: {
      id: ANSWER_ID,
      submission_id: SUBMISSION_ID,
      student_answer: '4',
      work_images: [],
      carried_over: false,
      check_count: 1,
      questions: { question_type: 'written', answer_parts: [] },
      submissions: null,
    },
    submission: {
      id: SUBMISSION_ID,
      student_id: 'student',
      status: 'in_progress',
      started_at: new Date().toISOString(),
      assignment_id: 'assignment',
      seb_config_revision: null,
      exam_access_mode: 'browser',
      current_streak: 0,
      best_streak: 0,
      streak_reached: false,
      assignments: null,
    },
    assignment: {
      id: 'assignment',
      duration_minutes: null,
      end_at: null,
      secure_browser_mode: 'browser',
      android_exam_mode: 'blocked',
      type: 'exercise',
      mode: 'online',
      instant_check: true,
      instant_check_answer_key: reveal,
      completion_rule: 'fixed',
      streak_target: null,
      streak_question_cap: null,
      streak_recycle_pool: false,
      require_work_image: false,
      scratchpad_enabled: false,
    },
    question: { question_type: 'written', answer_parts: [] },
  }
}

function database() {
  let updated: unknown = null
  const query: Record<string, any> = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn(() => query)
  query.maybeSingle = vi.fn(async () => ({
    data: {
      id: ANSWER_ID,
      random_values: { x: 2 },
      questions: { id: 'q', question_type: 'written' },
    },
  }))
  query.update = vi.fn((payload: unknown) => {
    updated = payload
    return query
  })
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
  const from = vi.fn(() => query)
  mocks.createAdminClient.mockReturnValue({ from })
  return { from, query, updated: () => updated }
}

describe('rerollCheckedRandomAnswer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'student' } } }) },
    })
    mocks.getWritableStudentAnswer.mockResolvedValue(writable())
  })

  it('freezes fresh values and clears only the answer for the next try', async () => {
    const db = database()
    mocks.buildFreshRandomQuestion.mockReturnValue({
      random_values: { x: 7 },
      correct_answer: '14',
    })

    await expect(rerollCheckedRandomAnswer(ANSWER_ID)).resolves.toEqual({
      success: true,
      rerolled: true,
      randomValues: { x: 7 },
    })
    expect(db.updated()).toEqual({
      random_values: { x: 7 },
      correct_answer: '14',
      student_answer: null,
      math_input_modes: {},
    })
  })

  it('does not rewrite a fixed question', async () => {
    const db = database()
    mocks.buildFreshRandomQuestion.mockReturnValue(null)
    await expect(rerollCheckedRandomAnswer(ANSWER_ID)).resolves.toEqual({
      success: true,
      rerolled: false,
    })
    expect(db.query.update).not.toHaveBeenCalled()
  })

  it('refuses the transition when the teacher did not enable answer keys', async () => {
    const db = database()
    mocks.getWritableStudentAnswer.mockResolvedValue(writable(false))
    await expect(rerollCheckedRandomAnswer(ANSWER_ID)).resolves.toEqual({
      error: 'งานนี้ไม่ได้เปิดให้สุ่มโจทย์ใหม่หลังดูคำตอบ',
    })
    expect(db.from).not.toHaveBeenCalled()
  })
})
