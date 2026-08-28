'use server'

import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import {
  CARD_DATA_MAX_IDS,
  EMPTY_CARD_DATA,
  fetchDuplicateCounts,
  fetchQuestionStats,
  fetchSetMemberships,
  type QuestionCardData,
  type QuestionCardDetail,
} from '@/lib/question-card-data'
import { fetchSubQuestionCounts } from '@/lib/question-sub-counts'

/** One row of the detail read, before the joined category is flattened. */
type DetailRow = {
  id: string
  subject: string | null
  group_id: string | null
  order_in_group: number | null
  content_fingerprint: string | null
  question_categories: { name: string } | null
}

/**
 * Everything the คลังโจทย์ card shows that the แฟ้มโจทย์ editor does not
 * already hold, fetched for the cards currently on screen.
 *
 * The editor loads the whole คลัง up front for its picker, and that list is
 * deliberately narrow — id, title, wording, ระดับ, ชนิด, แท็ก and nothing else.
 * Widening it to draw badges would make every page that opens a picker pay for
 * hundreds of rows nobody is looking at. So the rest arrives from here instead:
 * with the page for the first screenful, then on demand as the reader turns
 * the page. A แฟ้ม of a thousand โจทย์ therefore costs what a แฟ้ม of twenty
 * does.
 *
 * Failure is silent by design — a missing badge or an absent สถิติ strip is a
 * far better outcome than an editor that will not open.
 */
export async function getQuestionCardData(questionIds: string[]): Promise<QuestionCardData> {
  const user = await getAuthUser()
  if (!user) return EMPTY_CARD_DATA

  const ids = [...new Set(questionIds)].slice(0, CARD_DATA_MAX_IDS)
  if (ids.length === 0) return EMPTY_CARD_DATA

  const supabase = await createClient()

  // RLS already limits this to questions the reader may see; the created_by
  // filter narrows it further to their own, which is the only scope the
  // duplicate badge is ever counted over.
  const { data, error } = await supabase
    .from('questions')
    .select('id, subject, group_id, order_in_group, content_fingerprint, question_categories(name)')
    .eq('created_by', user.id)
    .in('id', ids)

  if (error) {
    console.error('[question-card-data] detail query failed:', error)
    return EMPTY_CARD_DATA
  }

  const rows = (data ?? []) as unknown as DetailRow[]
  const details: Record<string, QuestionCardDetail> = {}
  for (const row of rows) {
    details[row.id] = {
      subject: row.subject,
      category: row.question_categories?.name ?? null,
      group_id: row.group_id,
      order_in_group: row.order_in_group,
    }
  }

  const [stats, subQuestionCounts, duplicateCounts, setMemberships] = await Promise.all([
    fetchQuestionStats(supabase, ids),
    fetchSubQuestionCounts(supabase, rows),
    fetchDuplicateCounts(supabase, user.id, rows),
    fetchSetMemberships(supabase, user.id, ids),
  ])

  return { details, stats, duplicateCounts, subQuestionCounts, setMemberships }
}
