import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RECOVERY_INTENT_SECONDS,
  createRecoveryNonce,
  recoveryIntentRecipient,
  signRecoveryIntent,
  verifyRecoveryIntent,
} from './recovery-intent'
import { signRecoveryGrant } from './recovery-grant'

const cookie = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookie) }))
import { clearRecoveryIntent, consumeRecoveryIntent, hasRecoveryIntentNonce, issueRecoveryIntent } from './recovery-intent.server'

const secret = 'synthetic-recovery-intent-secret-at-least-32-characters'
const now = 1_700_000_000_000
const nonce = 'n'.repeat(43)
const email = 'student@example.com'

function resign(payload: Record<string, unknown>, domain = 'password-recovery-intent-v1') {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${createHmac('sha256', secret).update(`${domain}:${encoded}`).digest('hex')}`
}

describe('email recovery intent proof', () => {
  it('generates a fresh 32-byte nonce and keeps only its hash in the signed intent', () => {
    const rawNonce = createRecoveryNonce()
    expect(Buffer.from(rawNonce, 'base64url')).toHaveLength(32)
    expect(rawNonce).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(createRecoveryNonce()).not.toBe(rawNonce)
    const intent = signRecoveryIntent(secret, ' Student@Example.COM ', rawNonce, now)!
    const payload = JSON.parse(Buffer.from(intent.split('.')[0], 'base64url').toString())
    expect(payload).toMatchObject({ recipient: email, nonceHash: expect.stringMatching(/^[a-f0-9]{64}$/), issuedAt: now, expiresAt: now + 3600000 })
    expect(payload).not.toHaveProperty('nonce')
    expect(JSON.stringify(payload)).not.toContain(rawNonce)
    expect(verifyRecoveryIntent(secret, intent, rawNonce, 'STUDENT@example.com', now + 1)).toBe(true)
  })

  it('requires both the nonce delivered by email and its exact normalized recipient', () => {
    const intent = signRecoveryIntent(secret, email, nonce, now)!
    expect(recoveryIntentRecipient(secret, intent, nonce, now + 1)).toBe(email)
    expect(verifyRecoveryIntent(secret, intent, nonce, email, now + 1)).toBe(true)
    expect(verifyRecoveryIntent(secret, intent, 'x'.repeat(43), email, now + 1)).toBe(false)
    expect(verifyRecoveryIntent(secret, intent, '', email, now + 1)).toBe(false)
    expect(verifyRecoveryIntent(secret, intent, nonce, 'another@example.com', now + 1)).toBe(false)
    expect(verifyRecoveryIntent(secret, intent, nonce, '', now + 1)).toBe(false)
  })

  it('binds authenticated setup to the original user ID even if another account now has the same email', () => {
    const intent = signRecoveryIntent(secret, email, nonce, now, 'original-user')!
    expect(verifyRecoveryIntent(secret, intent, nonce, email, now + 1, 'original-user')).toBe(true)
    expect(verifyRecoveryIntent(secret, intent, nonce, email, now + 1, 'another-user')).toBe(false)
    expect(verifyRecoveryIntent(secret, intent, nonce, email, now + 1)).toBe(false)
    expect(verifyRecoveryIntent(secret, intent, nonce, 'another@example.com', now + 1, 'original-user')).toBe(false)
    const anonymous = signRecoveryIntent(secret, email, nonce, now)!
    expect(verifyRecoveryIntent(secret, anonymous, nonce, email, now + 1, 'verified-user')).toBe(true)
    expect(signRecoveryIntent(secret, email, nonce, now, '')).toBeNull()
  })

  it('expires after an hour and rejects future or overlong intents', () => {
    const intent = signRecoveryIntent(secret, email, nonce, now)!
    expect(verifyRecoveryIntent(secret, intent, nonce, email, now + RECOVERY_INTENT_SECONDS * 1000 - 1)).toBe(true)
    expect(verifyRecoveryIntent(secret, intent, nonce, email, now + RECOVERY_INTENT_SECONDS * 1000)).toBe(false)
    expect(verifyRecoveryIntent(secret, intent, nonce, email, now - 1)).toBe(false)
    const payload = JSON.parse(Buffer.from(intent.split('.')[0], 'base64url').toString())
    expect(verifyRecoveryIntent(secret, resign({ ...payload, expiresAt: now + 7200000 }), nonce, email, now)).toBe(false)
  })

  it('rejects tampering, another secret, malformed cookies and other flow signatures', () => {
    const intent = signRecoveryIntent(secret, email, nonce, now)!
    const payload = JSON.parse(Buffer.from(intent.split('.')[0], 'base64url').toString())
    for (const value of [
      '', 'x'.repeat(2049), `${intent}.extra`, intent.replace(/^./, 'z'), `${intent.split('.')[0]}.bad`,
      resign({ ...payload, recipient: 'invalid email' }), resign({ ...payload, nonceHash: 'bad' }),
      resign(payload, 'password-recovery-v1'), signRecoveryGrant(secret, email, nonce, now)!,
    ]) expect(verifyRecoveryIntent(secret, value, nonce, email, now)).toBe(false)
    expect(verifyRecoveryIntent('another-synthetic-secret-at-least-32-characters', intent, nonce, email, now)).toBe(false)
    expect(signRecoveryIntent('short', email, nonce, now)).toBeNull()
    expect(signRecoveryIntent(secret, 'invalid email', nonce, now)).toBeNull()
    expect(signRecoveryIntent(secret, email, 'short', now)).toBeNull()
  })
})

describe('server recovery intent cookie', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_FLOW_SECRET', secret)
    cookie.get.mockReturnValue(undefined)
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

  it('fails closed without a secret and does not write an intent cookie', async () => {
    vi.stubEnv('AUTH_FLOW_SECRET', '')
    expect(await issueRecoveryIntent(email)).toBeNull()
    expect(cookie.set).not.toHaveBeenCalled()
  })

  it('scopes a signed hash-only HttpOnly cookie to the callback in the requesting browser', async () => {
    const rawNonce = (await issueRecoveryIntent(email))!
    expect(cookie.set).toHaveBeenCalledWith('korkru_recovery_intent', expect.any(String), {
      httpOnly: true, secure: false, sameSite: 'lax', path: '/auth/callback', maxAge: RECOVERY_INTENT_SECONDS,
    })
    const value = cookie.set.mock.calls[0][1] as string
    expect(Buffer.from(value.split('.')[0], 'base64url').toString()).not.toContain(rawNonce)
    cookie.get.mockReturnValue({ value })
    expect(await hasRecoveryIntentNonce(rawNonce)).toBe(true)
    expect(await consumeRecoveryIntent(rawNonce, 'another@example.com', 'verified-user')).toBe(false)
    expect(cookie.set).toHaveBeenCalledTimes(1)
    expect(await consumeRecoveryIntent(rawNonce, 'STUDENT@example.com', 'verified-user')).toBe(true)
    expect(cookie.set).toHaveBeenLastCalledWith('korkru_recovery_intent', '', {
      httpOnly: true, secure: false, sameSite: 'lax', path: '/auth/callback', maxAge: 0,
    })
  })

  it('rejects another browser without the cookie and clears failed send intents at the same path', async () => {
    expect(await hasRecoveryIntentNonce(nonce)).toBe(false)
    expect(await consumeRecoveryIntent(nonce, email, 'verified-user')).toBe(false)
    await clearRecoveryIntent()
    expect(cookie.set).toHaveBeenCalledWith('korkru_recovery_intent', '', expect.objectContaining({ path: '/auth/callback', maxAge: 0 }))
  })

  it('consumes an authenticated setup intent only for its originally verified user', async () => {
    const rawNonce = (await issueRecoveryIntent(email, 'original-user'))!
    cookie.get.mockReturnValue({ value: cookie.set.mock.calls[0][1] })
    expect(await consumeRecoveryIntent(rawNonce, email, 'another-user')).toBe(false)
    expect(cookie.set).toHaveBeenCalledTimes(1)
    expect(await consumeRecoveryIntent(rawNonce, email, 'original-user')).toBe(true)
    expect(cookie.set).toHaveBeenCalledTimes(2)
  })
})
