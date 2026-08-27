'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, LayoutList, Grid3x3, Search, X, SlidersHorizontal, Tag, BookOpen, Layers, Users, Edit2, Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { QuestionCard } from './question-card'
import { QuestionSetBadges, type QuestionSetRef } from '@/components/questions/question-set-badges'
import { Pagination } from '@/components/ui/pagination'
import {
  SEARCH_GROUP_META,
  SearchGroupHeading,
  SearchGroupSelector,
} from '@/components/questions/question-search-groups'
import { QuestionSortControl } from '@/components/questions/question-sort-control'
import { SubQuestionCountBadge } from './sub-question-count-badge'
import { Card } from '@/components/ui/card'
import { DIFF_META, TYPE_LABEL } from '@/lib/question-display'
import type { QuestionStats } from '@/lib/question-stats'
import { ImportQuestionsButton } from '@/components/questions/import-questions-button'
import { getQuestionClientDetail } from '@/lib/actions/questions'
import type {
  QuestionDetailWithCategory,
  QuestionFilters,
  QuestionSearchResultGroup,
  QuestionWithCategory,
  QuestionWithCreator,
  TeamFilters,
} from '../page'
import { questionExcerpt } from '@/lib/question-display'
import { mergeTagPool } from '@/lib/tag-suggest'
import { questionEditHref } from '@/lib/question-return'
import type {
  QuestionSearchGroup,
  QuestionSearchGroupCounts,
  QuestionSearchScope,
} from '@/lib/question-search'
import {
  QUESTION_SORTS,
  questionSortParams,
  type QuestionSort,
  type QuestionSortDir,
  type QuestionSortKey,
  type QuestionSortScope,
} from '@/lib/question-sort'

const PreviewModal = dynamic(
  () => import('./preview-modal').then(mod => mod.PreviewModal),
  { loading: () => <PreviewLoadingOverlay /> }
)

/** How many tags the filter shows before asking to be expanded. */
const TAG_FILTER_PREVIEW = 12

/**
 * How long typing pauses before the search is sent.
 *
 * A search costs a server render, so this is really "how sure are we the
 * teacher has stopped typing". It used to be shorter than the render itself,
 * which meant a word could put several requests in flight and the reader spent
 * the whole time watching a list that never settled.
 */
const SEARCH_DEBOUNCE_MS = 500

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  questions: QuestionWithCategory[]
  /** Item analysis per question id; a question absent here has no graded answers yet. */
  stats: Record<string, QuestionStats>
  teamQuestions: QuestionWithCreator[]
  hasTeamOrg: boolean
  hasMultipleTeams: boolean
  myTeams: { id: string; name: string }[]
  currentUserId: string
  /** Every tag used in this teacher's own bank, most-used first. */
  allTags: string[]
  /** Search, filters and ordering, as read from the URL by the page. */
  filters: QuestionFilters
  /** Questions matching the current filters — the number being paged through. */
  matchCount: number
  searchGroups: QuestionSearchResultGroup<QuestionWithCategory>[]
  searchGroupCounts: QuestionSearchGroupCounts
  /** Every question the user owns, regardless of filters (for the tab badge). */
  totalCount: number
  /** question id → how many other questions share its content. Absent = none. */
  duplicateCounts: Record<string, number>
  /** question id → how many ข้อย่อย it holds. Absent = not counted, badge hidden. */
  subQuestionCounts: Record<string, number>
  /** question id → every แฟ้มโจทย์ in view holding it. Absent = in no แฟ้ม. */
  setMemberships: Record<string, QuestionSetRef[]>
  perPage: number
  teamFilters: TeamFilters
  teamMatchCount: number
  teamSearchGroups: QuestionSearchResultGroup<QuestionWithCreator>[]
  teamSearchGroupCounts: QuestionSearchGroupCounts
  /** False when the share list was too large to page in one query — the team
   *  list then arrives whole and its controls are hidden. */
  teamPaged: boolean
}

export function QuestionBankClient({
  questions, stats, teamQuestions, hasTeamOrg, hasMultipleTeams, myTeams, currentUserId,
  allTags, filters, matchCount, searchGroups, searchGroupCounts, totalCount, perPage, duplicateCounts,
  subQuestionCounts, setMemberships,
  teamFilters, teamMatchCount, teamSearchGroups, teamSearchGroupCounts, teamPaged,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  /**
   * The filters the reader has clicked but the server has not answered yet.
   *
   * The URL owns the filters and the server does the work, which left every
   * control looking untouched until a whole render came back: you clicked a
   * tag, nothing moved, and the page read as frozen rather than busy. These
   * values stand in until the real ones arrive, so a click lands immediately
   * on the control that received it.
   */
  const [optimisticParams, setOptimisticParams] = useState<Record<string, string | null>>({})
  // Cleared when the request lands: either the transition finished, or the
  // server sent different filters back. Both, because a navigation that
  // resolves without ever reporting itself as pending would otherwise leave a
  // control showing a value the list no longer reflects.
  const settledParams = JSON.stringify([filters, teamFilters, searchParams.get('tab') ?? ''])
  useEffect(() => {
    if (isPending) return
    setOptimisticParams(prev => (Object.keys(prev).length === 0 ? prev : {}))
  }, [isPending, settledParams])

  /** A filter's value as it should look right now: what was just clicked if
   *  that is still in flight, otherwise what the server sent back. */
  const shownParam = (key: string, settled: string) =>
    key in optimisticParams ? (optimisticParams[key] ?? '') : settled

  // The tab lives in the URL alongside the filters, so a paged or filtered
  // view survives a reload and can be linked to.
  const tabParam = shownParam('tab', searchParams.get('tab') ?? '')
  const scope: 'all' | 'mine' | 'team' =
    tabParam === 'mine' || tabParam === 'team' ? tabParam : 'all'

  // The URL owns the search and filters, because the server does the filtering
  // now — local state would only describe a list the server never sent.
  const search = filters.q
  const diffFilter = shownParam('difficulty', filters.difficulty) || 'all'
  const typeFilter = shownParam('type', filters.type) || 'all'
  const activeTag = shownParam('tag', filters.tag) || null
  const matchScope = (shownParam('match', filters.match) || 'all') as QuestionSearchScope
  // The order, like the filters, is the URL's to own — so a bank ordered by
  // ชื่อโจทย์ survives a reload and can be sent to someone else as a link.
  // Params matching the default are absent from the URL rather than spelled
  // out, hence the fallbacks: an empty `dir` means "this key's usual end".
  const sortKey = (shownParam('sort', filters.sort.key) || 'created') as QuestionSortKey
  const sort: QuestionSort = {
    key: sortKey,
    dir: (shownParam('dir', filters.sort.dir) || QUESTION_SORTS[sortKey].defaultDir) as QuestionSortDir,
  }
  const teamMatchScope = (shownParam('teammatch', teamFilters.match) || 'all') as QuestionSearchScope
  const totalPages = Math.max(1, Math.ceil(matchCount / perPage))

  /**
   * Marks a list as answering a click that has not landed yet.
   *
   * Dimmed rather than replaced by a skeleton: the rows on screen are still
   * the honest answer to the previous filter, and blanking them out would cost
   * the reader their place for the sake of looking busy. Clicks stay live, so
   * changing your mind mid-request does not need a wait first.
   */
  const busyList = cn(
    'transition-opacity motion-reduce:transition-none',
    isPending && 'opacity-50',
  )

  /**
   * Rewrites the query string. Callers say explicitly which page param to
   * clear — the two lists page independently, so narrowing the team list must
   * not throw away where the reader was in their own bank.
   */
  function setParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '' || value === 'all') params.delete(key)
      else params.set(key, value)
    }
    // Show the new state on the controls before asking for it, so the click
    // registers now rather than when the server answers.
    setOptimisticParams(prev => ({ ...prev, ...next }))
    startTransition(() => {
      router.replace(params.toString() ? `${pathname}?${params}` : pathname, { scroll: false })
    })
  }

  // Reordering restarts the list, so it cannot keep the reader on page 7 of an
  // order that no longer exists. Each list clears only its own page param —
  // the "ทั้งหมด" tab shows both at once and they page independently.
  const setSort = (next: QuestionSort) =>
    setParams({ ...questionSortParams(next), page: null })
  const setTeamSort = (next: QuestionSort) =>
    setParams({ ...questionSortParams(next, 't'), tpage: null })

  // Typing shouldn't fire a query per keystroke, so the input keeps its own
  // value and pushes it to the URL once the user pauses.
  const [searchDraft, setSearchDraft] = useState(filters.q)
  useEffect(() => { setSearchDraft(filters.q) }, [filters.q])
  useEffect(() => {
    if (searchDraft === filters.q) return
    const timer = setTimeout(() => setParams({ q: searchDraft, page: null }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft])

  const [viewMode,     setViewMode]     = useState<'list' | 'grid'>('list')
  const [previewQ,     setPreviewQ]     = useState<QuestionDetailWithCategory | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null)
  const teamSearch = teamFilters.q
  const teamFilter = teamFilters.team || 'all'
  const teamSortKey = (shownParam('tsort', teamFilters.sort.key) || 'created') as QuestionSortKey
  const teamSort: QuestionSort = {
    key: teamSortKey,
    dir: (shownParam('tdir', teamFilters.sort.dir) || QUESTION_SORTS[teamSortKey].defaultDir) as QuestionSortDir,
  }
  const teamTotalPages = Math.max(1, Math.ceil(teamMatchCount / perPage))

  const [teamSearchDraft, setTeamSearchDraft] = useState(teamFilters.q)
  useEffect(() => { setTeamSearchDraft(teamFilters.q) }, [teamFilters.q])
  useEffect(() => {
    if (teamSearchDraft === teamFilters.q) return
    const timer = setTimeout(() => setParams({ teamq: teamSearchDraft, tpage: null }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamSearchDraft])
  const [flaggedIds,   setFlaggedIds]   = useState<Set<string>>(new Set())
  const [showFilters,  setShowFilters]  = useState(false)

  async function openPreview(questionId: string) {
    if (previewLoadingId) return
    setPreviewLoadingId(questionId)
    const result = await getQuestionClientDetail(questionId)
    setPreviewLoadingId(null)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    setPreviewQ(result.data as QuestionDetailWithCategory)
  }

  function toggleFlag(id: string) {
    setFlaggedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // `questions` is already the filtered page the server sent back.
  const filtered = questions

  const activeFilterCount = [diffFilter !== 'all', typeFilter !== 'all', !!activeTag].filter(Boolean).length

  // Suggestions for the add-a-tag control on each card: the whole of this
  // teacher's bank, plus whatever the team questions on screen are tagged with.
  const tagPool = useMemo(
    () => mergeTagPool(allTags, teamQuestions.flatMap(q => q.tags ?? [])),
    [allTags, teamQuestions],
  )

  // The filter lists the bank's tags, and a long tail of them would push the
  // rest of the panel off screen — so it opens with the most-used ones.
  const [showAllTags, setShowAllTags] = useState(false)
  const visibleTags = useMemo(() => {
    if (showAllTags || allTags.length <= TAG_FILTER_PREVIEW) return allTags
    const head = allTags.slice(0, TAG_FILTER_PREVIEW)
    // A tag filtered from a URL or from the card of a rarely-used tag must
    // still show as selected, even when it sits outside the preview.
    return activeTag && !head.includes(activeTag) ? [...head, activeTag] : head
  }, [allTags, showAllTags, activeTag])

  // The server returns only the current team slice, including the rare
  // unpaged fallback used when a share list is too large for one URL.
  const filteredTeam = teamQuestions

  return (
    <div className="space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">คลังโจทย์ของฉัน</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {/* With a filter on, the count has to describe the list actually
                  shown — otherwise it reads as the whole bank while the page
                  holds a handful of matches. */}
              {scope === 'team'
                ? `${teamMatchCount} โจทย์`
                : matchCount !== totalCount
                  ? `${matchCount} จาก ${totalCount} โจทย์`
                  : scope === 'all'
                    ? `${totalCount + teamMatchCount} โจทย์`
                    : `${totalCount} โจทย์`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ImportQuestionsButton
              label="นำเข้าไฟล์โจทย์"
              size="sm"
              className="gap-1.5 hidden sm:flex"
              onImported={() => router.refresh()}
            />
            <Link href="/questions/sets/new">
              <Button variant="outline" size="sm" className="gap-1.5 hidden sm:flex">
                <Layers className="w-3.5 h-3.5" /> สร้างแฟ้มโจทย์
              </Button>
            </Link>
            <Link href="/questions/new">
              <Button size="sm" className="gap-1.5 shadow-sm">
                <Plus className="w-3.5 h-3.5" /> สร้างโจทย์
              </Button>
            </Link>
          </div>
        </div>

        <div className="inline-flex w-fit items-center rounded-lg bg-muted p-[3px] gap-0.5">
          {([
            { value: 'all' as const, label: 'ทั้งหมด', count: totalCount + teamMatchCount },
            { value: 'mine' as const, label: 'ของฉัน', count: totalCount },
            { value: 'team' as const, label: 'แชร์ในทีม', count: teamMatchCount },
          ]).map(opt => (
            <button
              key={opt.value}
              onClick={() => setParams({ tab: opt.value === 'all' ? null : opt.value })}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 h-[26px] text-sm font-medium transition-all',
                scope === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-foreground/60 hover:text-foreground/80'
              )}
            >
              {opt.value === 'team' && <Users className="w-3.5 h-3.5" />}
              {opt.label}
              {opt.count > 0 && (
                <span className={cn(
                  'text-[10px] font-bold rounded-full px-1.5 leading-[18px]',
                  scope === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}>
                  {opt.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {(scope === 'all' || scope === 'mine') && (
          <div className="space-y-4">
            {scope === 'all' && <h2 className="text-sm font-semibold text-muted-foreground">โจทย์ของฉัน</h2>}

        {/* Search + controls */}
        {/* Wraps rather than squeezes: on a phone the ordering controls drop to
            their own line instead of shrinking the search box to nothing. */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาจากชื่อ เนื้อหา หรือแท็ก..."
              value={searchDraft}
              onChange={e => setSearchDraft(e.target.value)}
              className="pl-9 bg-card"
            />
            {searchDraft && (
              <button
                onClick={() => setSearchDraft('')}
                aria-label="ล้างคำค้นหาโจทย์ของฉัน"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <QuestionSortControl
            sort={sort}
            onChange={setSort}
            label="เรียงลำดับโจทย์ของฉัน"
          />

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(f => !f)}
            className={`gap-1.5 shrink-0 ${showFilters || activeFilterCount > 0 ? 'border-primary bg-primary/10 text-primary' : ''}`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            กรอง
            {activeFilterCount > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1.5 leading-[18px]">
                {activeFilterCount}
              </span>
            )}
          </Button>

          <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-muted-foreground'}`}
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-muted-foreground'}`}
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {search && (
          <SearchGroupSelector
            value={matchScope}
            counts={searchGroupCounts}
            onChange={match => setParams({ match, page: null })}
            label="เลือกแหล่งที่พบคำค้นในโจทย์ของฉัน"
          />
        )}

        {/* Expanded filter panel */}
        {showFilters && (
          <Card edge="ring" padding="md" className="space-y-4">
            <div className="flex gap-8 flex-wrap">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">ระดับความยาก</p>
                <div className="flex gap-1.5 flex-wrap">
                  {['all', 'easy', 'medium', 'hard', 'analytical'].map(d => (
                    <button
                      key={d}
                      onClick={() => setParams({ difficulty: d, page: null })}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all border ${
                        diffFilter === d
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border text-muted-foreground hover:border-ring'
                      }`}
                    >
                      {d === 'all' ? 'ทั้งหมด' : DIFF_META[d]?.label ?? d}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">รูปแบบโจทย์</p>
                <div className="flex gap-1.5 flex-wrap">
                  {['all', ...Object.keys(TYPE_LABEL)].map(t => (
                    <button
                      key={t}
                      onClick={() => setParams({ type: t, page: null })}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all border ${
                        typeFilter === t
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border text-muted-foreground hover:border-ring'
                      }`}
                    >
                      {t === 'all' ? 'ทั้งหมด' : TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                <Tag className="w-3 h-3" /> แท็ก
              </p>
              {allTags.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  ยังไม่มีแท็กในคลัง — เพิ่มแท็กได้จากปุ่ม &ldquo;+ แท็ก&rdquo; บนการ์ดโจทย์
                </p>
              ) : (
                <div className="flex gap-1.5 flex-wrap">
                  {visibleTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setParams({ tag: activeTag === tag ? null : tag, page: null })}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all border ${
                        activeTag === tag
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:border-primary/20 hover:text-primary'
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                  {allTags.length > TAG_FILTER_PREVIEW && (
                    <Button
                      onClick={() => setShowAllTags(v => !v)}
                      variant="link"
                      size="xs"
                      className="px-1"
                    >
                      {showAllTags ? 'ย่อรายการแท็ก' : `ดูแท็กทั้งหมด (${allTags.length})`}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {activeFilterCount > 0 && (
              <button
                onClick={() => setParams({ difficulty: null, type: null, tag: null, page: null })}
                className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
              >
                <X className="w-3 h-3" /> ล้างตัวกรองทั้งหมด
              </button>
            )}
          </Card>
        )}

        {/* Active filter chips */}
        {activeFilterCount > 0 && !showFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">กรองโดย:</span>
            {diffFilter !== 'all' && (
              <span className="flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">
                {DIFF_META[diffFilter]?.label}
                <button onClick={() => setParams({ difficulty: null, page: null })} className="hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
              </span>
            )}
            {typeFilter !== 'all' && (
              <span className="flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">
                {TYPE_LABEL[typeFilter]}
                <button onClick={() => setParams({ type: null, page: null })} className="hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
              </span>
            )}
            {activeTag && (
              <span className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                #{activeTag}
                <button onClick={() => setParams({ tag: null, page: null })} className="hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
              </span>
            )}
          </div>
        )}

        {/* Paging above the list as well as below it — a full page of cards is a
            long scroll to reach the controls at the bottom. */}
        {totalPages > 1 && (
          <Pagination
            page={filters.page}
            totalPages={totalPages}
            isPending={isPending}
            label="หน้าของคลังโจทย์ (ด้านบน)"
            className="pt-0 pb-1"
            onGo={p => setParams({ page: String(p) })}
          />
        )}

        {/* Question list */}
        {totalCount === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <Card edge="ring" className="text-center py-16">
            <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">ไม่พบโจทย์ที่ตรงกัน</p>
            <p className="text-sm text-muted-foreground mt-1">ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง</p>
          </Card>
        ) : search ? (
          <div className={cn('space-y-7', busyList)} aria-busy={isPending}>
            {searchGroups.map(result => result.questions.length > 0 && (
              <section key={result.group} aria-labelledby={`own-search-${result.group}`} className="space-y-3">
                <SearchGroupHeading
                  id={`own-search-${result.group}`}
                  group={result.group}
                  count={searchGroupCounts[result.group]}
                />
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 gap-3' : 'space-y-2.5'}>
                  {result.questions.map(q => (
                    <QuestionCard
                      key={q.id}
                      question={q}
                      isFlagged={flaggedIds.has(q.id)}
                      onPreview={() => void openPreview(q.id)}
                      onToggleFlag={() => toggleFlag(q.id)}
                      myTeams={myTeams}
                      stats={stats[q.id]}
                      allTags={tagPool}
                      duplicateCount={duplicateCounts[q.id] ?? 0}
                      subQuestionCount={subQuestionCounts[q.id]}
                      sets={setMemberships[q.id]}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div
            className={cn(viewMode === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 gap-3' : 'space-y-2.5', busyList)}
            aria-busy={isPending}
          >
            {filtered.map(q => (
              <QuestionCard
                key={q.id}
                question={q}
                isFlagged={flaggedIds.has(q.id)}
                onPreview={() => void openPreview(q.id)}
                onToggleFlag={() => toggleFlag(q.id)}
                myTeams={myTeams}
                stats={stats[q.id]}
                allTags={tagPool}
                duplicateCount={duplicateCounts[q.id] ?? 0}
                subQuestionCount={subQuestionCounts[q.id]}
                sets={setMemberships[q.id]}
              />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <Pagination
            page={filters.page}
            totalPages={totalPages}
            isPending={isPending}
            label="หน้าของคลังโจทย์ (ท้ายรายการ)"
            onGo={p => {
              setParams({ page: String(p) })
              // The controls sit at the bottom of the list, so without this the
              // next page opens scrolled to its end.
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        )}
          </div>
        )}

        {(scope === 'all' || scope === 'team') && (
          <div className="space-y-4">
            {scope === 'all' && <h2 className="text-sm font-semibold text-muted-foreground">โจทย์ที่แชร์ในทีม</h2>}
            {!hasTeamOrg ? (
              <Card edge="ring" className="text-center py-24">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">ยังไม่มีทีม</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">สร้างหรือเข้าร่วมทีมก่อน เพื่อดูโจทย์ที่เพื่อนครูแชร์ไว้</p>
                <Link href="/settings/team">
                  <Button className="gap-2 shadow-sm">ไปที่หน้าทีมของฉัน</Button>
                </Link>
              </Card>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-48">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="ค้นหาจากชื่อ เนื้อหา หรือแท็ก..."
                      value={teamSearchDraft}
                      onChange={e => setTeamSearchDraft(e.target.value)}
                      className="pl-9 bg-card"
                    />
                  </div>

                  <QuestionSortControl
                    sort={teamSort}
                    onChange={setTeamSort}
                    label="เรียงลำดับโจทย์ที่แชร์ในทีม"
                    // "ทีมเจ้าของโจทย์" only tells the reader anything when
                    // more than one team is in the list to begin with.
                    scope="t"
                    omitKeys={hasMultipleTeams ? undefined : ['team']}
                  />
                  {hasMultipleTeams && (
                    <Select value={teamFilter} onValueChange={(v) => v !== null && setParams({ team: v === 'all' ? null : v, tpage: null })}>
                      <SelectTrigger className="bg-card">
                        <SelectValue placeholder="ทุกทีม">
                          {teamFilter === 'all' ? 'ทุกทีม' : myTeams.find(t => t.id === teamFilter)?.name ?? 'ทุกทีม'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">ทุกทีม</SelectItem>
                        {myTeams.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {teamSearch && (
                  <SearchGroupSelector
                    value={teamMatchScope}
                    counts={teamSearchGroupCounts}
                    onChange={match => setParams({ teammatch: match, tpage: null })}
                    label="เลือกแหล่งที่พบคำค้นในโจทย์ที่แชร์ในทีม"
                  />
                )}

                {teamMatchCount === 0 && !teamFilters.q && !teamFilters.team ? (
                  <Card edge="ring" className="text-center py-24">
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Users className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">ยังไม่มีโจทย์ที่แชร์ในทีม</h3>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">เมื่อสมาชิกในทีมสร้างโจทย์และเลือก &ldquo;ทีมของฉัน&rdquo; โจทย์จะปรากฏที่นี่</p>
                  </Card>
                ) : filteredTeam.length === 0 ? (
                  <Card edge="ring" className="text-center py-16">
                    <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">ไม่พบโจทย์ที่ตรงกัน</p>
                  </Card>
                ) : (
                  <>
                    {teamPaged && teamTotalPages > 1 && (
                      <Pagination
                        page={teamFilters.page}
                        totalPages={teamTotalPages}
                        isPending={isPending}
                        label="หน้าของโจทย์ในทีม (ด้านบน)"
                        className="pt-0 pb-1"
                        onGo={p => setParams({ tpage: String(p) })}
                      />
                    )}
                    {teamSearch ? (
                      <div className={cn('space-y-7', busyList)} aria-busy={isPending}>
                        {teamSearchGroups.map(result => result.questions.length > 0 && (
                          <section key={result.group} aria-labelledby={`team-search-${result.group}`} className="space-y-3">
                            <SearchGroupHeading
                              id={`team-search-${result.group}`}
                              group={result.group}
                              count={teamSearchGroupCounts[result.group]}
                            />
                            <div className="space-y-2.5">
                              {result.questions.map(q => (
                                <TeamQuestionCard key={q.id} question={q} showTeamName={hasMultipleTeams} currentUserId={currentUserId} subQuestionCount={subQuestionCounts[q.id]} sets={setMemberships[q.id]} onPreview={() => void openPreview(q.id)} />
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <div className={cn('space-y-2.5', busyList)} aria-busy={isPending}>
                        {filteredTeam.map(q => (
                          <TeamQuestionCard key={q.id} question={q} showTeamName={hasMultipleTeams} currentUserId={currentUserId} subQuestionCount={subQuestionCounts[q.id]} sets={setMemberships[q.id]} onPreview={() => void openPreview(q.id)} />
                        ))}
                      </div>
                    )}
                    {teamPaged && teamTotalPages > 1 && (
                      <Pagination
                        page={teamFilters.page}
                        totalPages={teamTotalPages}
                        isPending={isPending}
                        label="หน้าของโจทย์ในทีม (ท้ายรายการ)"
                        onGo={p => {
                          setParams({ tpage: String(p) })
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

      {/* Preview modal */}
      {previewLoadingId && <PreviewLoadingOverlay />}
      {previewQ && (
        <PreviewModal
          question={previewQ}
          isFlagged={flaggedIds.has(previewQ.id)}
          onClose={() => setPreviewQ(null)}
          onToggleFlag={() => toggleFlag(previewQ.id)}
          stats={stats[previewQ.id]}
        />
      )}
    </div>
  )
}

/**
 * Picking how the bank is ordered.
 *
 * Two controls rather than one menu of ten entries: "วันที่สร้าง ใหม่→เก่า"
 * and "วันที่สร้าง เก่า→ใหม่" are the same key asked twice, and spelling out
 * both ends of every key makes the menu twice as long to read for no more
 * choice than this.
 *
 * The direction button is labelled in the terms of the key it belongs to —
 * "ก → ฮ" on a column of names, "ใหม่ → เก่า" on a column of dates. "จากน้อย
 * ไปมาก" would describe the database rather than the list on screen.
 */



function PreviewLoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" aria-label="กำลังโหลดตัวอย่างโจทย์">
      <div className="h-80 w-full max-w-2xl animate-pulse rounded-2xl bg-card" />
    </div>
  )
}

function EmptyState() {
  return (
    <Card edge="ring" className="text-center py-24">
      <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <BookOpen className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">ยังไม่มีโจทย์ในคลัง</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">เริ่มสร้างโจทย์แรกเพื่อสร้างคลังข้อสอบฟิสิกส์</p>
      <Link href="/questions/new">
        <Button className="gap-2 shadow-sm">
          <Plus className="w-4 h-4" /> สร้างโจทย์แรก
        </Button>
      </Link>
    </Card>
  )
}

// ── TeamQuestionCard ─────────────────────────────────────────────────────────
// The creator can always edit their own question here; a teammate can too, but
// only if the creator turned on "อนุญาตให้เพื่อนในทีมแก้ไข" — enforced server-side.

function TeamQuestionCard({ question: q, showTeamName, currentUserId, subQuestionCount, sets, onPreview }: {
  question: QuestionWithCreator
  showTeamName: boolean
  currentUserId: string
  /** How many ข้อย่อย the question holds; absent when the count could not be read. */
  subQuestionCount?: number
  /** แฟ้มโจทย์ in view holding this question. Never says "none": a teammate's
   *  own แฟ้ม may simply be private to them. */
  sets?: QuestionSetRef[]
  onPreview: () => void
}) {
  // The edit page carries the bank's current view back with it, so returning
  // from an edit lands on the same search, filters and page.
  const returnQuery = useSearchParams().toString()
  const diff = DIFF_META[q.difficulty]
  const isGroup = q.order_in_group === 0
  const isOwner = q.created_by === currentUserId
  const canEdit = isOwner || q.team_edit_allowed

  return (
    <Card edge="ring" padding="md" className="hover:ring-primary/30 transition-all">
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {isGroup && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">📚 หลายขั้นตอน</span>
        )}
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${diff?.badge}`}>
          {diff?.label}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          {TYPE_LABEL[q.question_type] ?? q.question_type}
        </span>
        <SubQuestionCountBadge questionType={q.question_type} count={subQuestionCount} />
        {q.subject && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-tint-4/10 text-tint-4">
            {q.subject}
          </span>
        )}
        {q.question_categories?.name && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
            {q.question_categories.name}
          </span>
        )}
        {showTeamName && q.organizations?.name && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-tint-1/10 text-tint-1">
            {q.organizations.name}
          </span>
        )}
        {q.shared_org_names?.map((name) => (
          <span key={name} className="text-xs px-2 py-0.5 rounded-full bg-tint-2/10 text-tint-2">
            + {name}
          </span>
        ))}
        <QuestionSetBadges sets={sets} />
      </div>

      <button
        onClick={onPreview}
        className="text-sm font-semibold text-foreground hover:text-primary transition-colors text-left line-clamp-1 w-full"
      >
        {q.title}
      </button>
      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{questionExcerpt(q.question_text)}</p>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <span className="text-xs text-muted-foreground">
          โดย {q.users?.full_name || 'ไม่ทราบชื่อ'}
        </span>
        <div className="flex items-center gap-1.5">
          {canEdit && (
            <Link
              href={questionEditHref(
                isGroup ? `/questions/multi/${q.group_id}` : `/questions/${q.id}/edit`,
                returnQuery,
                { tab: 'team' },
              )}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-muted-foreground bg-muted hover:bg-accent rounded-lg transition-all"
            >
              <Edit2 className="w-3.5 h-3.5" /> แก้ไข
            </Link>
          )}
          <button
            onClick={onPreview}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/10 rounded-lg transition-all"
          >
            <Eye className="w-3.5 h-3.5" /> ดูตัวอย่าง
          </button>
        </div>
      </div>
    </Card>
  )
}


