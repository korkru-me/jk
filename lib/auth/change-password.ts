import { z } from 'zod'
import { passwordSchema } from './validation'

export const changePasswordSchema = z.object({
  old_password: z.string().min(1, 'กรุณากรอกรหัสผ่านปัจจุบัน'),
  new_password: passwordSchema,
  confirm_password: z.string(),
}).refine((values) => values.new_password === values.confirm_password, {
  path: ['confirm_password'],
  message: 'รหัสผ่านใหม่ไม่ตรงกัน',
})

interface AuthFailure {
  code?: string
  status?: number
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

export type PasswordChangeResult =
  | { error: string }
  | { success: true; sessionsRevoked: boolean; warning?: string }

const retryMessage = 'ยังเปลี่ยนรหัสผ่านไม่ได้ กรุณาลองใหม่อีกครั้ง'
const revokedWarning = 'เปลี่ยนรหัสผ่านแล้ว แต่ยังยุติการเข้าสู่ระบบทุกอุปกรณ์ไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่และติดต่อผู้ดูแลหากสงสัยว่าบัญชีถูกเข้าถึง'

function verificationError(error: AuthFailure) {
  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return 'ลองยืนยันรหัสผ่านหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่'
  }
  if (error.code === 'invalid_credentials') {
    return 'รหัสผ่านปัจจุบันไม่ถูกต้อง หากสมัครด้วย Google หรือยังไม่ได้ตั้งรหัสผ่าน ให้ใช้ลิงก์ตั้งรหัสผ่านทางอีเมลด้านล่าง'
  }
  return 'ยังยืนยันรหัสผ่านปัจจุบันไม่ได้ กรุณาลองใหม่ หรือใช้ลิงก์ตั้งรหัสผ่านทางอีเมลด้านล่าง'
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
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    const { data: { user }, error: userError } = await auth.getUser()
    if (userError || !user) return { error: 'กรุณาเข้าสู่ระบบอีกครั้งก่อนเปลี่ยนรหัสผ่าน' }
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
    if (verified.error) return { error: verificationError(verified.error) }
    if (!verified.data.session || verified.data.user?.id !== user.id) {
      return { error: 'ยืนยันบัญชีไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง' }
    }

    const { error } = await auth.updateUser({
      password: parsed.data.new_password,
      current_password: parsed.data.old_password,
    })
    if (error) {
      if (error.code === 'same_password') return { error: 'กรุณาใช้รหัสผ่านใหม่ที่ต่างจากรหัสผ่านปัจจุบัน' }
      if (error.code === 'weak_password') return { error: 'รหัสผ่านนี้ไม่ผ่านเงื่อนไขความปลอดภัย กรุณาใช้รหัสผ่านที่ยาวและคาดเดายากขึ้น' }
      if (error.code === 'reauthentication_needed' || error.code === 'reauthentication_not_valid') {
        return { error: 'กรุณาเข้าสู่ระบบใหม่ หรือใช้ลิงก์ตั้งรหัสผ่านทางอีเมลเพื่อยืนยันตัวตนอีกครั้ง' }
      }
      return { error: retryMessage }
    }
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
