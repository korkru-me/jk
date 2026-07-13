'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
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

export async function getClassroomInviteInfo(token: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('classroom_invitations')
    .select('id, permission, classroom_id, classrooms(name)')
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (!data) return null
  const classroom = data.classrooms as any
  return { inviteId: data.id, permission: data.permission as CoTeacherPermission, classroomName: classroom?.name ?? '', classroomId: data.classroom_id as string }
}

export async function acceptClassroomInvitation(token: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'กรุณาเข้าสู่ระบบก่อน' }

  const { data: invite } = await supabase
    .from('classroom_invitations')
    .select('id, classroom_id, permission, created_by')
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (!invite) return { error: 'ลิงก์นี้หมดอายุหรือใช้งานไปแล้ว' }

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('classroom_co_teachers')
    .select('id')
    .eq('classroom_id', invite.classroom_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing) {
    const { error } = await admin
      .from('classroom_co_teachers')
      .insert({
        classroom_id: invite.classroom_id,
        user_id: user.id,
        permission: invite.permission,
        invited_by: invite.created_by,
      })
    if (error) return { error: error.message }
  }

  await supabase
    .from('classroom_invitations')
    .update({ used_at: new Date().toISOString(), used_by: user.id })
    .eq('id', invite.id)

  return { success: true, classroomId: invite.classroom_id as string }
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
