import type { createClient } from '@/lib/supabase/server'
import { subQuestionCount, type CountableQuestion } from '@/lib/question-parts'

/** Ids per `in(...)` round in the part-count pass — keeps the URL short. */
const PART_COUNT_ID_CHUNK = 100

/** The fields on a listed row that decide where its part count comes from. */
export type CountablePlacement = { id: string; group_id: string | null; order_in_group: number | null }

/**
 * How many ข้อย่อย each question on screen holds.
 *
 * The list itself deliberately carries only what it filters and renders on, so
 * the shape a count is read from — blanks, statements, parts, pairs — is
 * fetched separately for the couple of dozen rows actually shown rather than
 * widening every query the bank runs. A โจทย์หลายขั้นตอน keeps its parts in
 * sibling rows instead of its own columns, so those are counted in a second
 * pass by group.
 */
export async function fetchSubQuestionCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  questions: CountablePlacement[],
): Promise<Record<string, number>> {
  if (questions.length === 0) return {}

  // Parent row -> its group, for the rows whose parts are siblings. Read off
  // the rows already in hand, which is why the two reads below are independent
  // of each other: neither needs the other's answer, so they go out together
  // rather than one after the other.
  const groupByParent = new Map<string, string>()
  for (const question of questions) {
    if (question.order_in_group === 0 && question.group_id) {
      groupByParent.set(question.id, question.group_id)
    }
  }

  const ids = questions.map(question => question.id)
  const groupIds = [...new Set(groupByParent.values())]
  const chunks = <T,>(all: T[]) => {
    const out: T[][] = []
    for (let i = 0; i < all.length; i += PART_COUNT_ID_CHUNK) {
      out.push(all.slice(i, i + PART_COUNT_ID_CHUNK))
    }
    return out
  }

  const [shapeResults, memberResults] = await Promise.all([
    Promise.all(chunks(ids).map(slice => supabase
      .from('questions')
      .select('id, question_type, extra_data, answer_parts, mcq_options')
      .in('id', slice))),
    Promise.all(chunks(groupIds).map(slice => supabase
      .from('questions')
      .select('group_id')
      .in('group_id', slice)
      .gt('order_in_group', 0))),
  ])

  const rows: (CountableQuestion & { id: string })[] = []
  for (const { data, error } of shapeResults) {
    if (error) {
      // Losing the count costs a badge, not the page.
      console.error('[question-sub-counts] part count query failed:', error)
      return {}
    }
    rows.push(...((data ?? []) as unknown as (CountableQuestion & { id: string })[]))
  }

  const membersByGroup = new Map<string, number>()
  for (const { data, error } of memberResults) {
    if (error) {
      // A group whose members stay unread falls back to its own shape (1),
      // which is wrong but harmless — better than dropping every count.
      console.error('[question-sub-counts] group part count query failed:', error)
      break
    }
    for (const row of (data ?? []) as { group_id: string | null }[]) {
      if (!row.group_id) continue
      membersByGroup.set(row.group_id, (membersByGroup.get(row.group_id) ?? 0) + 1)
    }
  }

  return Object.fromEntries(rows.map(row => {
    const groupId = groupByParent.get(row.id)
    return [row.id, subQuestionCount(row, groupId ? membersByGroup.get(groupId) : undefined)]
  }))
}
