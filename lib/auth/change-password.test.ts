import { beforeEach, describe, expect, it, vi } from 'vitest'
import { changePasswordForUser, changePasswordSchema } from './change-password'

function form(oldPassword = 'old password1 ', newPassword = ' new password2 ') {
  const data = new FormData()
  data.set('old_password', oldPassword)
  data.set('new_password', newPassword)
  data.set('confirm_password', newPassword)
  return data
}

function fixture() {
  const auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'current-user', email: 'verified@example.com' } }, error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  }
  const verifier = {
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { user: { id: 'current-user' }, session: { access_token: 'synthetic' } }, error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  }
  const createVerifier = vi.fn(() => verifier)
  return { auth, verifier, createVerifier }
}

describe('settings password change authorization', () => {
  let f: ReturnType<typeof fixture>
  beforeEach(() => { f = fixture() })

  it('requires the current password and the same new-password policy as signup', async () => {
    for (const data of [form(''), form('oldpass1', '12345678'), form('oldpass1', 'abcdefgh')]) {
      expect(await changePasswordForUser(data, f.auth, f.createVerifier)).toHaveProperty('error')
    }
    expect(f.auth.getUser).not.toHaveBeenCalled()
    expect(f.auth.updateUser).not.toHaveBeenCalled()
    expect(f.createVerifier).not.toHaveBeenCalled()
  })

  it('rejects mismatched confirmations and non-text form values', () => {
    expect(changePasswordSchema.safeParse({
      old_password: 'oldpass1', new_password: 'newpass2', confirm_password: 'different2',
    }).success).toBe(false)
    expect(changePasswordSchema.safeParse({
      old_password: new Blob(['oldpass1']), new_password: 'newpass2', confirm_password: 'newpass2',
    }).success).toBe(false)
  })

  it('rejects a missing or failed verified session before checking credentials', async () => {
    for (const result of [
      { data: { user: null }, error: null },
      { data: { user: { id: 'current-user', email: 'verified@example.com' } }, error: { status: 401 } },
    ]) {
      f.auth.getUser.mockResolvedValueOnce(result)
      expect(await changePasswordForUser(form(), f.auth, f.createVerifier)).toHaveProperty('error')
    }
    expect(f.createVerifier).not.toHaveBeenCalled()
    expect(f.auth.updateUser).not.toHaveBeenCalled()
  })

  it('does not change a password for an account without a verified email identity', async () => {
    f.auth.getUser.mockResolvedValue({ data: { user: { id: 'current-user' } }, error: null })
    expect(await changePasswordForUser(form(), f.auth, f.createVerifier)).toHaveProperty('error')
    expect(f.createVerifier).not.toHaveBeenCalled()
  })

  it('verifies the session email, ignores submitted identity, and preserves password whitespace', async () => {
    const data = form()
    data.set('email', 'attacker@example.com')
    data.set('user_id', 'another-user')
    expect(await changePasswordForUser(data, f.auth, f.createVerifier)).toEqual({ success: true, sessionsRevoked: true })
    expect(f.verifier.signInWithPassword).toHaveBeenCalledWith({ email: 'verified@example.com', password: 'old password1 ' })
    expect(f.auth.updateUser).toHaveBeenCalledWith({ password: ' new password2 ', current_password: 'old password1 ' })
    expect(f.verifier.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(f.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
    expect(f.verifier.signOut.mock.invocationCallOrder[0]).toBeLessThan(f.auth.updateUser.mock.invocationCallOrder[0])
    expect(f.auth.updateUser.mock.invocationCallOrder[0]).toBeLessThan(f.auth.signOut.mock.invocationCallOrder[0])
  })

  it('rejects an incorrect current password and suggests recovery for Google-only users', async () => {
    f.verifier.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'provider secret detail' } })
    const result = await changePasswordForUser(form(), f.auth, f.createVerifier)
    expect(result).toHaveProperty('error', expect.stringContaining('Google'))
    expect(JSON.stringify(result)).not.toContain('provider secret detail')
    expect(f.auth.updateUser).not.toHaveBeenCalled()
    expect(f.auth.signOut).not.toHaveBeenCalled()
  })

  it.each([{ status: 429 }, { code: 'over_request_rate_limit' }])('handles provider credential throttling without a password mutation', async (error) => {
    f.verifier.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error })
    expect(await changePasswordForUser(form(), f.auth, f.createVerifier)).toHaveProperty('error', expect.stringContaining('กรุณารอ'))
    expect(f.auth.updateUser).not.toHaveBeenCalled()
  })

  it('cleans up an unexpected verification session and rejects a different user', async () => {
    f.verifier.signInWithPassword.mockResolvedValue({ data: { user: { id: 'another-user' }, session: {} }, error: null })
    expect(await changePasswordForUser(form(), f.auth, f.createVerifier)).toHaveProperty('error')
    expect(f.verifier.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(f.auth.updateUser).not.toHaveBeenCalled()
  })

  it('rejects a provider response without a usable verification session', async () => {
    f.verifier.signInWithPassword.mockResolvedValue({ data: { user: { id: 'current-user' }, session: null }, error: null })
    expect(await changePasswordForUser(form(), f.auth, f.createVerifier)).toHaveProperty('error')
    expect(f.auth.updateUser).not.toHaveBeenCalled()
  })

  it('does not change credentials when temporary-session cleanup fails', async () => {
    f.verifier.signOut.mockResolvedValue({ error: { status: 503 } })
    expect(await changePasswordForUser(form(), f.auth, f.createVerifier)).toHaveProperty('error')
    expect(f.auth.updateUser).not.toHaveBeenCalled()
  })

  it.each(['same_password', 'weak_password', 'reauthentication_needed', 'reauthentication_not_valid', 'unexpected'])('reports an update failure (%s) without claiming success or signing out', async (code) => {
    f.auth.updateUser.mockResolvedValue({ error: { code, message: 'sensitive provider payload' } })
    const result = await changePasswordForUser(form(), f.auth, f.createVerifier)
    expect(result).toHaveProperty('error')
    expect(JSON.stringify(result)).not.toContain('sensitive provider payload')
    expect(f.auth.signOut).not.toHaveBeenCalled()
  })

  it('handles verification network failure without changing credentials', async () => {
    f.verifier.signInWithPassword.mockRejectedValue(new Error('private transport detail'))
    expect(await changePasswordForUser(form(), f.auth, f.createVerifier)).toHaveProperty('error')
    expect(f.auth.updateUser).not.toHaveBeenCalled()
  })

  it('reports the successful password change honestly when global revocation fails', async () => {
    f.auth.signOut.mockResolvedValueOnce({ error: { status: 503 } }).mockResolvedValueOnce({ error: null })
    const result = await changePasswordForUser(form(), f.auth, f.createVerifier)
    expect(result).toEqual({ success: true, sessionsRevoked: false, warning: expect.stringContaining('เปลี่ยนรหัสผ่านแล้ว') })
    expect(f.auth.signOut.mock.calls).toEqual([[{ scope: 'global' }], [{ scope: 'local' }]])
    expect(f.auth.updateUser).toHaveBeenCalledOnce()
  })

  it('retains the success warning when both revocation requests throw', async () => {
    f.auth.signOut.mockRejectedValue(new Error('offline'))
    expect(await changePasswordForUser(form(), f.auth, f.createVerifier)).toEqual({
      success: true, sessionsRevoked: false, warning: expect.any(String),
    })
    expect(f.auth.updateUser).toHaveBeenCalledOnce()
  })
})
