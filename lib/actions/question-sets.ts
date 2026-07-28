'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/actions/questions'
import { getMyTeamOrgIds } from '@/lib/actions/team-org'
import type { QuestionSet, Visibility } from '@/lib/types'

interface QuestionSetData {
  title: string
  description: string
  question_ids: string[]
  tags: string[]
  visibility: Visibility
  /** Which team to share to when visibility is 'organization'. Required once
   *  the user belongs to more than one team; auto-resolved if they have exactly one. */
  org_id?: string | null
  /** Other teams (besides org_id) to additionally share this set with. */
  shared_org_ids?: string[]
}

export interface QuestionSetWithCreator extends QuestionSet {
  /** Absent for a caller's own sets (getMyQuestionSets doesn't join these). */
  users?: { full_name: string } | null
  organizations?: { name: string } | null
  /** Names of teams this set was additionally shared to, beyond its home org. */
  shared_org_names?: string[]
}

/** Replaces every question_set_shares row for a set with exactly `orgIds`. */
async function syncQuestionSetShares(
  supabase: Awaited<ReturnType<typeof createClient>>,
  setId: string,
  orgIds: string[]
) {
  const uniqueOrgIds = [...new Set(orgIds)]
  await supabase.from('question_set_shares').delete().eq('question_set_id', setId)
  if (uniqueOrgIds.length > 0) {
    await supabase
      .from('question_set_shares')
      .insert(uniqueOrgIds.map((orgId) => ({ question_set_id: setId, org_id: orgId })))
  }
}

/** Every org_id this set is additionally shared to, beyond its home org_id. */
export async function getQuestionSetShareOrgIds(setId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('question_set_shares').select('org_id').eq('question_set_id', setId)
  return (data ?? []).map((r) => r.org_id)
}

export async function createQuestionSet(data: QuestionSetData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  if (data.question_ids.length === 0) return { error: 'กรุณาเลือกโจทย์อย่างน้อย 1 ข้อ' }

  const orgResult = await resolveOrgId(data.visibility, data.org_id)
  if ('error' in orgResult) return orgResult

  const { data: set, error } = await supabase
    .from('question_sets')
    .insert({
      org_id: orgResult.orgId,
      created_by: user.id,
      visibility: data.visibility,
      title: data.title.trim(),
      description: data.description.trim() || null,
      question_ids: data.question_ids,
      tags: data.tags,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  if (data.visibility === 'organization' || data.visibility === 'school') {
    const extraShares = (data.shared_org_ids ?? []).filter((id) => id !== orgResult.orgId)
    await syncQuestionSetShares(supabase, set.id, extraShares)
  }

  revalidatePath('/questions/sets')
  return { id: set.id as string }
}

export async function updateQuestionSet(id: string, data: QuestionSetData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  if (data.question_ids.length === 0) return { error: 'กรุณาเลือกโจทย์อย่างน้อย 1 ข้อ' }

  const orgResult = await resolveOrgId(data.visibility, data.org_id)
  if ('error' in orgResult) return orgResult

  const { error } = await supabase
    .from('question_sets')
    .update({
      org_id: orgResult.orgId,
      visibility: data.visibility,
      title: data.title.trim(),
      description: data.description.trim() || null,
      question_ids: data.question_ids,
      tags: data.tags,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  const extraShares = (data.visibility === 'organization' || data.visibility === 'school')
    ? (data.shared_org_ids ?? []).filter((oid) => oid !== orgResult.orgId)
    : []
  await syncQuestionSetShares(supabase, id, extraShares)

  revalidatePath('/questions/sets')
  redirect('/questions/sets')
}

export async function deleteQuestionSet(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('question_sets')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/questions/sets')
  return { success: true }
}

export async function getMyQuestionSets(): Promise<QuestionSet[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('question_sets')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })

  return (data ?? []) as QuestionSet[]
}

/** Sets visible via a team — either its home org or an additional share. */
export async function getTeamQuestionSets(): Promise<QuestionSetWithCreator[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const teamOrgIds = await getMyTeamOrgIds()
  if (teamOrgIds.length === 0) return []

  const [{ data: primaryData }, { data: shareRows }] = await Promise.all([
    supabase
      .from('question_sets')
      .select('*, users(full_name), organizations!question_sets_org_id_fkey(name)')
      .in('org_id', teamOrgIds)
      .eq('visibility', 'organization')
      .order('created_at', { ascending: false }),
    supabase
      .from('question_set_shares')
      .select('question_set_id, org_id, organizations(name)')
      .in('org_id', teamOrgIds),
  ])

  const sharedNamesBySet = new Map<string, string[]>()
  const sharedIdsBySet = new Map<string, string[]>()
  for (const row of (shareRows ?? []) as any[]) {
    const name = row.organizations?.name
    if (!name) continue
    sharedNamesBySet.set(row.question_set_id, [...(sharedNamesBySet.get(row.question_set_id) ?? []), name])
    sharedIdsBySet.set(row.question_set_id, [...(sharedIdsBySet.get(row.question_set_id) ?? []), row.org_id])
  }

  const sharedOnlyIds = [...sharedNamesBySet.keys()]
  let sharedOnlyData: QuestionSetWithCreator[] = []
  if (sharedOnlyIds.length > 0) {
    const { data } = await supabase
      .from('question_sets')
      .select('*, users(full_name), organizations!question_sets_org_id_fkey(name)')
      .in('id', sharedOnlyIds)
      .order('created_at', { ascending: false })
    sharedOnlyData = (data ?? []) as QuestionSetWithCreator[]
  }

  const byId = new Map<string, QuestionSetWithCreator>()
  for (const s of [...(primaryData ?? []), ...sharedOnlyData] as QuestionSetWithCreator[]) {
    byId.set(s.id, {
      ...s,
      shared_org_names: sharedNamesBySet.get(s.id) ?? [],
      shared_org_ids: sharedIdsBySet.get(s.id) ?? [],
    })
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export async function getQuestionSet(id: string): Promise<QuestionSet | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('question_sets')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  return data as QuestionSet | null
}
