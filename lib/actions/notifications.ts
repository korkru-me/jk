'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyOrgId } from '@/lib/actions/org'
import type { Notification } from '@/lib/types'

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getMyNotifications(limit = 20): Promise<Notification[]> {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return []

  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []) as Notification[]
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return 0

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', user.id)
    .eq('is_read', false)

  return count ?? 0
}

export async function markNotificationRead(id: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('recipient_id', user.id)

  if (error) return { error: error.message }
  return { success: true }
}

export async function markAllNotificationsRead() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', user.id)
    .eq('is_read', false)

  if (error) return { error: error.message }
  return { success: true }
}

export async function notifyNonSubmitters(assignmentId: string, classroomId: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  // Re-fetch the assignment via the user-scoped client — RLS doubles as the
  // permission check here (null means the caller isn't the owner or an
  // authorized co-teacher).
  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, title')
    .eq('id', assignmentId)
    .maybeSingle()
  if (!assignment) return { error: 'ไม่มีสิทธิ์ หรือไม่พบชุดข้อสอบ' }

  const orgId = await getMyOrgId()
  if (!orgId) return { error: 'ไม่พบข้อมูลสถาบัน' }

  const admin = createAdminClient()

  const { data: roster } = await admin
    .from('classroom_students')
    .select('student_id')
    .eq('classroom_id', classroomId)
  const rosterIds = (roster ?? []).map((r: any) => r.student_id)
  if (rosterIds.length === 0) return { success: true, notified: 0 }

  const { data: submitted } = await admin
    .from('submissions')
    .select('student_id')
    .eq('assignment_id', assignmentId)
    .in('status', ['submitted', 'graded'])
  const submittedIds = new Set((submitted ?? []).map((s: any) => s.student_id))

  const nonSubmitterIds = rosterIds.filter((id: string) => !submittedIds.has(id))
  if (nonSubmitterIds.length === 0) return { success: true, notified: 0 }

  // Dedupe against an existing unread reminder for this assignment sent in
  // the last 24h, so repeated clicks don't spam students.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await admin
    .from('notifications')
    .select('recipient_id')
    .eq('related_assignment_id', assignmentId)
    .eq('type', 'assignment_reminder')
    .eq('is_read', false)
    .gte('created_at', since)
  const recentlyNotified = new Set((recent ?? []).map((n: any) => n.recipient_id))

  const targets = nonSubmitterIds.filter((id: string) => !recentlyNotified.has(id))
  if (targets.length === 0) return { success: true, notified: 0 }

  const { error } = await admin.from('notifications').insert(
    targets.map((recipient_id: string) => ({
      org_id: orgId,
      recipient_id,
      actor_id: user.id,
      type: 'assignment_reminder' as const,
      title: `อย่าลืมทำ "${assignment.title}"`,
      body: 'ครูส่งการเตือนให้ทำงานที่ยังไม่ได้ส่ง',
      link: `/assignments/${assignmentId}/take`,
      related_assignment_id: assignmentId,
      related_classroom_id: classroomId,
    }))
  )

  if (error) return { error: error.message }
  return { success: true, notified: targets.length }
}
