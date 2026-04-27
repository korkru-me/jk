'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Variable, MCQOption, QuestionType, Difficulty, Visibility } from '@/lib/types'

export interface QuestionFormData {
  title: string
  question_text: string
  question_type: QuestionType
  difficulty: Difficulty
  visibility: Visibility
  category_id: string
  is_random: boolean
  variables: Variable[]
  answer_formula: string
  answer_unit: string
  answer_tolerance: number
  mcq_options: MCQOption[]
  solution_text: string
}

export async function createQuestion(data: QuestionFormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase.from('questions').insert({
    created_by: user.id,
    category_id: data.category_id || null,
    title: data.title,
    question_text: data.question_text,
    question_type: data.question_type,
    difficulty: data.difficulty,
    visibility: data.visibility,
    is_random: data.is_random,
    variables: data.variables,
    answer_formula: data.answer_formula,
    answer_unit: data.answer_unit || null,
    answer_tolerance: data.answer_tolerance,
    mcq_options: data.question_type === 'mcq' ? data.mcq_options : null,
    solution_text: data.solution_text || null,
  })

  if (error) return { error: error.message }

  revalidatePath('/questions')
  redirect('/questions')
}

export async function updateQuestion(id: string, data: QuestionFormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('questions')
    .update({
      category_id: data.category_id || null,
      title: data.title,
      question_text: data.question_text,
      question_type: data.question_type,
      difficulty: data.difficulty,
      visibility: data.visibility,
      is_random: data.is_random,
      variables: data.variables,
      answer_formula: data.answer_formula,
      answer_unit: data.answer_unit || null,
      answer_tolerance: data.answer_tolerance,
      mcq_options: data.question_type === 'mcq' ? data.mcq_options : null,
      solution_text: data.solution_text || null,
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

export async function getFormulaPresets(categoryId?: string) {
  const supabase = await createClient()
  let query = supabase.from('formula_presets').select('*, question_categories(name)')
  if (categoryId) query = query.eq('category_id', categoryId)
  const { data } = await query
  return data ?? []
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
