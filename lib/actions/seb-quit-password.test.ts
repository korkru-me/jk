import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createRevision: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/seb-quit-password-service.server', () => ({
  createSebQuitPasswordRevisionForOwner: mocks.createRevision,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { SebQuitPasswordError } from '@/lib/seb-quit-password-core.server'
import { saveSebQuitPassword } from '@/lib/actions/seb-quit-password'

const OWNER_ID = '20000000-0000-4000-8000-000000000002'
const ASSIGNMENT_ID = '30000000-0000-4000-8000-000000000003'
const PASSWORD = 'Teacher-Exit-Only#2026'
const CREATED_AT = '2026-09-23T08:15:30.000Z'

describe('saveSebQuitPassword Server Action', () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset()
    mocks.createRevision.mockReset().mockResolvedValue({
      assignmentId: ASSIGNMENT_ID,
      orgId: '10000000-0000-4000-8000-000000000001',
      ownerId: OWNER_ID,
      revision: 2,
      createdAt: CREATED_AT,
    })
    mocks.createClient.mockReset().mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: OWNER_ID } } }) },
    })
  })

  it('returns revision metadata only and revalidates both teacher views', async () => {
    const command = {
      assignmentId: ASSIGNMENT_ID,
      expectedRevision: 1,
      password: PASSWORD,
      confirmation: PASSWORD,
    }
    const result = await saveSebQuitPassword(command)

    expect(mocks.createRevision).toHaveBeenCalledWith(command, OWNER_ID)
    expect(result).toEqual({ success: true, revision: 2, createdAt: CREATED_AT })
    expect(JSON.stringify(result)).not.toContain(PASSWORD)
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/assignments/${ASSIGNMENT_ID}`)
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/assignments/${ASSIGNMENT_ID}/edit`)
  })

  it('fails closed for an unauthenticated caller without invoking the service', async () => {
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    await expect(saveSebQuitPassword({})).resolves.toMatchObject({
      success: false,
      error: { code: 'SEB_QUIT_PASSWORD_ACCESS_DENIED' },
    })
    expect(mocks.createRevision).not.toHaveBeenCalled()
  })

  it('maps domain failures to a fixed safe response', async () => {
    mocks.createRevision.mockRejectedValue(new SebQuitPasswordError('SEB_QUIT_PASSWORD_REVISION_CONFLICT'))

    const result = await saveSebQuitPassword({
      assignmentId: ASSIGNMENT_ID,
      expectedRevision: 1,
      password: PASSWORD,
      confirmation: PASSWORD,
    })

    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'SEB_QUIT_PASSWORD_REVISION_CONFLICT',
        reloadRequired: true,
      },
    })
    expect(JSON.stringify(result)).not.toContain(PASSWORD)
  })
})
