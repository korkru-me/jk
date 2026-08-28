import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { redirect } from 'next/navigation'
import type { Question } from '@/lib/types'
import { type QuestionStats } from '@/lib/question-stats'
import {
  fetchDuplicateCounts,
  fetchQuestionStats,
  fetchSetMemberships,
} from '@/lib/question-card-data'
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
import {
  applyQuestionSort,
  compareQuestions,
  DEFAULT_QUESTION_SORT,
  isDatabaseSortable,
  rankQuestionIds,
  readQuestionSort,
  type QuestionSort,
} from '@/lib/question-sort'
import { rankCountedTags } from '@/lib/tag-suggest'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { fetchSubQuestionCounts } from '@/lib/question-sub-counts'
import type { QuestionSetRef } from '@/components/questions/question-set-badges'

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
  | 'group_id'
  | 'order_in_group'
  | 'team_edit_allowed'
  | 'content_fingerprint'
  | 'created_at'
  | 'updated_at'
  | 'subject'
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


/** Questions per page in the bank list. */
export const QUESTIONS_PER_PAGE = 24

export interface QuestionFilters {
  q: string
  match: QuestionSearchScope
  type: string
  difficulty: string
  tag: string
  page: number
  /** How the list is ordered. Absent from the URL means newest first. */
  sort: QuestionSort
}

/** The team tab has its own search, team narrowing, page and order. */
export interface TeamFilters {
  q: string
  match: QuestionSearchScope
  team: string
  page: number
  /** Its own ordering, from its own params — the "ทั้งหมด" tab shows both
   *  lists at once, and ordering one must not reorder the other. */
  sort: QuestionSort
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
    sort: readQuestionSort(sp),
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
    sort: readQuestionSort(sp, 't'),
  }
}

/** One row per distinct tag, as the tag-counting functions return them. */
type TagUseRow = { tag: string; uses: number }

/**
 * Every tag in reach of one scope of the bank, most-used first.
 *
 * Two things need it: the tag filter, which used to run off a hardcoded list
 * that went stale the moment anyone tagged a question with something else, and
 * the search — a typed word can only reach a tag by matching a whole array
 * element, so the words are resolved against this list first.
 *
 * Counted in the database. This used to read the `tags` column of every
 * question in scope and tally it here, which meant a whole bank crossing the
 * wire to produce a couple of dozen strings — and it had to finish before the
 * search query could even be built, so it delayed the query the page exists to
 * run. `rankCountedTags` still decides the order, because ties are broken with
 * Thai collation from JavaScript and Postgres does not sort the same way.
 */
async function fetchTagUses(
  rpc: PromiseLike<{ data: TagUseRow[] | null; error: unknown }>,
): Promise<string[]> {
  const { data, error } = await rpc
  if (error) {
    console.error('[questions/page] tag count failed:', error)
    return []
  }
  return rankCountedTags((data ?? []).map(row => ({ tag: row.tag, uses: Number(row.uses) })))
}

const fetchOwnTags = (supabase: Awaited<ReturnType<typeof createClient>>) =>
  fetchTagUses(supabase.rpc('my_question_tag_uses') as unknown as
    PromiseLike<{ data: TagUseRow[] | null; error: unknown }>)

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

  const summaryFields = 'id, created_by, org_id, title, question_text, question_type, difficulty, tags, group_id, order_in_group, team_edit_allowed, content_fingerprint, created_at, updated_at, subject'

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
  const ownTagsPromise = fetchOwnTags(supabase)

  async function loadOwnQuestions() {
    // Only a typed query needs the tag universe, and only to turn its words
    // into whole tags. A tag click or a page turn has no words to resolve, so
    // it must not sit behind the tag count — which is what the unconditional
    // await here used to make every one of them do.
    const searchSpec = filters.q
      ? questionSearchGroupFilters(filters.q, await ownTagsPromise)
      : null

    // 'rows' returns the cards, 'count' asks only how many there are, and
    // 'ids' returns the identifiers alone — enough to rank the whole filtered
    // bank in memory without carrying its text across the wire.
    const buildQuery = (group?: QuestionSearchGroup, mode: 'rows' | 'count' | 'ids' = 'rows') => {
      let query = supabase
        .from('questions')
        .select(
          mode === 'ids' ? 'id' : `${summaryFields}, question_categories(name)`,
          { count: 'exact', head: mode === 'count' },
        )
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

    /**
     * One page of a bank ordered by something the database cannot sort by.
     *
     * The item-analysis keys rank on numbers that are computed from graded
     * answers rather than stored on the question, so PostgREST has no column
     * to order by and no `.range()` can page it. This does the paging instead:
     * read the identifiers of every question the current filters match, rank
     * those, and fetch the cards for the two dozen the ranking put on this
     * page.
     *
     * Only the ids cross the wire for the whole bank — the reason the list
     * pages in the database in the first place is the weight of the rows, not
     * the count of them. It is still the one order that costs a read
     * proportional to the bank rather than to the page, which is why it is
     * reached only when one of those four keys is chosen.
     */
    async function rankedPage(group: QuestionSearchGroup | undefined, from: number, to: number) {
      // The select string is chosen at runtime, so supabase-js cannot infer the
      // narrower row type the 'ids' mode actually returns.
      const { rows, error } = await fetchAllRows<{ id: string }>((rangeFrom, rangeTo) =>
        applyQuestionSort(buildQuery(group, 'ids'), DEFAULT_QUESTION_SORT)
          .range(rangeFrom, rangeTo) as unknown as
          PromiseLike<{ data: { id: string }[] | null; error: unknown }>)
      if (error) console.error('[questions/page] ranked id query failed:', error)
      const ids = rows.map(row => row.id)

      // Ranked from the same stats the cards show, so the order and the
      // numbers printed on it can never be two different measurements. Asked
      // for in one scope-wide read rather than by naming every id: the answer
      // set is the same either way, and RLS is already the filter.
      const stats = await fetchQuestionStats(supabase, 'all')
      const pageIds = rankQuestionIds(ids, stats, filters.sort).slice(from, to + 1)
      if (pageIds.length === 0) return { questions: [] as QuestionWithCategory[], count: ids.length }

      const { data, error: rowError } = await buildQuery(group).in('id', pageIds)
      if (rowError) console.error('[questions/page] ranked row query failed:', rowError)
      const cards = (data ?? []) as unknown as QuestionWithCategory[]

      // `in` answers in whatever order it likes; the ranking decides the page.
      const byId = new Map(cards.map(card => [card.id, card]))
      return {
        questions: pageIds
          .map(id => byId.get(id))
          .filter((card): card is QuestionWithCategory => card != null),
        count: ids.length,
      }
    }
    const ranked = !isDatabaseSortable(filters.sort.key)

    if (!searchSpec) {
      const from = (filters.page - 1) * QUESTIONS_PER_PAGE
      if (ranked) {
        const { questions, count } = await rankedPage(undefined, from, from + QUESTIONS_PER_PAGE - 1)
        return {
          questions,
          total: count,
          groups: [] as QuestionSearchResultGroup<QuestionWithCategory>[],
          groupCounts: { tag: 0, title: 0, content: 0 } satisfies QuestionSearchGroupCounts,
        }
      }
      const { data, error, count } = await applyQuestionSort(buildQuery(), filters.sort)
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
        if (shouldLoadRows && ranked) {
          const { questions, count } = await rankedPage(
            group, directFrom, directFrom + QUESTIONS_PER_PAGE - 1,
          )
          return { group, count, questions }
        }
        const result = shouldLoadRows
          ? await applyQuestionSort(buildQuery(group), filters.sort)
            .range(directFrom, directFrom + QUESTIONS_PER_PAGE - 1)
          : await buildQuery(group, 'count')
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
      const { count, error } = await buildQuery(group, 'count')
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

      if (ranked) {
        const { questions } = await rankedPage(group, slice.from, slice.to)
        return { group, questions }
      }

      const { data, error } = await applyQuestionSort(buildQuery(group), filters.sort)
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

  /**
   * The team tab, loaded alongside the teacher's own list rather than after it.
   *
   * Nothing in here depends on the own-bank queries — it needs the caller's
   * team memberships and nothing else — but it used to sit behind the whole
   * first Promise.all and so waited out the search queries before its own
   * first read even went out. Two independent chains of round trips ran end
   * to end; now they overlap.
   */
  async function loadTeamContext() {
    const { data: membershipRows, error: membershipError } = await supabase
      .from('organization_members')
      .select('org_role, organizations!inner(id, name, is_personal)')
      .eq('user_id', userId)
      .eq('organizations.is_personal', false)
    if (membershipError) console.error('[questions/page] membership query failed:', membershipError)

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
      // `team_question_tag_uses` resolves the share membership itself, so the
      // tag count no longer has to wait for the share list to come back — the
      // two go out together and the pair costs one round trip instead of two.
      const teamTagsPromise: Promise<string[]> = teamFilters.q
        ? fetchTagUses(supabase.rpc('team_question_tag_uses', {
          p_org_ids: teamOrgIds,
        }) as unknown as PromiseLike<{ data: TagUseRow[] | null; error: unknown }>)
        : Promise.resolve([])

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

        const teamTags = await teamTagsPromise
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
          const { data, error: teamError, count } = await applyQuestionSort(
            buildTeamQuery(), teamFilters.sort,
          ).range(teamFrom, teamFrom + QUESTIONS_PER_PAGE - 1)
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
                ? await applyQuestionSort(buildTeamQuery(group), teamFilters.sort)
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
              const { data, error: groupError } = await applyQuestionSort(
                buildTeamQuery(group), teamFilters.sort,
              ).range(slice.from, slice.to)
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
          // A fixed order here, not the chosen one: these rows are merged with
          // a second query through a Map below, which discards the order they
          // arrived in, so the list is ordered in memory afterwards instead.
          // The order still has to be *stable* — this walks the list a range at
          // a time, and rows tied on created_at with no tiebreaker would shift
          // between one range and the next, dropping and repeating questions.
          applyQuestionSort(
            supabase
              .from('questions')
              .select(teamSelect)
              .eq('is_research_snapshot', false)
              .or(ownedByTeam)
              .or('group_id.is.null,order_in_group.eq.0'),
            DEFAULT_QUESTION_SORT,
          ).range(rangeFrom, rangeTo)
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
          .sort(compareQuestions(teamFilters.sort))

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

    return { myTeams, teamQuestions, teamTotal, teamPaged, teamSearchGroups, teamSearchGroupCounts }
  }

  /**
   * Whether anything is narrowing the list — a search, a filter, a tag chip.
   *
   * When nothing is, the list's own count *is* the whole คลัง, and the badge
   * query below asks the database the identical question a second time. Both
   * are exact counts over every row a teacher owns, which is the most
   * expensive thing this page does; running one of them twice on the view the
   * tab opens in was pure duplication.
   */
  const narrowed = !!filters.q
    || filters.type !== 'all'
    || filters.difficulty !== 'all'
    || !!filters.tag

  const [ownResult, teamContext, narrowedTotal, allTags] = await Promise.all([
    loadOwnQuestions(),
    loadTeamContext(),
    // The tab badge counts the whole bank, not the filtered slice — so it is
    // only worth its own round trip once the two differ.
    narrowed
      ? supabase
          .from('questions')
          .select('id', { count: 'exact', head: true })
          .eq('created_by', userId)
          .eq('is_research_snapshot', false)
          .or('group_id.is.null,order_in_group.eq.0')
          .then(result => result.count ?? 0)
      : Promise.resolve(null),
    ownTagsPromise,
  ])
  const unfilteredTotal = narrowedTotal ?? ownResult.total

  const { myTeams, teamQuestions, teamTotal, teamPaged, teamSearchGroups, teamSearchGroupCounts } = teamContext

  const ownQuestions = ownResult.questions
  // Only the questions actually on screen need stats, part counts, a แฟ้ม
  // lookup or a duplicate check now. The duplicate badge stays an own-bank question, so it
  // is asked about `ownQuestions` alone — a teammate's card never shows one.
  const visibleQuestions = [...ownQuestions, ...teamQuestions]
  const [stats, subQuestionCounts, duplicateCounts, setMemberships] = await Promise.all([
    fetchQuestionStats(supabase, visibleQuestions.map(q => q.id)),
    fetchSubQuestionCounts(supabase, visibleQuestions),
    fetchDuplicateCounts(supabase, userId, ownQuestions),
    fetchSetMemberships(supabase, userId, visibleQuestions.map(q => q.id)),
  ])

  return (
    <QuestionBankClient
      questions={ownQuestions}
      stats={stats}
      teamQuestions={teamQuestions}
      hasTeamOrg={myTeams.length > 0}
      hasMultipleTeams={myTeams.length > 1}
      myTeams={myTeams.map(t => ({ id: t.id, name: t.name }))}
      currentUserId={userId}
      filters={filters}
      allTags={allTags}
      matchCount={ownResult.total}
      searchGroups={ownResult.groups}
      searchGroupCounts={ownResult.groupCounts}
      totalCount={unfilteredTotal}
      duplicateCounts={duplicateCounts}
      subQuestionCounts={subQuestionCounts}
      setMemberships={setMemberships}
      perPage={QUESTIONS_PER_PAGE}
      teamFilters={teamFilters}
      teamMatchCount={teamTotal}
      teamSearchGroups={teamSearchGroups}
      teamSearchGroupCounts={teamSearchGroupCounts}
      teamPaged={teamPaged}
    />
  )
}
