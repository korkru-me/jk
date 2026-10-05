'use server'

import { createClient } from '@/lib/supabase/server'
import type { Question } from '@/lib/types'

export type QuestionPreviewDetail = Pick<Question,
  'id' | 'title' | 'question_text' | 'question_type' | 'is_random' | 'variables'
  | 'answer_parts' | 'mcq_options' | 'image_urls' | 'extra_data'
>

/** Teacher previews only, through the caller's session and question-bank RLS.
 * Bounded batches avoid one Server Action/session lookup per question. */
export async function getQuestionPreviewDetails(ids: readonly string[]): Promise<
  { data: QuestionPreviewDetail[] } | { error: string }
> {
  if (!Array.isArray(ids) || ids.length > 50 || ids.some(id => typeof id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    return { error: 'รายการโจทย์ไม่ถูกต้อง' }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (ids.length === 0) return { data: [] }
  const { data, error } = await supabase.from('questions')
    .select('id,title,question_text,question_type,is_random,variables,answer_parts,mcq_options,image_urls,extra_data')
    .in('id', [...new Set(ids)])
    .eq('is_research_snapshot', false)
  if (error) return { error: 'โหลดโจทย์ไม่สำเร็จ กรุณาลองอีกครั้ง' }
  return { data: (data ?? []) as unknown as QuestionPreviewDetail[] }
}
