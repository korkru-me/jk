'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { isInviteToken } from '@/lib/invite-token'
import type { CoTeacherPermission } from '@/lib/types'

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// ─── Read ──────────────────────────────────────────────────────────────────

export async function getClassroomCoTeachers(classroomId: string) {
  const supabase = await createClient()

  const { data: coTeachers } = await supabase
    .from('classroom_co_teachers')
    .select('id, user_id, permission, created_at, users(id, full_name, email)')
    .eq('classroom_id', classroomId)
    .order('created_at', { ascending: true })

  const { data: invites } = await supabase
    .from('classroom_invitations')
    .select('id, token, permission, email, expires_at, created_at')
    .eq('classroom_id', classroomId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  return {
    coTeachers: (coTeachers ?? []).map((t: any) => ({
      id: t.id as string,
      userId: t.user_id as string,
      permission: t.permission as CoTeacherPermission,
      createdAt: t.created_at as string,
      fullName: t.users?.full_name ?? '',
      email: t.users?.email ?? '',
    })),
    invites: (invites ?? []).map((i: any) => ({
      id: i.id as string,
      token: i.token as string,
      permission: i.permission as CoTeacherPermission,
      email: i.email as string | null,
      expiresAt: i.expires_at as string,
      createdAt: i.created_at as string,
    })),
  }
}

// ─── Invite link ───────────────────────────────────────────────────────────

export async function createClassroomInvitation(classroomId: string, permission: CoTeacherPermission) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data, error } = await supabase
    .from('classroom_invitations')
    .insert({ classroom_id: classroomId, permission, created_by: user.id })
    .select('token')
    .single()

  if (error) return { error: error.message }

  revalidatePath(`/classrooms/${classroomId}`)
  return { token: data.token }
}

export async function revokeClassroomInvitation(inviteId: string, classroomId: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('classroom_invitations')
    .delete()
    .eq('id', inviteId)

  if (error) return { error: error.message }
  revalidatePath(`/classrooms/${classroomId}`)
  return { success: true }
}

// ─── Join via token ────────────────────────────────────────────────────────
// The token is the whole secret, so nobody but the room's invite managers can
// read classroom_invitations. The invitee goes through two database functions
// that need the exact token (20260927022004_close_invitation_token_reads.sql).

export async function getClassroomInviteInfo(token: string) {
  if (!isInviteToken(token)) return null
  const supabase = await createClient()
  const { data } = await supabase
    .rpc('get_classroom_invitation_preview', { p_token: token })
    .maybeSingle()

  if (!data) return null
  const invite = data as { classroom_name: string; permission: CoTeacherPermission }
  return { classroomName: invite.classroom_name, permission: invite.permission }
}

export async function acceptClassroomInvitation(token: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'กรุณาเข้าสู่ระบบก่อน' }
  if (!isInviteToken(token)) return { error: 'ลิงก์นี้หมดอายุหรือใช้งานไปแล้ว' }

  // Adds the co-teacher and closes the invite in one transaction. Someone who
  // already teaches the room gets its id back without using the link up.
  const { data: classroomId, error } = await supabase
    .rpc('accept_classroom_invitation', { p_token: token })

  if (error) return { error: 'เข้าร่วมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }
  if (!classroomId) return { error: 'ลิงก์นี้หมดอายุหรือใช้งานไปแล้ว' }

  return { success: true, classroomId: classroomId as string }
}

// ─── Co-teacher management ─────────────────────────────────────────────────

export async function updateCoTeacherPermission(coTeacherId: string, permission: CoTeacherPermission, classroomId: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('classroom_co_teachers')
    .update({ permission })
    .eq('id', coTeacherId)

  if (error) return { error: error.message }
  revalidatePath(`/classrooms/${classroomId}`)
  return { success: true }
}

export async function removeCoTeacher(coTeacherId: string, classroomId: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('classroom_co_teachers')
    .delete()
    .eq('id', coTeacherId)

  if (error) return { error: error.message }
  revalidatePath(`/classrooms/${classroomId}`)
  return { success: true }
}
