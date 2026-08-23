import type { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import type { Question } from '@/lib/types'

/**
 * The questions a โจทย์ picker offers, and the fields it filters and lists on.
 *
 * `tags` is part of the row on purpose: the picker filters by tag and searches
 * over tags, and leaving the column out of the select is invisible in the
 * type — `tags` just arrives `undefined` and every tag filter quietly matches
 * nothing. That was the bug in the แฟ้มโจทย์ picker.
 */
export type BankQuestion = Pick<
  Question,
  'id' | 'title' | 'question_text' | 'difficulty' | 'question_type' | 'requires_work_image' | 'tags'
>

const BANK_FIELDS = 'id, title, question_text, difficulty, question_type, requires_work_image, tags'

/**
 * Every question of this teacher's the pickers may offer, newest first.
 *
 * Paged rather than fetched in one shot: a single query is capped at 1,000 rows
 * server-side, which silently hides the tail of a bank once it grows past that
 * — and a hidden question is one the picker's search can never find.
 */
export async function fetchBankQuestions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<BankQuestion[]> {
  const { rows, error } = await fetchAllRows<BankQuestion>((from, to) =>
    supabase
      .from('questions')
      .select(BANK_FIELDS)
      .eq('created_by', userId)
      .neq('visibility', 'pending')
      // created_at alone is not unique — a bulk import stamps a whole batch
      // with the same instant — so pages would repeat and skip rows without a
      // tiebreak on id.
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
  )
  if (error) console.error('[question-bank] query failed:', error)
  return rows
}
