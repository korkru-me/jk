import { createDecipheriv, webcrypto } from 'node:crypto'
import { inspect } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

import { SebPasswordError, type SebPasswordBinding, type SebPasswordOwnerContext } from '@/lib/seb-password-policy'
import { prepareSebPasswordDraft, SebPasswordVault, sebPasswordDraftSummary } from '@/lib/seb-password-vault'

// Synthetic secrets only. Never use these keys/passwords outside tests.
const KEY_A = Buffer.alloc(32, 0x11).toString('base64')
const KEY_B = Buffer.alloc(32, 0x22).toString('base64')
const PASSWORD_A = 'Lab-teacher-A-Password!'
const PASSWORD_B = 'Lab-teacher-B-Password!'
const ID = (digit: string) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`
const binding = (): SebPasswordBinding => ({ orgId: ID('1'), teacherId: ID('2'), assignmentId: ID('3'), revisionId: ID('4'), revision: 1 })
const owner = (): SebPasswordOwnerContext => ({
  actor: { id: ID('2'), role: 'teacher', status: 'active' }, memberOrgIds: [ID('1')],
  assignment: { id: ID('3'), org_id: ID('1'), created_by: ID('2'), mode: 'online', type: 'exam', secure_browser_mode: 'seb_required' },
})
const vault = () => new SebPasswordVault('key-a', { 'key-a': KEY_A })
const altered = (value: string) => { const bytes = Buffer.from(value, 'base64'); bytes[0] ^= 1; return bytes.toString('base64') }

describe('context-bound authenticated encryption', () => {
  it('round-trips the exact password without plaintext in the envelope or vault inspection', () => {
    const instance = vault()
    const envelope = instance.seal(PASSWORD_A, binding())
    expect(instance.open(envelope, binding())).toBe(PASSWORD_A)
    expect(JSON.stringify(envelope)).not.toContain(PASSWORD_A)
    expect(inspect(instance, { showHidden: true })).not.toContain(KEY_A)
    expect(JSON.stringify(instance)).toBe('{}')
    expect(Object.isFrozen(envelope)).toBe(true)
  })
  it('uses a fresh 96-bit IV for every seal, including the same password/context', () => {
    const instance = vault()
    const envelopes = Array.from({ length: 100 }, () => instance.seal(PASSWORD_A, binding()))
    expect(new Set(envelopes.map(e => e.iv)).size).toBe(100)
    expect(envelopes.every(e => Buffer.from(e.iv, 'base64').length === 12 && Buffer.from(e.tag, 'base64').length === 16)).toBe(true)
  })
  it('decrypts with the independently expressed WebCrypto AES-GCM contract', async () => {
    const scope = binding()
    const envelope = vault().seal(PASSWORD_A, scope)
    const aad = new TextEncoder().encode(JSON.stringify([
      'korkru:seb-quit-password', 1, 'AES-256-GCM', 'key-a',
      ID('1'), ID('2'), ID('3'), ID('4'), 1,
    ]))
    const key = await webcrypto.subtle.importKey('raw', Buffer.from(KEY_A, 'base64'), 'AES-GCM', false, ['decrypt'])
    const decrypted = await webcrypto.subtle.decrypt({
      name: 'AES-GCM', iv: Buffer.from(envelope.iv, 'base64'), additionalData: aad, tagLength: 128,
    }, key, Buffer.concat([Buffer.from(envelope.ciphertext, 'base64'), Buffer.from(envelope.tag, 'base64')]))
    expect(new TextDecoder().decode(decrypted)).toBe(PASSWORD_A)
  })
  it.each(['orgId', 'teacherId', 'assignmentId', 'revisionId', 'revision'] as const)('rejects moving a secret to another %s', field => {
    const instance = vault()
    const envelope = instance.seal(PASSWORD_A, binding())
    const target = { ...binding(), [field]: field === 'revision' ? 2 : ID('5') }
    expect(() => instance.open(envelope, target)).toThrow('SEB_PASSWORD_SECRET_UNAVAILABLE')
  })
  it.each(['iv', 'tag', 'ciphertext'] as const)('rejects modified %s', field => {
    const instance = vault()
    const envelope = instance.seal(PASSWORD_A, binding())
    expect(() => instance.open({ ...envelope, [field]: altered(envelope[field]) }, binding())).toThrow('SEB_PASSWORD_SECRET_UNAVAILABLE')
  })
  it.each([
    { version: 2 }, { algorithm: 'AES-256-CBC' }, { keyId: 'unknown' }, { iv: '' },
    { tag: Buffer.alloc(12).toString('base64') }, { ciphertext: 'x'.repeat(10000) }, { ciphertext: '****' },
  ])('rejects unknown format/keys and unbounded fields', override => {
    const instance = vault()
    expect(() => instance.open({ ...instance.seal(PASSWORD_A, binding()), ...override }, binding())).toThrow('SEB_PASSWORD_SECRET_UNAVAILABLE')
  })
  it('rejects truncation, appended bytes and noncanonical base64', () => {
    const instance = vault()
    const envelope = instance.seal(PASSWORD_A, binding())
    for (const ciphertext of [
      Buffer.from(envelope.ciphertext, 'base64').subarray(0, 12).toString('base64'),
      Buffer.concat([Buffer.from(envelope.ciphertext, 'base64'), Buffer.from('x')]).toString('base64'),
      `${envelope.ciphertext}\n`,
    ]) expect(() => instance.open({ ...envelope, ciphertext }, binding())).toThrow('SEB_PASSWORD_SECRET_UNAVAILABLE')
  })
  it('does not expose plaintext on authentication failure even though update() can produce it', () => {
    const instance = vault()
    const envelope = instance.seal(PASSWORD_A, binding())
    const error = (() => {
      try { instance.open({ ...envelope, tag: altered(envelope.tag) }, binding()) } catch (value) { return value }
    })()
    expect(error).toBeInstanceOf(SebPasswordError)
    expect(String(error)).not.toContain(PASSWORD_A)
    expect(error).not.toHaveProperty('cause')
  })
  it('authenticates key ID even if an alias has the same key material', () => {
    const instance = new SebPasswordVault('key-a', { 'key-a': KEY_A, alias: KEY_A })
    const envelope = instance.seal(PASSWORD_A, binding())
    expect(() => instance.open({ ...envelope, keyId: 'alias' }, binding())).toThrow('SEB_PASSWORD_SECRET_UNAVAILABLE')
  })
  it('does not allow a legacy unauthenticated decryption path', () => {
    const envelope = vault().seal(PASSWORD_A, binding())
    const cipher = createDecipheriv('aes-256-gcm', Buffer.from(KEY_A, 'base64'), Buffer.from(envelope.iv, 'base64'))
    cipher.update(Buffer.from(envelope.ciphertext, 'base64'))
    expect(() => cipher.final()).toThrow()
  })
})

describe('dedicated key rotation and safe draft status', () => {
  it('writes with the active key, retains old decryptability only while the old key is available', () => {
    const oldEnvelope = vault().seal(PASSWORD_A, binding())
    const rotated = new SebPasswordVault('key-b', { 'key-a': KEY_A, 'key-b': KEY_B })
    expect(rotated.open(oldEnvelope, binding())).toBe(PASSWORD_A)
    expect(rotated.seal(PASSWORD_B, binding()).keyId).toBe('key-b')
    const retired = new SebPasswordVault('key-b', { 'key-b': KEY_B })
    expect(() => retired.open(oldEnvelope, binding())).toThrow('SEB_PASSWORD_SECRET_UNAVAILABLE')
  })
  const invalidKeyrings: Array<Record<string, string>> = [
    {}, { 'key-a': 'not-a-key' }, { 'key-a': Buffer.alloc(16).toString('base64') },
    { 'key-a': `${KEY_A}\n` }, { other: KEY_A }, { 'key-a': KEY_A, 'bad key': KEY_B },
  ]
  it.each(invalidKeyrings)('rejects invalid keyrings with no fallback to any environment key', keys => {
    expect(() => new SebPasswordVault('key-a', keys)).toThrow('SEB_PASSWORD_KEYRING_INVALID')
  })
  it('creates revision 2 without changing revision 1 or claiming live sessions changed', () => {
    const instance = vault()
    const first = prepareSebPasswordDraft(owner(), PASSWORD_A, 0, 0, instance)
    const savedFirst = JSON.stringify(first)
    const second = prepareSebPasswordDraft(owner(), PASSWORD_B, 1, 1, instance)
    expect(JSON.stringify(first)).toBe(savedFirst)
    expect(instance.open(first.secret, first.binding)).toBe(PASSWORD_A)
    expect(instance.open(second.secret, second.binding)).toBe(PASSWORD_B)
    expect(second.binding.revisionId).not.toBe(first.binding.revisionId)
    expect(() => instance.open(first.secret, second.binding)).toThrow('SEB_PASSWORD_SECRET_UNAVAILABLE')
    expect(sebPasswordDraftSummary(second)).toEqual({
      revision: 2, status: 'draft', appliedToSeb: false,
      existingSessionsUpdated: false, requiresNewConfigFile: true,
    })
    expect(Object.isFrozen(first)).toBe(true)
    expect(JSON.stringify(sebPasswordDraftSummary(first))).not.toContain('ciphertext')
  })
  it('checks owner and version conflict before calling the vault', () => {
    const instance = vault()
    const seal = vi.spyOn(instance, 'seal')
    const context = owner()
    context.assignment.created_by = ID('5')
    expect(() => prepareSebPasswordDraft(context, PASSWORD_A, 0, 0, instance)).toThrow('SEB_PASSWORD_ACCESS_DENIED')
    expect(() => prepareSebPasswordDraft(owner(), PASSWORD_A, 2, 1, instance)).toThrow('SEB_PASSWORD_REVISION_CONFLICT')
    expect(seal).not.toHaveBeenCalled()
  })
  it('assigns separate revision identities to concurrently planned drafts, without claiming to serialize DB writes', () => {
    const instance = vault()
    const one = prepareSebPasswordDraft(owner(), PASSWORD_A, 0, 0, instance)
    const two = prepareSebPasswordDraft(owner(), PASSWORD_B, 0, 0, instance)
    expect(one.binding.revision).toBe(two.binding.revision)
    expect(one.binding.revisionId).not.toBe(two.binding.revisionId)
    expect(() => instance.open(one.secret, two.binding)).toThrow('SEB_PASSWORD_SECRET_UNAVAILABLE')
    // A future repository still MUST atomically persist only one expected-revision write.
  })
})
