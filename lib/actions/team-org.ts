'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { OrgType, TeamOrg, TeamOrgMember } from '@/lib/types'

const REVALIDATE = () => revalidatePath('/settings/team')

interface TeamOrgData {
  org: TeamOrg
  myRole: 'owner' | 'teacher'
  currentUserId: string
  members: TeamOrgMember[]
}

// ─── Read ──────────────────────────────────────────────────────────────────

/** Every team (school/team) org the current user belongs to — distinct from
 *  their personal workspace org. A teacher/admin may belong to any number. */
export async function getMyTeamOrgs(): Promise<(TeamOrg & { myRole: 'owner' | 'teacher' })[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('organization_members')
    .select('org_role, joined_at, organizations!inner(id, name, type, invite_code, is_personal)')
    .eq('user_id', user.id)
    .eq('organizations.is_personal', false)
    .order('joined_at', { ascending: true })

  return (data ?? []).map((m: any) => ({
    id: m.organizations.id,
    name: m.organizations.name,
    type: m.organizations.type,
    invite_code: m.organizations.invite_code,
    myRole: m.org_role as 'owner' | 'teacher',
  }))
}

/** Lightweight {id, name} list for the team picker in the question editor. */
export async function getMyTeamOrgOptions(): Promise<{ id: string; name: string }[]> {
  const orgs = await getMyTeamOrgs()
  return orgs.map(o => ({ id: o.id, name: o.name }))
}

/** org_ids of every team the user belongs to — used to query team-shared questions. */
export async function getMyTeamOrgIds(): Promise<string[]> {
  const orgs = await getMyTeamOrgs()
  return orgs.map(o => o.id)
}

/** Full detail (members list) for one specific team org — only if the caller is a member. */
export async function getTeamOrgData(orgId: string): Promise<TeamOrgData | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_role, organizations!inner(id, name, type, invite_code, is_personal)')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .eq('organizations.is_personal', false)
    .maybeSingle()

  if (!membership) return null

  const org = membership.organizations as any

  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id, org_role, joined_at, users(full_name, email)')
    .eq('org_id', org.id)
    .order('joined_at', { ascending: true })

  return {
    org: { id: org.id, name: org.name, type: org.type, invite_code: org.invite_code },
    myRole: membership.org_role as 'owner' | 'teacher',
    currentUserId: user.id,
    members: (members ?? []).map((m: any) => ({
      userId: m.user_id,
      role: m.org_role as 'owner' | 'teacher',
      joinedAt: m.joined_at as string,
      fullName: m.users?.full_name ?? '',
      email: m.users?.email ?? '',
    })),
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function canManageTeam(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('users').select('role').eq('id', userId).maybeSingle()
  return data?.role === 'teacher' || data?.role === 'admin'
}

async function getMembership(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, orgId: string) {
  const { data } = await supabase
    .from('organization_members')
    .select('org_id, org_role, organizations!inner(is_personal)')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .eq('organizations.is_personal', false)
    .maybeSingle()
  return data
}

// ─── Create ────────────────────────────────────────────────────────────────

export async function createTeamOrg(name: string, type: OrgType) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  if (!(await canManageTeam(supabase, user.id))) {
    return { error: 'เฉพาะครูหรือผู้ดูแลเท่านั้นที่สร้างองค์กรได้' }
  }

  if (!name.trim()) return { error: 'กรุณากรอกชื่อองค์กร' }

  const { data: codeData, error: codeError } = await supabase.rpc('generate_invite_code')
  if (codeError) return { error: codeError.message }

  const admin = createAdminClient()
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({ name: name.trim(), type, invite_code: codeData, is_personal: false, subscription_tier: 'free' })
    .select('id, name, type, invite_code')
    .single()

  if (orgError) return { error: orgError.message }

  const { error: memberError } = await admin
    .from('organization_members')
    .insert({ org_id: org.id, user_id: user.id, org_role: 'owner' })

  if (memberError) return { error: memberError.message }

  REVALIDATE()
  return { data: org as TeamOrg }
}

// ─── Join ──────────────────────────────────────────────────────────────────

export async function joinTeamOrgByCode(code: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  if (!(await canManageTeam(supabase, user.id))) {
    return { error: 'เฉพาะครูหรือผู้ดูแลเท่านั้นที่เข้าร่วมองค์กรได้' }
  }

  const admin = createAdminClient()
  const { data: org } = await admin
    .from('organizations')
    .select('id, name, type, invite_code')
    .eq('invite_code', code.trim().toUpperCase())
    .eq('is_personal', false)
    .maybeSingle()

  if (!org) return { error: 'ไม่พบรหัสนี้ กรุณาตรวจสอบอีกครั้ง' }

  const { data: existing } = await admin
    .from('organization_members')
    .select('id')
    .eq('org_id', org.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) return { error: 'คุณเป็นสมาชิกองค์กรนี้อยู่แล้ว' }

  const { error } = await admin
    .from('organization_members')
    .insert({ org_id: org.id, user_id: user.id, org_role: 'teacher' })

  if (error) return { error: error.message }

  REVALIDATE()
  return { data: org as TeamOrg }
}

// ─── Leave / Delete ─────────────────────────────────────────────────────────

export async function leaveTeamOrg(orgId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const membership = await getMembership(supabase, user.id, orgId)
  if (!membership) return { error: 'คุณไม่ได้อยู่ในองค์กรนี้' }

  if (membership.org_role === 'owner') {
    return { error: 'เจ้าของไม่สามารถออกได้ กรุณาโอนสิทธิ์ก่อน หรือลบองค์กร' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('organization_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  REVALIDATE()
  return { success: true }
}

export async function deleteTeamOrg(orgId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const membership = await getMembership(supabase, user.id, orgId)
  if (!membership) return { error: 'คุณไม่ได้อยู่ในองค์กรนี้' }

  if (membership.org_role !== 'owner') return { error: 'ไม่มีสิทธิ์' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('organizations')
    .delete()
    .eq('id', orgId)

  if (error) return { error: error.message }

  REVALIDATE()
  return { success: true }
}
