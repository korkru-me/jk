import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

import { changeSebPasswordDraft, parseSebPasswordSettingsSummary, sebPasswordErrorMessage,
  type SebPasswordServicePorts, type SebPasswordWrite } from '@/lib/seb-password-service'
import { SebPasswordVault } from '@/lib/seb-password-vault'
import { SebPasswordError, type SebPasswordOwnerContext } from '@/lib/seb-password-policy'
import { loadSebPasswordVault, sebPasswordDraftsEnabled } from '@/lib/seb-password-config'

const teacher = '11111111-1111-4111-8111-111111111111'
const org = '22222222-2222-4222-8222-222222222222'
const assignment = '33333333-3333-4333-8333-333333333333'
const other = '44444444-4444-4444-8444-444444444444'
const password = 'Synthetic-test-password-123!'
const vault = new SebPasswordVault('test', { test: Buffer.alloc(32, 9).toString('base64') })
const context = (): SebPasswordOwnerContext => ({
  actor: { id: teacher, role: 'teacher', status: 'active' }, memberOrgIds: [org],
  assignment: { id: assignment, org_id: org, created_by: teacher, mode: 'online', type: 'exam', secure_browser_mode: 'seb_required' },
})
const saved = (revision = 1) => ({
  draft: { revision, state: 'saved', updatedAt: '2026-09-05T08:00:00Z', expiresAt: '2026-10-05T08:00:00Z' }, events: [],
})
const command = () => ({ assignmentId: assignment, expectedRevision: 0, operation: 'save', password, confirmation: password })
const ports = () => ({
  authorize: vi.fn(async () => context()), enabled: vi.fn(() => true), vault: vi.fn(() => vault),
  read: vi.fn(async (): Promise<unknown> => ({ draft: null, events: [] })),
  write: vi.fn(async (_context: SebPasswordOwnerContext, _write: SebPasswordWrite): Promise<unknown> => saved()),
}) satisfies SebPasswordServicePorts

describe('SEB password command boundary with synthetic ports (not live auth)', () => {
  it('authenticates first, writes a bound ciphertext, returns only metadata', async () => {
    const deps = ports()
    const result = await changeSebPasswordDraft(command(), deps)
    expect(deps.authorize).toHaveBeenCalledWith(assignment)
    const written = deps.write.mock.calls[0][1]
    expect(JSON.stringify(written)).not.toContain(password)
    expect(written.secret).not.toBeNull()
    expect(vault.open(written.secret, { assignmentId: assignment, orgId: org, teacherId: teacher, revisionId: written.revisionId, revision: 1 })).toBe(password)
    expect(result).toEqual(saved())
    expect(JSON.stringify(result)).not.toMatch(/password|ciphertext|keyId|applied/i)
  })
  it('never accesses storage/vault for an unauthenticated user', async () => {
    const deps = ports()
    deps.authorize.mockRejectedValue(new SebPasswordError('SEB_PASSWORD_AUTH_REQUIRED'))
    await expect(changeSebPasswordDraft(command(), deps)).rejects.toThrow('SEB_PASSWORD_AUTH_REQUIRED')
    expect(deps.read).not.toHaveBeenCalled()
    expect(deps.vault).not.toHaveBeenCalled()
    expect(deps.write).not.toHaveBeenCalled()
  })
  it.each(['student', 'suspended', 'wrong-owner', 'wrong-org', 'wrong-assignment', 'removed-membership'])('denies %s before privileged IO', async failure => {
    const deps = ports()
    const actor = context()
    if (failure === 'student') actor.actor.role = 'student'
    if (failure === 'suspended') actor.actor.status = 'suspended'
    if (failure === 'wrong-owner') actor.assignment.created_by = other
    if (failure === 'wrong-org') actor.assignment.org_id = other
    if (failure === 'wrong-assignment') actor.assignment.id = other
    deps.authorize.mockResolvedValue(failure === 'removed-membership' ? { ...actor, memberOrgIds: [] } : actor)
    await expect(changeSebPasswordDraft(command(), deps)).rejects.toThrow('SEB_PASSWORD_ACCESS_DENIED')
    expect(deps.read).not.toHaveBeenCalled()
    expect(deps.write).not.toHaveBeenCalled()
  })
  it('cannot enable the draft feature through a command field', async () => {
    const deps = ports()
    await expect(changeSebPasswordDraft({ ...command(), enabled: true }, deps)).rejects.toThrow('SEB_PASSWORD_CONTEXT_INVALID')
    deps.enabled.mockReturnValue(false)
    await expect(changeSebPasswordDraft(command(), deps)).rejects.toThrow('SEB_PASSWORD_DISABLED')
    expect(deps.write).not.toHaveBeenCalled()
  })
  it.each([null, '', {}, { ...command(), assignmentId: 'bad' }, { ...command(), expectedRevision: '0' }, { ...command(), actorId: other },
    { ...command(), expectedRevision: -1 }, { ...command(), expectedRevision: 2147483647 }, { ...command(), operation: 'apply' }])('rejects malformed commands', async input => {
    const deps = ports()
    await expect(changeSebPasswordDraft(input, deps)).rejects.toThrow('SEB_PASSWORD_CONTEXT_INVALID')
    expect(deps.write).not.toHaveBeenCalled()
  })
  it.each([' short ', 'short', 'a'.repeat(65), 'ทดสอบ12345678'])('validates password again on the server', async value => {
    const deps = ports()
    await expect(changeSebPasswordDraft({ ...command(), password: value, confirmation: value }, deps)).rejects.toThrow('SEB_PASSWORD_INVALID')
    expect(deps.read).not.toHaveBeenCalled()
  })
  it('does not trim a mismatching confirmation or touch storage', async () => {
    const deps = ports()
    await expect(changeSebPasswordDraft({ ...command(), confirmation: password + ' ' }, deps)).rejects.toThrow('SEB_PASSWORD_CONFIRMATION_MISMATCH')
    expect(deps.read).not.toHaveBeenCalled()
  })
  it('rejects stale metadata before encryption and preserves CAS errors from persistence', async () => {
    const deps = ports()
    deps.read.mockResolvedValue(saved(2))
    await expect(changeSebPasswordDraft(command(), deps)).rejects.toThrow('SEB_PASSWORD_REVISION_CONFLICT')
    expect(deps.vault).not.toHaveBeenCalled()
    deps.read.mockResolvedValue({ draft: null, events: [] })
    deps.write.mockRejectedValue(new SebPasswordError('SEB_PASSWORD_REVISION_CONFLICT'))
    await expect(changeSebPasswordDraft(command(), deps)).rejects.toThrow('SEB_PASSWORD_REVISION_CONFLICT')
    expect(deps.write).toHaveBeenCalledTimes(1) // Never retries with a fresh revision.
  })
  it('discards only the exact current draft without decrypting or requiring a vault key', async () => {
    const deps = ports()
    deps.read.mockResolvedValue(saved())
    deps.write.mockResolvedValue({ draft: { ...saved(2).draft, state: 'discarded', expiresAt: null }, events: [] })
    await changeSebPasswordDraft({ assignmentId: assignment, operation: 'discard', expectedRevision: 1 }, deps)
    expect(deps.vault).not.toHaveBeenCalled()
    expect(deps.write.mock.calls[0][1].secret).toBeNull()
    await expect(changeSebPasswordDraft({ ...command(), operation: 'discard' }, deps)).rejects.toThrow('SEB_PASSWORD_CONTEXT_INVALID')
  })
  it.each([{}, { draft: null, events: [] }, saved(2), { ...saved(), draft: { ...saved().draft, state: 'applied' } }])('does not announce success for an invalid acknowledgement', async response => {
    const deps = ports()
    deps.write.mockResolvedValue(response)
    await expect(changeSebPasswordDraft(command(), deps)).rejects.toThrow('SEB_PASSWORD_STORAGE_UNAVAILABLE')
  })
})

describe('safe DTOs and redacted errors', () => {
  it('strips secret fields at every nesting level', () => {
    const value = parseSebPasswordSettingsSummary({ ...saved(), password,
      draft: { ...saved().draft, secret: { ciphertext: 'private' } },
      events: [{ revision: 1, action: 'saved', createdAt: '2026-09-05T08:00:00Z', password }],
    })
    expect(JSON.stringify(value)).not.toMatch(/password|ciphertext|private|secret/)
  })
  it.each([null, {}, { ...saved(), events: Array(11).fill({}) }, { ...saved(), draft: { ...saved().draft, expiresAt: null } },
    { ...saved(), draft: { ...saved().draft, expiresAt: '2026-01-01T00:00:00Z' } }])('fails closed on malformed storage summaries', input => {
    expect(() => parseSebPasswordSettingsSummary(input)).toThrow('SEB_PASSWORD_STORAGE_UNAVAILABLE')
  })
  it('never reflects database, crypto, or network error content', () => {
    const result = sebPasswordErrorMessage(new Error(password))
    expect(JSON.stringify(result)).not.toContain(password)
    expect(result.reloadRequired).toBe(true)
  })
})

describe('explicit deployment keyring configuration', () => {
  it('defaults disabled and accepts only an explicit true string', () => {
    for (const value of [undefined, '1', 'TRUE', ' true ', 'false']) {
      expect(sebPasswordDraftsEnabled({ SEB_PASSWORD_DRAFTS_ENABLED: value })).toBe(false)
    }
    expect(sebPasswordDraftsEnabled({ SEB_PASSWORD_DRAFTS_ENABLED: 'true' })).toBe(true)
  })
  it('loads a dedicated bounded keyring', () => {
    expect(loadSebPasswordVault({ SEB_PASSWORD_ACTIVE_KEY_ID: 'test', SEB_PASSWORD_KEYRING: JSON.stringify({ test: Buffer.alloc(32, 7).toString('base64') }) })).toBeInstanceOf(SebPasswordVault)
  })
  it.each([{}, { SEB_SESSION_SECRET: password }, { SEB_PASSWORD_KEYRING: 'not-json' },
    { SEB_PASSWORD_ACTIVE_KEY_ID: 'test', SEB_PASSWORD_KEYRING: '[]' },
    { SEB_PASSWORD_ACTIVE_KEY_ID: 'test', SEB_PASSWORD_KEYRING: JSON.stringify({ test: password }) },
    { SEB_PASSWORD_ACTIVE_KEY_ID: 'test', SEB_PASSWORD_KEYRING: ' '.repeat(1025) },
  ])('rejects missing/broken configuration without exposing input', env => {
    expect(() => loadSebPasswordVault(env)).toThrow('SEB_PASSWORD_KEYRING_INVALID')
  })
})
