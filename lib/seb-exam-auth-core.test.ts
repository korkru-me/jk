import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createSebExamContextClaims, signSebExamContextClaims } from './seb-exam-context-core'
import {
  WAITING_AUTH_HANDOFF_TTL_MS,
  WAITING_AUTH_NONCE_COOKIE,
  createWaitingAuthHandoffClaims,
  readWaitingAuthNonceCookie,
  signWaitingAuthHandoffClaims,
  verifyWaitingAuthHandoffClaims,
} from './seb-exam-auth-core'

const now = 1_800_000_000_000
const secret = 'test-only-waiting-auth-handoff-signing-secret'
const scope = {
  assignmentId: '11111111-1111-4111-8111-111111111111', revision: 7,
  releaseId: 'asr-11111111111141118111111111111111-r7-abcdef0123456789',
}
const context = createSebExamContextClaims(scope, { now, contextId: 'a'.repeat(32) })
const nonce = 'b'.repeat(32)
const claims = createWaitingAuthHandoffClaims(context, 'google', { now, nonce })
const token = signWaitingAuthHandoffClaims(claims, secret)
function signUnknown(value: unknown) {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${payload}.${createHmac('sha256', secret).update(`korkru:seb-exam:auth-handoff:v1\0${payload}`).digest('base64url')}`
}

describe('signed exam-only auth handoff', () => {
  it('binds OAuth and Magic Link handoff to pending scope without adding auth/SEB/submit authority', () => {
    expect(verifyWaitingAuthHandoffClaims(token, secret, context, nonce, now)).toEqual(claims)
    expect(claims.expiresAt).toBe(now + WAITING_AUTH_HANDOFF_TTL_MS)
    expect(claims.userId).toBeNull()
    const magic = createWaitingAuthHandoffClaims(context, 'magic_link', { now })
    expect(verifyWaitingAuthHandoffClaims(signWaitingAuthHandoffClaims(magic, secret), secret, context, magic.nonce, now)).toEqual(magic)
    expect(JSON.stringify(magic)).not.toMatch(/submitted|password|email|configKey|browserExamKey/)
  })

  it('rejects nonce mismatch, missing cookie, signature/secret/purpose substitution and expiry', () => {
    for (const badNonce of [null, 'c'.repeat(32), `${nonce}\n`, 'invalid']) {
      expect(verifyWaitingAuthHandoffClaims(token, secret, context, badNonce, now)).toBeNull()
    }
    expect(verifyWaitingAuthHandoffClaims(`${token}x`, secret, context, nonce, now)).toBeNull()
    expect(verifyWaitingAuthHandoffClaims(token, `${secret}wrong`, context, nonce, now)).toBeNull()
    expect(verifyWaitingAuthHandoffClaims(signSebExamContextClaims(context, secret), secret, context, nonce, now)).toBeNull()
    expect(verifyWaitingAuthHandoffClaims(token, secret, context, nonce, claims.expiresAt)).toBeNull()
    expect(verifyWaitingAuthHandoffClaims(token, secret, context, nonce, now - 60_001)).toBeNull()
  })

  it('requires exact context, account, assignment, registered release and revision', () => {
    for (const changed of [
      { ...context, contextId: 'c'.repeat(32) },
      { ...context, userId: '22222222-2222-4222-8222-222222222222' },
      createSebExamContextClaims({ ...scope, revision: 8, releaseId: scope.releaseId.replace('-r7-', '-r8-') }, { now }),
      { ...context, releaseId: scope.releaseId.replace('abcdef', '123456') },
    ]) expect(verifyWaitingAuthHandoffClaims(token, secret, changed, nonce, now)).toBeNull()
  })

  it.each([
    { ...claims, next: '/dashboard' }, { ...claims, role: 'teacher' },
    { ...claims, method: 'password' }, { ...claims, nonce: 'z'.repeat(32) },
    { ...claims, expiresAt: claims.expiresAt + 1 }, { ...claims, schemaVersion: 2 },
    { ...claims, userId: 'bad' }, { ...claims, kind: 'seb_exam_context' },
  ])('rejects unsupported signed shape %#', value => {
    expect(verifyWaitingAuthHandoffClaims(signUnknown(value), secret, context, nonce, now)).toBeNull()
  })

  it('caps handoff lifetime to live context and validates nonce/TTL before signing', () => {
    const short = createSebExamContextClaims(scope, { now, ttlMs: 1000 })
    expect(createWaitingAuthHandoffClaims(short, 'google', { now }).expiresAt).toBe(short.expiresAt)
    expect(() => createWaitingAuthHandoffClaims(context, 'google', { now, ttlMs: 0 })).toThrow()
    expect(() => createWaitingAuthHandoffClaims(context, 'google', { now, ttlMs: WAITING_AUTH_HANDOFF_TTL_MS + 1 })).toThrow()
    expect(() => createWaitingAuthHandoffClaims(context, 'google', { now, nonce: 'bad' })).toThrow()
    expect(() => createWaitingAuthHandoffClaims(short, 'google', { now: short.expiresAt })).toThrow()
    expect(() => signWaitingAuthHandoffClaims(claims, 'short')).toThrow()
  })
})

describe('raw waiting-auth nonce marker', () => {
  it('accepts one canonical nonce cookie among unrelated cookies', () => {
    expect(readWaitingAuthNonceCookie(`normal=old; ${WAITING_AUTH_NONCE_COOKIE}=${nonce}; unrelated=yes`)).toBe(nonce)
  })
  it.each([
    null, '', `${WAITING_AUTH_NONCE_COOKIE}=`, WAITING_AUTH_NONCE_COOKIE,
    `${WAITING_AUTH_NONCE_COOKIE}=${nonce}; ${WAITING_AUTH_NONCE_COOKIE}=${nonce}`,
    `${WAITING_AUTH_NONCE_COOKIE} =bad`, `${WAITING_AUTH_NONCE_COOKIE}=%61encoded`,
    `${WAITING_AUTH_NONCE_COOKIE}="${nonce}"`, `${WAITING_AUTH_NONCE_COOKIE}=${nonce}\n`,
  ])('fails closed for absent/malformed/duplicate nonce %j', cookie => {
    expect(readWaitingAuthNonceCookie(cookie)).toBeNull()
  })
})
