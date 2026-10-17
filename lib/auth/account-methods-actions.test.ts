import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), getSession: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(),
  issue: vi.fn(), consume: vi.fn(), clear: vi.fn(), complete: vi.fn(), verify: vi.fn(), forgot: vi.fn(), derive: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser, getSession: mocks.getSession } }) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signInWithPassword: mocks.signInWithPassword, signOut: mocks.signOut } }) }))
vi.mock('@/lib/actions/auth', () => ({ forgotPassword: mocks.forgot }))
vi.mock('@/lib/auth/google-account-link', () => ({ completeGoogleAccountLink: mocks.complete, deriveGoogleConnection: mocks.derive }))
vi.mock('@/lib/auth/google-account-link.server', () => ({ issueGoogleLinkChallenge: mocks.issue, consumeGoogleLinkChallenge: mocks.consume, clearGoogleLinkChallenge: mocks.clear }))
vi.mock('@/lib/auth/google-id-token.server', () => ({ verifyGoogleIdToken: mocks.verify }))
import { cancelGoogleAccountLink, completeGoogleAccountLink, getAccountSignInMethods, sendAccountPasswordEmail, startGoogleAccountLink } from '../actions/account-methods'

const user = { id: 'verified-user', email: 'Owner@example.com', email_confirmed_at: '2026-10-17T00:00:00Z', identities: [] }
function password(value: string | Blob = ' Currentpass1 ') {
  const data = new FormData()
  data.set('current_password', value)
  data.set('email', 'attacker@example.com')
  data.set('user_id', 'attacker')
  return data
}
beforeEach(() => {
  vi.stubEnv('GOOGLE_ACCOUNT_LINKING_ENABLED', 'true')
  vi.stubEnv('GOOGLE_ACCOUNT_LINK_CLIENT_ID', 'fixture.apps.googleusercontent.com')
  mocks.getUser.mockResolvedValue({ data: { user }, error: null })
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'verified-session' } }, error: null })
  mocks.signInWithPassword.mockResolvedValue({ data: { user, session: {} }, error: null })
  mocks.signOut.mockResolvedValue({ error: null })
  mocks.issue.mockResolvedValue({ nonceHash: 'hashed-nonce', expiresAt: 1234 })
  mocks.consume.mockResolvedValue({ rawNonce: 'server-only-raw-nonce' })
  mocks.complete.mockResolvedValue({ success: true, temporarySessionRevoked: true })
  mocks.derive.mockReturnValue({ state: 'unlinked', email: null })
  mocks.forgot.mockResolvedValue({ success: true })
})
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks() })

describe('account sign-in methods authorization', () => {
  it('cancels the browser proof even if the feature is disabled or the account session is gone', async () => {
    vi.stubEnv('GOOGLE_ACCOUNT_LINKING_ENABLED', 'false')
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await cancelGoogleAccountLink()).toEqual({ success: true })
    expect(mocks.clear).toHaveBeenCalledOnce()
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.complete).not.toHaveBeenCalled()
  })
  it('does not report cancellation as successful if clearing the browser proof fails', async () => {
    mocks.clear.mockRejectedValueOnce(new Error('private cookie failure'))
    const result = await cancelGoogleAccountLink()
    expect(result).toHaveProperty('error')
    expect(JSON.stringify(result)).not.toContain('private cookie failure')
  })
  it('keeps password status unknown and reads only the verified identity', async () => {
    expect(await getAccountSignInMethods()).toEqual({ email: user.email, emailVerified: true, google: { state: 'unlinked', email: null }, canConnectGoogle: true })
    expect(await getAccountSignInMethods()).not.toHaveProperty('hasPassword')
  })
  it('fails closed when linking is disabled or its audience is missing', async () => {
    for (const [enabled, id] of [['false', 'fixture.apps.googleusercontent.com'], ['true', '']]) {
      vi.stubEnv('GOOGLE_ACCOUNT_LINKING_ENABLED', enabled)
      vi.stubEnv('GOOGLE_ACCOUNT_LINK_CLIENT_ID', id)
      expect(await startGoogleAccountLink(password())).toHaveProperty('error')
      expect(await completeGoogleAccountLink('credential')).toHaveProperty('error')
    }
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
    expect(mocks.issue).not.toHaveBeenCalled()
    expect(mocks.consume).not.toHaveBeenCalled()
  })
  it.each([null, { ...user, email_confirmed_at: null }, { ...user, is_anonymous: true }])('requires a verified nonanonymous account before proving a password (%j)', async (candidate) => {
    mocks.getUser.mockResolvedValue({ data: { user: candidate }, error: null })
    expect(await startGoogleAccountLink(password())).toHaveProperty('error')
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
    expect(mocks.issue).not.toHaveBeenCalled()
  })
  it('validates the password input before issuing a challenge', async () => {
    for (const data of [new FormData(), password(''), password(new Blob(['not text'])), password('x'.repeat(4097))]) {
      expect(await startGoogleAccountLink(data)).toHaveProperty('field', 'current_password')
    }
    expect(mocks.issue).not.toHaveBeenCalled()
  })
  it('verifies the session email, preserves password bytes, and cleans the temporary session before issuing proof', async () => {
    const result = await startGoogleAccountLink(password())
    expect(result).toEqual({ success: true, clientId: 'fixture.apps.googleusercontent.com', nonceHash: 'hashed-nonce', expiresAt: 1234 })
    expect(JSON.stringify(result)).not.toContain('rawNonce')
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: user.email, password: ' Currentpass1 ' })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(mocks.issue.mock.invocationCallOrder[0])
    expect(mocks.issue).toHaveBeenCalledWith(user.id, user.email, 'verified-session')
  })
  it('rejects another verified identity and cleanup failures before issuing proof', async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ data: { user: { ...user, id: 'another-user' }, session: {} }, error: null })
    expect(await startGoogleAccountLink(password())).toHaveProperty('error')
    mocks.signOut.mockResolvedValueOnce({ error: { status: 503 } })
    expect(await startGoogleAccountLink(password())).toHaveProperty('error')
    expect(mocks.issue).not.toHaveBeenCalled()
  })
  it('maps a wrong password to the field and keeps provider details private', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'private details' } })
    const result = await startGoogleAccountLink(password())
    expect(result).toHaveProperty('field', 'current_password')
    expect(JSON.stringify(result)).not.toContain('private details')
    expect(mocks.issue).not.toHaveBeenCalled()
  })
  it('refuses conflicting Google identities before requesting a password proof', async () => {
    mocks.derive.mockReturnValue({ state: 'conflict', email: 'another@example.com' })
    expect(await startGoogleAccountLink(password())).toHaveProperty('error')
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
  })
  it('binds completion to freshly verified user and session and never accepts submitted account identifiers', async () => {
    expect(await completeGoogleAccountLink('google-token')).toEqual({ success: true })
    expect(mocks.consume).toHaveBeenCalledWith(user.id, user.email, 'verified-session')
    expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({ user, accessToken: 'verified-session', credential: 'google-token', audience: 'fixture.apps.googleusercontent.com', verifyIdToken: mocks.verify }))
  })
  it('preserves partial-success warnings without exposing Auth tokens', async () => {
    mocks.complete.mockResolvedValue({ success: true, temporarySessionRevoked: false, warning: 'temporary session cleanup unavailable' })
    expect(await completeGoogleAccountLink('google-token')).toEqual({ success: true, warning: 'temporary session cleanup unavailable' })
  })
  it('sends password setup only to the verified account email', async () => {
    expect(await sendAccountPasswordEmail()).toEqual({ success: true, retryAfterSeconds: 60 })
    expect(mocks.forgot).toHaveBeenCalledWith(user.email, user.id)
  })
  it.each([null, { ...user, email_confirmed_at: null }, { ...user, is_anonymous: true }])('cannot send setup email for an unverified or missing account (%j)', async (candidate) => {
    mocks.getUser.mockResolvedValue({ data: { user: candidate }, error: null })
    expect(await sendAccountPasswordEmail()).toHaveProperty('error')
    expect(mocks.forgot).not.toHaveBeenCalled()
  })
  it('keeps shared email cooldown and configuration errors visible', async () => {
    mocks.forgot.mockResolvedValue({ error: 'กรุณารอ', retryAfterSeconds: 42 })
    expect(await sendAccountPasswordEmail()).toEqual({ error: 'กรุณารอ', retryAfterSeconds: 42 })
  })
})
