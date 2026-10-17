import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(), resend: vi.fn(), resetPasswordForEmail: vi.fn(), signInWithOtp: vi.fn(), signInWithOAuth: vi.fn(),
  reserve: vi.fn(), remember: vi.fn(),
  getUser: vi.fn(), getSession: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(), profileRead: vi.fn(), profileUpdate: vi.fn(),
  hasGrant: vi.fn(), clearGrant: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: mocks })) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: mocks.profileRead }) }),
  update: mocks.profileUpdate,
}) })) }))
vi.mock('@/lib/auth/email-request-limit.server', () => ({ reserveAuthEmail: mocks.reserve }))
vi.mock('@/lib/auth/signup-email.server', () => ({ rememberSignupEmail: mocks.remember }))
vi.mock('@/lib/auth/recovery-grant.server', () => ({ hasRecoveryGrant: mocks.hasGrant, clearRecoveryGrant: mocks.clearGrant }))
import { completeProfile, forgotPassword, loginWithGoogle, register, resendSignupConfirmation, resetPassword, sendMagicLink } from '../actions/auth'

function signup(accept = true) {
  const form = new FormData()
  Object.entries({ role: 'student', full_name: 'นักเรียนทดสอบ', email: 'Student@Example.COM', password: 'password1', confirm_password: 'password1', accept_terms: String(accept) }).forEach(([key, value]) => form.set(key, value))
  return form
}
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://fixture.invalid')
  mocks.reserve.mockResolvedValue({ allowed: true })
  mocks.signUp.mockResolvedValue({ data: { session: null, user: { id: 'synthetic' } }, error: null })
  for (const name of ['resend', 'resetPasswordForEmail', 'signInWithOtp'] as const) mocks[name].mockResolvedValue({ error: null })
})
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks() })

describe('public email actions', () => {
  it('requires acknowledgement before reserving or creating an account', async () => {
    expect(await register(signup(false))).toHaveProperty('error')
    expect(mocks.reserve).not.toHaveBeenCalled()
    expect(mocks.signUp).not.toHaveBeenCalled()
  })
  it('uses a fixed callback and records policy acknowledgement without changing the chosen role', async () => {
    expect(await register(signup())).toMatchObject({ success: true, signedIn: false, email: 'student@example.com' })
    expect(mocks.signUp.mock.calls[0][0]).toMatchObject({
      email: 'student@example.com',
      options: { emailRedirectTo: 'https://fixture.invalid/auth/callback?flow=signup', data: {
        role: 'student', terms_version: '2026-10-17', privacy_version: '2026-10-17', terms_acknowledged_at: expect.any(String),
      } },
    })
    expect(mocks.remember).toHaveBeenCalledWith('student@example.com')
    expect(mocks.signUp.mock.calls[0][0]).not.toHaveProperty('confirm_password')
    expect(mocks.signUp.mock.calls[0][0].options.data).not.toHaveProperty('confirm_password')
  })

  it('rejects missing or mismatched confirmation before reserving or sending email', async () => {
    for (const confirmation of [null, '', 'Password1', 'password1 ']) {
      const form = signup()
      if (confirmation === null) form.delete('confirm_password')
      else form.set('confirm_password', confirmation)
      expect(await register(form)).toHaveProperty('error')
    }
    expect(mocks.reserve).not.toHaveBeenCalled()
    expect(mocks.signUp).not.toHaveBeenCalled()
  })
  it('does not reveal an already registered address in the signup result', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null, user: null }, error: { code: 'user_already_exists' } })
    expect(await register(signup())).toMatchObject({ success: true, signedIn: false })
  })
  it('prevents all four sending paths from calling Auth when reservation is denied', async () => {
    mocks.reserve.mockResolvedValue({ allowed: false, error: 'กรุณารอ', retryAfterSeconds: 60 })
    for (const action of [() => register(signup()), () => resendSignupConfirmation('student@example.com'), () => forgotPassword('student@example.com'), () => sendMagicLink('student@example.com')]) {
      expect(await action()).toMatchObject({ error: 'กรุณารอ', retryAfterSeconds: 60 })
    }
    for (const fn of [mocks.signUp, mocks.resend, mocks.resetPasswordForEmail, mocks.signInWithOtp]) expect(fn).not.toHaveBeenCalled()
  })
  it('resends only signup confirmations with the fixed destination', async () => {
    await resendSignupConfirmation('STUDENT@example.com')
    expect(mocks.resend).toHaveBeenCalledWith({ type: 'signup', email: 'student@example.com', options: { emailRedirectTo: 'https://fixture.invalid/auth/callback?flow=signup' } })
  })
  it('gives the same resend result for missing/confirmed addresses', async () => {
    for (const code of ['user_not_found', 'email_already_confirmed']) {
      mocks.resend.mockResolvedValueOnce({ error: { code } })
      expect(await resendSignupConfirmation('student@example.com')).toEqual({ success: true, retryAfterSeconds: 60 })
    }
  })
  it('keeps infrastructure failures visible without returning provider internals', async () => {
    mocks.resend.mockResolvedValueOnce({ error: { code: 'unexpected_failure', message: 'secret provider details' } })
    const result = await resendSignupConfirmation('student@example.com')
    expect(result).toHaveProperty('error')
    expect(JSON.stringify(result)).not.toContain('secret provider')
  })
  it('does not create a new user through magic link and scopes recovery to reset-password', async () => {
    await sendMagicLink('student@example.com')
    expect(mocks.signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(false)
    await forgotPassword('student@example.com')
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith('student@example.com', { redirectTo: 'https://fixture.invalid/auth/callback?next=%2Freset-password' })
  })
  it('requires acknowledgement for Google signup before connecting to Google', async () => {
    expect(await loginWithGoogle('student', false)).toHaveProperty('error')
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled()
  })

  it('keeps Google onboarding incomplete when acknowledgement storage fails', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'verified-user' } } })
    mocks.profileRead.mockResolvedValue({ data: { id: 'verified-user', role: 'student', survey_role: null }, error: null })
    mocks.updateUser.mockResolvedValue({ error: { code: 'unexpected_failure' } })
    expect(await completeProfile(signup())).toHaveProperty('error')
    expect(mocks.profileUpdate).not.toHaveBeenCalled()
  })

  it('does not let an existing login alone reset the password', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'verified-user' } } })
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'synthetic-session' } } })
    mocks.hasGrant.mockResolvedValue(false)
    const form = new FormData()
    form.set('password', 'newpassword1')
    form.set('confirm_password', 'newpassword1')
    expect(await resetPassword(form)).toHaveProperty('error')
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('clears the valid recovery grant and revokes sessions after a reset', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'verified-user' } } })
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'synthetic-session' } } })
    mocks.hasGrant.mockResolvedValue(true)
    mocks.updateUser.mockResolvedValue({ error: null })
    mocks.signOut.mockResolvedValue({ error: null })
    const form = new FormData()
    form.set('password', 'newpassword1')
    form.set('confirm_password', 'newpassword1')
    expect(await resetPassword(form)).toEqual({ success: true })
    expect(mocks.hasGrant).toHaveBeenCalledWith('verified-user', 'synthetic-session')
    expect(mocks.clearGrant).toHaveBeenCalledOnce()
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })
})
