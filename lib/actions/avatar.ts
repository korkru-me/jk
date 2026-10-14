'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getAuthUser } from '@/lib/auth/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AVATAR_BUCKET, AVATAR_MAX_BYTES, saveAvatarCrop } from '@/lib/avatar-storage'

export async function updateMyAvatar(formData: FormData): Promise<{ error?: string; avatarUrl?: string }> {
  const user = await getAuthUser()
  if (!user) return { error: 'กรุณาเข้าสู่ระบบก่อนบันทึกรูป' }
  const file = formData.get('avatar')
  if (!(file instanceof File) || file.type !== 'image/png' || file.size > AVATAR_MAX_BYTES) return { error: 'รูปไม่ถูกต้อง กรุณาจัดรูปใหม่อีกครั้ง' }
  const admin = createAdminClient()
  const { data: account, error } = await admin.from('users').select('id,status').eq('id', user.id).maybeSingle()
  if (error || account?.status !== 'active') return { error: 'ไม่สามารถบันทึกรูปสำหรับบัญชีนี้ได้' }
  try {
    const avatarUrl = await saveAvatarCrop(user.id, new Uint8Array(await file.arrayBuffer()), randomUUID(), {
      async readAvatar() {
        const { data, error } = await admin.from('users').select('avatar_url').eq('id', user.id).single()
        if (error) throw new Error('Account unavailable')
        return data.avatar_url as string | null
      },
      async upload(path, bytes) {
        const { error } = await admin.storage.from(AVATAR_BUCKET).upload(path, bytes, { contentType: 'image/png', upsert: false })
        if (error) throw new Error('Upload unavailable')
      },
      publicUrl: path => admin.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl,
      async replaceAvatar(previous, next) {
        let query = admin.from('users').update({ avatar_url: next }).eq('id', user.id).eq('status', 'active')
        query = previous === null ? query.is('avatar_url', null) : query.eq('avatar_url', previous)
        const { data, error } = await query.select('id')
        if (error) throw new Error('Save unavailable')
        return data?.length === 1
      },
      async remove(path) {
        const { error } = await admin.storage.from(AVATAR_BUCKET).remove([path])
        if (error) throw new Error('Cleanup unavailable')
      },
    })
    revalidatePath('/settings/profile')
    revalidatePath('/', 'layout')
    return { avatarUrl }
  } catch {
    return { error: 'บันทึกรูปไม่สำเร็จ กรุณาลองใหม่ รูปเดิมยังอยู่' }
  }
}
