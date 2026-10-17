'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createIsolatedClient } from '@supabase/supabase-js'
import { changePasswordForUser, type PasswordChangeResult } from '@/lib/auth/change-password'
import { revalidatePath } from 'next/cache'

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่พบผู้ใช้งาน' }

  const full_name = (formData.get('full_name') as string)?.trim()
  if (!full_name) return { error: 'กรุณากรอกชื่อ-นามสกุล' }

  const admin = createAdminClient()
  const { error } = await admin.from('users').update({ full_name }).eq('id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/settings/profile')
  return { success: true }
}

export async function updatePassword(formData: FormData): Promise<PasswordChangeResult> {
  try {
    const supabase = await createClient()
    return await changePasswordForUser(formData, supabase.auth, () => createIsolatedClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    ).auth)
  } catch {
    return { error: 'ยังเปลี่ยนรหัสผ่านไม่ได้ กรุณาลองใหม่อีกครั้ง' }
  }
}

export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  return profile
}
