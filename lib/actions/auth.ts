'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
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
  })
  if (!parsed.success) return { error: validationMessage(parsed.error.issues) }

  const { email, password, full_name, role } = parsed.data
  const instructor_type = role === 'teacher' ? 'teacher' : null

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name,
        role,
        instructor_type,
        survey_role: role,
      },
    },
  })

  if (error) {
    const connectionError = authConnectionError(error)
    if (connectionError) return { error: connectionError }
    return { error: error.message }
  }

  return { success: true, signedIn: Boolean(data.session) }
}

export async function loginWithGoogle(role?: AccountRole) {
  const supabase = await createClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const callbackUrl = new URL('/auth/callback', siteUrl)
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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return { error: validationMessage(parsed.error.issues) }

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
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

export async function forgotPassword(email: string) {
  const supabase = await createClient()
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return { error: validationMessage(parsed.error.issues) }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const callbackUrl = new URL('/auth/callback', siteUrl)
  callbackUrl.searchParams.set('next', '/reset-password')

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: callbackUrl.toString(),
  })
  if (error) {
    const connectionError = authConnectionError(error)
    if (connectionError) return { error: connectionError }
    return { error: 'ยังส่งอีเมลไม่ได้ในขณะนี้ กรุณารอสักครู่แล้วลองใหม่' }
  }
  return { success: true }
}

export async function completeProfile(formData: FormData) {
  const parsed = completeProfileSchema.safeParse({
    role: formData.get('role'),
    full_name: formData.get('full_name'),
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

  await supabase.auth.updateUser({
    data: { full_name, role, survey_role: role },
  })
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

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    const connectionError = authConnectionError(error)
    if (connectionError) return { error: connectionError }
    return { error: 'ไม่สามารถตั้งรหัสผ่านใหม่ได้ กรุณาขอลิงก์ใหม่แล้วลองอีกครั้ง' }
  }

  // Invalidate refresh tokens on other devices after a credential reset.
  await supabase.auth.signOut({ scope: 'global' })
  return { success: true }
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
