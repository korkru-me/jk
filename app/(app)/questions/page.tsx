import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { redirect } from 'next/navigation'
import type { Question } from '@/lib/types'
import { computeQuestionStats, type GradedAnswerRow, type QuestionStats } from '@/lib/question-stats'
import { QuestionBankClient } from './_components/question-bank-client'
import {
  QUESTION_SEARCH_GROUPS,
  matchesSearch,
  questionSearchGroup,
  questionSearchGroupFilters,
  questionSearchGroupSlices,
  type QuestionSearchGroup,
  type QuestionSearchGroupCounts,
  type QuestionSearchScope,
} from '@/lib/question-search'
import { rankTagsByUse } from '@/lib/tag-suggest'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { subQuestionCount, type CountableQuestion } from '@/lib/question-parts'

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
  | 'content_fingerprint'
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

export interface QuestionSearchResultGroup<T> {
  group: QuestionSearchGroup
  questions: T[]
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
  match: QuestionSearchScope
  type: string
  difficulty: string
  tag: string
  page: number
}

/** The team tab has its own search, team narrowing and page. */
export interface TeamFilters {
  q: string
  match: QuestionSearchScope
  team: string
  page: number
}

const readOne = (sp: Record<string, string | string[] | undefined>, k: string) =>
  typeof sp[k] === 'string' ? (sp[k] as string) : ''

function readFilters(sp: Record<string, string | string[] | undefined>): QuestionFilters {
  const one = (k: string) => readOne(sp, k)
  const match = one('match')
  return {
    q: one('q').trim(),
    match: match === 'tag' || match === 'title' || match === 'content' ? match : 'all',
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
  const match = one('teammatch')
  return {
    q: one('teamq').trim(),
    match: match === 'tag' || match === 'title' || match === 'content' ? match : 'all',
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

/** Fingerprints per `in(...)` round in the duplicate pass — keeps the URL short. */
const DUPLICATE_ID_CHUNK = 100

const fetchOwnTags = (
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) => fetchTags(supabase, q => q.eq('created_by', userId))

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
async function fetchDuplicateCounts(
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
      console.error('[questions/page] duplicate count query failed:', error)
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

/** Ids per `in(...)` round in the part-count pass — keeps the URL short. */
const PART_COUNT_ID_CHUNK = 100

/** The fields on a listed row that decide where its part count comes from. */
type CountablePlacement = { id: string; group_id: string | null; order_in_group: number | null }

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
async function fetchSubQuestionCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  questions: CountablePlacement[],
): Promise<Record<string, number>> {
  if (questions.length === 0) return {}

  const ids = questions.map(question => question.id)
  const rows: (CountableQuestion & { id: string })[] = []
  for (let i = 0; i < ids.length; i += PART_COUNT_ID_CHUNK) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, question_type, extra_data, answer_parts, mcq_options')
      .in('id', ids.slice(i, i + PART_COUNT_ID_CHUNK))
    if (error) {
      // Losing the count costs a badge, not the page.
      console.error('[questions/page] part count query failed:', error)
      return {}
    }
    rows.push(...((data ?? []) as unknown as (CountableQuestion & { id: string })[]))
  }

  // Parent row -> its group, for the rows whose parts are siblings.
  const groupByParent = new Map<string, string>()
  for (const question of questions) {
    if (question.order_in_group === 0 && question.group_id) {
      groupByParent.set(question.id, question.group_id)
    }
  }

  const membersByGroup = new Map<string, number>()
  const groupIds = [...new Set(groupByParent.values())]
  for (let i = 0; i < groupIds.length; i += PART_COUNT_ID_CHUNK) {
    const { data, error } = await supabase
      .from('questions')
      .select('group_id')
      .in('group_id', groupIds.slice(i, i + PART_COUNT_ID_CHUNK))
      .gt('order_in_group', 0)
    if (error) {
      // A group whose members stay unread falls back to its own shape (1),
      // which is wrong but harmless — better than dropping every count.
      console.error('[questions/page] group part count query failed:', error)
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

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const userId = user.id

  const sp = await searchParams
  const filters = readFilters(sp)
  const teamFilters = readTeamFilters(sp)

  const summaryFields = 'id, created_by, org_id, title, question_text, question_type, difficulty, tags, requires_work_image, group_id, order_in_group, team_edit_allowed, content_fingerprint, created_at'

  // Filtering and paging happen in the database rather than in the browser:
  // the bank is already past a thousand questions, and shipping all of them on
  // every visit only gets slower.
  //
  // Every ordered query here breaks ties on `id`. created_at alone is not
  // unique — a bulk import stamps a whole batch with the same instant, and 50
  // rows sharing a timestamp have no defined order between them, so successive
  // pages would repeat some questions and skip others.
  // Tags take part in the search, so the words have to be resolved against the
  // tags that exist before the query goes out — `ov` matches whole array
  // elements, never a substring of one.
  const ownTagsPromise = fetchOwnTags(supabase, userId)

  async function loadOwnQuestions() {
    const ownTags = await ownTagsPromise
    const searchSpec = filters.q
      ? questionSearchGroupFilters(filters.q, ownTags)
      : null

    const buildQuery = (group?: QuestionSearchGroup, head = false) => {
      let query = supabase
        .from('questions')
        .select(`${summaryFields}, question_categories(name)`, { count: 'exact', head })
        .eq('created_by', userId)
        .eq('is_research_snapshot', false)
        .or('group_id.is.null,order_in_group.eq.0')

      if (searchSpec) {
        for (const clause of searchSpec.broadOrClauses) query = query.or(clause)

        if (group === 'tag') {
          query = query.overlaps('tags', searchSpec.matchingTags)
        } else if (group === 'title') {
          if (searchSpec.matchingTags.length > 0) {
            query = query.or(`tags.is.null,tags.not.ov.${searchSpec.matchingTagsLiteral}`)
          }
          query = query.or(searchSpec.titleOrClause)
        } else if (group === 'content') {
          if (searchSpec.matchingTags.length > 0) {
            query = query.or(`tags.is.null,tags.not.ov.${searchSpec.matchingTagsLiteral}`)
          }
          for (const pattern of searchSpec.titlePatterns) {
            query = query.not('title', 'ilike', pattern)
          }
        }
      }

      if (filters.type !== 'all') query = query.eq('question_type', filters.type)
      if (filters.difficulty !== 'all') query = query.eq('difficulty', filters.difficulty)
      if (filters.tag) query = query.contains('tags', [filters.tag])
      return query
    }

    if (!searchSpec) {
      const from = (filters.page - 1) * QUESTIONS_PER_PAGE
      const { data, error, count } = await buildQuery()
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + QUESTIONS_PER_PAGE - 1)
      if (error) console.error('[questions/page] query failed:', error)
      return {
        questions: (data ?? []) as unknown as QuestionWithCategory[],
        total: count ?? 0,
        groups: [] as QuestionSearchResultGroup<QuestionWithCategory>[],
        groupCounts: { tag: 0, title: 0, content: 0 } satisfies QuestionSearchGroupCounts,
      }
    }

    const visibleGroups: readonly QuestionSearchGroup[] = filters.match === 'all'
      ? QUESTION_SEARCH_GROUPS
      : [filters.match]

    // The first page (and every single-group page) can fetch counts and rows in
    // one database round. Only a later page spanning all three groups needs a
    // count round before its cross-group offsets are known.
    if (filters.match !== 'all' || filters.page === 1) {
      const directFrom = filters.match === 'all'
        ? 0
        : (filters.page - 1) * QUESTIONS_PER_PAGE
      const directResults = await Promise.all(QUESTION_SEARCH_GROUPS.map(async group => {
        if (group === 'tag' && searchSpec.matchingTags.length === 0) {
          return { group, count: 0, questions: [] as QuestionWithCategory[] }
        }
        const shouldLoadRows = visibleGroups.includes(group)
        const result = shouldLoadRows
          ? await buildQuery(group)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(directFrom, directFrom + QUESTIONS_PER_PAGE - 1)
          : await buildQuery(group, true)
        if (result.error) console.error(`[questions/page] ${group} search query failed:`, result.error)
        return {
          group,
          count: result.count ?? 0,
          questions: (result.data ?? []) as unknown as QuestionWithCategory[],
        }
      }))
      const groupCounts = Object.fromEntries(
        directResults.map(result => [result.group, result.count]),
      ) as QuestionSearchGroupCounts
      const slices = questionSearchGroupSlices(
        groupCounts,
        filters.match,
        filters.page,
        QUESTIONS_PER_PAGE,
      )
      const groups = visibleGroups.map(group => {
        const result = directResults.find(candidate => candidate.group === group)
        const slice = slices[group]
        if (!result || !slice) return { group, questions: [] }
        return {
          group,
          questions: result.questions.slice(
            slice.from - directFrom,
            slice.to - directFrom + 1,
          ),
        }
      })
      return {
        questions: groups.flatMap(group => group.questions),
        total: visibleGroups.reduce<number>((sum, group) => sum + groupCounts[group], 0),
        groups,
        groupCounts,
      }
    }

    const countPairs = await Promise.all(QUESTION_SEARCH_GROUPS.map(async group => {
      if (group === 'tag' && searchSpec.matchingTags.length === 0) {
        return [group, 0] as const
      }
      const { count, error } = await buildQuery(group, true)
      if (error) console.error(`[questions/page] ${group} search count failed:`, error)
      return [group, count ?? 0] as const
    }))
    const groupCounts = Object.fromEntries(countPairs) as QuestionSearchGroupCounts
    const slices = questionSearchGroupSlices(
      groupCounts,
      filters.match,
      filters.page,
      QUESTIONS_PER_PAGE,
    )

    const groups = await Promise.all(visibleGroups.map(async group => {
      const slice = slices[group]
      if (!slice) return { group, questions: [] }

      const { data, error } = await buildQuery(group)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(slice.from, slice.to)
      if (error) console.error(`[questions/page] ${group} search query failed:`, error)
      return {
        group,
        questions: (data ?? []) as unknown as QuestionWithCategory[],
      }
    }))

    return {
      questions: groups.flatMap(group => group.questions),
      total: visibleGroups.reduce<number>((sum, group) => sum + groupCounts[group], 0),
      groups,
      groupCounts,
    }
  }

  const [ownResult, { data: membershipRows }, { count: unfilteredTotal }, allTags] = await Promise.all([
    loadOwnQuestions(),
    supabase
      .from('organization_members')
      .select('org_role, organizations!inner(id, name, is_personal)')
      .eq('user_id', userId)
      .eq('organizations.is_personal', false),
    // The tab badge counts the whole bank, not the filtered slice.
    supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
      .eq('is_research_snapshot', false)
      .or('group_id.is.null,order_in_group.eq.0'),
    ownTagsPromise,
  ])

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
  let teamSearchGroups: QuestionSearchResultGroup<QuestionWithCreator>[] = []
  let teamSearchGroupCounts: QuestionSearchGroupCounts = { tag: 0, title: 0, content: 0 }

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
      // Narrowing to one team means either it owns the question, or the
      // question was shared to it.
      let teamNarrowFilter = ''
      if (teamFilters.team) {
        const sharedToTeam = [...sharedIdsByQuestion.entries()]
          .filter(([, orgIds]) => orgIds.includes(teamFilters.team))
          .map(([questionId]) => questionId)
        teamNarrowFilter = sharedToTeam.length > 0
          ? `org_id.eq.${teamFilters.team},id.in.(${sharedToTeam.join(',')})`
          : `org_id.eq.${teamFilters.team}`
      }

      const teamTags = teamFilters.q
        ? await fetchTags(supabase, q => q.or(unionFilter))
        : []
      const searchSpec = teamFilters.q
        ? questionSearchGroupFilters(teamFilters.q, teamTags)
        : null

      const buildTeamQuery = (group?: QuestionSearchGroup, head = false) => {
        let query = supabase
          .from('questions')
          .select(teamSelect, { count: 'exact', head })
          .eq('is_research_snapshot', false)
          .or(unionFilter)
          .or('group_id.is.null,order_in_group.eq.0')

        if (teamNarrowFilter) query = query.or(teamNarrowFilter)
        if (searchSpec) {
          for (const clause of searchSpec.broadOrClauses) query = query.or(clause)
          if (group === 'tag') {
            query = query.overlaps('tags', searchSpec.matchingTags)
          } else if (group === 'title') {
            if (searchSpec.matchingTags.length > 0) {
              query = query.or(`tags.is.null,tags.not.ov.${searchSpec.matchingTagsLiteral}`)
            }
            query = query.or(searchSpec.titleOrClause)
          } else if (group === 'content') {
            if (searchSpec.matchingTags.length > 0) {
              query = query.or(`tags.is.null,tags.not.ov.${searchSpec.matchingTagsLiteral}`)
            }
            for (const pattern of searchSpec.titlePatterns) {
              query = query.not('title', 'ilike', pattern)
            }
          }
        }
        return query
      }

      if (!searchSpec) {
        const teamFrom = (teamFilters.page - 1) * QUESTIONS_PER_PAGE
        const { data, error: teamError, count } = await buildTeamQuery()
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(teamFrom, teamFrom + QUESTIONS_PER_PAGE - 1)
        if (teamError) console.error('[questions/page] team query failed:', teamError)
        teamTotal = count ?? 0
        teamQuestions = (data ?? []) as unknown as QuestionWithCreator[]
      } else {
        const visibleGroups: readonly QuestionSearchGroup[] = teamFilters.match === 'all'
          ? QUESTION_SEARCH_GROUPS
          : [teamFilters.match]

        if (teamFilters.match !== 'all' || teamFilters.page === 1) {
          const directFrom = teamFilters.match === 'all'
            ? 0
            : (teamFilters.page - 1) * QUESTIONS_PER_PAGE
          const directResults = await Promise.all(QUESTION_SEARCH_GROUPS.map(async group => {
            if (group === 'tag' && searchSpec.matchingTags.length === 0) {
              return { group, count: 0, questions: [] as QuestionWithCreator[] }
            }
            const shouldLoadRows = visibleGroups.includes(group)
            const result = shouldLoadRows
              ? await buildTeamQuery(group)
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .range(directFrom, directFrom + QUESTIONS_PER_PAGE - 1)
              : await buildTeamQuery(group, true)
            if (result.error) console.error(`[questions/page] team ${group} search query failed:`, result.error)
            return {
              group,
              count: result.count ?? 0,
              questions: (result.data ?? []) as unknown as QuestionWithCreator[],
            }
          }))
          teamSearchGroupCounts = Object.fromEntries(
            directResults.map(result => [result.group, result.count]),
          ) as QuestionSearchGroupCounts
          const slices = questionSearchGroupSlices(
            teamSearchGroupCounts,
            teamFilters.match,
            teamFilters.page,
            QUESTIONS_PER_PAGE,
          )
          teamSearchGroups = visibleGroups.map(group => {
            const result = directResults.find(candidate => candidate.group === group)
            const slice = slices[group]
            if (!result || !slice) return { group, questions: [] }
            return {
              group,
              questions: result.questions.slice(
                slice.from - directFrom,
                slice.to - directFrom + 1,
              ),
            }
          })
        } else {
          const countPairs = await Promise.all(QUESTION_SEARCH_GROUPS.map(async group => {
            if (group === 'tag' && searchSpec.matchingTags.length === 0) {
              return [group, 0] as const
            }
            const { count, error: countError } = await buildTeamQuery(group, true)
            if (countError) console.error(`[questions/page] team ${group} search count failed:`, countError)
            return [group, count ?? 0] as const
          }))
          teamSearchGroupCounts = Object.fromEntries(countPairs) as QuestionSearchGroupCounts
          const slices = questionSearchGroupSlices(
            teamSearchGroupCounts,
            teamFilters.match,
            teamFilters.page,
            QUESTIONS_PER_PAGE,
          )
          teamSearchGroups = await Promise.all(visibleGroups.map(async group => {
            const slice = slices[group]
            if (!slice) return { group, questions: [] }
            const { data, error: groupError } = await buildTeamQuery(group)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false })
              .range(slice.from, slice.to)
            if (groupError) console.error(`[questions/page] team ${group} search query failed:`, groupError)
            return {
              group,
              questions: (data ?? []) as unknown as QuestionWithCreator[],
            }
          }))
        }
        teamQuestions = teamSearchGroups.flatMap(group => group.questions)
        teamTotal = visibleGroups.reduce<number>((sum, group) => sum + teamSearchGroupCounts[group], 0)
      }

      const attachShareNames = (q: QuestionWithCreator): QuestionWithCreator => ({
        ...q,
        shared_org_names: sharedNamesByQuestion.get(q.id) ?? [],
        shared_org_ids: sharedIdsByQuestion.get(q.id) ?? [],
      })
      teamQuestions = teamQuestions.map(attachShareNames)
      teamSearchGroups = teamSearchGroups.map(result => ({
        ...result,
        questions: result.questions.map(attachShareNames),
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

      if (teamFilters.team) {
        teamQuestions = teamQuestions.filter(q =>
          q.org_id === teamFilters.team || q.shared_org_ids?.includes(teamFilters.team)
        )
      }

      if (teamFilters.q) {
        const grouped: Record<QuestionSearchGroup, QuestionWithCreator[]> = {
          tag: [],
          title: [],
          content: [],
        }
        for (const question of teamQuestions) {
          if (!matchesSearch(question, teamFilters.q)) continue
          const group = questionSearchGroup(question, teamFilters.q)
          if (group) grouped[group].push(question)
        }
        teamSearchGroupCounts = {
          tag: grouped.tag.length,
          title: grouped.title.length,
          content: grouped.content.length,
        }
        const visibleGroups: readonly QuestionSearchGroup[] = teamFilters.match === 'all'
          ? QUESTION_SEARCH_GROUPS
          : [teamFilters.match]
        teamSearchGroups = visibleGroups.map(group => ({ group, questions: grouped[group] }))
        teamQuestions = teamSearchGroups.flatMap(group => group.questions)
      }
      teamTotal = teamQuestions.length
    }
  }

  const ownQuestions = ownResult.questions
  // Only the questions actually on screen need stats, part counts or a
  // duplicate check now. The duplicate badge stays an own-bank question, so it
  // is asked about `ownQuestions` alone — a teammate's card never shows one.
  const visibleQuestions = [...ownQuestions, ...teamQuestions]
  const [stats, subQuestionCounts, duplicateCounts] = await Promise.all([
    fetchQuestionStats(supabase, visibleQuestions.map(q => q.id)),
    fetchSubQuestionCounts(supabase, visibleQuestions),
    fetchDuplicateCounts(supabase, userId, ownQuestions),
  ])

  return (
    <QuestionBankClient
      questions={ownQuestions}
      stats={stats}
      teamQuestions={teamQuestions}
      hasTeamOrg={teamOrgIds.length > 0}
      hasMultipleTeams={teamOrgIds.length > 1}
      myTeams={myTeams.map(t => ({ id: t.id, name: t.name }))}
      currentUserId={userId}
      filters={filters}
      allTags={allTags}
      matchCount={ownResult.total}
      searchGroups={ownResult.groups}
      searchGroupCounts={ownResult.groupCounts}
      totalCount={unfilteredTotal ?? 0}
      duplicateCounts={duplicateCounts}
      subQuestionCounts={subQuestionCounts}
      perPage={QUESTIONS_PER_PAGE}
      teamFilters={teamFilters}
      teamMatchCount={teamTotal}
      teamSearchGroups={teamSearchGroups}
      teamSearchGroupCounts={teamSearchGroupCounts}
      teamPaged={teamPaged}
    />
  )
}
