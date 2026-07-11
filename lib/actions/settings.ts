'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

export async function updatePassword(formData: FormData) {
  const supabase = await createClient()
  const newPassword = (formData.get('new_password') as string)?.trim()
  const confirmPassword = (formData.get('confirm_password') as string)?.trim()

  if (!newPassword || newPassword.length < 8) return { error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }
  if (newPassword !== confirmPassword) return { error: 'รหัสผ่านใหม่ไม่ตรงกัน' }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: error.message }
  return { success: true }
}

export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  return profile
}
