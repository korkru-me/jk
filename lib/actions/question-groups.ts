'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { randomUUID } from 'crypto'
import { resolveOrgId } from '@/lib/actions/questions'
import type { Variable, Difficulty, Visibility } from '@/lib/types'
import { RETURN_PARAM } from '@/lib/question-return'

export interface SubQuestionData {
  id?: string
  question_text: string
  difficulty: Difficulty
  variables: Variable[]
  answer_formula: string
  answer_unit: string
  answer_tolerance: number
  solution_text: string
  solution_image_urls: string[]
}

export interface QuestionGroupPayload {
  parentId?: string
  groupId?: string
  title: string
  context: string
  category_id: string
  visibility: Visibility
  org_id?: string | null
  /** Other teams (besides org_id) to additionally share this group with. */
  shared_org_ids?: string[]
  /** Whether teammates with access to this group may also edit it (creator can always edit). Default true. */
  team_edit_allowed?: boolean
  difficulty: Difficulty
  subQuestions: SubQuestionData[]
  /** The bank view the editor was opened from, carried through the save redirect. */
  return_query?: string
}

/** Replaces question_shares for every row in the group (parent + sub-questions) with `orgIds`. */
async function syncGroupShares(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
  orgIds: string[]
) {
  const { data: rows } = await supabase.from('questions').select('id').eq('group_id', groupId)
  const ids = (rows ?? []).map((r) => r.id)
  if (ids.length === 0) return

  await supabase.from('question_shares').delete().in('question_id', ids)

  const uniqueOrgIds = [...new Set(orgIds)]
  if (uniqueOrgIds.length > 0) {
    await supabase
      .from('question_shares')
      .insert(ids.flatMap((questionId) => uniqueOrgIds.map((orgId) => ({ question_id: questionId, org_id: orgId }))))
  }
}

export async function saveQuestionGroup(payload: QuestionGroupPayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  if (payload.subQuestions.length === 0) return { error: 'ต้องมีอย่างน้อย 1 ข้อย่อย' }

  // Only the owner may change who this group is shared with — teammates with
  // edit access can fix content, but not reassign ownership/visibility/sharing.
  let isOwner = true
  let existing: { org_id: string | null; visibility: Visibility; team_edit_allowed: boolean } | null = null
  if (payload.parentId) {
    const { data } = await supabase
      .from('questions')
      .select('created_by, org_id, visibility, team_edit_allowed')
      .eq('id', payload.parentId)
      .maybeSingle()
    if (!data) return { error: 'ไม่พบโจทย์กลุ่มนี้' }
    isOwner = data.created_by === user.id
    if (!isOwner && !data.team_edit_allowed) {
      return { error: 'เจ้าของโจทย์กลุ่มไม่อนุญาตให้ทีมแก้ไขโจทย์กลุ่มนี้' }
    }
    existing = data
  }

  const orgResult = isOwner
    ? await resolveOrgId(payload.visibility, payload.org_id)
    : { orgId: existing!.org_id as string }
  if ('error' in orgResult) return orgResult

  const visibility = isOwner ? payload.visibility : existing!.visibility
  const teamEditAllowed = isOwner ? (payload.team_edit_allowed ?? true) : existing!.team_edit_allowed

  const groupId = payload.groupId ?? randomUUID()

  // Upsert parent (order_in_group = 0, holds shared context)
  const parentPayload = {
    org_id: orgResult.orgId,
    category_id: payload.category_id || null,
    title: payload.title,
    question_text: payload.context,
    question_type: 'written' as const,
    difficulty: payload.difficulty,
    visibility,
    team_edit_allowed: teamEditAllowed,
    is_random: false,
    variables: [] as Variable[],
    answer_formula: '',
    answer_unit: null,
    answer_tolerance: 0.01,
    group_id: groupId,
    order_in_group: 0,
  }

  let parentId = payload.parentId
  if (parentId) {
    const { error } = await supabase.from('questions').update(parentPayload).eq('id', parentId)
    if (error) return { error: error.message }
  } else {
    const { data: newParent, error } = await supabase
      .from('questions').insert({ ...parentPayload, created_by: user.id }).select('id').single()
    if (error) return { error: error.message }
    parentId = newParent.id
  }

  // Remove sub-questions that were deleted
  if (payload.groupId) {
    const { data: existingSubs } = await supabase
      .from('questions').select('id').eq('group_id', groupId).gt('order_in_group', 0)
    const keepIds = new Set(payload.subQuestions.filter((s) => s.id).map((s) => s.id!))
    const toDelete = (existingSubs ?? []).filter((s) => !keepIds.has(s.id)).map((s) => s.id)
    if (toDelete.length > 0) {
      await supabase.from('questions').delete().in('id', toDelete)
    }
  }

  // Upsert each sub-question
  for (let i = 0; i < payload.subQuestions.length; i++) {
    const sq = payload.subQuestions[i]
    const subPayload = {
      org_id: orgResult.orgId,
      category_id: payload.category_id || null,
      title: `${payload.title} — ข้อ ${i + 1}`,
      question_text: sq.question_text,
      question_type: 'written' as const,
      difficulty: sq.difficulty,
      visibility,
      team_edit_allowed: teamEditAllowed,
      is_random: sq.variables.some((v) => v.type !== 'reference'),
      variables: sq.variables,
      answer_formula: sq.answer_formula,
      answer_unit: sq.answer_unit || null,
      answer_tolerance: sq.answer_tolerance,
      solution_text: sq.solution_text || null,
      solution_image_urls: sq.solution_image_urls ?? [],
      parent_question_id: parentId,
      group_id: groupId,
      order_in_group: i + 1,
    }
    if (sq.id) {
      const { error } = await supabase.from('questions').update(subPayload).eq('id', sq.id)
      if (error) return { error: error.message }
    } else {
      const { error } = await supabase.from('questions').insert({ ...subPayload, created_by: user.id })
      if (error) return { error: error.message }
    }
  }

  if (isOwner) {
    const extraShares = (visibility === 'organization' || visibility === 'school')
      ? (payload.shared_org_ids ?? []).filter((oid) => oid !== orgResult.orgId)
      : []
    await syncGroupShares(supabase, groupId, extraShares)
  }

  revalidatePath('/questions')
  revalidatePath(`/questions/multi/${groupId}`)
  redirect(
    payload.return_query
      ? `/questions/multi/${groupId}?${RETURN_PARAM}=${encodeURIComponent(payload.return_query)}`
      : `/questions/multi/${groupId}`
  )
}

export async function deleteQuestionGroup(groupId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const { error } = await supabase
    .from('questions').delete().eq('group_id', groupId).eq('created_by', user.id)
  if (error) return { error: error.message }
  revalidatePath('/questions')
}
