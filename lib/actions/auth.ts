'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { reserveAuthEmail } from '@/lib/auth/email-request-limit.server'
import { rememberSignupEmail } from '@/lib/auth/signup-email.server'
import { POLICY_VERSION } from '@/lib/legal'
import { clearRecoveryGrant, hasRecoveryGrant } from '@/lib/auth/recovery-grant.server'
import { clearRecoveryIntent, issueRecoveryIntent } from '@/lib/auth/recovery-intent.server'
import {
  completeProfileSchema,
  emailSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  type AccountRole,
} from '@/lib/auth/validation'

function validationMessage(issues: { message: string }[]) {
  return issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่'
}

function authConnectionError(error: unknown) {
  return isAuthRetryableFetchError(error)
    ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'
    : null
}

function emailCallbackUrl(flow: 'signup' | 'recovery' | 'login') {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) return null
  try {
    const url = new URL('/auth/callback', siteUrl)
    if (flow === 'recovery') url.searchParams.set('next', '/reset-password')
    if (flow === 'signup') url.searchParams.set('flow', 'signup')
    return url.toString()
  } catch {
    return null
  }
}

export async function login(_prevState: unknown, formData: FormData) {
  const supabase = await createClient()

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: validationMessage(parsed.error.issues) }

  const { email, password } = parsed.data

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const connectionError = authConnectionError(error)
    if (connectionError) return { error: connectionError }
    return {
      error: error.message === 'Invalid login credentials'
        ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
        : error.message,
    }
  }

  // Recover orphaned auth users who have no profile row
  if (data.user) {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('users')
      .select('id')
      .eq('id', data.user.id)
      .single()

    if (!profile) {
      const meta = data.user.user_metadata
      const role: AccountRole = meta?.role === 'teacher' ? 'teacher' : 'student'
      const fullName = meta?.full_name ?? meta?.name ?? email.split('@')[0]
      const { error: profileError } = await admin.from('users').insert({
        id: data.user.id,
        email: data.user.email!,
        full_name: fullName,
        prefix: meta?.prefix ?? null,
        first_name: meta?.first_name ?? null,
        last_name: meta?.last_name ?? null,
        role,
        survey_role: meta?.survey_role === 'teacher' || meta?.survey_role === 'student'
          ? meta.survey_role
          : null,
        instructor_type: role === 'teacher' ? 'teacher' : null,
      })
      if (!profileError) {
        await admin.rpc('ensure_personal_organization', {
          p_user_id: data.user.id,
          p_display_name: fullName,
        })
      }
    }
  }

  redirect('/dashboard')
}

export async function register(formData: FormData) {
  const supabase = await createClient()

  const parsed = signupSchema.safeParse({
    role: formData.get('role'),
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirm_password: formData.get('confirm_password'),
    accept_terms: formData.get('accept_terms') === 'true',
  })
  if (!parsed.success) return { error: validationMessage(parsed.error.issues) }

  const { email, password, full_name, role } = parsed.data
  const instructor_type = role === 'teacher' ? 'teacher' : null
  const callbackUrl = emailCallbackUrl('signup')
  if (!callbackUrl) return { error: 'ระบบสมัครสมาชิกยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล KorKru' }
  const limit = await reserveAuthEmail(email)
  if (!limit.allowed) return { error: limit.error, retryAfterSeconds: limit.retryAfterSeconds }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: callbackUrl,
      data: {
        full_name,
        role,
        instructor_type,
        survey_role: role,
        terms_version: POLICY_VERSION,
        privacy_version: POLICY_VERSION,
        terms_acknowledged_at: new Date().toISOString(),
      },
    },
  })

  if (error) {
    const connectionError = authConnectionError(error)
    if (connectionError) return { error: connectionError }
    if (error.code !== 'user_already_exists') {
      return { error: error.code === 'over_email_send_rate_limit'
        ? 'มีคำขอส่งอีเมลถี่เกินไป กรุณารอสักครู่แล้วลองใหม่'
        : 'ยังสมัครสมาชิกไม่ได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่ หรือติดต่อผู้ดูแล KorKru' }
    }
  }

  await rememberSignupEmail(email)
  return { success: true, signedIn: Boolean(data.session), email, retryAfterSeconds: 60 }
}

export async function loginWithGoogle(role?: AccountRole, acceptTerms?: boolean) {
  if (role !== undefined && (role !== 'teacher' && role !== 'student')) {
    return { error: 'กรุณาเลือกว่าคุณเป็นครูหรือนักเรียน' }
  }
  if (role && acceptTerms !== true) {
    return { error: 'กรุณายอมรับข้อกำหนดและรับทราบนโยบายความเป็นส่วนตัว' }
  }
  const supabase = await createClient()
  const configuredCallback = emailCallbackUrl('login')
  if (!configuredCallback) return { error: 'ระบบเข้าสู่ระบบยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล KorKru' }
  const callbackUrl = new URL(configuredCallback)
  if (role === 'teacher' || role === 'student') callbackUrl.searchParams.set('role', role)

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl.toString(),
      queryParams: { access_type: 'offline', prompt: 'select_account' },
    },
  })

  if (error || !data.url) {
    return { error: error?.message ?? 'ไม่สามารถเชื่อมต่อ Google ได้' }
  }

  redirect(data.url)
}

export async function sendMagicLink(email: string) {
  const supabase = await createClient()
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return { error: validationMessage(parsed.error.issues) }
  const callbackUrl = emailCallbackUrl('login')
  if (!callbackUrl) return { error: 'ระบบส่งอีเมลยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล KorKru' }
  const limit = await reserveAuthEmail(parsed.data)
  if (!limit.allowed) return { error: limit.error, retryAfterSeconds: limit.retryAfterSeconds }

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      emailRedirectTo: callbackUrl,
      shouldCreateUser: false,
    },
  })
  if (error) {
    const connectionError = authConnectionError(error)
    if (connectionError) return { error: connectionError }
    // Keep the response identical for registered and unregistered addresses.
    return { success: true }
  }
  return { success: true }
}

export async function forgotPassword(email: string, expectedUserId?: string) {
  const supabase = await createClient()
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return { error: validationMessage(parsed.error.issues) }

  const callbackUrl = emailCallbackUrl('recovery')
  if (!callbackUrl) return { error: 'ระบบส่งอีเมลยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล KorKru' }
  const limit = await reserveAuthEmail(parsed.data)
  if (!limit.allowed) return { error: limit.error, retryAfterSeconds: limit.retryAfterSeconds }

  try {
    const nonce = await issueRecoveryIntent(parsed.data, expectedUserId)
    if (!nonce) return { error: 'ระบบส่งลิงก์ตั้งรหัสผ่านยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลังหรือติดต่อผู้ดูแล KorKru' }
    const redirectUrl = new URL(callbackUrl)
    redirectUrl.searchParams.set('recovery_nonce', nonce)
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: redirectUrl.toString(),
    })
    if (error) {
      await clearRecoveryIntent()
      const connectionError = authConnectionError(error)
      if (connectionError) return { error: connectionError }
      return { error: 'ยังส่งอีเมลไม่ได้ในขณะนี้ กรุณารอสักครู่แล้วลองใหม่' }
    }
  } catch {
    await clearRecoveryIntent()
    return { error: 'ยังส่งอีเมลไม่ได้ในขณะนี้ กรุณารอสักครู่แล้วลองใหม่' }
  }
  return { success: true }
}

export async function resendSignupConfirmation(email: string) {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return { error: validationMessage(parsed.error.issues) }
  const callbackUrl = emailCallbackUrl('signup')
  if (!callbackUrl) return { error: 'ระบบส่งอีเมลยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล KorKru' }
  const limit = await reserveAuthEmail(parsed.data)
  if (!limit.allowed) return { error: limit.error, retryAfterSeconds: limit.retryAfterSeconds }

  const supabase = await createClient()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: parsed.data,
    options: { emailRedirectTo: callbackUrl },
  })
  if (error) {
    const connectionError = authConnectionError(error)
    if (connectionError) return { error: connectionError }
    // Missing/already-confirmed addresses have the same response as pending
    // accounts. Infrastructure/rate errors still need an honest retry state.
    if (error.code !== 'user_not_found' && error.code !== 'email_already_confirmed') {
      return { error: 'ยังส่งอีเมลไม่ได้ในขณะนี้ กรุณารอสักครู่แล้วลองใหม่', retryAfterSeconds: 60 }
    }
  }
  await rememberSignupEmail(parsed.data)
  return { success: true, retryAfterSeconds: 60 }
}

export async function completeProfile(formData: FormData) {
  const parsed = completeProfileSchema.safeParse({
    role: formData.get('role'),
    full_name: formData.get('full_name'),
    accept_terms: formData.get('accept_terms') === 'true',
  })
  if (!parsed.success) return { error: validationMessage(parsed.error.issues) }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ลิงก์เข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่' }

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('id, role, survey_role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) return { error: 'ไม่สามารถอ่านข้อมูลบัญชีได้ กรุณาลองใหม่' }
  if (!profile) return { error: 'ไม่พบข้อมูลบัญชี กรุณาเข้าสู่ระบบใหม่' }
  if (profile.role === 'admin' || profile.survey_role) return { success: true }

  const { role, full_name } = parsed.data
  // Do not mark onboarding complete when the acknowledgement write failed:
  // the protected layout uses survey_role to decide whether to show this step.
  const { error: acknowledgementError } = await supabase.auth.updateUser({
    data: {
      full_name, role, survey_role: role,
      terms_version: POLICY_VERSION,
      privacy_version: POLICY_VERSION,
      terms_acknowledged_at: new Date().toISOString(),
    },
  })
  if (acknowledgementError) return { error: 'ยังบันทึกการรับทราบข้อกำหนดไม่ได้ กรุณาลองใหม่' }

  const { data: updated, error } = await admin
    .from('users')
    .update({
      full_name,
      role,
      survey_role: role,
      instructor_type: role === 'teacher' ? 'teacher' : null,
    })
    .eq('id', user.id)
    .is('survey_role', null)
    .select('id')
    .maybeSingle()

  if (error) return { error: 'ไม่สามารถบันทึกข้อมูลบัญชีได้ กรุณาลองใหม่' }
  if (!updated) return { success: true }

  return { success: true }
}

export async function resetPassword(formData: FormData) {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirm_password: formData.get('confirm_password'),
  })
  if (!parsed.success) return { error: validationMessage(parsed.error.issues) }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ลิงก์ตั้งรหัสผ่านหมดอายุ กรุณาขอลิงก์ใหม่' }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session || !(await hasRecoveryGrant(user.id, session.access_token))) {
    return { error: 'กรุณาเปิดลิงก์ตั้งรหัสผ่านใหม่จากอีเมลภายใน 10 นาที' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    const connectionError = authConnectionError(error)
    if (connectionError) return { error: connectionError }
    return { error: 'ไม่สามารถตั้งรหัสผ่านใหม่ได้ กรุณาขอลิงก์ใหม่แล้วลองอีกครั้ง' }
  }

  // Invalidate refresh tokens on other devices after a credential reset.
  await clearRecoveryGrant()
  try {
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' })
    if (!signOutError) return { success: true }
  } catch { /* Credential update succeeded; report revocation separately. */ }
  return { success: true, warning: 'ตั้งรหัสผ่านแล้ว แต่ยังยุติการเข้าสู่ระบบทุกอุปกรณ์ไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่และติดต่อผู้ดูแล' }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  return profile
}
