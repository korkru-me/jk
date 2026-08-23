'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { buildFullName } from '@/lib/utils'
import { isSubjectGroup } from '@/lib/subject-groups'

export async function login(_prevState: unknown, formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    if (isAuthRetryableFetchError(error)) {
      return { error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่' }
    }
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
      await admin.from('users').insert({
        id: data.user.id,
        email: data.user.email!,
        full_name: meta?.full_name ?? email.split('@')[0],
        prefix: meta?.prefix ?? null,
        first_name: meta?.first_name ?? null,
        last_name: meta?.last_name ?? null,
        role: (meta?.role as 'teacher' | 'student') ?? 'student',
      })
    }
  }

  redirect('/dashboard')
}

export async function register(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const prefix = formData.get('prefix') as string
  const first_name = formData.get('first_name') as string
  const last_name = formData.get('last_name') as string
  const survey_role = formData.get('survey_role') as string
  const role_custom = formData.get('role_custom') as string | null
  const subject_group_raw = formData.get('subject_group') as string | null
  const subject_group_other = formData.get('subject_group_other') as string | null

  if (!prefix?.trim() || !first_name?.trim() || !last_name?.trim()) {
    return { error: 'กรุณากรอกคำนำหน้าชื่อ ชื่อ และสกุล' }
  }

  const full_name = buildFullName(prefix, first_name, last_name)

  // Map survey role → system role + instructor_type
  const role = survey_role === 'student' || survey_role === 'parent' || survey_role === 'other'
    ? 'student'
    : 'teacher'
  const instructor_type = survey_role === 'teacher' || survey_role === 'tutor'
    ? survey_role
    : null

  // กลุ่มสาระการเรียนรู้ถามเฉพาะครูผู้สอน — บทบาทอื่นไม่เก็บค่า
  const subject_group =
    survey_role === 'teacher' && subject_group_raw && isSubjectGroup(subject_group_raw)
      ? subject_group_raw
      : null
  const subject_group_other_value =
    subject_group === 'other' ? subject_group_other?.trim() || null : null

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name,
        prefix,
        first_name,
        last_name,
        role,
        instructor_type,
        survey_role,
        role_custom,
        subject_group,
        subject_group_other: subject_group_other_value,
      },
    },
  })

  if (error) {
    return { error: error.message }
  }

  if (data.user) {
    const admin = createAdminClient()
    const { error: profileError } = await admin
      .from('users')
      .upsert(
        {
          id: data.user.id,
          email: data.user.email!,
          full_name,
          prefix,
          first_name,
          last_name,
          role: role as 'teacher' | 'student',
          instructor_type: instructor_type || null,
          survey_role: survey_role || null,
          role_custom: survey_role === 'other' ? (role_custom || null) : null,
          subject_group,
          subject_group_other: subject_group_other_value,
        },
        { onConflict: 'id' }
      )

    if (profileError) {
      return { error: profileError.message }
    }
  }

  return { success: true }
}

export async function loginWithGoogle() {
  const supabase = await createClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
      queryParams: { access_type: 'offline', prompt: 'consent' },
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
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  })
  if (error) return { error: error.message }
  return { success: true }
}

export async function forgotPassword(email: string) {
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/reset-password`,
  })
  if (error) return { error: error.message }
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
