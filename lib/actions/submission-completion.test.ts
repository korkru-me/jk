import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), createAdminClient: vi.fn(),
  studentHasAssignment: vi.fn(), pool: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/auth/assignment-access', () => ({ studentHasAssignment: mocks.studentHasAssignment, canManageAssignment: vi.fn() }))
vi.mock('@/lib/assignment-question-access.server', () => ({ loadAssignmentQuestionsByProvenance: mocks.pool }))

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
