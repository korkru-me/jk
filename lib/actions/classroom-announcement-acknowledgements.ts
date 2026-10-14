'use server'

import { revalidatePath } from 'next/cache'
import { getAuthUser } from '@/lib/auth/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeAttachments } from '@/lib/attachment-display'
import { isAnnouncementAcknowledgementEnabled, type PendingClassroomAnnouncement, type AnnouncementAcknowledgementStatus } from '@/lib/classroom-announcement-acknowledgements'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getPendingClassroomAnnouncements(): Promise<{ posts: PendingClassroomAnnouncement[]; error?: string }> {
  if (!isAnnouncementAcknowledgementEnabled(process.env)) return { posts: [] }
  const user = await getAuthUser()
  if (!user) return { posts: [], error: 'กรุณาเข้าสู่ระบบใหม่' }
  // The service-only RPC repeats role and exact roster authorization. Its actor
  // always comes from the verified session, never from a client parameter.
  const { data, error } = await createAdminClient().rpc('pending_classroom_announcements', { p_actor: user.id })
  if (error) return { posts: [], error: 'โหลดประกาศที่ต้องรับทราบไม่สำเร็จ กรุณาลองใหม่' }
  const posts = (data ?? []) as PendingClassroomAnnouncement[]
  return { posts: posts.map(post => ({ ...post, attachments: sanitizeAttachments(post.attachments, process.env.NEXT_PUBLIC_SUPABASE_URL) })) }
}

export async function acknowledgeClassroomAnnouncement(postId: string, round: number) {
  if (!isAnnouncementAcknowledgementEnabled(process.env)) return { error: 'ระบบรับทราบประกาศยังไม่พร้อมใช้งาน' }
  if (!UUID.test(postId) || !Number.isSafeInteger(round) || round < 1 || round > 2147483647) return { error: 'ประกาศไม่ถูกต้อง' }
  const user = await getAuthUser()
  if (!user) return { error: 'กรุณาเข้าสู่ระบบใหม่' }
  const { error } = await createAdminClient().rpc('acknowledge_classroom_announcement', { p_actor: user.id, p_post: postId, p_round: round })
  if (error) return {
    error: error.code === '40001' ? 'ครูแจ้งประกาศนี้ใหม่ กรุณาโหลดประกาศล่าสุดก่อนรับทราบ'
      : error.code === '42501' ? 'ประกาศนี้ไม่พร้อมรับทราบแล้ว กรุณาโหลดรายการล่าสุด' : 'รับทราบประกาศไม่สำเร็จ กรุณาลองใหม่',
    stale: error.code === '40001' || error.code === '42501',
  }
  revalidatePath('/dashboard')
  revalidatePath('/classrooms/[id]', 'page')
  return { success: true as const }
}

export async function remindClassroomAnnouncement(postId: string) {
  if (!isAnnouncementAcknowledgementEnabled(process.env)) return { error: 'ระบบรับทราบประกาศยังไม่พร้อมใช้งาน' }
  if (!UUID.test(postId)) return { error: 'ประกาศไม่ถูกต้อง' }
  const user = await getAuthUser()
  if (!user) return { error: 'กรุณาเข้าสู่ระบบใหม่' }
  const admin = createAdminClient()
  // No privileged resource query before the RPC has authorized this actor.
  const { data, error } = await admin.rpc('remind_classroom_announcement', { p_actor: user.id, p_post: postId })
  if (error) return { error: 'แจ้งเตือนซ้ำไม่สำเร็จ กรุณาลองใหม่' }
  const result = data as { round: number; remindedAt: string }
  revalidatePath('/dashboard')
  revalidatePath('/classrooms/[id]', 'page')
  return result
}

export async function getClassroomAnnouncementAcknowledgementStatus(classroomId: string): Promise<Record<string, AnnouncementAcknowledgementStatus>> {
  if (!isAnnouncementAcknowledgementEnabled(process.env) || !UUID.test(classroomId)) return {}
  const user = await getAuthUser()
  if (!user) return {}
  const { data, error } = await createAdminClient().rpc('classroom_announcement_acknowledgement_status', { p_actor: user.id, p_classroom: classroomId })
  if (error) throw new Error('โหลดสถานะรับทราบประกาศไม่สำเร็จ กรุณาลองใหม่')
  return (data ?? {}) as Record<string, AnnouncementAcknowledgementStatus>
}
