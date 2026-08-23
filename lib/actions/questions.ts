'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyOrgId } from '@/lib/actions/org'
import { getMyTeamOrgs } from '@/lib/actions/team-org'
import { dedupeTags } from '@/lib/tag-suggest'
import type { Variable, LogicRule, MCQOption, AnswerPart, Question, QuestionType, Difficulty, Visibility, MatchingPair, TrueFalseConfig, FillBlankConfig, OrderingConfig, RandomQuestionConfig, FileUploadConfig, CompositeConfig } from '@/lib/types'

export interface QuestionFormData {
  title: string
  subject: string
  question_text: string
  question_type: QuestionType
  difficulty: Difficulty
  visibility: Visibility
  category_id: string
  grade_level: string
  is_random: boolean
  variables: Variable[]
  logic_rules: LogicRule[]
  answer_parts: AnswerPart[]
  answer_formula: string        // kept in sync with answer_parts[0].formula
  answer_unit: string           // kept in sync with answer_parts[0].unit
  answer_tolerance: number      // kept in sync with answer_parts[0].tolerance
  mcq_options: MCQOption[]
  matching_pairs?: MatchingPair[]
  essay_rubric?: { criterion: string; points: number }[]
  extra_data?: TrueFalseConfig | FillBlankConfig | OrderingConfig | RandomQuestionConfig | FileUploadConfig | CompositeConfig
  solution_text: string
  solution_image_urls?: string[]
  tags: string[]
  image_urls: string[]
  requires_work_image?: boolean
  /** Which team to share to when visibility is 'organization'/'school'. Required
   *  once the user belongs to more than one team; auto-resolved if they have exactly one. */
  org_id?: string | null
  /** Other teams (besides org_id) to additionally share this question with. */
  shared_org_ids?: string[]
  /** Whether teammates with access to this question may also edit it (creator can always edit). Default true. */
  team_edit_allowed?: boolean
  /** Where to redirect after a successful save. Defaults to '/questions'. */
  redirect_to?: string
}

/** Replaces every question_shares row for a question with exactly `orgIds`. */
async function syncQuestionShares(
  supabase: Awaited<ReturnType<typeof createClient>>,
  questionId: string,
  orgIds: string[]
) {
  const uniqueOrgIds = [...new Set(orgIds)]
  await supabase.from('question_shares').delete().eq('question_id', questionId)
  if (uniqueOrgIds.length > 0) {
    await supabase
      .from('question_shares')
      .insert(uniqueOrgIds.map((orgId) => ({ question_id: questionId, org_id: orgId })))
  }
}

/** Every org_id this question is additionally shared to, beyond its home org_id. */
export async function getQuestionShareOrgIds(questionId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('question_shares').select('org_id').eq('question_id', questionId)
  return (data ?? []).map((r) => r.org_id)
}

/** Full question payload for interactions that need it (preview/duplicate).
 *  The question-bank list deliberately ships only lightweight summaries;
 *  RLS still decides whether the current user may read this row. */
export async function getQuestionClientDetail(questionId: string): Promise<
  | { data: Question & { question_categories: { name: string } | null } }
  | { error: string }
> {
  const supabase = await createClient()
  const questionQuery = supabase
    .from('questions')
    .select('*, question_categories(name)')
    .eq('id', questionId)
    .maybeSingle()

  const [{ data: { user } }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    questionQuery,
  ])

  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (error) return { error: error.message }
  if (!data) return { error: 'ไม่พบโจทย์นี้หรือคุณไม่มีสิทธิ์เข้าถึง' }
  return { data: data as unknown as Question & { question_categories: { name: string } | null } }
}

/** 'organization'/'school' (legacy) visibility shares to a specific team org (chosen
 *  by the caller, or the sole team they belong to); anything else (private) is
 *  scoped to the creator's personal workspace org. */
export async function resolveOrgId(visibility: Visibility, chosenOrgId?: string | null): Promise<{ orgId: string } | { error: string }> {
  if (visibility === 'organization' || visibility === 'school') {
    const teams = await getMyTeamOrgs()
    if (teams.length === 0) return { error: 'คุณยังไม่มีทีม กรุณาสร้างหรือเข้าร่วมทีมก่อน' }

    if (chosenOrgId) {
      if (!teams.some(t => t.id === chosenOrgId)) return { error: 'คุณไม่ได้เป็นสมาชิกทีมนี้' }
      return { orgId: chosenOrgId }
    }

    if (teams.length === 1) return { orgId: teams[0].id }
    return { error: 'กรุณาเลือกทีมที่จะแชร์โจทย์นี้' }
  }
  const orgId = await getMyOrgId()
  if (!orgId) return { error: 'ไม่พบข้อมูลสถาบัน กรุณาติดต่อผู้ดูแล' }
  return { orgId }
}

export async function createQuestion(data: QuestionFormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const orgResult = await resolveOrgId(data.visibility, data.org_id)
  if ('error' in orgResult) return orgResult

  const { data: inserted, error } = await supabase.from('questions').insert({
    org_id: orgResult.orgId,
    created_by: user.id,
    category_id: data.category_id || null,
    grade_level: data.grade_level || null,
    subject: data.subject || null,
    title: data.title,
    question_text: data.question_text,
    question_type: data.question_type,
    difficulty: data.difficulty,
    visibility: data.visibility,
    is_random: data.is_random,
    variables: data.variables,
    logic_rules: data.logic_rules,
    answer_parts: data.question_type === 'written' ? data.answer_parts : null,
    answer_formula: data.answer_formula,
    answer_unit: data.answer_unit || null,
    answer_tolerance: data.answer_tolerance,
    mcq_options: resolveMcqOptions(data),
    extra_data: data.extra_data ?? {},
    solution_text: data.solution_text || null,
    solution_image_urls: data.solution_image_urls ?? [],
    tags: data.tags.length > 0 ? data.tags : null,
    image_urls: data.image_urls.length > 0 ? data.image_urls : [],
    requires_work_image: data.question_type === 'written' ? (data.requires_work_image ?? false) : false,
    team_edit_allowed: data.team_edit_allowed ?? true,
  }).select('id').single()

  if (error) return { error: error.message }

  const extraShares = (data.shared_org_ids ?? []).filter((id) => id !== orgResult.orgId)
  if (data.visibility === 'organization' || data.visibility === 'school') {
    await syncQuestionShares(supabase, inserted.id, extraShares)
  }

  revalidatePath('/questions')
  redirect('/questions')
}

function resolveMcqOptions(data: QuestionFormData) {
  if (data.question_type === 'mcq') return data.mcq_options
  if (data.question_type === 'matching') return (data.matching_pairs ?? []) as any
  if (data.question_type === 'essay' && data.essay_rubric?.length) return data.essay_rubric as any
  return null
}

export async function updateQuestion(id: string, data: QuestionFormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data: existing } = await supabase
    .from('questions')
    .select('created_by, org_id, visibility, team_edit_allowed')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return { error: 'ไม่พบโจทย์นี้' }

  const isOwner = existing.created_by === user.id
  if (!isOwner && !existing.team_edit_allowed) {
    return { error: 'เจ้าของโจทย์ไม่อนุญาตให้ทีมแก้ไขโจทย์นี้' }
  }

  // Only the owner may change who this question is shared with — teammates with
  // edit access can fix content, but not reassign ownership/visibility/sharing.
  const orgResult = isOwner
    ? await resolveOrgId(data.visibility, data.org_id)
    : { orgId: existing.org_id as string }
  if ('error' in orgResult) return orgResult

  const { error } = await supabase
    .from('questions')
    .update({
      org_id: orgResult.orgId,
      category_id: data.category_id || null,
      grade_level: data.grade_level || null,
      subject: data.subject || null,
      title: data.title,
      question_text: data.question_text,
      question_type: data.question_type,
      difficulty: data.difficulty,
      visibility: isOwner ? data.visibility : existing.visibility,
      is_random: data.is_random,
      variables: data.variables,
      logic_rules: data.logic_rules,
      answer_parts: data.question_type === 'written' ? data.answer_parts : null,
      answer_formula: data.answer_formula,
      answer_unit: data.answer_unit || null,
      answer_tolerance: data.answer_tolerance,
      mcq_options: resolveMcqOptions(data),
      extra_data: data.extra_data ?? {},
      solution_text: data.solution_text || null,
      solution_image_urls: data.solution_image_urls ?? [],
      tags: data.tags.length > 0 ? data.tags : null,
      image_urls: data.image_urls,
      requires_work_image: data.question_type === 'written' ? (data.requires_work_image ?? false) : false,
      team_edit_allowed: isOwner ? (data.team_edit_allowed ?? true) : existing.team_edit_allowed,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  if (isOwner) {
    const visibility = data.visibility
    const extraShares = (visibility === 'organization' || visibility === 'school')
      ? (data.shared_org_ids ?? []).filter((oid) => oid !== orgResult.orgId)
      : []
    await syncQuestionShares(supabase, id, extraShares)
  }

  revalidatePath('/questions')
  revalidatePath(`/questions/${id}/edit`)
  redirect(data.redirect_to || '/questions')
}

/**
 * Share one question into one team, on top of whatever it is already shared to.
 *
 * `syncQuestionShares` above replaces the whole set, which is what the edit form
 * wants; this is the additive version used by the share menu on a question card.
 *
 * Authorization is the question_shares_owner_all policy: the row only inserts if
 * the caller created the question and belongs to the target org. A failure here
 * is genuinely a refusal, so it must surface rather than report success.
 */
export async function shareQuestionToOrg(questionId: string, orgId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('question_shares')
    .upsert({ question_id: questionId, org_id: orgId }, { onConflict: 'question_id,org_id' })

  if (error) {
    console.error('[shareQuestionToOrg] failed:', error)
    return { error: 'แชร์ไม่สำเร็จ — แชร์ได้เฉพาะโจทย์ที่คุณสร้างเอง และเฉพาะทีมที่คุณเป็นสมาชิก' }
  }

  revalidatePath('/questions')
  return {}
}

export async function setRequiresWorkImage(id: string, value: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('questions')
    .update({ requires_work_image: value })
    .eq('id', id)
    .eq('created_by', user.id)

  if (error) return { error: error.message }

  revalidatePath('/questions')
  revalidatePath('/questions/sets/[id]/edit', 'page')
  revalidatePath('/assignments/new')
}

/**
 * Replaces the whole tag list of one question.
 *
 * The question bank edits tags in place on the card, so this is the one write
 * that touches tags without going through the edit form. Ownership is checked
 * the same way `setRequiresWorkImage` does; `.select()` is what tells an
 * unauthorized write apart from a successful one, because an update that
 * matches no row is not an error.
 */
export async function updateQuestionTags(id: string, tags: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  // Same normalization the tag input applies, so a tag added from the card and
  // the same tag added from the form stay one tag.
  const cleaned = dedupeTags(tags)

  const { data, error } = await supabase
    .from('questions')
    .update({ tags: cleaned.length > 0 ? cleaned : null })
    .eq('id', id)
    .eq('created_by', user.id)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'แก้ไขแท็กได้เฉพาะโจทย์ที่คุณสร้างเอง' }

  revalidatePath('/questions')
  revalidatePath(`/questions/${id}/edit`)
  return { tags: cleaned }
}

export async function deleteQuestion(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('questions')
    .delete()
    .eq('id', id)
    .eq('created_by', user.id)

  if (error) return { error: error.message }

  revalidatePath('/questions')
}

export async function getCategories() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('question_categories')
    .select('*')
    .order('order')
  return data ?? []
}

export async function getAllTags(): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('questions').select('tags')
  if (!data) return []
  const tagSet = new Set<string>()
  for (const row of data) {
    if (Array.isArray(row.tags)) {
      for (const t of row.tags) if (t) tagSet.add(t)
    }
  }
  return [...tagSet].sort()
}

export async function getFormulaPresets(categoryId?: string) {
  const supabase = await createClient()
  let query = supabase.from('formula_presets').select('*, question_categories(name)')
  if (categoryId) query = query.eq('category_id', categoryId)
  const { data } = await query
  return data ?? []
}

export interface CreateFormulaPresetInput {
  formula_name: string
  equation: string
  target_variable: string
  variables: { name: string; min: number; max: number }[]
  description?: string
  category_id?: string | null
}

export async function createFormulaPreset(input: CreateFormulaPresetInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data, error } = await supabase
    .from('formula_presets')
    .insert({
      formula_name: input.formula_name,
      equation: input.equation,
      target_variable: input.target_variable,
      variables: input.variables,
      description: input.description || null,
      category_id: input.category_id || null,
    })
    .select('*, question_categories(name)')
    .single()

  if (error) return { error: error.message }
  return { data }
}

export async function searchQuestions(query: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('questions')
    .select('id, title, answer_formula, variables, answer_unit')
    .eq('created_by', user.id)
    .ilike('title', `%${query}%`)
    .limit(10)

  return data ?? []
}
