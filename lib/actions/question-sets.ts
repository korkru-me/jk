'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/actions/questions'
import { getMyTeamOrgIds } from '@/lib/actions/team-org'
import {
  normalizeSetSections,
  removeQuestionsFromSet as dropQuestionsFromSet,
  type QuestionSetSection,
} from '@/lib/question-set-sections'
import type { QuestionSet, Visibility } from '@/lib/types'

interface QuestionSetData {
  title: string
  description: string
  question_ids: string[]
  /** แฟ้มย่อย inside the set. Normalized server-side against question_ids, so a
   *  client that sends stale or invented ids can't corrupt the set. */
  sections?: QuestionSetSection[]
  /** Optional and no longer edited anywhere: sets are found by title now. Left
   *  in so a caller that still has tags can write them, and so an update that
   *  omits them keeps whatever an older set was saved with. */
  tags?: string[]
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

  const orgResult = await resolveOrgId(data.visibility, data.org_id)
  if ('error' in orgResult) return orgResult

  const normalized = normalizeSetSections(data.sections ?? [], data.question_ids)

  const { data: set, error } = await supabase
    .from('question_sets')
    .insert({
      org_id: orgResult.orgId,
      created_by: user.id,
      visibility: data.visibility,
      title: data.title.trim(),
      description: data.description.trim() || null,
      question_ids: normalized.question_ids,
      sections: normalized.sections,
      tags: data.tags ?? [],
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

  const orgResult = await resolveOrgId(data.visibility, data.org_id)
  if ('error' in orgResult) return orgResult

  const normalized = normalizeSetSections(data.sections ?? [], data.question_ids)

  const { error } = await supabase
    .from('question_sets')
    .update({
      org_id: orgResult.orgId,
      visibility: data.visibility,
      title: data.title.trim(),
      description: data.description.trim() || null,
      question_ids: normalized.question_ids,
      sections: normalized.sections,
      ...(data.tags ? { tags: data.tags } : {}),
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

/**
 * Files questions into แฟ้ม that already exist, without touching anything else
 * about them.
 *
 * `updateQuestionSet` rewrites a แฟ้ม whole — title, description, visibility,
 * shares, order — which is right for the editor and wrong for "put this โจทย์
 * in that แฟ้ม": a client that only wants to add one id would have to send the
 * แฟ้ม's entire current state back, and anything it got stale would be written
 * over. This adds ids and leaves every other column alone.
 *
 * Several แฟ้ม at once, because the list this is called from drops a โจทย์ the
 * moment it lands in one: a teacher who wants it in three แฟ้ม has to say so
 * now or lose the chance. Several โจทย์ at once for the same reason the list
 * has tick boxes.
 *
 * Order inside a แฟ้ม is the teacher's own, so new ids go at the end. An id the
 * แฟ้ม already holds is skipped rather than repeated, and `sections` is
 * re-normalized against the new membership so แฟ้มย่อย stay valid — a newly
 * added โจทย์ belongs to no แฟ้มย่อย until someone puts it in one.
 *
 * Only the creator's own แฟ้ม can be written: editing a แฟ้ม is creator-only in
 * RLS, and the read below filters by `created_by` as well so a set that is not
 * the caller's is reported as such instead of failing silently.
 */
export type AddQuestionsToSetsResult =
  | { error: string }
  | {
    /** Which แฟ้ม took something, for the message the list prints. A แฟ้ม that
     *  already held every โจทย์ picked reports 0 rather than an error. */
    sets: { title: string; added: number }[]
    failedCount: number
  }

export async function addQuestionsToSets(
  setIds: string[],
  questionIds: string[],
): Promise<AddQuestionsToSetsResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const wantedSetIds = [...new Set(setIds)].filter(Boolean)
  const wantedQuestionIds = [...new Set(questionIds)].filter(Boolean)
  if (wantedSetIds.length === 0) return { error: 'ยังไม่ได้เลือกแฟ้มโจทย์' }
  if (wantedQuestionIds.length === 0) return { error: 'ยังไม่ได้เลือกโจทย์' }

  const { data: sets, error: readError } = await supabase
    .from('question_sets')
    .select('id, title, question_ids, sections')
    .in('id', wantedSetIds)
    .eq('created_by', user.id)
  if (readError) return { error: readError.message }
  if (!sets || sets.length === 0) return { error: 'ไม่พบแฟ้มโจทย์ที่เลือก หรือไม่ใช่แฟ้มของคุณ' }

  const results = await Promise.all(sets.map(async (set: any) => {
    const current = (set.question_ids ?? []) as string[]
    const existing = new Set(current)
    const incoming = wantedQuestionIds.filter(id => !existing.has(id))
    if (incoming.length === 0) return { title: set.title as string, added: 0, error: null }

    const normalized = normalizeSetSections(set.sections ?? [], [...current, ...incoming])
    const { error } = await supabase
      .from('question_sets')
      .update({ question_ids: normalized.question_ids, sections: normalized.sections })
      .eq('id', set.id)
    return { title: set.title as string, added: incoming.length, error: error?.message ?? null }
  }))

  const failed = results.filter(result => result.error)
  if (failed.length === sets.length) return { error: failed[0].error ?? 'เพิ่มโจทย์เข้าแฟ้มไม่สำเร็จ' }

  revalidatePath('/questions/sets')
  return {
    sets: results.filter(result => !result.error).map(({ title, added }) => ({ title, added })),
    failedCount: failed.length,
  }
}

export type RemoveQuestionsFromSetResult = { error: string } | { title: string; removed: number }

/**
 * Takes questions out of one แฟ้ม, leaving them in คลังโจทย์.
 *
 * The counterpart of `addQuestionsToSets`, and the reason the โจทย์ browser can
 * show what is inside a แฟ้ม rather than only what is outside every แฟ้ม: a
 * teacher reading through แฟ้ม พลังงาน and finding a question that does not
 * belong there should be able to say so from where they are standing.
 *
 * Removing from a แฟ้ม is not deleting: the question stays in the คลัง, and งาน
 * already assigned from this แฟ้ม are untouched — they snapshot their questions
 * at creation. `sections` is re-normalized so a removed question also leaves
 * whatever แฟ้มย่อย held it, which is what `removeQuestionsFromSet` in
 * `lib/question-set-sections.ts` already encodes for the แฟ้ม editor.
 */
export async function removeQuestionsFromQuestionSet(
  setId: string,
  questionIds: string[],
): Promise<RemoveQuestionsFromSetResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const removing = [...new Set(questionIds)].filter(Boolean)
  if (removing.length === 0) return { error: 'ยังไม่ได้เลือกโจทย์' }

  const { data: set, error: readError } = await supabase
    .from('question_sets')
    .select('id, title, question_ids, sections')
    .eq('id', setId)
    .eq('created_by', user.id)
    .maybeSingle()
  if (readError) return { error: readError.message }
  if (!set) return { error: 'ไม่พบแฟ้มโจทย์ หรือไม่ใช่แฟ้มของคุณ' }

  const current = ((set as any).question_ids ?? []) as string[]
  const held = removing.filter(id => current.includes(id))
  if (held.length === 0) return { title: (set as any).title as string, removed: 0 }

  const normalized = dropQuestionsFromSet((set as any).sections ?? [], current, held)
  const { error } = await supabase
    .from('question_sets')
    .update({ question_ids: normalized.question_ids, sections: normalized.sections })
    .eq('id', setId)
  if (error) return { error: error.message }

  revalidatePath('/questions/sets')
  return { title: (set as any).title as string, removed: held.length }
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
