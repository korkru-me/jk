'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { randomUUID } from 'crypto'
import type { Variable, Difficulty, Visibility } from '@/lib/types'

export interface SubQuestionData {
  id?: string
  question_text: string
  difficulty: Difficulty
  variables: Variable[]
  answer_formula: string
  answer_unit: string
  answer_tolerance: number
  solution_text: string
}

export interface QuestionGroupPayload {
  parentId?: string
  groupId?: string
  title: string
  context: string
  category_id: string
  visibility: Visibility
  difficulty: Difficulty
  subQuestions: SubQuestionData[]
}

export async function saveQuestionGroup(payload: QuestionGroupPayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  if (payload.subQuestions.length === 0) return { error: 'ต้องมีอย่างน้อย 1 ข้อย่อย' }

  const groupId = payload.groupId ?? randomUUID()

  // Upsert parent (order_in_group = 0, holds shared context)
  const parentPayload = {
    created_by: user.id,
    category_id: payload.category_id || null,
    title: payload.title,
    question_text: payload.context,
    question_type: 'written' as const,
    difficulty: payload.difficulty,
    visibility: payload.visibility,
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
    const { error } = await supabase.from('questions').update(parentPayload).eq('id', parentId).eq('created_by', user.id)
    if (error) return { error: error.message }
  } else {
    const { data: newParent, error } = await supabase.from('questions').insert(parentPayload).select('id').single()
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
      created_by: user.id,
      category_id: payload.category_id || null,
      title: `${payload.title} — ข้อ ${i + 1}`,
      question_text: sq.question_text,
      question_type: 'written' as const,
      difficulty: sq.difficulty,
      visibility: payload.visibility,
      is_random: sq.variables.some((v) => v.type !== 'reference'),
      variables: sq.variables,
      answer_formula: sq.answer_formula,
      answer_unit: sq.answer_unit || null,
      answer_tolerance: sq.answer_tolerance,
      solution_text: sq.solution_text || null,
      parent_question_id: parentId,
      group_id: groupId,
      order_in_group: i + 1,
    }
    if (sq.id) {
      const { error } = await supabase.from('questions').update(subPayload).eq('id', sq.id).eq('created_by', user.id)
      if (error) return { error: error.message }
    } else {
      const { error } = await supabase.from('questions').insert(subPayload)
      if (error) return { error: error.message }
    }
  }

  revalidatePath('/questions')
  revalidatePath(`/questions/multi/${groupId}`)
  redirect(`/questions/multi/${groupId}`)
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
