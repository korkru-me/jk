'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
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
  const full_name = formData.get('full_name') as string
  const role = formData.get('role') as string

  if (!full_name?.trim()) {
    return { error: 'กรุณากรอกชื่อ-นามสกุล' }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, role },
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
          role: role as 'teacher' | 'student',
        },
        { onConflict: 'id', ignoreDuplicates: true }
      )

    if (profileError) {
      return { error: profileError.message }
    }
  }

  redirect('/dashboard')
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
