'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyOrgId } from '@/lib/actions/org'
import type { Variable, LogicRule, MCQOption, AnswerPart, QuestionType, Difficulty, Visibility, MatchingPair, TrueFalseConfig, FillBlankConfig, OrderingConfig, RandomQuestionConfig } from '@/lib/types'

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
  extra_data?: TrueFalseConfig | FillBlankConfig | OrderingConfig | RandomQuestionConfig
  solution_text: string
  tags: string[]
  image_urls: string[]
}

export async function createQuestion(data: QuestionFormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const orgId = await getMyOrgId()
  if (!orgId) return { error: 'ไม่พบข้อมูลสถาบัน กรุณาติดต่อผู้ดูแล' }

  const { error } = await supabase.from('questions').insert({
    org_id: orgId,
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
    tags: data.tags.length > 0 ? data.tags : null,
    image_urls: data.image_urls.length > 0 ? data.image_urls : [],
  })

  if (error) return { error: error.message }

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

  const { error } = await supabase
    .from('questions')
    .update({
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
      tags: data.tags.length > 0 ? data.tags : null,
      image_urls: data.image_urls,
    })
    .eq('id', id)
    .eq('created_by', user.id)

  if (error) return { error: error.message }

  revalidatePath('/questions')
  revalidatePath(`/questions/${id}/edit`)
  redirect('/questions')
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
