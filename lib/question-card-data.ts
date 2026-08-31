import type { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { computeQuestionStats, type GradedAnswerRow, type QuestionStats } from '@/lib/question-stats'
import type { QuestionSetRef } from '@/components/questions/question-set-badges'

/**
 * The per-card reads the คลังโจทย์ list and the แฟ้มโจทย์ editor share.
 *
 * All four answer the same shape of question — "for the couple of dozen โจทย์
 * on screen, what else is true of them" — and all four are deliberately asked
 * about the visible rows only. The คลัง carries hundreds of โจทย์ and the
 * queries here are the expensive ones on the page, so they scale with what the
 * reader can actually see, never with how much they own.
 */

/** What a full card prints beyond the fields a picker already carries. */
export interface QuestionCardDetail {
  subject: string | null
  category: string | null
  group_id: string | null
  order_in_group: number | null
}

/** Everything the four reads below add up to, for one screenful of cards. */
export interface QuestionCardData {
  details: Record<string, QuestionCardDetail>
  stats: Record<string, QuestionStats>
  duplicateCounts: Record<string, number>
  subQuestionCounts: Record<string, number>
  setMemberships: Record<string, QuestionSetRef[]>
}

export const EMPTY_CARD_DATA: QuestionCardData = {
  details: {}, stats: {}, duplicateCounts: {}, subQuestionCounts: {}, setMemberships: {},
}

/**
 * Ids per lazy request — one screenful of cards, never a whole แฟ้ม.
 *
 * Every read here is proportional to what it is asked about, so this cap is
 * what keeps a แฟ้ม of five hundred โจทย์ from costing five hundred โจทย์ worth
 * of queries the moment its editor opens.
 */
export const CARD_DATA_MAX_IDS = 60

/**
 * Item-analysis stats for the listed questions.
 *
 * RLS on submission_answers already limits this to attempts on assignments the
 * signed-in teacher created, which is the scope we want: "how has this question
 * performed in my classes". Only submitted/graded attempts count — an
 * in-progress one has no meaningful score yet.
 */

// PostgREST puts an `.in(...)` list in the URL, so asking about every question
// at once stops working as a bank grows — a thousand ids is a ~45 KB query
// string, which the server rejects outright (400) and the stats silently
// vanish from the page. Asking in slices keeps each URL small.
const STATS_ID_BATCH = 200

const STATS_SELECT =
  'question_id, score, max_score, submissions!inner(assignment_id, total_score, status, submitted_at, created_at)'

/** One PostgREST row from the stats select, before it is narrowed to a GradedAnswerRow. */
type StatsRow = {
  question_id: string
  score: number | null
  max_score: number | null
  submissions?: {
    assignment_id?: string | null
    total_score?: number | null
    submitted_at?: string | null
    created_at?: string | null
  } | null
}

const toGradedRow = (row: StatsRow): GradedAnswerRow => ({
  question_id: row.question_id,
  score: Number(row.score ?? 0),
  max_score: Number(row.max_score ?? 0),
  submission_total: Number(row.submissions?.total_score ?? 0),
  assignment_id: row.submissions?.assignment_id ?? '',
  // An attempt that was graded but never formally submitted still has a
  // created_at, and "last used" should not skip it.
  submitted_at: row.submissions?.submitted_at ?? row.submissions?.created_at ?? null,
})

/**
 * Item-analysis stats for the listed questions.
 *
 * RLS on submission_answers already limits this to attempts on assignments the
 * signed-in teacher created, which is the scope we want: "how has this question
 * performed in my classes". Only submitted/graded attempts count — an
 * in-progress one has no meaningful score yet.
 *
 * `'all'` asks for every graded answer in that scope instead of naming
 * questions. Ordering the bank by item analysis needs the stats for the whole
 * คลัง, and naming 883 questions in slices would send five long URLs to fetch
 * the very same rows RLS would have handed over anyway.
 *
 * Either way the reads page through `fetchAllRows`: PostgREST caps a response
 * at 1,000 rows, and a class set can pass that in a single slice — which would
 * not fail, it would just quietly compute p from part of the evidence.
 */
export async function fetchQuestionStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  questionIds: string[] | 'all',
): Promise<Record<string, QuestionStats>> {
  if (questionIds !== 'all' && questionIds.length === 0) return {}

  const batches: (string[] | 'all')[] = []
  if (questionIds === 'all') {
    batches.push('all')
  } else {
    for (let i = 0; i < questionIds.length; i += STATS_ID_BATCH) {
      batches.push(questionIds.slice(i, i + STATS_ID_BATCH))
    }
  }

  const results = await Promise.all(batches.map(batch =>
    fetchAllRows<StatsRow>((from, to) => {
      let query = supabase
        .from('submission_answers')
        .select(STATS_SELECT)
        .in('submissions.status', ['submitted', 'graded'])
        // A row a wrong-only retry carried forward is a copy of an answer an
        // earlier attempt already contributed here. Counting it again would
        // weight one student's answer twice in this question's difficulty.
        .eq('carried_over', false)
      if (batch !== 'all') query = query.in('question_id', batch)
      return query.order('id', { ascending: true }).range(from, to) as unknown as
        PromiseLike<{ data: StatsRow[] | null; error: unknown }>
    })
  ))

  const rows: GradedAnswerRow[] = []
  for (const { rows: batchRows, error } of results) {
    if (error) {
      // One failed slice costs its questions their stats, not the whole page.
      console.error('[question-card-data] stats query failed:', error)
      continue
    }
    for (const row of batchRows) rows.push(toGradedRow(row))
  }

  return Object.fromEntries(computeQuestionStats(rows))
}

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
