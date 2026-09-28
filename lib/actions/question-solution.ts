'use server'

import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import {
  buildQuestionSolution,
  type QuestionSolution,
  type SolutionColumns,
  type SolutionStepRow,
} from '@/lib/question-solution'

/** The listed row, as far as its เฉลย is concerned. */
type ListedRow = SolutionColumns & {
  id: string
  title: string
  group_id: string | null
  order_in_group: number | null
}

const LOAD_FAILED = 'โหลดเฉลยไม่สำเร็จ — ปิดหน้าต่างนี้แล้วกด “ดูเฉลย” อีกครั้ง'

/**
 * The เฉลย behind one card's ดูเฉลย button — for a โจทย์หลายขั้นตอน, the เฉลย
 * of every step.
 *
 * Read with the signed-in teacher's own client, so RLS decides which โจทย์ may
 * be opened exactly as it decides the list the card came from: their own, and
 * those their teams share. Only the เฉลย columns and what labels them are read;
 * the answer key and the rest of the row stay in the database.
 */
export async function getQuestionSolution(
  questionId: string,
): Promise<{ data: QuestionSolution } | { error: string }> {
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('questions')
    .select('id, title, group_id, order_in_group, solution_text, solution_image_urls')
    .eq('id', questionId)
    .eq('is_research_snapshot', false)
    .maybeSingle()

  if (error) {
    console.error('[question-solution] row read failed:', error)
    return { error: LOAD_FAILED }
  }
  if (!data) return { error: 'ไม่พบโจทย์นี้หรือคุณไม่มีสิทธิ์เข้าถึง' }
  const row = data as unknown as ListedRow

  // Only a group's listed row sends us to its steps; the group id comes from
  // the row just read, never from the caller.
  let steps: SolutionStepRow[] = []
  if (row.order_in_group === 0 && row.group_id) {
    const { data: stepRows, error: stepError } = await supabase
      .from('questions')
      .select('id, order_in_group, question_text, solution_text, solution_image_urls')
      .eq('group_id', row.group_id)
      .gt('order_in_group', 0)
      .order('order_in_group', { ascending: true })
    if (stepError) {
      console.error('[question-solution] step read failed:', stepError)
      return { error: LOAD_FAILED }
    }
    steps = (stepRows ?? []) as unknown as SolutionStepRow[]
  }

  return { data: buildQuestionSolution(row, steps) }
}
