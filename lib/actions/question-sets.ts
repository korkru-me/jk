'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyOrgId } from '@/lib/actions/org'
import type { QuestionSet } from '@/lib/types'

interface QuestionSetData {
  title: string
  description: string
  question_ids: string[]
  tags: string[]
}

export async function createQuestionSet(data: QuestionSetData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  if (data.question_ids.length === 0) return { error: 'กรุณาเลือกโจทย์อย่างน้อย 1 ข้อ' }

  const orgId = await getMyOrgId()
  if (!orgId) return { error: 'ไม่พบข้อมูลสถาบัน กรุณาติดต่อผู้ดูแล' }

  const { data: set, error } = await supabase
    .from('question_sets')
    .insert({
      org_id: orgId,
      created_by: user.id,
      title: data.title.trim(),
      description: data.description.trim() || null,
      question_ids: data.question_ids,
      tags: data.tags,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/questions/sets')
  return { id: set.id as string }
}

export async function updateQuestionSet(id: string, data: QuestionSetData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  if (data.question_ids.length === 0) return { error: 'กรุณาเลือกโจทย์อย่างน้อย 1 ข้อ' }

  const { error } = await supabase
    .from('question_sets')
    .update({
      title: data.title.trim(),
      description: data.description.trim() || null,
      question_ids: data.question_ids,
      tags: data.tags,
    })
    .eq('id', id)

  if (error) return { error: error.message }

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

export async function getQuestionSet(id: string): Promise<QuestionSet | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('question_sets')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  return data as QuestionSet | null
}
