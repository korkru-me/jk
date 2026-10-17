import { createHash, createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completeGoogleAccountLink,
  createGoogleLinkChallenge,
  deriveGoogleConnection,
  GOOGLE_LINK_CHALLENGE_SECONDS,
  readGoogleLinkChallenge,
  type GoogleIdTokenVerifier,
  type GoogleLinkUser,
} from './google-account-link'
import { consumeGoogleLinkChallenge, issueGoogleLinkChallenge, clearGoogleLinkChallenge } from './google-account-link.server'

const cookieStore = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }))

const secret = 'synthetic-account-link-secret-at-least-32-characters'
const now = Date.parse('2026-10-17T12:00:00Z')
const email = 'verified@example.com'
const userId = 'current-user'
const accessToken = 'synthetic-original-access-token'
const subject = 'google-subject-123'
const audience = 'synthetic-client.apps.googleusercontent.com'
const credential = 'synthetic-google-id-token'
const user: GoogleLinkUser = { id: userId, email, email_confirmed_at: '2026-10-16T12:00:00Z', identities: [] }
const linkedUser: GoogleLinkUser = {
  ...user,
  identities: [{ provider: 'google', id: subject, user_id: userId, identity_data: { sub: subject, email, email_verified: true } }],
}

function challenge() {
  const signed = createGoogleLinkChallenge(secret, userId, email, accessToken, now)!
  return readGoogleLinkChallenge(secret, signed.value, userId, email, accessToken, now)!
}

function fixture() {
  const auth = {
    signInWithIdToken: vi.fn().mockResolvedValue({ data: { user: structuredClone(linkedUser), session: { access_token: 'temporary-session' } }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    setSession: vi.fn(),
  }
  const verifyIdToken = vi.fn<GoogleIdTokenVerifier>().mockResolvedValue({ subject, email })
  const createAuth = vi.fn(() => auth)
  const args = { user: structuredClone(user), accessToken, challenge: challenge(), credential, audience, verifyIdToken, createAuth, now }
  return { auth, verifyIdToken, createAuth, args }
}

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.clearAllMocks() })

describe('Google account-link signed challenges', () => {
  it('binds a random 32-byte nonce to exact actor, email and existing access token', () => {
    const signed = createGoogleLinkChallenge(secret, userId, '  VERIFIED@example.com ', accessToken, now)!
    const proof = readGoogleLinkChallenge(secret, signed.value, userId, email, accessToken, now)!
    expect(Buffer.from(proof.rawNonce, 'base64url')).toHaveLength(32)
    expect(proof.nonceHash).toBe(createHash('sha256').update(proof.rawNonce).digest('hex'))
    expect(signed.nonceHash).toBe(proof.nonceHash)
    expect(signed.expiresAt).toBe(now + GOOGLE_LINK_CHALLENGE_SECONDS * 1000)
    expect(signed.value).not.toContain(accessToken)
    expect(proof.tokenHash).not.toBe(accessToken)
    expect(readGoogleLinkChallenge(secret, signed.value, 'another-user', email, accessToken, now)).toBeNull()
    expect(readGoogleLinkChallenge(secret, signed.value, userId, 'another@example.com', accessToken, now)).toBeNull()
    expect(readGoogleLinkChallenge(secret, signed.value, userId, email, 'another-access-token', now)).toBeNull()
  })

  it('generates a different nonce for each password confirmation', () => {
    const first = createGoogleLinkChallenge(secret, userId, email, accessToken, now)!
    const second = createGoogleLinkChallenge(secret, userId, email, accessToken, now)!
    expect(first.nonceHash).not.toBe(second.nonceHash)
    expect(first.value).not.toBe(second.value)
  })

  it('expires strictly after five minutes and rejects a future-issued challenge', () => {
    const signed = createGoogleLinkChallenge(secret, userId, email, accessToken, now)!
    expect(readGoogleLinkChallenge(secret, signed.value, userId, email, accessToken, now + 299999)).not.toBeNull()
    expect(readGoogleLinkChallenge(secret, signed.value, userId, email, accessToken, now + 300000)).toBeNull()
    expect(readGoogleLinkChallenge(secret, signed.value, userId, email, accessToken, now - 1)).toBeNull()
  })

  it('does not treat Gmail dots, plus aliases or googlemail as the same email', () => {
    const signed = createGoogleLinkChallenge(secret, userId, 'first.last@gmail.com', accessToken, now)!
    for (const other of ['firstlast@gmail.com', 'first.last+tag@gmail.com', 'first.last@googlemail.com']) {
      expect(readGoogleLinkChallenge(secret, signed.value, userId, other, accessToken, now)).toBeNull()
    }
  })

  it('rejects tampering, another signing purpose/secret and malformed payloads without throwing', () => {
    const signed = createGoogleLinkChallenge(secret, userId, email, accessToken, now)!
    const [payload, signature] = signed.value.split('.')
    const foreignSignature = createHmac('sha256', secret).update(`password-recovery-v1:${payload}`).digest('hex')
    for (const value of ['', 'x'.repeat(4097), `${signed.value}.extra`, `${payload}.bad`, `!${payload}.${signature}`, `${payload}.${signature.toUpperCase()}`, `${payload}.${foreignSignature}`]) {
      expect(readGoogleLinkChallenge(secret, value, userId, email, accessToken, now)).toBeNull()
    }
    expect(readGoogleLinkChallenge('another-synthetic-secret-32-characters', signed.value, userId, email, accessToken, now)).toBeNull()
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    for (const update of [
      { expiresAt: now + 300001 }, { issuedAt: now + 1 }, { rawNonce: 'small' },
      { rawNonce: 3 }, { issuedAt: null }, { expiresAt: null }, { tokenHash: 'bad' },
      { email: 'another@example.com' }, { userId: null },
    ]) {
      const changed = Buffer.from(JSON.stringify({ ...data, ...update })).toString('base64url')
      const hmac = createHmac('sha256', secret).update(`google-account-link-v1:${changed}`).digest('hex')
      expect(readGoogleLinkChallenge(secret, `${changed}.${hmac}`, userId, email, accessToken, now)).toBeNull()
    }
  })

  it.each([
    ['short', userId, email, accessToken, now], [secret, '', email, accessToken, now],
    [secret, userId, 'not-email', accessToken, now], [secret, userId, email, '', now],
    [secret, userId, email, accessToken, Number.NaN], [secret, userId, email, accessToken, -1],
  ] as const)('fails closed with an invalid signing context', (key, id, address, token, time) => {
    expect(createGoogleLinkChallenge(key, id, address, token, time)).toBeNull()
  })
})

describe('Google connection status derived from verified identities', () => {
  it('reports linked only from an actual Google identity, never provider metadata hints', () => {
    expect(deriveGoogleConnection(user)).toEqual({ state: 'unlinked', email: null })
    expect(deriveGoogleConnection({ ...user, identities: undefined })).toEqual({ state: 'unknown', email: null })
    expect(deriveGoogleConnection(linkedUser)).toEqual({ state: 'linked', email })
    const hinted = { ...user, user_metadata: { provider: 'google' }, app_metadata: { providers: ['google'] } }
    expect(deriveGoogleConnection(hinted)).toEqual({ state: 'unlinked', email: null })
  })

  it('normalizes case/whitespace without adding password capability claims', () => {
    const status = deriveGoogleConnection({ ...linkedUser, email: ' VERIFIED@example.com ' })
    expect(status).toEqual({ state: 'linked', email })
    expect(status).not.toHaveProperty('hasPassword')
    expect(status).not.toHaveProperty('password')
  })

  it('marks another email or actor conflict and missing identity email unknown', () => {
    expect(deriveGoogleConnection({ ...linkedUser, email: 'other@example.com' }).state).toBe('conflict')
    expect(deriveGoogleConnection({ ...linkedUser, identities: [{ provider: 'google', user_id: 'other-user', identity_data: { email } }] }).state).toBe('conflict')
    expect(deriveGoogleConnection({ ...linkedUser, identities: [{ provider: 'google', identity_data: {} }] }).state).toBe('unknown')
    expect(deriveGoogleConnection({ ...linkedUser, identities: [...linkedUser.identities!, { provider: 'google', identity_data: { email: 'another@example.com' } }] }).state).toBe('conflict')
  })
})

describe('same-email Google linking orchestration', () => {
  it('checks Google claims before creating an isolated client and revokes only the temporary session', async () => {
    const f = fixture()
    expect(await completeGoogleAccountLink(f.args)).toEqual({ success: true, temporarySessionRevoked: true })
    expect(f.verifyIdToken).toHaveBeenCalledWith(credential, { audience, nonceHash: f.args.challenge.nonceHash, email })
    expect(f.verifyIdToken.mock.invocationCallOrder[0]).toBeLessThan(f.createAuth.mock.invocationCallOrder[0])
    expect(f.auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: credential, nonce: f.args.challenge.rawNonce })
    expect(f.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
    expect(f.auth.setSession).not.toHaveBeenCalled()
  })

  it.each([null, { subject, email: 'other@example.com' }, { subject: '', email }])('rejects a wrong/unverified Google credential before any Supabase call', async (verified) => {
    const f = fixture()
    f.verifyIdToken.mockResolvedValue(verified)
    expect(await completeGoogleAccountLink(f.args)).toHaveProperty('error')
    expect(f.createAuth).not.toHaveBeenCalled()
    expect(f.auth.signInWithIdToken).not.toHaveBeenCalled()
    expect(f.auth.signOut).not.toHaveBeenCalled()
  })

  it('rejects an unavailable verifier without leaking token/error details or calling Auth', async () => {
    const f = fixture()
    f.verifyIdToken.mockRejectedValue(new Error(`private-key-fetch-detail ${credential}`))
    const result = await completeGoogleAccountLink(f.args)
    expect(result).toHaveProperty('error')
    expect(JSON.stringify(result)).not.toContain(credential)
    expect(JSON.stringify(result)).not.toContain('private-key-fetch-detail')
    expect(f.createAuth).not.toHaveBeenCalled()
  })

  it.each([
    { challenge: null }, { accessToken: 'changed-original-session' }, { user: { ...user, id: 'other-user' } },
    { user: { ...user, email: 'other@example.com' } }, { now: now + 300000 }, { now: now - 1 },
  ])('rejects expired/changed binding before verifying Google', async (changed) => {
    const f = fixture()
    expect(await completeGoogleAccountLink({ ...f.args, ...changed })).toHaveProperty('error')
    expect(f.verifyIdToken).not.toHaveBeenCalled()
    expect(f.createAuth).not.toHaveBeenCalled()
  })

  it.each([
    { ...user, email_confirmed_at: null }, { ...user, email_confirmed_at: 'invalid' },
    { ...user, email: null }, { ...user, is_anonymous: true },
  ])('requires a currently verified nonanonymous account email', async (current) => {
    const f = fixture()
    expect(await completeGoogleAccountLink({ ...f.args, user: current })).toHaveProperty('error')
    expect(f.verifyIdToken).not.toHaveBeenCalled()
    expect(f.createAuth).not.toHaveBeenCalled()
  })

  it.each([{ credential: '' }, { credential: 'x'.repeat(16385) }, { audience: '' }])('rejects malformed credentials/configuration before Auth', async (changed) => {
    const f = fixture()
    expect(await completeGoogleAccountLink({ ...f.args, ...changed })).toHaveProperty('error')
    expect(f.createAuth).not.toHaveBeenCalled()
  })

  it.each([
    { ...linkedUser, id: 'different-user' }, { ...linkedUser, email: 'different@example.com' },
    { ...linkedUser, identities: [] },
    { ...linkedUser, identities: [{ provider: 'google', user_id: userId, identity_data: { sub: 'another-sub', email, email_verified: true } }] },
    { ...linkedUser, identities: [{ provider: 'google', user_id: 'different-user', identity_data: { sub: subject, email, email_verified: true } }] },
    { ...linkedUser, identities: [{ provider: 'google', user_id: userId, identity_data: { sub: subject, email: 'different@example.com', email_verified: true } }] },
    { ...linkedUser, identities: [{ provider: 'google', user_id: userId, identity_data: { sub: subject, email, email_verified: false } }] },
    { ...linkedUser, identities: [...linkedUser.identities!, { provider: 'google', user_id: userId, identity_data: { sub: 'other-sub', email: 'other@example.com', email_verified: true } }] },
  ])('never accepts a wrong returned user/email/Google identity and still cleans up its session', async (returned) => {
    const f = fixture()
    f.auth.signInWithIdToken.mockResolvedValue({ data: { user: returned, session: {} }, error: null })
    expect(await completeGoogleAccountLink(f.args)).toHaveProperty('error')
    expect(f.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
    expect(f.auth.setSession).not.toHaveBeenCalled()
  })

  it('rejects an absent temporary session and does not expose a provider error', async () => {
    const f = fixture()
    f.auth.signInWithIdToken.mockResolvedValue({ data: { user: linkedUser, session: null }, error: { message: 'provider-private' } })
    const result = await completeGoogleAccountLink(f.args)
    expect(result).toHaveProperty('error')
    expect(JSON.stringify(result)).not.toContain('provider-private')
    expect(f.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
  })

  it('tries temporary cleanup after a lost response and returns only a bounded error', async () => {
    const f = fixture()
    f.auth.signInWithIdToken.mockRejectedValue(new Error('private-transport-detail'))
    expect(await completeGoogleAccountLink(f.args)).toEqual({ error: expect.not.stringContaining('private-transport-detail') })
    expect(f.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
  })

  it.each(['response', 'throw'])('reports already-completed linking honestly when temporary revocation fails (%s)', async (mode) => {
    const f = fixture()
    if (mode === 'response') f.auth.signOut.mockResolvedValue({ error: { status: 503 } })
    else f.auth.signOut.mockRejectedValue(new Error('cleanup-private-detail'))
    expect(await completeGoogleAccountLink(f.args)).toEqual({ success: true, temporarySessionRevoked: false, warning: expect.any(String) })
    expect(f.auth.signInWithIdToken).toHaveBeenCalledOnce()
    expect(f.auth.setSession).not.toHaveBeenCalled()
  })

  it('does not turn a mismatched identity into success even when cleanup also fails', async () => {
    const f = fixture()
    f.auth.signInWithIdToken.mockResolvedValue({ data: { user: { ...linkedUser, id: 'different-user' }, session: {} }, error: null })
    f.auth.signOut.mockRejectedValue(new Error('private-cleanup-detail'))
    expect(await completeGoogleAccountLink(f.args)).toHaveProperty('error')
  })
})

describe('HttpOnly Google-link challenge browser flow', () => {
  beforeEach(() => { vi.stubEnv('AUTH_FLOW_SECRET', secret); vi.useFakeTimers(); vi.setSystemTime(now) })

  it('returns only the hashed nonce and writes a short-lived protected cookie', async () => {
    const publicChallenge = await issueGoogleLinkChallenge(userId, email, accessToken)
    expect(publicChallenge).toEqual({ nonceHash: expect.stringMatching(/^[a-f0-9]{64}$/), expiresAt: now + 300000 })
    expect(publicChallenge).not.toHaveProperty('rawNonce')
    expect(publicChallenge).not.toHaveProperty('value')
    const [name, value, options] = cookieStore.set.mock.calls[0]
    expect(name).toBe('korkru_google_account_link')
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 300 })
    expect(typeof options.secure).toBe('boolean')
    const privateProof = readGoogleLinkChallenge(secret, value, userId, email, accessToken, now)!
    expect(privateProof.nonceHash).toBe(publicChallenge?.nonceHash)
    expect(JSON.stringify(publicChallenge)).not.toContain(privateProof.rawNonce)
  })

  it('clears the cookie before returning a valid or invalid challenge on completion', async () => {
    const signed = createGoogleLinkChallenge(secret, userId, email, accessToken, now)!
    cookieStore.get.mockReturnValue({ value: signed.value })
    expect(await consumeGoogleLinkChallenge(userId, email, accessToken)).toMatchObject({ userId, email })
    expect(cookieStore.set).toHaveBeenLastCalledWith('korkru_google_account_link', '', expect.objectContaining({ httpOnly: true, maxAge: 0, path: '/' }))
    cookieStore.get.mockReturnValue({ value: 'invalid' })
    expect(await consumeGoogleLinkChallenge(userId, email, accessToken)).toBeNull()
    expect(cookieStore.set).toHaveBeenCalledTimes(2)
  })

  it('fails closed without a signing secret and can clear a cancelled attempt', async () => {
    vi.stubEnv('AUTH_FLOW_SECRET', '')
    expect(await issueGoogleLinkChallenge(userId, email, accessToken)).toBeNull()
    expect(cookieStore.set).not.toHaveBeenCalled()
    await clearGoogleLinkChallenge()
    expect(cookieStore.set).toHaveBeenCalledWith('korkru_google_account_link', '', expect.objectContaining({ maxAge: 0 }))
  })
})
