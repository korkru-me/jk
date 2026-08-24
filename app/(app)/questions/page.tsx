import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { redirect } from 'next/navigation'
import type { Question } from '@/lib/types'
import { computeQuestionStats, type GradedAnswerRow, type QuestionStats } from '@/lib/question-stats'
import { QuestionBankClient } from './_components/question-bank-client'
import { questionSearchOrClauses } from '@/lib/question-search'
import { rankTagsByUse } from '@/lib/tag-suggest'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'

export const metadata = { title: 'คลังโจทย์ — KorKru' }

export type QuestionSummary = Pick<
  Question,
  | 'id'
  | 'created_by'
  | 'org_id'
  | 'title'
  | 'question_text'
  | 'question_type'
  | 'difficulty'
  | 'tags'
  | 'requires_work_image'
  | 'group_id'
  | 'order_in_group'
  | 'team_edit_allowed'
  | 'created_at'
>

export type QuestionWithCategory = QuestionSummary & { question_categories: { name: string } | null }
export type QuestionDetailWithCategory = Question & { question_categories: { name: string } | null }
export type QuestionWithCreator = QuestionWithCategory & {
  users: { full_name: string } | null
  organizations: { name: string } | null
  /** Names of teams this question was additionally shared to, beyond its home org. */
  shared_org_names?: string[]
  shared_org_ids?: string[]
}

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

async function fetchQuestionStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  questionIds: string[],
): Promise<Record<string, QuestionStats>> {
  if (questionIds.length === 0) return {}

  const batches: string[][] = []
  for (let i = 0; i < questionIds.length; i += STATS_ID_BATCH) {
    batches.push(questionIds.slice(i, i + STATS_ID_BATCH))
  }

  const results = await Promise.all(batches.map(ids =>
    supabase
      .from('submission_answers')
      .select('question_id, score, max_score, submissions!inner(assignment_id, total_score, status)')
      .in('question_id', ids)
      .in('submissions.status', ['submitted', 'graded'])
  ))

  const rows: GradedAnswerRow[] = []
  for (const { data, error } of results) {
    if (error) {
      // One failed slice costs its questions their stats, not the whole page.
      console.error('[questions/page] stats query failed:', error)
      continue
    }
    for (const row of (data ?? []) as any[]) {
      rows.push({
        question_id: row.question_id,
        score: Number(row.score ?? 0),
        max_score: Number(row.max_score ?? 0),
        submission_total: Number(row.submissions?.total_score ?? 0),
        assignment_id: row.submissions?.assignment_id ?? '',
      })
    }
  }

  return Object.fromEntries(computeQuestionStats(rows))
}

/** Questions per page in the bank list. */
export const QUESTIONS_PER_PAGE = 24

export interface QuestionFilters {
  q: string
  type: string
  difficulty: string
  tag: string
  page: number
}

/** The team tab has its own search, team narrowing and page. */
export interface TeamFilters {
  q: string
  team: string
  page: number
}

const readOne = (sp: Record<string, string | string[] | undefined>, k: string) =>
  typeof sp[k] === 'string' ? (sp[k] as string) : ''

function readFilters(sp: Record<string, string | string[] | undefined>): QuestionFilters {
  const one = (k: string) => readOne(sp, k)
  return {
    q: one('q').trim(),
    type: one('type') || 'all',
    difficulty: one('difficulty') || 'all',
    tag: one('tag'),
    page: Math.max(1, Number(one('page')) || 1),
  }
}

// Separate params from the own-questions list, because the "ทั้งหมด" tab shows
// both lists at once and each has to page on its own.
function readTeamFilters(sp: Record<string, string | string[] | undefined>): TeamFilters {
  const one = (k: string) => readOne(sp, k)
  return {
    q: one('teamq').trim(),
    team: one('team'),
    page: Math.max(1, Number(one('tpage')) || 1),
  }
}

function tagQuery(supabase: Awaited<ReturnType<typeof createClient>>) {
  return supabase.from('questions').select('tags').eq('is_research_snapshot', false).not('tags', 'is', null)
}

/**
 * Every tag in reach of one scope of the bank, most-used first.
 *
 * Two things need it: the tag filter, which used to run off a hardcoded list
 * that went stale the moment anyone tagged a question with something else, and
 * the search — a typed word can only reach a tag by matching a whole array
 * element, so the words are resolved against this list first.
 *
 * Reads only the `tags` column, and pages, because the 1,000-row cap would
 * otherwise silently drop the tail of a large bank — the same reason
 * `fetchAllRows` exists.
 */
async function fetchTags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  narrow: (q: ReturnType<typeof tagQuery>) => ReturnType<typeof tagQuery>,
): Promise<string[]> {
  const { rows, error } = await fetchAllRows<{ tags: string[] | null }>((from, to) =>
    narrow(tagQuery(supabase)).order('id').range(from, to)
  )
  if (error) console.error('[questions/page] tag query failed:', error)

  return rankTagsByUse(rows.map(row => row.tags))
}

const fetchOwnTags = (
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) => fetchTags(supabase, q => q.eq('created_by', userId))

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const filters = readFilters(sp)
  const teamFilters = readTeamFilters(sp)
  const from = (filters.page - 1) * QUESTIONS_PER_PAGE

  const summaryFields = 'id, created_by, org_id, title, question_text, question_type, difficulty, tags, requires_work_image, group_id, order_in_group, team_edit_allowed, created_at'

  // Filtering and paging happen in the database rather than in the browser:
  // the bank is already past a thousand questions, and shipping all of them on
  // every visit only gets slower.
  //
  // Every ordered query here breaks ties on `id`. created_at alone is not
  // unique — a bulk import stamps a whole batch with the same instant, and 50
  // rows sharing a timestamp have no defined order between them, so successive
  // pages would repeat some questions and skip others.
  let ownQuery = supabase
    .from('questions')
    .select(`${summaryFields}, question_categories(name)`, { count: 'exact' })
    .eq('created_by', user.id)
    .eq('is_research_snapshot', false)
    .or('group_id.is.null,order_in_group.eq.0')

  // Tags take part in the search, so the words have to be resolved against the
  // tags that exist before the query goes out — `ov` matches whole array
  // elements, never a substring of one.
  const ownTagsPromise = fetchOwnTags(supabase, user.id)
  if (filters.q) {
    for (const clause of questionSearchOrClauses(filters.q, await ownTagsPromise)) {
      // One clause per word, ANDed: every word has to land somewhere.
      ownQuery = ownQuery.or(clause)
    }
  }
  if (filters.type !== 'all') ownQuery = ownQuery.eq('question_type', filters.type)
  if (filters.difficulty !== 'all') ownQuery = ownQuery.eq('difficulty', filters.difficulty)
  if (filters.tag) ownQuery = ownQuery.contains('tags', [filters.tag])

  const [{ data: questions, error, count: ownTotal }, { data: membershipRows }, { count: unfilteredTotal }, allTags] = await Promise.all([
    ownQuery.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, from + QUESTIONS_PER_PAGE - 1),
    supabase
      .from('organization_members')
      .select('org_role, organizations!inner(id, name, is_personal)')
      .eq('user_id', user.id)
      .eq('organizations.is_personal', false),
    // The tab badge counts the whole bank, not the filtered slice.
    supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', user.id)
      .eq('is_research_snapshot', false)
      .or('group_id.is.null,order_in_group.eq.0'),
    ownTagsPromise,
  ])

  if (error) console.error('[questions/page] query failed:', error)

  const myTeams = (membershipRows ?? []).map((row: any) => ({
    id: row.organizations.id as string,
    name: row.organizations.name as string,
  }))
  const teamOrgIds = myTeams.map(t => t.id)

  // A share list is small in practice — sharing is a deliberate per-question
  // action — but it rides in the URL of the query below, and PostgREST rejects
  // a query string past roughly a thousand ids. Beyond this the team tab falls
  // back to loading in full: still correct, just not paged.
  const MAX_SHARED_IDS_IN_QUERY = 700

  let teamQuestions: QuestionWithCreator[] = []
  let teamTotal = 0
  let teamPaged = false

  if (teamOrgIds.length > 0) {
    const { data: shareRows, error: shareError } = await supabase
      .from('question_shares')
      .select('question_id, org_id, organizations(name)')
      .in('org_id', teamOrgIds)
    if (shareError) console.error('[questions/page] share query failed:', shareError)

    // question_id -> extra teams it was shared to (id + name, for filtering + badges)
    const sharedNamesByQuestion = new Map<string, string[]>()
    const sharedIdsByQuestion = new Map<string, string[]>()
    for (const row of (shareRows ?? []) as any[]) {
      const name = row.organizations?.name
      if (!name) continue
      sharedNamesByQuestion.set(row.question_id, [...(sharedNamesByQuestion.get(row.question_id) ?? []), name])
      sharedIdsByQuestion.set(row.question_id, [...(sharedIdsByQuestion.get(row.question_id) ?? []), row.org_id])
    }
    const sharedIds = [...sharedNamesByQuestion.keys()]

    const teamSelect = `${summaryFields}, question_categories(name), users(full_name), organizations!questions_org_id_fkey(name)`
    // The tab is a union: questions a team owns, plus questions shared into
    // one. Expressed as a single OR so the database can order and slice the
    // whole thing — two queries could each be paged, but not merged in order.
    const ownedByTeam = `and(org_id.in.(${teamOrgIds.join(',')}),visibility.in.(organization,school))`
    const unionFilter = sharedIds.length > 0
      ? `${ownedByTeam},id.in.(${sharedIds.join(',')})`
      : ownedByTeam

    if (sharedIds.length <= MAX_SHARED_IDS_IN_QUERY) {
      teamPaged = true
      let teamQuery = supabase
        .from('questions')
        .select(teamSelect, { count: 'exact' })
        .eq('is_research_snapshot', false)
        .or(unionFilter)
        .or('group_id.is.null,order_in_group.eq.0')

      if (teamFilters.q) {
        // Same rule as the โจทย์ของฉัน tab, against the tags this tab can see.
        const teamTags = await fetchTags(supabase, q => q.or(unionFilter))
        for (const clause of questionSearchOrClauses(teamFilters.q, teamTags)) {
          teamQuery = teamQuery.or(clause)
        }
      }
      // Narrowing to one team means either it owns the question, or the
      // question was shared to it.
      if (teamFilters.team) {
        const sharedToTeam = [...sharedIdsByQuestion.entries()]
          .filter(([, orgIds]) => orgIds.includes(teamFilters.team))
          .map(([questionId]) => questionId)
        teamQuery = teamQuery.or(
          sharedToTeam.length > 0
            ? `org_id.eq.${teamFilters.team},id.in.(${sharedToTeam.join(',')})`
            : `org_id.eq.${teamFilters.team}`
        )
      }

      const teamFrom = (teamFilters.page - 1) * QUESTIONS_PER_PAGE
      const { data, error: teamError, count } = await teamQuery
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(teamFrom, teamFrom + QUESTIONS_PER_PAGE - 1)
      if (teamError) console.error('[questions/page] team query failed:', teamError)
      teamTotal = count ?? 0
      teamQuestions = ((data ?? []) as unknown as QuestionWithCreator[]).map(q => ({
        ...q,
        shared_org_names: sharedNamesByQuestion.get(q.id) ?? [],
        shared_org_ids: sharedIdsByQuestion.get(q.id) ?? [],
      }))
    } else {
      const { rows, error: teamError } = await fetchAllRows<Record<string, unknown>>((rangeFrom, rangeTo) =>
        supabase
          .from('questions')
          .select(teamSelect)
          .eq('is_research_snapshot', false)
          .or(ownedByTeam)
          .or('group_id.is.null,order_in_group.eq.0')
          .order('created_at', { ascending: false })
          .range(rangeFrom, rangeTo)
      )
      if (teamError) console.error('[questions/page] team query failed:', teamError)

      const byId = new Map<string, QuestionWithCreator>()
      for (const q of rows as unknown as QuestionWithCreator[]) byId.set(q.id, q)
      if (sharedIds.length > 0) {
        for (let i = 0; i < sharedIds.length; i += 500) {
          const { data } = await supabase
            .from('questions')
            .select(teamSelect)
            .eq('is_research_snapshot', false)
            .in('id', sharedIds.slice(i, i + 500))
            .or('group_id.is.null,order_in_group.eq.0')
          for (const q of (data ?? []) as unknown as QuestionWithCreator[]) byId.set(q.id, q)
        }
      }
      teamQuestions = [...byId.values()]
        .map(q => ({
          ...q,
          shared_org_names: sharedNamesByQuestion.get(q.id) ?? [],
          shared_org_ids: sharedIdsByQuestion.get(q.id) ?? [],
        }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      teamTotal = teamQuestions.length
    }
  }

  const ownQuestions = (questions ?? []) as unknown as QuestionWithCategory[]
  // Only the questions actually on screen need stats now.
  const stats = await fetchQuestionStats(
    supabase,
    [...ownQuestions, ...teamQuestions].map(q => q.id),
  )

  return (
    <QuestionBankClient
      questions={ownQuestions}
      stats={stats}
      teamQuestions={teamQuestions}
      hasTeamOrg={teamOrgIds.length > 0}
      hasMultipleTeams={teamOrgIds.length > 1}
      myTeams={myTeams.map(t => ({ id: t.id, name: t.name }))}
      currentUserId={user.id}
      filters={filters}
      allTags={allTags}
      matchCount={ownTotal ?? 0}
      totalCount={unfilteredTotal ?? 0}
      perPage={QUESTIONS_PER_PAGE}
      teamFilters={teamFilters}
      teamMatchCount={teamTotal}
      teamPaged={teamPaged}
    />
  )
}
