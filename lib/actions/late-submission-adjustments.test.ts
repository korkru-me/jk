import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  canManageAssignment: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/auth/server', () => ({ getAuthUser: mocks.getAuthUser }))
vi.mock('@/lib/auth/assignment-access', () => ({ canManageAssignment: mocks.canManageAssignment }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { applyLateColorScoreAdjustment } from './late-submission-adjustments'

const ASSIGNMENT_ID = '10000000-0000-4000-8000-000000000001'
const USER_ID = '20000000-0000-4000-8000-000000000001'
const DUE = '2026-10-08T09:00:00.000Z'
const END = '2026-10-11T09:00:00.000Z'

function queryResult(result: { data: unknown; error?: unknown }, single = false) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  }
  return single ? { ...chain, maybeSingle: () => Promise.resolve(result) } : chain
}

describe('applyLateColorScoreAdjustment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAuthUser.mockResolvedValue({ id: USER_ID })
    mocks.canManageAssignment.mockResolvedValue(true)
  })

  it('fails closed before using the service role', async () => {
    mocks.getAuthUser.mockResolvedValue(null)
    await expect(applyLateColorScoreAdjustment({
      assignmentId: ASSIGNMENT_ID, color: 'amber', adjustment: -2,
    })).resolves.toEqual({ error: 'ไม่ได้เข้าสู่ระบบ' })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()

    mocks.getAuthUser.mockResolvedValue({ id: USER_ID })
    mocks.canManageAssignment.mockResolvedValue(false)
    await expect(applyLateColorScoreAdjustment({
      assignmentId: ASSIGNMENT_ID, color: 'amber', adjustment: -2,
    })).resolves.toEqual({ error: 'ไม่มีสิทธิ์ปรับคะแนนงานนี้' })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('derives every same-colour student on the server and sends one atomic RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'batch-id', error: null })
    const assignment = {
      id: ASSIGNMENT_ID,
      org_id: '30000000-0000-4000-8000-000000000001',
      due_at: DUE,
      end_at: END,
      completion_rule: 'fixed',
      late_bands: [
        { id: '40000000-0000-4000-8000-000000000001', starts_at: DUE, label: 'ช่วงแรก', color: 'amber' },
        { id: '40000000-0000-4000-8000-000000000002', starts_at: '2026-10-09T09:00:00.000Z', label: 'ช่วงสอง', color: 'amber' },
      ],
    }
    const submissions = [
      { student_id: '50000000-0000-4000-8000-000000000001', status: 'submitted', submitted_at: '2026-10-08T10:00:00.000Z' },
      { student_id: '50000000-0000-4000-8000-000000000002', status: 'graded', submitted_at: '2026-10-10T10:00:00.000Z' },
      { student_id: '50000000-0000-4000-8000-000000000003', status: 'graded', submitted_at: '2026-10-08T08:00:00.000Z' },
    ]
    const admin = {
      from: vi.fn((table: string) => {
        if (table === 'assignments') return queryResult({ data: assignment }, true)
        if (table === 'submissions') return queryResult({ data: submissions })
        if (table === 'assignment_extensions') return queryResult({ data: [] })
        throw new Error(`unexpected table ${table}`)
      }),
      rpc,
    }
    mocks.createAdminClient.mockReturnValue(admin)

    await expect(applyLateColorScoreAdjustment({
      assignmentId: ASSIGNMENT_ID,
      color: 'amber',
      adjustment: -2,
      reason: '  ส่งช้า  ',
    })).resolves.toMatchObject({ success: true, affectedCount: 2 })

    expect(rpc).toHaveBeenCalledWith('apply_assignment_score_adjustment', expect.objectContaining({
      p_assignment_id: ASSIGNMENT_ID,
      p_student_ids: [
        '50000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000002',
      ],
      p_adjustment: -2,
      p_reason: 'ส่งช้า',
      p_changed_by: USER_ID,
    }))
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/assignments/${ASSIGNMENT_ID}/results`)
  })
})
