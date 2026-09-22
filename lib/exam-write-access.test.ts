import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getExamAccessSession: vi.fn(),
}))

vi.mock('@/lib/exam-access-session', () => ({
  getExamAccessSession: mocks.getExamAccessSession,
}))
vi.mock('server-only', () => ({}))

import { getWritableStudentAnswer } from '@/lib/exam-write-access'

const STUDENT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const ASSIGNMENT = '33333333-3333-4333-8333-333333333333'

function answerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    submission_id: '55555555-5555-4555-8555-555555555555',
    student_answer: '',
    work_images: [],
    carried_over: false,
    check_count: 0,
    questions: { question_type: 'written', answer_parts: [] },
    submissions: {
      id: '55555555-5555-4555-8555-555555555555',
      student_id: STUDENT,
      status: 'in_progress',
      started_at: new Date(Date.now() - 60_000).toISOString(),
      assignment_id: ASSIGNMENT,
      current_streak: 0,
      best_streak: 0,
      streak_reached: false,
      assignments: {
        id: ASSIGNMENT,
        duration_minutes: 60,
        end_at: null,
        secure_browser_mode: 'seb_required',
        android_exam_mode: 'blocked',
        type: 'exam',
        mode: 'online',
        instant_check: false,
        instant_check_answer_key: false,
        completion_rule: 'all',
        streak_target: null,
        streak_question_cap: null,
        streak_recycle_pool: false,
        require_work_image: false,
        scratchpad_enabled: false,
      },
    },
    ...overrides,
  }
}

function admin(answer: ReturnType<typeof answerRow>, extension: string | null = null) {
  return {
    from(table: string) {
      if (table === 'submission_answers') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: answer }) }),
          }),
        }
      }
      if (table === 'assignment_extensions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({
                data: extension ? { extended_end_at: extension } : null,
              }) }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    },
  }
}

describe('writable exam answer boundary', () => {
  beforeEach(() => {
    mocks.getExamAccessSession.mockReset()
    mocks.getExamAccessSession.mockResolvedValue({ mode: 'seb' })
  })

  it('rejects a different student before checking the exam session', async () => {
    const result = await getWritableStudentAnswer(admin(answerRow()) as never, 'answer', OTHER)
    expect(result).toEqual({ error: 'ไม่มีสิทธิ์' })
    expect(mocks.getExamAccessSession).not.toHaveBeenCalled()
  })

  it('rejects a submitted or timer-expired attempt', async () => {
    const submitted = answerRow({
      submissions: { ...answerRow().submissions, status: 'submitted' },
    })
    expect(await getWritableStudentAnswer(admin(submitted) as never, 'answer', STUDENT))
      .toEqual({ error: 'ส่งงานแล้ว' })

    const expired = answerRow({
      submissions: {
        ...answerRow().submissions,
        started_at: new Date(Date.now() - 120_000).toISOString(),
        assignments: { ...answerRow().submissions.assignments, duration_minutes: 1 },
      },
    })
    expect(await getWritableStudentAnswer(admin(expired) as never, 'answer', STUDENT))
      .toEqual({ error: 'หมดเวลาทำข้อสอบแล้ว' })
  })

  it('requires a current extension after the assignment deadline', async () => {
    const ended = answerRow({
      submissions: {
        ...answerRow().submissions,
        assignments: {
          ...answerRow().submissions.assignments,
          end_at: new Date(Date.now() - 60_000).toISOString(),
        },
      },
    })
    expect(await getWritableStudentAnswer(admin(ended) as never, 'answer', STUDENT))
      .toEqual({ error: 'หมดเวลาส่งแล้ว' })
    expect('error' in await getWritableStudentAnswer(
      admin(ended, new Date(Date.now() + 60_000).toISOString()) as never,
      'answer',
      STUDENT,
    )).toBe(false)
  })

  it('fails closed when an SEB-required attempt has no live access session', async () => {
    mocks.getExamAccessSession.mockResolvedValue(null)
    expect(await getWritableStudentAnswer(admin(answerRow()) as never, 'answer', STUDENT))
      .toEqual({ error: 'เซสชันเข้าสอบหมดอายุ กรุณากลับไปเปิดข้อสอบใหม่' })
    expect(mocks.getExamAccessSession).toHaveBeenCalledWith(STUDENT, ASSIGNMENT, false)
  })

  it('passes Android monitored allowance without treating a normal exam as SEB', async () => {
    const monitored = answerRow({
      submissions: {
        ...answerRow().submissions,
        assignments: { ...answerRow().submissions.assignments, android_exam_mode: 'monitored' },
      },
    })
    expect('error' in await getWritableStudentAnswer(admin(monitored) as never, 'answer', STUDENT)).toBe(false)
    expect(mocks.getExamAccessSession).toHaveBeenCalledWith(STUDENT, ASSIGNMENT, true)

    mocks.getExamAccessSession.mockClear()
    const browser = answerRow({
      submissions: {
        ...answerRow().submissions,
        assignments: { ...answerRow().submissions.assignments, secure_browser_mode: 'browser' },
      },
    })
    expect('error' in await getWritableStudentAnswer(admin(browser) as never, 'answer', STUDENT)).toBe(false)
    expect(mocks.getExamAccessSession).not.toHaveBeenCalled()
  })
})
