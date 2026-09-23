import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { SebQuitPasswordError } from '@/lib/seb-quit-password-core.server'
import { persistSebQuitPasswordRevision } from '@/lib/seb-quit-password-persistence.server'

const ORG_ID = '10000000-0000-4000-8000-000000000001'
const OWNER_ID = '20000000-0000-4000-8000-000000000002'
const ASSIGNMENT_ID = '30000000-0000-4000-8000-000000000003'
const HASH = 'a'.repeat(64)
const CREATED_AT = '2026-09-23T08:15:30.000Z'

function prepared(override: Record<string, unknown> = {}) {
  return {
    orgId: ORG_ID,
    ownerId: OWNER_ID,
    assignmentId: ASSIGNMENT_ID,
    revision: 2,
    hashedQuitPassword: HASH,
    ...override,
  }
}

function successfulRow(override: Record<string, unknown> = {}) {
  return {
    assignment_id: ASSIGNMENT_ID,
    org_id: ORG_ID,
    owner_id: OWNER_ID,
    revision: 2,
    created_at: CREATED_AT,
    ...override,
  }
}

function expectCode(run: Promise<unknown>, code: string) {
  return expect(run).rejects.toMatchObject({
    name: 'SebQuitPasswordError',
    code,
    message: code,
  })
}

describe('SEB quit-password revision persistence', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    mocks.createAdminClient.mockReset().mockReturnValue({ rpc: mocks.rpc })
  })

  it('calls only the service RPC and returns frozen non-secret metadata', async () => {
    mocks.rpc.mockResolvedValue({ data: [successfulRow()], error: null })

    const result = await persistSebQuitPasswordRevision(prepared())

    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('create_assignment_seb_quit_password_revision', {
      p_assignment_id: ASSIGNMENT_ID,
      p_actor_id: OWNER_ID,
      p_expected_revision: 1,
      p_hashed_quit_password: HASH,
    })
    expect(result).toEqual({
      assignmentId: ASSIGNMENT_ID,
      orgId: ORG_ID,
      ownerId: OWNER_ID,
      revision: 2,
      createdAt: CREATED_AT,
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(JSON.stringify(result)).not.toContain(HASH)
  })

  it.each([
    ['22023', 'SEB_QUIT_PASSWORD_INVALID_CONTEXT'],
    ['42501', 'SEB_QUIT_PASSWORD_ACCESS_DENIED'],
    ['55000', 'SEB_QUIT_PASSWORD_NOT_ELIGIBLE'],
    ['55006', 'SEB_QUIT_PASSWORD_ACTIVE_ATTEMPT'],
    ['40001', 'SEB_QUIT_PASSWORD_REVISION_CONFLICT'],
    ['23505', 'SEB_QUIT_PASSWORD_REVISION_CONFLICT'],
    ['22003', 'SEB_QUIT_PASSWORD_REVISION_EXHAUSTED'],
  ])('maps SQLSTATE %s to the fixed safe domain error %s', async (sqlState, code) => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: sqlState, message: `database detail ${HASH}` },
    })

    await expectCode(persistSebQuitPasswordRevision(prepared()), code)
  })

  it('replaces unknown returned and thrown failures without reflecting details', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0001', message: `database detail ${HASH}` },
    })
    await expect(persistSebQuitPasswordRevision(prepared())).rejects.toEqual(
      new Error('SEB_QUIT_PASSWORD_PERSISTENCE_FAILED'),
    )

    mocks.rpc.mockRejectedValueOnce(new Error(`transport detail ${HASH}`))
    await expect(persistSebQuitPasswordRevision(prepared())).rejects.toEqual(
      new Error('SEB_QUIT_PASSWORD_PERSISTENCE_FAILED'),
    )
  })

  it.each([
    [{ ...prepared(), extra: true }],
    [prepared({ revision: 0 })],
    [prepared({ assignmentId: 'not-a-uuid' })],
    [prepared({ hashedQuitPassword: 'A'.repeat(64) })],
  ])('rejects malformed prepared data before creating an admin client', async input => {
    await expectCode(
      persistSebQuitPasswordRevision(input),
      'SEB_QUIT_PASSWORD_INVALID_CONTEXT',
    )
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it.each([
    [null],
    [[]],
    [[successfulRow(), successfulRow()]],
    [[successfulRow({ assignment_id: OWNER_ID })]],
    [[successfulRow({ revision: 3 })]],
    [[successfulRow({ created_at: 'not-a-timestamp' })]],
    [[successfulRow({ hashed_quit_password: HASH })]],
  ])('fails closed when the RPC response is malformed or mismatched', async data => {
    mocks.rpc.mockResolvedValue({ data, error: null })
    await expect(persistSebQuitPasswordRevision(prepared())).rejects.toEqual(
      new Error('SEB_QUIT_PASSWORD_PERSISTENCE_FAILED'),
    )
  })

  it('never logs or attaches a database error as the thrown cause', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const secretError = new Error(`transport detail ${HASH}`)
    mocks.rpc.mockRejectedValue(secretError)

    try {
      await persistSebQuitPasswordRevision(prepared())
      throw new Error('expected persistence failure')
    } catch (error) {
      expect(error).not.toBe(secretError)
      expect(error).not.toBeInstanceOf(SebQuitPasswordError)
      expect(String(error)).not.toContain(HASH)
      expect((error as Error & { cause?: unknown }).cause).toBeUndefined()
    }
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
