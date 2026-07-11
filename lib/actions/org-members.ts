'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const REVALIDATE = () => revalidatePath('/settings/organization')

// ─── Read ──────────────────────────────────────────────────────────────────

export async function getOrgData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // org the user belongs to (primary)
  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_id, org_role, organizations(id, name, subscription_tier, is_personal)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) return null

  const org = membership.organizations as any
  const myRole = membership.org_role

  // all members of this org
  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id, org_role, joined_at, users(id, full_name, email, avatar_url)')
    .eq('org_id', org.id)
    .order('joined_at', { ascending: true })

  // active invite links (not expired, not used)
  const { data: invites } = await supabase
    .from('org_invitations')
    .select('id, token, role, email, expires_at, created_at')
    .eq('org_id', org.id)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  return {
    org: org as { id: string; name: string; subscription_tier: string; is_personal: boolean },
    myRole: myRole as 'owner' | 'admin' | 'teacher' | 'student',
    currentUserId: user.id,
    members: (members ?? []).map((m: any) => ({
      userId: m.user_id,
      role: m.org_role as string,
      joinedAt: m.joined_at as string,
      fullName: m.users?.full_name ?? '',
      email: m.users?.email ?? '',
    })),
    invites: (invites ?? []).map((i: any) => ({
      id: i.id as string,
      token: i.token as string,
      role: i.role as string,
      email: i.email as string | null,
      expiresAt: i.expires_at as string,
      createdAt: i.created_at as string,
    })),
  }
}

// ─── Invite by email ───────────────────────────────────────────────────────

export async function inviteMemberByEmail(email: string, role: 'admin' | 'teacher' | 'student') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const orgId = await getCallerOrgId(supabase, user.id)
  if (!orgId) return { error: 'ไม่พบ org' }

  const myRole = await getCallerOrgRole(supabase, user.id, orgId)
  if (!['owner', 'admin'].includes(myRole ?? '')) return { error: 'ไม่มีสิทธิ์' }

  // ค้นหา user จาก email โดยใช้ admin client
  const admin = createAdminClient()
  const { data: target } = await admin
    .from('users')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()

  if (!target) return { error: 'ไม่พบผู้ใช้ที่มีอีเมลนี้ในระบบ กรุณาให้พวกเขาสมัครก่อน' }

  // ตรวจสอบว่าเป็นสมาชิกอยู่แล้วหรือไม่
  const { data: existing } = await supabase
    .from('organization_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', target.id)
    .maybeSingle()

  if (existing) return { error: 'ผู้ใช้นี้เป็นสมาชิกอยู่แล้ว' }

  const { error } = await admin
    .from('organization_members')
    .insert({ org_id: orgId, user_id: target.id, org_role: role })

  if (error) return { error: error.message }

  REVALIDATE()
  return { success: true }
}

// ─── Invite link ───────────────────────────────────────────────────────────

export async function createInviteLink(role: 'admin' | 'teacher' | 'student') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const orgId = await getCallerOrgId(supabase, user.id)
  if (!orgId) return { error: 'ไม่พบ org' }

  const myRole = await getCallerOrgRole(supabase, user.id, orgId)
  if (!['owner', 'admin'].includes(myRole ?? '')) return { error: 'ไม่มีสิทธิ์' }

  const { data, error } = await supabase
    .from('org_invitations')
    .insert({ org_id: orgId, role, created_by: user.id })
    .select('token')
    .single()

  if (error) return { error: error.message }

  REVALIDATE()
  return { token: data.token }
}

export async function revokeInvite(inviteId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('org_invitations')
    .delete()
    .eq('id', inviteId)

  if (error) return { error: error.message }
  REVALIDATE()
  return { success: true }
}

// ─── Join via token ────────────────────────────────────────────────────────

export async function getInviteInfo(token: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('org_invitations')
    .select('id, role, org_id, organizations(name)')
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (!data) return null
  const org = data.organizations as any
  return { inviteId: data.id, role: data.role, orgName: org?.name ?? '' }
}

export async function joinByToken(token: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'กรุณาเข้าสู่ระบบก่อน' }

  const { data: invite } = await supabase
    .from('org_invitations')
    .select('id, org_id, role')
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (!invite) return { error: 'ลิงก์นี้หมดอายุหรือใช้งานไปแล้ว' }

  // ตรวจสอบว่าเป็นสมาชิกอยู่แล้วหรือไม่
  const { data: existing } = await supabase
    .from('organization_members')
    .select('id')
    .eq('org_id', invite.org_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing) {
    const admin = createAdminClient()
    const { error } = await admin
      .from('organization_members')
      .insert({ org_id: invite.org_id, user_id: user.id, org_role: invite.role })
    if (error) return { error: error.message }
  }

  // mark invite as used
  await supabase
    .from('org_invitations')
    .update({ used_at: new Date().toISOString() })
    .eq('id', invite.id)

  return { success: true, orgId: invite.org_id }
}

// ─── Member management ─────────────────────────────────────────────────────

export async function updateMemberRole(targetUserId: string, newRole: 'admin' | 'teacher' | 'student') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const orgId = await getCallerOrgId(supabase, user.id)
  if (!orgId) return { error: 'ไม่พบ org' }

  const myRole = await getCallerOrgRole(supabase, user.id, orgId)
  if (!['owner', 'admin'].includes(myRole ?? '')) return { error: 'ไม่มีสิทธิ์' }

  // ป้องกัน owner ถูกเปลี่ยน role
  const { data: targetMember } = await supabase
    .from('organization_members')
    .select('org_role')
    .eq('org_id', orgId)
    .eq('user_id', targetUserId)
    .maybeSingle()

  if (targetMember?.org_role === 'owner') return { error: 'ไม่สามารถเปลี่ยน role ของ owner ได้' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('organization_members')
    .update({ org_role: newRole })
    .eq('org_id', orgId)
    .eq('user_id', targetUserId)

  if (error) return { error: error.message }
  REVALIDATE()
  return { success: true }
}

export async function removeMember(targetUserId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const orgId = await getCallerOrgId(supabase, user.id)
  if (!orgId) return { error: 'ไม่พบ org' }

  const myRole = await getCallerOrgRole(supabase, user.id, orgId)
  if (!['owner', 'admin'].includes(myRole ?? '')) return { error: 'ไม่มีสิทธิ์' }

  const { data: targetMember } = await supabase
    .from('organization_members')
    .select('org_role')
    .eq('org_id', orgId)
    .eq('user_id', targetUserId)
    .maybeSingle()

  if (targetMember?.org_role === 'owner') return { error: 'ไม่สามารถลบ owner ออกได้' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('organization_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', targetUserId)

  if (error) return { error: error.message }
  REVALIDATE()
  return { success: true }
}

export async function renameOrg(name: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const orgId = await getCallerOrgId(supabase, user.id)
  if (!orgId) return { error: 'ไม่พบ org' }

  const myRole = await getCallerOrgRole(supabase, user.id, orgId)
  if (!['owner', 'admin'].includes(myRole ?? '')) return { error: 'ไม่มีสิทธิ์' }

  const { error } = await supabase
    .from('organizations')
    .update({ name: name.trim() })
    .eq('id', orgId)

  if (error) return { error: error.message }
  REVALIDATE()
  return { success: true }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function getCallerOrgId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.org_id ?? null
}

async function getCallerOrgRole(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, orgId: string) {
  const { data } = await supabase
    .from('organization_members')
    .select('org_role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data?.org_role ?? null
}
