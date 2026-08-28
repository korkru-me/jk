import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { redirect } from 'next/navigation'
import { QuestionSetsClient } from './_components/question-sets-client'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { fetchSubQuestionCounts } from '@/lib/question-sub-counts'
import { rankCountedTags } from '@/lib/tag-suggest'
import {
  QUESTION_SEARCH_GROUPS,
  questionSearchGroupFilters,
  questionSearchGroupSlices,
  type QuestionSearchGroup,
  type QuestionSearchGroupCounts,
  type QuestionSearchScope,
} from '@/lib/question-search'
import {
  applyQuestionSort, DEFAULT_QUESTION_SORT, readQuestionSort, type QuestionSort,
} from '@/lib/question-sort'
import type { QuestionSetRef } from '@/components/questions/question-set-badges'
import type { Question, QuestionSet } from '@/lib/types'

export const metadata = { title: 'คลังแฟ้มโจทย์ — KorKru' }

// A set's question_ids can go stale once a question is deleted — attaches
// valid_question_count (how many ids still resolve) to each set so the
// library's displayed count matches what the assignment picker actually
// shows, instead of the raw (possibly inflated) stored length.
export type QuestionSetSummary = Pick<
  QuestionSet,
  'id' | 'created_by' | 'title' | 'description' | 'question_ids' | 'sections' | 'tags'
> & {
  valid_question_count?: number
}

export type QuestionSetSummaryWithCreator = QuestionSetSummary & {
  users?: { full_name: string } | null
  organizations?: { name: string } | null
  shared_org_names?: string[]
}

/**
 * A โจทย์ that no แฟ้ม in view holds, carrying what the card at the bottom of
 * the page draws — the same fields the คลังโจทย์ card reads, minus everything
 * that only its editing controls needed.
 */
export type UnfiledQuestion = Pick<
  Question,
  | 'id'
  | 'title'
  | 'question_text'
  | 'question_type'
  | 'difficulty'
  | 'tags'
  | 'subject'
  | 'group_id'
  | 'order_in_group'
> & { question_categories: { name: string } | null }

/** Questions per page in the browser. Matches the คลังโจทย์ list: the cards are
 *  the same weight, so the page should be too. */
export const UNFILED_PER_PAGE = 24

/**
 * Which slice of the คลัง the browser at the foot of the page is showing.
 *
 * Membership lives on the แฟ้ม, never on the question, so none of these three
 * can be expressed as a column filter — they are all "is this id in this set
 * of ids", answered against lists the page has already loaded.
 */
export type LibraryScope =
  | { kind: 'unfiled' }
  | { kind: 'all' }
  | { kind: 'set'; setId: string }

export interface LibraryQuery {
  scope: LibraryScope
  search: string
  match: QuestionSearchScope
  sort: QuestionSort
  page: number
}

export interface LibraryResult {
  questions: UnfiledQuestion[]
  /** Present only while searching: the page's questions split by what matched. */
  groups: { group: QuestionSearchGroup; questions: UnfiledQuestion[] }[]
  groupCounts: QuestionSearchGroupCounts
  /** How many questions the scope and search match in total. */
  total: number
  page: number
}

const CARD_FIELDS =
  'id, title, question_text, question_type, difficulty, tags, subject, group_id, order_in_group, question_categories(name)'

/**
 * One page of the โจทย์ browser: whichever slice of the คลัง the reader asked
 * for, searched, ordered and paged.
 *
 * The awkward part is that two of the three filters live on different sides of
 * the database. Search and ordering are columns, so they belong in the query;
 * แฟ้ม membership is an array on another table, so it cannot be. Filtering in
 * the browser instead would mean shipping the whole คลัง, and naming a
 * thousand ids in a URL is a 400 from PostgREST.
 *
 * So the query asks for **ids alone** — every question this teacher owns that
 * matches the search, already in the chosen order — and membership is applied
 * to that ordered list here. Ids are small enough to carry the whole คลัง
 * (a page of 24 cards is what actually costs); the order survives because
 * filtering a list never reorders it. The cards are then read for the 24 ids
 * the page landed on.
 *
 * The same shape the คลังโจทย์ list already uses when it has to rank by
 * something the database cannot order by.
 *
 * While a search is running the answer is three ordered lists, not one —
 * matched by แท็ก, by ชื่อ, by เนื้อหา, each question in exactly one of them —
 * and a page runs across them in that order.
 */
async function fetchLibraryPage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  query: LibraryQuery,
  filedIds: Set<string>,
  setMemberIds: Map<string, Set<string>>,
  tagUniverse: string[],
  /**
   * Every โจทย์ id of this teacher's, newest first — the list the page has
   * already read for its "ยังไม่อยู่ในแฟ้มใด" count.
   *
   * Unsearched and in the default order, that read and this one are the same
   * query down to the tiebreak, so the คลัง's ids were being walked twice on
   * every visit to a page that opens in exactly that state. Handed over, the
   * common case costs no id query at all.
   *
   * `null` when that read failed. Its own caller only loses a count to such a
   * failure, and the browser should not lose its whole list to it as well —
   * so the list falls back to asking for the ids itself.
   */
  defaultOrderIds: string[] | null,
): Promise<LibraryResult> {
  const searchSpec = query.search
    ? questionSearchGroupFilters(query.search, tagUniverse)
    : null

  const buildIdQuery = (group?: QuestionSearchGroup) => {
    let q = supabase
      .from('questions')
      .select('id')
      .eq('created_by', userId)
      .eq('is_research_snapshot', false)
      .or('group_id.is.null,order_in_group.eq.0')

    if (searchSpec) {
      for (const clause of searchSpec.broadOrClauses) q = q.or(clause)
      if (group === 'tag') {
        q = q.overlaps('tags', searchSpec.matchingTags)
      } else if (group === 'title') {
        if (searchSpec.matchingTags.length > 0) {
          q = q.or(`tags.is.null,tags.not.ov.${searchSpec.matchingTagsLiteral}`)
        }
        q = q.or(searchSpec.titleOrClause)
      } else if (group === 'content') {
        if (searchSpec.matchingTags.length > 0) {
          q = q.or(`tags.is.null,tags.not.ov.${searchSpec.matchingTagsLiteral}`)
        }
        for (const pattern of searchSpec.titlePatterns) q = q.not('title', 'ilike', pattern)
      }
    }
    return q
  }

  const inScope = (id: string) => {
    if (query.scope.kind === 'all') return true
    if (query.scope.kind === 'unfiled') return !filedIds.has(id)
    return setMemberIds.get(query.scope.setId)?.has(id) ?? false
  }

  /** Whether `defaultOrderIds` is already in the order being asked for. */
  const isDefaultOrder = query.sort.key === DEFAULT_QUESTION_SORT.key
    && query.sort.dir === DEFAULT_QUESTION_SORT.dir

  /** Every id this scope and group hold, in the reader's chosen order. */
  async function scopedIds(group?: QuestionSearchGroup): Promise<string[]> {
    if (group === 'tag' && searchSpec && searchSpec.matchingTags.length === 0) return []
    if (!searchSpec && isDefaultOrder && defaultOrderIds) return defaultOrderIds.filter(inScope)
    const { rows, error } = await fetchAllRows<{ id: string }>((from, to) =>
      applyQuestionSort(buildIdQuery(group), query.sort)
        .range(from, to) as unknown as PromiseLike<{ data: { id: string }[] | null; error: unknown }>)
    if (error) {
      console.error('[questions/sets/page] library id query failed:', error)
      return []
    }
    return rows.map(row => row.id).filter(inScope)
  }

  async function fetchCards(ids: string[]): Promise<Map<string, UnfiledQuestion>> {
    if (ids.length === 0) return new Map()
    const { data, error } = await supabase.from('questions').select(CARD_FIELDS).in('id', ids)
    if (error) {
      // Losing the rows costs the list, not the page — the แฟ้ม above it stand.
      console.error('[questions/sets/page] library card query failed:', error)
      return new Map()
    }
    return new Map((data as unknown as UnfiledQuestion[]).map(row => [row.id, row]))
  }

  const emptyCounts: QuestionSearchGroupCounts = { tag: 0, title: 0, content: 0 }

  if (!searchSpec) {
    const ids = await scopedIds()
    const totalPages = Math.max(1, Math.ceil(ids.length / UNFILED_PER_PAGE))
    const page = Math.min(Math.max(1, query.page), totalPages)
    const from = (page - 1) * UNFILED_PER_PAGE
    const pageIds = ids.slice(from, from + UNFILED_PER_PAGE)
    const byId = await fetchCards(pageIds)
    return {
      questions: pageIds.map(id => byId.get(id)).filter((q): q is UnfiledQuestion => q != null),
      groups: [],
      groupCounts: emptyCounts,
      total: ids.length,
      page,
    }
  }

  const resolved = await Promise.all(
    QUESTION_SEARCH_GROUPS.map(group => scopedIds(group)),
  )
  const groupIds: Record<QuestionSearchGroup, string[]> = {
    tag: resolved[0],
    title: resolved[1],
    content: resolved[2],
  }

  const groupCounts: QuestionSearchGroupCounts = {
    tag: groupIds.tag.length,
    title: groupIds.title.length,
    content: groupIds.content.length,
  }
  const visibleGroups: readonly QuestionSearchGroup[] = query.match === 'all'
    ? QUESTION_SEARCH_GROUPS
    : [query.match]
  const total = visibleGroups.reduce<number>((sum, group) => sum + groupCounts[group], 0)
  const totalPages = Math.max(1, Math.ceil(total / UNFILED_PER_PAGE))
  const page = Math.min(Math.max(1, query.page), totalPages)

  const slices = questionSearchGroupSlices(groupCounts, query.match, page, UNFILED_PER_PAGE)
  const pageIdsByGroup = visibleGroups.map(group => {
    const slice = slices[group]
    return {
      group,
      ids: slice ? groupIds[group].slice(slice.from, slice.to + 1) : [],
    }
  })
  const byId = await fetchCards(pageIdsByGroup.flatMap(entry => entry.ids))

  const groups = pageIdsByGroup.map(entry => ({
    group: entry.group,
    questions: entry.ids.map(id => byId.get(id)).filter((q): q is UnfiledQuestion => q != null),
  }))
  return {
    questions: groups.flatMap(group => group.questions),
    groups,
    groupCounts,
    total,
    page,
  }
}

/** One row of the tag-count RPC, before it is ranked. */
type TagUseRow = { tag: string; uses: number }

/**
 * Every tag in this teacher's own คลัง, most-used first.
 *
 * The แท็ก chips on an unfiled card can be added to, and an add offers the
 * tags that already exist rather than inviting a fourth spelling of one. Same
 * RPC and same ranking the คลังโจทย์ page uses, so both offer the same pool.
 */
async function fetchOwnTags(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string[]> {
  const { data, error } = await (supabase.rpc('my_question_tag_uses') as unknown as
    PromiseLike<{ data: TagUseRow[] | null; error: unknown }>)
  if (error) {
    console.error('[questions/sets/page] tag count failed:', error)
    return []
  }
  return rankCountedTags((data ?? []).map(row => ({ tag: row.tag, uses: Number(row.uses) })))
}

async function withValidCounts<T extends { question_ids: string[] }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sets: T[]
): Promise<(T & { valid_question_count: number })[]> {
  const allIds = Array.from(new Set(sets.flatMap(s => s.question_ids)))
  if (allIds.length === 0) return sets.map(set => ({ ...set, valid_question_count: 0 }))

  const { data: existing } = await supabase.from('questions').select('id').in('id', allIds)
  const existingIds = new Set((existing ?? []).map((q: any) => q.id as string))

  return sets.map(s => ({
    ...s,
    valid_question_count: s.question_ids.filter(id => existingIds.has(id)).length,
  }))
}

export default async function QuestionSetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  // The browser's whole state lives in the URL, like the คลังโจทย์ list — a
  // teacher filing a คลัง of 879 works through it over several sittings, and a
  // view they can link to or come back to beats one that resets to the top.
  const sp = await searchParams
  const one = (key: string) => (typeof sp[key] === 'string' ? (sp[key] as string) : '')
  const unfiledPageParam = Number(one('unfiled'))
  const unfiledPage = Math.max(1, Number.isFinite(unfiledPageParam) && unfiledPageParam > 0 ? unfiledPageParam : 1)
  const rawMatch = one('umatch')
  const libraryQueryBase = {
    search: one('uq').trim(),
    match: (rawMatch === 'tag' || rawMatch === 'title' || rawMatch === 'content'
      ? rawMatch
      : 'all') as QuestionSearchScope,
    sort: readQuestionSort(sp, 'u'),
    page: unfiledPage,
  }

  const summaryFields = 'id, created_by, title, description, question_ids, sections, tags'
  // The คลัง's own ids, for the "ยังไม่อยู่ในแฟ้ม" list at the bottom. Nothing
  // about them depends on the แฟ้ม queries — only the subtraction below does —
  // so the read goes out alongside them rather than after.
  //
  // Ordered newest first, with `id` breaking ties: `fetchAllRows` walks the
  // คลัง a range at a time, and rows sharing a created_at (a bulk import
  // stamps a whole batch with one instant) would otherwise shift between
  // ranges, dropping and repeating questions.
  const ownQuestionIdsPromise = fetchAllRows<{ id: string }>((from, to) => supabase
    .from('questions')
    .select('id')
    .eq('created_by', user.id)
    .eq('is_research_snapshot', false)
    .or('group_id.is.null,order_in_group.eq.0')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to) as unknown as PromiseLike<{ data: { id: string }[] | null; error: unknown }>)
    // A non-teacher is redirected below and never awaits this, so a thrown
    // network error would surface as an unhandled rejection instead of a
    // missing list.
    .catch((error: unknown) => ({ rows: [] as { id: string }[], error }))

  // The แท็ก universe depends on nothing this page reads, and it is not fast:
  // it used to be awaited after the แฟ้ม queries had already finished, adding
  // its whole round trip to the page rather than overlapping them. Started
  // here, it is almost always resolved by the time anything needs it.
  const allTagsPromise = fetchOwnTags(supabase)
    .catch((error: unknown) => {
      console.error('[questions/sets/page] tag query failed:', error)
      return [] as string[]
    })

  const [profileResult, mySetsResult, membershipResult] = await Promise.all([
    supabase.from('users').select('role').eq('id', user.id).single(),
    supabase
      .from('question_sets')
      .select(summaryFields)
      .eq('created_by', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('organization_members')
      .select('organizations!inner(id, is_personal)')
      .eq('user_id', user.id)
      .eq('organizations.is_personal', false),
  ])
  const { data: profile } = profileResult
  if (profile?.role !== 'teacher' && profile?.role !== 'admin') redirect('/dashboard')

  const mySetsRaw = (mySetsResult.data ?? []) as unknown as QuestionSetSummary[]
  const teamOrgIds = (membershipResult.data ?? []).map((row: any) => row.organizations.id as string)
  let teamSetsRaw: QuestionSetSummaryWithCreator[] = []

  if (teamOrgIds.length > 0) {
    const [{ data: primaryData }, { data: shareRows }] = await Promise.all([
      supabase
        .from('question_sets')
        .select(`${summaryFields}, users(full_name), organizations!question_sets_org_id_fkey(name)`)
        .in('org_id', teamOrgIds)
        .eq('visibility', 'organization')
        .order('created_at', { ascending: false }),
      supabase
        .from('question_set_shares')
        .select('question_set_id, org_id, organizations(name)')
        .in('org_id', teamOrgIds),
    ])

    const sharedNamesBySet = new Map<string, string[]>()
    for (const row of (shareRows ?? []) as any[]) {
      const name = row.organizations?.name
      if (!name) continue
      sharedNamesBySet.set(row.question_set_id, [
        ...(sharedNamesBySet.get(row.question_set_id) ?? []),
        name,
      ])
    }

    const sharedOnlyIds = [...sharedNamesBySet.keys()]
    let sharedOnlyData: QuestionSetSummaryWithCreator[] = []
    if (sharedOnlyIds.length > 0) {
      const { data } = await supabase
        .from('question_sets')
        .select(`${summaryFields}, users(full_name), organizations!question_sets_org_id_fkey(name)`)
        .in('id', sharedOnlyIds)
        .order('created_at', { ascending: false })
      sharedOnlyData = (data ?? []) as unknown as QuestionSetSummaryWithCreator[]
    }

    const byId = new Map<string, QuestionSetSummaryWithCreator>()
    for (const set of [...(primaryData ?? []), ...sharedOnlyData] as unknown as QuestionSetSummaryWithCreator[]) {
      byId.set(set.id, {
        ...set,
        shared_org_names: sharedNamesBySet.get(set.id) ?? [],
      })
    }
    teamSetsRaw = [...byId.values()]
  }

  const rawSets = [...mySetsRaw, ...teamSetsRaw]

  // Filed = held by any แฟ้ม this page shows, the teacher's own and the team's
  // alike: a โจทย์ a colleague put in a shared แฟ้ม has a home, and listing it
  // as unfiled would send the teacher looking for one it already has.
  //
  // Read off the rows as they arrived. Validation below only *adds* a count to
  // each แฟ้ม; it never edits `question_ids`, so nothing here has to wait for
  // it — and waiting is what it used to do, putting a whole round trip in front
  // of the โจทย์ list for a number only the แฟ้ม cards read.
  const filedIds = new Set(rawSets.flatMap(set => set.question_ids))
  const { rows: ownQuestionRows, error: ownQuestionError } = await ownQuestionIdsPromise
  if (ownQuestionError) {
    console.error('[questions/sets/page] own question id query failed:', ownQuestionError)
  }
  const ownQuestionIds = ownQuestionRows.map(row => row.id)

  // Which แฟ้ม hold what, read off the rows this page already loaded — the
  // browser filters by membership, and the cards name the แฟ้ม a question is
  // already in. No further query: `question_ids` is right here.
  const setMemberIds = new Map<string, Set<string>>(
    rawSets.map(set => [set.id, new Set(set.question_ids)]),
  )
  const setMemberships: Record<string, QuestionSetRef[]> = {}
  for (const set of rawSets) {
    const ref: QuestionSetRef = {
      id: set.id,
      title: set.title,
      isOwner: set.created_by === user.id,
    }
    for (const questionId of set.question_ids) {
      (setMemberships[questionId] ??= []).push(ref)
    }
  }

  // A typed query has to resolve its words against the tags that exist before
  // it can reach one (`ov` matches whole array elements), and the same list is
  // what the แท็ก chips offer. Read once, started at the top, used for both.
  const allTags = await allTagsPromise

  const scopeParam = one('qscope')
  const scope: LibraryScope = scopeParam === 'all'
    ? { kind: 'all' }
    : scopeParam && setMemberIds.has(scopeParam)
      ? { kind: 'set', setId: scopeParam }
      : { kind: 'unfiled' }

  // The แฟ้ม cards' "how many of these โจทย์ still exist" and the โจทย์ list
  // need nothing from each other, so they go out together.
  const [allSets, library] = await Promise.all([
    withValidCounts(supabase, rawSets),
    fetchLibraryPage(
      supabase, user.id, { ...libraryQueryBase, scope }, filedIds, setMemberIds, allTags,
      ownQuestionError ? null : ownQuestionIds,
    ),
  ])
  const mySets = allSets.slice(0, mySetsRaw.length)
  const teamSets = allSets.slice(mySetsRaw.length)

  // Only the 24 cards actually on screen need a ข้อย่อย count.
  const subQuestionCounts = await fetchSubQuestionCounts(supabase, library.questions)

  return (
    <QuestionSetsClient
      mySets={mySets}
      teamSets={teamSets}
      currentUserId={user.id}
      library={library}
      libraryScope={scope}
      librarySearch={libraryQueryBase.search}
      libraryMatch={libraryQueryBase.match}
      librarySort={libraryQueryBase.sort}
      unfiledPerPage={UNFILED_PER_PAGE}
      unfiledTotal={ownQuestionIds.filter(id => !filedIds.has(id)).length}
      ownQuestionTotal={ownQuestionIds.length}
      subQuestionCounts={subQuestionCounts}
      setMemberships={setMemberships}
      allTags={allTags}
    />
  )
}
