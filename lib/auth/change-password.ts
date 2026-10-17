import { z } from 'zod'
import { passwordSchema } from './validation'

export const changePasswordSchema = z.object({
  old_password: z.string({ error: 'กรุณากรอกรหัสผ่านปัจจุบัน' }).min(1, 'กรุณากรอกรหัสผ่านปัจจุบัน'),
  new_password: z.string({ error: 'กรุณากรอกรหัสผ่านใหม่' }).min(1, 'กรุณากรอกรหัสผ่านใหม่').pipe(passwordSchema),
  confirm_password: z.string({ error: 'กรุณายืนยันรหัสผ่านใหม่' }).min(1, 'กรุณายืนยันรหัสผ่านใหม่'),
}).refine((values) => values.new_password === values.confirm_password, {
  path: ['confirm_password'],
  message: 'รหัสผ่านใหม่ไม่ตรงกัน',
}).refine((values) => values.old_password !== values.new_password, {
  path: ['new_password'],
  message: 'กรุณาใช้รหัสผ่านใหม่ที่ต่างจากรหัสผ่านปัจจุบัน',
})

interface AuthFailure {
  code?: string
  status?: number
  name?: string
}

interface PasswordChangeAuth {
  getUser(): Promise<{
    data: { user: { id: string; email?: string } | null }
    error: AuthFailure | null
  }>
  updateUser(attributes: { password: string; current_password: string }): Promise<{ error: AuthFailure | null }>
  signOut(options: { scope: 'global' | 'local' }): Promise<{ error: AuthFailure | null }>
}

interface CredentialVerifier {
  signInWithPassword(credentials: { email: string; password: string }): Promise<{
    data: { user: { id: string } | null; session: unknown | null }
    error: AuthFailure | null
  }>
  signOut(options: { scope: 'local' }): Promise<{ error: AuthFailure | null }>
}

export type PasswordChangeField = 'old_password' | 'new_password' | 'confirm_password'
type PasswordChangeError = { error: string; field?: PasswordChangeField; action?: 'sign_in' }

export type PasswordChangeResult =
  | PasswordChangeError
  | { success: true; sessionsRevoked: boolean; warning?: string }

const retryMessage = 'ยังเปลี่ยนรหัสผ่านไม่ได้ กรุณาลองใหม่อีกครั้ง'
const revokedWarning = 'เปลี่ยนรหัสผ่านแล้ว แต่ยังยุติการเข้าสู่ระบบทุกอุปกรณ์ไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่และติดต่อผู้ดูแลหากสงสัยว่าบัญชีถูกเข้าถึง'

function isPasswordChangeField(value: unknown): value is PasswordChangeField {
  return value === 'old_password' || value === 'new_password' || value === 'confirm_password'
}

function isSessionError(error: AuthFailure) {
  return error.name === 'AuthSessionMissingError'
    || ['session_expired', 'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used', 'bad_jwt', 'no_authorization'].includes(error.code ?? '')
}

function signInRequired(): PasswordChangeError {
  return { error: 'กรุณาเข้าสู่ระบบอีกครั้งก่อนเปลี่ยนรหัสผ่าน', action: 'sign_in' }
}

function providerError(error: AuthFailure, stage: 'identity' | 'verification' | 'update'): PasswordChangeError {
  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return { error: 'มีคำขอเปลี่ยนรหัสผ่านถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' }
  }
  if (error.name === 'AuthRetryableFetchError' || error.status === 0 || error.status === 408
    || (error.status !== undefined && error.status >= 500)
    || error.code === 'request_timeout' || error.code === 'unexpected_failure') {
    return { error: 'ระบบยืนยันตัวตนขัดข้องชั่วคราว กรุณารอสักครู่แล้วลองใหม่' }
  }
  // A verifier has its own temporary session. Its errors must never imply that
  // the cookie-bound session expired or replace that session in the browser.
  if (stage !== 'verification' && isSessionError(error)) return signInRequired()
  if (stage === 'update') {
    if (error.code === 'same_password') return { error: 'กรุณาใช้รหัสผ่านใหม่ที่ต่างจากรหัสผ่านปัจจุบัน', field: 'new_password' }
    if (error.code === 'weak_password') return { error: 'รหัสผ่านนี้ไม่ผ่านเงื่อนไขความปลอดภัย กรุณาใช้รหัสผ่านที่ยาวและคาดเดายากขึ้น', field: 'new_password' }
    if (['reauthentication_needed', 'reauthentication_not_valid', 'reauth_nonce_missing'].includes(error.code ?? '')) {
      return signInRequired()
    }
  }
  if (stage !== 'identity' && error.code === 'invalid_credentials') {
    return {
      error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง หากสมัครด้วย Google หรือยังไม่ได้ตั้งรหัสผ่าน KorKru ให้ใช้ลิงก์ตั้งรหัสผ่านทางอีเมล',
      field: 'old_password',
    }
  }
  if (error.code === 'captcha_failed') {
    return { error: 'ยังยืนยันตัวตนผ่านระบบตรวจสอบความปลอดภัยไม่ได้ กรุณาใช้ลิงก์ตั้งรหัสผ่านทางอีเมลหรือติดต่อผู้ดูแล' }
  }
  if (error.code === 'insufficient_aal') {
    return { error: 'บัญชีนี้ต้องยืนยันตัวตนเพิ่มเติมก่อนเปลี่ยนรหัสผ่าน กรุณาติดต่อผู้ดูแล' }
  }
  if (error.code === 'email_provider_disabled') {
    return { error: 'ระบบยืนยันด้วยรหัสผ่านยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล' }
  }
  return { error: retryMessage }
}

/** Verify credentials without replacing the cookie-bound session or trusting a submitted email. */
export async function changePasswordForUser(
  formData: FormData,
  auth: PasswordChangeAuth,
  createVerifier: () => CredentialVerifier,
): Promise<PasswordChangeResult> {
  const parsed = changePasswordSchema.safeParse({
    old_password: formData.get('old_password'),
    new_password: formData.get('new_password'),
    confirm_password: formData.get('confirm_password'),
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue.path[0]
    return { error: issue.message, ...(isPasswordChangeField(field) ? { field } : {}) }
  }

  try {
    const { data: { user }, error: userError } = await auth.getUser()
    if (userError) return providerError(userError, 'identity')
    if (!user) return signInRequired()
    if (!user.email) return { error: 'บัญชีนี้ไม่มีอีเมลสำหรับยืนยันรหัสผ่าน กรุณาติดต่อผู้ดูแล' }

    const verifier = createVerifier()
    const verified = await verifier.signInWithPassword({
      email: user.email,
      password: parsed.data.old_password,
    })

    // A successful verification creates a temporary session. Revoke that session
    // before changing the password, including when its identity is unexpected.
    if (verified.data.session) {
      const cleanup = await verifier.signOut({ scope: 'local' })
      if (cleanup.error) return { error: retryMessage }
    }
    if (verified.error) return providerError(verified.error, 'verification')
    if (!verified.data.session || verified.data.user?.id !== user.id) {
      return { error: 'ยืนยันบัญชีไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง' }
    }

    const { error } = await auth.updateUser({
      password: parsed.data.new_password,
      current_password: parsed.data.old_password,
    })
    if (error) return providerError(error, 'update')
  } catch {
    return { error: retryMessage }
  }

  // Credential update has succeeded. A revocation failure must not tell the user
  // the password change failed or invite them to repeat it with the old password.
  try {
    const { error } = await auth.signOut({ scope: 'global' })
    if (!error) return { success: true, sessionsRevoked: true }
  } catch {
    // Attempt local cleanup below after a failed global revocation.
  }
  try {
    await auth.signOut({ scope: 'local' })
  } catch {
    // The warning remains explicit even if local cleanup is also unavailable.
  }
  return { success: true, sessionsRevoked: false, warning: revokedWarning }
}
