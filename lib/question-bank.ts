import type { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { naturalMaxScore } from '@/lib/assignment-attempt'
import { subQuestionCount, type CountableQuestion } from '@/lib/question-parts'
import type { Question } from '@/lib/types'

/**
 * The questions a โจทย์ picker offers, and the fields it filters and lists on.
 *
 * `tags` is part of the row on purpose: the picker filters by tag and searches
 * over tags, and leaving the column out of the select is invisible in the
 * type — `tags` just arrives `undefined` and every tag filter quietly matches
 * nothing. That was the bug in the แฟ้มโจทย์ picker.
 */
type BankQuestionFields = Pick<
  Question,
  'id' | 'title' | 'question_text' | 'difficulty' | 'question_type' | 'requires_work_image' | 'tags'
>

export type BankQuestion = BankQuestionFields & {
  /** How many ข้อย่อย the question holds — see lib/question-parts.ts. */
  sub_question_count: number
  /** What a งาน gives this question when the teacher does not say otherwise. */
  default_points: number
}

/** The row as it comes back, before the jsonb is counted and dropped. */
type BankRow = BankQuestionFields & CountableQuestion

const BANK_FIELDS = 'id, title, question_text, difficulty, question_type, requires_work_image, tags'

/** The jsonb a point value is counted from. `question_type` decides which of
 *  them is read, and BANK_FIELDS already asks for it. */
const POINT_SHAPE_FIELDS = 'extra_data, answer_parts, mcq_options'

/** Everything a point value needs, for a caller selecting its own narrow row. */
export const QUESTION_POINT_FIELDS = `question_type, ${POINT_SHAPE_FIELDS}`

/**
 * A question's point value before a teacher overrides it — its own structure,
 * in points.
 *
 * This is the same number grading already treats as the question's natural
 * ceiling, so a งาน that keeps the default scores exactly as it did before
 * anyone could set points at all: one point per ข้อย่อย, except where the
 * teacher weighted a ถูก-ผิด statement or a โจทย์ผสม part more heavily, which
 * this respects and a plain part count would quietly throw away.
 */
export function defaultQuestionPoints(row: CountableQuestion): number {
  return naturalMaxScore(
    row.question_type,
    row.extra_data,
    (row.answer_parts ?? null) as unknown[] | null,
    Array.isArray(row.mcq_options) ? row.mcq_options.length : 0,
  )
}

/** Adds the counted fields to a row read with BANK_FIELDS + QUESTION_POINT_FIELDS. */
export function withQuestionPoints<T extends CountableQuestion>(row: T) {
  const { extra_data: _extra, answer_parts: _parts, mcq_options: _options, ...rest } = row
  return {
    ...rest,
    sub_question_count: subQuestionCount(row),
    default_points: defaultQuestionPoints(row),
  }
}

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
  const { rows, error } = await fetchAllRows<BankRow>((from, to) =>
    supabase
      .from('questions')
      .select(`${BANK_FIELDS}, ${POINT_SHAPE_FIELDS}`)
      .eq('created_by', userId)
      .eq('is_research_snapshot', false)
      .neq('visibility', 'pending')
      // created_at alone is not unique — a bulk import stamps a whole batch
      // with the same instant — so pages would repeat and skip rows without a
      // tiebreak on id.
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
  )
  if (error) console.error('[question-bank] query failed:', error)
  // The raw jsonb is only read to count with — dropping it here keeps a
  // thousand-question picker from shipping every blank and option to the
  // browser just to know that one question is worth three points.
  return rows.map(withQuestionPoints)
}
