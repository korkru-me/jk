import type { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { hasSolution, type SolutionColumns } from '@/lib/question-solution'
import type { CountablePlacement } from '@/lib/question-sub-counts'
import type { QuestionSetRef } from '@/components/questions/question-set-badges'

/**
 * The per-card reads the คลังโจทย์ list and the แฟ้มโจทย์ editor share.
 *
 * All of them answer the same shape of question — "for the couple of dozen
 * โจทย์ on screen, what else is true of them" — and all of them are
 * deliberately asked about the visible rows only. The คลัง carries hundreds of
 * โจทย์ and the queries here are the expensive ones on the page, so they scale
 * with what the reader can actually see, never with how much they own.
 */

/** What a full card prints beyond the fields a picker already carries. */
export interface QuestionCardDetail {
  subject: string | null
  category: string | null
  group_id: string | null
  order_in_group: number | null
}

/** Everything the reads below add up to, for one screenful of cards. */
export interface QuestionCardData {
  details: Record<string, QuestionCardDetail>
  duplicateCounts: Record<string, number>
  subQuestionCounts: Record<string, number>
  setMemberships: Record<string, QuestionSetRef[]>
  /** question id → whether it carries a เฉลย. Absent = not known. */
  solutionPresence: Record<string, boolean>
}

export const EMPTY_CARD_DATA: QuestionCardData = {
  details: {}, duplicateCounts: {}, subQuestionCounts: {}, setMemberships: {},
  solutionPresence: {},
}

/**
 * Ids per lazy request — one screenful of cards, never a whole แฟ้ม.
 *
 * Every read here is proportional to what it is asked about, so this cap is
 * what keeps a แฟ้ม of five hundred โจทย์ from costing five hundred โจทย์ worth
 * of queries the moment its editor opens.
 */
export const CARD_DATA_MAX_IDS = 60

/** Fingerprints per `in(...)` round in the duplicate pass — keeps the URL short. */
const DUPLICATE_ID_CHUNK = 100

/**
 * Which of a teacher's questions are the same question twice.
 *
 * This used to read the wording of the entire bank on every render — search,
 * tag click, page turn alike — and rebuild the fingerprints from scratch to
 * draw a badge that is usually absent. The fingerprint now lives on the row
 * (`content_fingerprint`, written by the server actions that save a question),
 * so the question here is only "how many of this teacher's questions carry the
 * fingerprints already on screen": one indexed lookup over at most a page of
 * distinct values, instead of a pass over the whole คลัง.
 *
 * A row whose fingerprint has not been backfilled yet is skipped rather than
 * guessed at, which shows up as a missing badge, never as a wrong count.
 */
export async function fetchDuplicateCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  questions: { id: string; content_fingerprint: string | null }[],
): Promise<Record<string, number>> {
  const fingerprints = [...new Set(
    questions.map(question => question.content_fingerprint).filter((f): f is string => !!f)
  )]
  if (fingerprints.length === 0) return {}

  // Counted over the same rows the list itself shows: this teacher's own
  // questions, no research snapshots, and a group counted once by its parent.
  const totals = new Map<string, number>()
  for (let i = 0; i < fingerprints.length; i += DUPLICATE_ID_CHUNK) {
    const { data, error } = await supabase
      .from('questions')
      .select('content_fingerprint')
      .eq('created_by', userId)
      .eq('is_research_snapshot', false)
      .or('group_id.is.null,order_in_group.eq.0')
      .in('content_fingerprint', fingerprints.slice(i, i + DUPLICATE_ID_CHUNK))
    if (error) {
      // Losing the count costs a badge, not the page.
      console.error('[question-card-data] duplicate count query failed:', error)
      return {}
    }
    for (const row of (data ?? []) as { content_fingerprint: string | null }[]) {
      if (!row.content_fingerprint) continue
      totals.set(row.content_fingerprint, (totals.get(row.content_fingerprint) ?? 0) + 1)
    }
  }

  // The badge says how many *other* questions say the same thing.
  const counts: Record<string, number> = {}
  for (const question of questions) {
    if (!question.content_fingerprint) continue
    const total = totals.get(question.content_fingerprint) ?? 0
    if (total > 1) counts[question.id] = total - 1
  }
  return counts
}

/** One row of the แฟ้ม lookup, before it is turned into refs. */
type SetMembershipRow = { id: string; title: string; created_by: string; question_ids: string[] | null }

/** Question ids per `ov(...)` round in the แฟ้ม lookup — keeps the URL short. */
const SET_LOOKUP_ID_CHUNK = 100

/**
 * Which แฟ้มโจทย์ hold each question on screen.
 *
 * Membership lives on the แฟ้ม as an array of question ids, so the question is
 * asked from that side: every set overlapping the ids currently listed, then
 * inverted into question -> sets here. A question may sit in any number of
 * แฟ้ม, and the card names all of them.
 *
 * RLS decides which แฟ้ม count — the teacher's own, plus the ones their teams
 * share — so a colleague's private แฟ้ม never appears on a card. Asked for
 * only the couple of dozen rows actually shown, like the other per-card reads.
 */
export async function fetchSetMemberships(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  questionIds: string[],
): Promise<Record<string, QuestionSetRef[]>> {
  if (questionIds.length === 0) return {}

  const chunks: string[][] = []
  for (let i = 0; i < questionIds.length; i += SET_LOOKUP_ID_CHUNK) {
    chunks.push(questionIds.slice(i, i + SET_LOOKUP_ID_CHUNK))
  }

  const results = await Promise.all(chunks.map(chunk => supabase
    .from('question_sets')
    .select('id, title, created_by, question_ids')
    .overlaps('question_ids', chunk)))

  const wanted = new Set(questionIds)
  // question id -> its แฟ้ม, keyed by set id: a แฟ้ม matched by two chunks
  // comes back twice and must still be listed once.
  const byQuestion = new Map<string, Map<string, QuestionSetRef>>()
  for (const { data, error } of results) {
    if (error) {
      // Losing the lookup costs the badges, not the page.
      console.error('[question-card-data] set membership query failed:', error)
      return {}
    }
    for (const row of (data ?? []) as unknown as SetMembershipRow[]) {
      const ref: QuestionSetRef = { id: row.id, title: row.title, isOwner: row.created_by === userId }
      for (const questionId of row.question_ids ?? []) {
        if (!wanted.has(questionId)) continue
        const sets = byQuestion.get(questionId) ?? new Map<string, QuestionSetRef>()
        sets.set(row.id, ref)
        byQuestion.set(questionId, sets)
      }
    }
  }

  return Object.fromEntries(
    [...byQuestion].map(([questionId, sets]) => [
      questionId,
      [...sets.values()].sort((a, b) => a.title.localeCompare(b.title, 'th')),
    ]),
  )
}

/** Ids per `in(...)` round in the เฉลย lookup — keeps the URL short. */
const SOLUTION_LOOKUP_ID_CHUNK = 100

/**
 * Which โจทย์ on screen carry a เฉลย — typed, attached as a file, or written on
 * the board — for the ดูเฉลย button on each card.
 *
 * Only a yes or no reaches the page. The เฉลย itself is read when the button is
 * pressed (lib/actions/question-solution.ts): shipping two dozen of them with
 * every search and page turn, to draw a button most of which nobody presses,
 * would put the whole cost on the list for none of the use.
 *
 * A โจทย์หลายขั้นตอน keeps its เฉลย on the steps rather than on the row the
 * list shows, so a group counts as having one when any step does. The steps
 * are read alongside the listed rows, not after them — the group ids are
 * already on the rows in hand.
 *
 * A read that fails leaves its rows out rather than answering "none": no
 * button is harmless, while a greyed-out "ยังไม่แนบเฉลย" on a โจทย์ that has
 * one would be a false statement about it.
 */
export async function fetchSolutionPresence(
  supabase: Awaited<ReturnType<typeof createClient>>,
  questions: CountablePlacement[],
): Promise<Record<string, boolean>> {
  if (questions.length === 0) return {}

  const groupByParent = new Map<string, string>()
  for (const question of questions) {
    if (question.order_in_group === 0 && question.group_id) {
      groupByParent.set(question.id, question.group_id)
    }
  }

  const chunks = <T,>(all: T[]) => {
    const out: T[][] = []
    for (let i = 0; i < all.length; i += SOLUTION_LOOKUP_ID_CHUNK) {
      out.push(all.slice(i, i + SOLUTION_LOOKUP_ID_CHUNK))
    }
    return out
  }

  const [rowResults, stepResults] = await Promise.all([
    Promise.all(chunks(questions.map(question => question.id)).map(slice => supabase
      .from('questions')
      .select('id, solution_text, solution_image_urls')
      .in('id', slice))),
    Promise.all(chunks([...new Set(groupByParent.values())]).map(slice => supabase
      .from('questions')
      .select('group_id, solution_text, solution_image_urls')
      .in('group_id', slice)
      .gt('order_in_group', 0))),
  ])

  const ownSolution = new Map<string, boolean>()
  for (const { data, error } of rowResults) {
    if (error) {
      // Losing the lookup costs the buttons, not the page.
      console.error('[question-card-data] solution lookup failed:', error)
      return {}
    }
    for (const row of (data ?? []) as unknown as (SolutionColumns & { id: string })[]) {
      ownSolution.set(row.id, hasSolution(row))
    }
  }

  let stepsRead = true
  const groupsWithSolution = new Set<string>()
  for (const { data, error } of stepResults) {
    if (error) {
      console.error('[question-card-data] group solution lookup failed:', error)
      stepsRead = false
      break
    }
    for (const row of (data ?? []) as unknown as (SolutionColumns & { group_id: string | null })[]) {
      if (row.group_id && hasSolution(row)) groupsWithSolution.add(row.group_id)
    }
  }

  const presence: Record<string, boolean> = {}
  for (const [id, carriesOne] of ownSolution) {
    const groupId = groupByParent.get(id)
    if (carriesOne || !groupId) presence[id] = carriesOne
    // Unread steps leave a group unanswered, not answered "none".
    else if (stepsRead) presence[id] = groupsWithSolution.has(groupId)
  }
  return presence
}
