import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  persistSebQuitPasswordRevision: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/seb-quit-password-persistence.server', () => ({
  persistSebQuitPasswordRevision: mocks.persistSebQuitPasswordRevision,
}))

import {
  createSebQuitPasswordRevisionForOwner,
  hasSebQuitPasswordRevision,
  readSebQuitPasswordSetupState,
} from '@/lib/seb-quit-password-service.server'

const ORG_ID = '10000000-0000-4000-8000-000000000001'
const OWNER_ID = '20000000-0000-4000-8000-000000000002'
const OTHER_ID = '20000000-0000-4000-8000-000000000003'
const ASSIGNMENT_ID = '30000000-0000-4000-8000-000000000003'
const PASSWORD = 'Teacher-Exit-Only#2026'
const CREATED_AT = '2026-09-23T08:15:30.000Z'

type Result = { data: unknown; error: unknown }

function adminWith(overrides: Partial<Record<string, Result>> = {}) {
  const results: Record<string, Result> = {
    assignments: {
      data: {
        id: ASSIGNMENT_ID,
        org_id: ORG_ID,
        created_by: OWNER_ID,
        mode: 'online',
        type: 'exam',
        status: 'draft',
        secure_browser_mode: 'seb_required',
      },
      error: null,
    },
    users: { data: { id: OWNER_ID, role: 'teacher', status: 'active' }, error: null },
    organization_members: { data: { org_id: ORG_ID }, error: null },
    assignment_seb_config_revisions: { data: { revision: 1, created_at: CREATED_AT }, error: null },
    submissions: { data: null, error: null },
    ...overrides,
  }

  return {
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => results[table]),
      }
      return builder
    }),
  }
}

describe('SEB quit-password owner service', () => {
  beforeEach(() => {
    mocks.createAdminClient.mockReset().mockReturnValue(adminWith())
    mocks.persistSebQuitPasswordRevision.mockReset().mockImplementation(async prepared => ({
      assignmentId: prepared.assignmentId,
      orgId: prepared.orgId,
      ownerId: prepared.ownerId,
      revision: prepared.revision,
      createdAt: CREATED_AT,
    }))
  })

  it('returns only display-safe owner metadata', async () => {
    await expect(readSebQuitPasswordSetupState(ASSIGNMENT_ID, OWNER_ID)).resolves.toEqual({
      currentRevision: 1,
      configuredAt: CREATED_AT,
      canManage: true,
      blockedReason: null,
    })
  })

  it('fails the publication gate closed when no revision can be proven', async () => {
    await expect(hasSebQuitPasswordRevision(ASSIGNMENT_ID)).resolves.toBe(true)

    mocks.createAdminClient.mockReturnValue(adminWith({
      assignment_seb_config_revisions: { data: null, error: null },
    }))
    await expect(hasSebQuitPasswordRevision(ASSIGNMENT_ID)).resolves.toBe(false)

    mocks.createAdminClient.mockClear()
    await expect(hasSebQuitPasswordRevision('not-an-id')).resolves.toBe(false)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('hides revision metadata from a non-owner', async () => {
    mocks.createAdminClient.mockReturnValue(adminWith({
      users: { data: { id: OTHER_ID, role: 'teacher', status: 'active' }, error: null },
    }))

    await expect(readSebQuitPasswordSetupState(ASSIGNMENT_ID, OTHER_ID)).resolves.toEqual({
      currentRevision: null,
      configuredAt: null,
      canManage: false,
      blockedReason: 'owner_only',
    })
  })

  it('blocks rotation while an attempt is active', async () => {
    mocks.createAdminClient.mockReturnValue(adminWith({
      submissions: { data: { id: '40000000-0000-4000-8000-000000000004' }, error: null },
    }))

    await expect(readSebQuitPasswordSetupState(ASSIGNMENT_ID, OWNER_ID)).resolves.toMatchObject({
      canManage: false,
      blockedReason: 'active_attempt',
    })
    await expect(createSebQuitPasswordRevisionForOwner({
      assignmentId: ASSIGNMENT_ID,
      expectedRevision: 1,
      password: PASSWORD,
      confirmation: PASSWORD,
    }, OWNER_ID)).rejects.toMatchObject({ code: 'SEB_QUIT_PASSWORD_ACTIVE_ATTEMPT' })
    expect(mocks.persistSebQuitPasswordRevision).not.toHaveBeenCalled()
  })

  it('hashes inside the server boundary and returns no secret-derived value', async () => {
    const result = await createSebQuitPasswordRevisionForOwner({
      assignmentId: ASSIGNMENT_ID,
      expectedRevision: 1,
      password: PASSWORD,
      confirmation: PASSWORD,
    }, OWNER_ID)

    expect(mocks.persistSebQuitPasswordRevision).toHaveBeenCalledTimes(1)
    const prepared = mocks.persistSebQuitPasswordRevision.mock.calls[0][0]
    expect(prepared).toMatchObject({
      assignmentId: ASSIGNMENT_ID,
      orgId: ORG_ID,
      ownerId: OWNER_ID,
      revision: 2,
    })
    expect(prepared.hashedQuitPassword).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(prepared)).not.toContain(PASSWORD)
    expect(JSON.stringify(result)).not.toContain(PASSWORD)
    expect(result).not.toHaveProperty('hashedQuitPassword')
  })
})
