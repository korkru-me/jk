'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DIFF_META } from '@/lib/question-display'
import { filterQuestions, tagsMatchingTerm } from '@/lib/question-search'
import type { AssignmentQuestionOption } from '@/components/assignments/create-assignment-form'
import { QuestionListPreviewDialog } from '@/components/assignments/question-list-preview-dialog'
import type { getQuestionPreviewDetails } from '@/lib/actions/question-previews'
import { Card } from '@/components/ui/card'
import { QuestionCard } from '@/components/questions/question-card'
import { getQuestionCardData } from '@/lib/actions/question-card-data'
import { EMPTY_CARD_DATA, type QuestionCardData } from '@/lib/question-card-data'
import { nextCardDataBatch } from '@/lib/question-card-prefetch'

const DIFFICULTY_FILTERS = ['all', 'easy', 'medium', 'hard', 'analytical'] as const

/**
 * Cards each part of the list (the picks, then the bank) draws before the
 * reader asks for more by scrolling to its end.
 *
 * The list used to draw every match at once. Over a real 912-question คลัง
 * (28 ตุลาคม 2026) opening เพิ่มหรือเอาโจทย์ออก built 937 cards — some 19,000
 * DOM nodes and a 0.3 s freeze on a fast laptop — and every badge batch that
 * came back re-rendered all of them again. Paging rather than windowing: cards
 * differ in height and the list keeps a ticked row still under the pointer,
 * both of which a list that unmounts rows as they scroll away would fight.
 * Select-all and the match count still work on every match, drawn or not.
 */
const PICKER_PAGE_SIZE = 40

type PickerPages = { filterKey: string; selected: number; bank: number }

function firstPages(filterKey: string): PickerPages {
  return { filterKey, selected: PICKER_PAGE_SIZE, bank: PICKER_PAGE_SIZE }
}

/** One more page of `part` — from the first page again if the filters changed. */
function morePages(prev: PickerPages, filterKey: string, part: 'selected' | 'bank'): PickerPages {
  const base = prev.filterKey === filterKey ? prev : firstPages(filterKey)
  return { ...base, [part]: base[part] + PICKER_PAGE_SIZE }
}

interface Props {
  questions: AssignmentQuestionOption[]
  selectedIds: string[]
  onToggle: (id: string) => void
  /** Enables bulk selection of matching questions while retaining hidden picks. */
  onSelectionChange?: (ids: string[]) => void
  search: string
  onSearchChange: (v: string) => void
  diffFilter: string
  onDiffFilterChange: (v: string) => void
  title?: string
  /** Rendered between the heading and the search box, where an entry point
   *  into the list belongs — the assignment wizard puts เพิ่มจากแฟ้มโจทย์
   *  there. Above the search on purpose: below it, it scrolls away exactly
   *  when a teacher deep in the bank goes looking for it. */
  toolbar?: React.ReactNode
  /** Rendered above the list — the set editor uses it to show which แฟ้มย่อย
   *  newly ticked questions will land in. */
  banner?: React.ReactNode
  /** The chip list of picked questions at the bottom. Off where a richer
   *  panel already shows the selection (the set editor). */
  showSelectedFooter?: boolean
  /** The heading row. Off inside a dialog, which titles itself. */
  showHeader?: boolean
  /** `plain` drops the card surface — for embedding in a dialog, which draws
   *  its own. */
  surface?: 'card' | 'plain'
  /**
   * What the selection was before this session of picking. Given it, the list
   * highlights pending additions, marks pending removals explicitly, and keeps
   * a question the teacher just unticked pinned where they can put it back.
   */
  baselineIds?: string[]
  /** What the picks go into, for the pending-removal note on each row. */
  collectionNoun?: string
  initialCardData?: QuestionCardData
  /** Local visual fixtures may supply synthetic details without reading Supabase. */
  loadPreviewQuestions?: typeof getQuestionPreviewDetails
  /** Local load fixtures may supply synthetic card badges the same way. */
  loadCardData?: typeof getQuestionCardData
}

export function QuestionPicker({
  questions, selectedIds, onToggle, onSelectionChange, search, onSearchChange, diffFilter, onDiffFilterChange,
  title = 'เลือกโจทย์', toolbar, banner, showSelectedFooter = true, showHeader = true, surface = 'card',
  baselineIds, collectionNoun = 'แฟ้ม', loadPreviewQuestions, initialCardData, loadCardData = getQuestionCardData,
}: Props) {
  const [previewId, setPreviewId] = useState<string | null>(null)
  const allTags = useMemo(
    () => Array.from(new Set(questions.flatMap(q => q.tags ?? []))).sort(),
    [questions],
  )
  // The tags the last word typed points at — shown as shortcuts, not as a
  // filter of their own: one box searches names, bodies and tags together,
  // the same rule the คลังโจทย์ page runs server-side.
  const lastWord = search.trim().split(/\s+/).pop() ?? ''
  const tagSuggestions = tagsMatchingTerm(allTags, lastWord)
    .filter(t => t.toLowerCase() !== lastWord.toLowerCase())
    .slice(0, 8)

  /** Swaps the word being typed for the whole tag it pointed at. */
  function completeWithTag(tag: string) {
    const words = search.trim().split(/\s+/).filter(Boolean)
    words[Math.max(0, words.length - 1)] = tag
    onSearchChange(`${words.join(' ')} `)
  }

  // Title, body text and tags, word by word — see lib/question-search. Kept
  // across renders that change neither: a tick or a badge batch arriving
  // should not strip the markup of the whole คลัง again.
  const filteredQs = useMemo(
    () => filterQuestions(questions, { search, difficulty: diffFilter }),
    [questions, search, diffFilter],
  )
  const hasFilters = search.trim().length > 0 || diffFilter !== 'all'
  const selectedSet = new Set(selectedIds)
  const matchingSelectedCount = filteredQs.filter(q => selectedSet.has(q.id)).length
  const allMatchingSelected = filteredQs.length > 0 && matchingSelectedCount === filteredQs.length

  function toggleAllMatching() {
    if (!onSelectionChange) return
    const matchingIds = new Set(filteredQs.map(q => q.id))
    onSelectionChange(allMatchingSelected
      ? selectedIds.filter(id => !matchingIds.has(id))
      : [...selectedIds, ...filteredQs.filter(q => !selectedSet.has(q.id)).map(q => q.id)])
  }

  function clearFilters() {
    onSearchChange('')
    onDiffFilterChange('all')
  }

  const baseline = baselineIds ?? []
  const baselineSet = new Set(baseline)
  const selectedOrder = new Map(selectedIds.map((id, index) => [id, index + 1]))
  const filteredById = new Map(filteredQs.map(question => [question.id, question]))
  // Keep a review copy of each pick at the top, but leave the original row in
  // its bank position too. Teachers can keep scanning from the same place and
  // the original checkbox remains the visible source of truth.
  const selectedQs = selectedIds
    .map(id => filteredById.get(id))
    .filter((question): question is AssignmentQuestionOption => question !== undefined)

  // How far each part is drawn, keyed by the filters so that a new search or
  // ระดับ starts again from the first page. See PICKER_PAGE_SIZE.
  const filterKey = `${diffFilter}\n${search}`
  const [pageState, setPageState] = useState(() => firstPages(filterKey))
  const pages = pageState.filterKey === filterKey ? pageState : firstPages(filterKey)
  const shownSelectedQs = selectedQs.slice(0, pages.selected)
  const shownBankQs = filteredQs.slice(0, pages.bank)
  const moreSelected = selectedQs.length - shownSelectedQs.length
  const moreBank = filteredQs.length - shownBankQs.length

  const listRef = useRef<HTMLDivElement>(null)
  const bankRowRefs = useRef(new Map<string, HTMLDivElement>())
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [cardData, setCardData] = useState(initialCardData ?? EMPTY_CARD_DATA)
  const requestedIds = useRef(new Set(Object.keys(initialCardData?.details ?? {})))
  const cardDataInFlight = useRef(false)
  /** The current list's way to ask for the next batch, for a request that just came back. */
  const scheduleCardData = useRef<(() => void) | null>(null)
  const pendingAnchorRef = useRef<{ id: string; top: number } | null>(null)

  useLayoutEffect(() => {
    const pendingAnchor = pendingAnchorRef.current
    const list = listRef.current
    const row = pendingAnchor ? bankRowRefs.current.get(pendingAnchor.id) : null
    if (pendingAnchor && list && row) {
      list.scrollTop += row.getBoundingClientRect().top - pendingAnchor.top
    }
    pendingAnchorRef.current = null
  }, [selectedIds])

  // Read badges only for drawn cards near the scroll viewport. The bank can
  // contain thousands of questions; opening a picker must not request all of
  // their folder memberships, duplicates and solution status. One batch is in
  // flight at a time and each covers the screen plus the rows after it — see
  // lib/question-card-prefetch.ts for why.
  const drawnRowsKey = [...shownSelectedQs, ...shownBankQs].map(q => q.id).join(',')
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const onScreen = new Set<HTMLElement>()
    let timer: ReturnType<typeof setTimeout> | undefined

    const requestNextBatch = () => {
      if (cardDataInFlight.current) return
      const rows = [...list.querySelectorAll<HTMLElement>('[data-question-id]')]
      const ids = nextCardDataBatch(
        rows.map(row => row.dataset.questionId!),
        new Set([...onScreen].map(row => row.dataset.questionId!)),
        requestedIds.current,
      )
      if (ids.length === 0) return
      ids.forEach(id => requestedIds.current.add(id))
      cardDataInFlight.current = true
      loadCardData(ids).then(data => {
        cardDataInFlight.current = false
        setCardData(prev => ({
          details: { ...prev.details, ...data.details },
          duplicateCounts: { ...prev.duplicateCounts, ...data.duplicateCounts },
          subQuestionCounts: { ...prev.subQuestionCounts, ...data.subQuestionCounts },
          setMemberships: { ...prev.setMemberships, ...data.setMemberships },
          solutionPresence: { ...prev.solutionPresence, ...data.solutionPresence },
        }))
        // The reader may have scrolled on while this was out.
        scheduleCardData.current?.()
      }, error => {
        cardDataInFlight.current = false
        console.error('[question-picker] card details failed:', error)
        // Asked again on the next scroll rather than straight away, so a
        // server that is failing is not called in a loop.
        ids.forEach(id => requestedIds.current.delete(id))
      })
    }
    // A scroll fires the observer many times; wait for it to settle so the
    // batch is chosen from where the reader stopped, not from every row passed.
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(requestNextBatch, 100)
    }
    scheduleCardData.current = schedule

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const row = entry.target as HTMLElement
        if (entry.isIntersecting) onScreen.add(row)
        else onScreen.delete(row)
      }
      schedule()
    }, { root: list, rootMargin: '100px' })
    list.querySelectorAll('[data-question-id]').forEach(row => observer.observe(row))
    return () => {
      observer.disconnect()
      clearTimeout(timer)
      if (scheduleCardData.current === schedule) scheduleCardData.current = null
    }
  }, [drawnRowsKey, loadCardData])

  // The next page of the bank as its end scrolls near. The ‘แสดงเพิ่ม’ button
  // under the list does the same for keyboard users.
  const hasMoreBank = moreBank > 0
  useEffect(() => {
    const list = listRef.current
    const sentinel = loadMoreRef.current
    if (!list || !sentinel) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setPageState(prev => morePages(prev, filterKey, 'bank'))
      }
    }, { root: list, rootMargin: '0px 0px 400px 0px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMoreBank, pages.bank, filterKey])

  function toggleFromBank(id: string) {
    const row = bankRowRefs.current.get(id)
    if (row) pendingAnchorRef.current = { id, top: row.getBoundingClientRect().top }
    onToggle(id)
  }

  const Surface = surface === 'plain' ? PlainSurface : CardSurface

  function questionRow(q: AssignmentQuestionOption, toggle: () => void, location: 'selected' | 'bank') {
    const orderNumber = selectedOrder.get(q.id) ?? null
    const isSelected = orderNumber !== null
    const wasSelected = baselineSet.has(q.id)
    const pending = !baselineIds ? null
      : isSelected && !wasSelected ? 'add'
      : !isSelected && wasSelected ? 'remove'
      : null
    return (
      <QuestionCard
        question={{
          ...q,
          subject: cardData.details[q.id]?.subject ?? q.subject,
          group_id: cardData.details[q.id]?.group_id ?? null,
          order_in_group: cardData.details[q.id]?.order_in_group ?? null,
          question_categories: cardData.details[q.id]?.category
            ? { name: cardData.details[q.id].category! } : null,
        }}
        isFlagged={false}
        onToggleFlag={() => {}}
        myTeams={[]}
        allTags={allTags}
        detailsLoaded={!!cardData.details[q.id]}
        duplicateCount={cardData.duplicateCounts[q.id] ?? 0}
        subQuestionCount={cardData.subQuestionCounts[q.id] ?? q.sub_question_count}
        sets={cardData.setMemberships[q.id]}
        hasSolution={cardData.solutionPresence[q.id]}
        position={orderNumber ?? undefined}
        onPreview={() => setPreviewId(q.id)}
        pickerContext={{
          selected: isSelected,
          onSelect: toggle,
          label: `${isSelected ? 'ยกเลิกการเลือก' : 'เลือก'}โจทย์ ${q.title}${location === 'selected' ? ' จากกลุ่มโจทย์ที่เลือก' : ''}`,
          pending,
          removalNote: `− จะเอาออกจาก${collectionNoun}`,
        }}
      />
    )
  }

  return (
    <>
    <Surface>
      {showHeader && (
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <span className="text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
            {selectedIds.length} ข้อที่เลือก
          </span>
        </div>
      )}

      {toolbar}

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหาจากชื่อ เนื้อหา หรือแท็ก..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <ToggleGroup
          value={[diffFilter]}
          onValueChange={values => {
            const next = values.at(-1)
            // Keep one filter selected. Clicking the active filter should not
            // leave the list in a visually blank/undefined state.
            if (next && DIFFICULTY_FILTERS.includes(next as typeof DIFFICULTY_FILTERS[number])) {
              onDiffFilterChange(next)
            }
          }}
          aria-label="กรองโจทย์ตามระดับความยาก"
          variant="outline"
          size="sm"
          spacing={1}
          className="max-w-full flex-wrap"
        >
          {DIFFICULTY_FILTERS.map(d => (
            <ToggleGroupItem
              key={d}
              value={d}
              className="h-auto rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground aria-pressed:bg-primary/10 aria-pressed:text-foreground data-[state=on]:bg-primary/10 data-[state=on]:text-foreground"
            >
              {d === 'all' ? 'ทั้งหมด' : DIFF_META[d]?.label ?? d}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Tag shortcuts for the word being typed. Spelled out rather than left
          to a <datalist>: the native dropdown never opens for some
          browsers/IMEs, so there was no hint that a tag existed at all. */}
      {tagSuggestions.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground">แท็กที่ตรง:</span>
          {tagSuggestions.map(t => (
            <Button
              key={t}
              type="button"
              variant="outline"
              size="xs"
              onClick={() => completeWithTag(t)}
            >
              #{t}
            </Button>
          ))}
        </div>
      )}

      {banner}

      {/* A count, because a filtered list that comes back short otherwise
          looks the same as one that failed to search. */}
      {hasFilters && filteredQs.length > 0 && (
        <p className="text-xs text-muted-foreground">
          พบ {filteredQs.length} ข้อ จากทั้งหมด {questions.length} ข้อ
        </p>
      )}

      {onSelectionChange && (
        <label className="flex min-h-6 w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground pointer-coarse:min-h-11">
          <input
            type="checkbox"
            checked={allMatchingSelected}
            ref={node => {
              if (node) node.indeterminate = matchingSelectedCount > 0 && !allMatchingSelected
            }}
            onChange={toggleAllMatching}
            disabled={filteredQs.length === 0}
            aria-label={hasFilters ? 'เลือกทุกข้อที่ตรงกับตัวกรอง' : 'เลือกทุกข้อ'}
            className="shrink-0 accent-primary"
          />
          <span>เลือกทุกข้อ{hasFilters ? 'ที่ตรงกับตัวกรอง' : ''} ({filteredQs.length} ข้อ)</span>
        </label>
      )}

      <div ref={listRef} className="flex max-h-96 flex-col gap-2 overflow-y-auto p-1">
        {filteredQs.length === 0 ? (
          <div className="text-center py-12 text-sm space-y-2">
            <p className="text-muted-foreground">
              {questions.length === 0 ? 'ยังไม่มีโจทย์ในคลัง' : 'ไม่พบโจทย์ที่ตรงกัน'}
            </p>
            {/* Which filters are on, spelled out: a tag chip left over from an
                earlier search is easy to miss, and it silently empties the
                list no matter what is typed in the search box. */}
            {hasFilters && (
              <>
                <p className="text-xs text-muted-foreground">
                  กำลังกรองด้วย{' '}
                  {[
                    search.trim() && `คำค้น “${search.trim()}”`,
                    diffFilter !== 'all' && `ระดับ ${DIFF_META[diffFilter]?.label ?? diffFilter}`,
                  ].filter(Boolean).join(' · ')}
                </p>
                <Button type="button" variant="link" size="xs" onClick={clearFilters}>
                  ล้างตัวกรองทั้งหมด
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            {selectedQs.length > 0 && (
              <>
                <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  โจทย์ที่เลือก ({selectedIds.length} ข้อ)
                </p>
                {shownSelectedQs.map(q => (
                  <div key={`selected-${q.id}`} data-question-id={q.id}>
                    {questionRow(q, () => onToggle(q.id), 'selected')}
                  </div>
                ))}
                {moreSelected > 0 && (
                  <ShowMoreRow
                    label={`แสดงโจทย์ที่เลือกอีก ${Math.min(PICKER_PAGE_SIZE, moreSelected)} ข้อ`}
                    detail={`แสดงอยู่ ${shownSelectedQs.length} จาก ${selectedQs.length} ข้อ`}
                    onClick={() => setPageState(prev => morePages(prev, filterKey, 'selected'))}
                  />
                )}
                <p className="px-1 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  โจทย์ทั้งหมด
                </p>
              </>
            )}
            {shownBankQs.map(q => (
              <div
                key={`bank-${q.id}`}
                data-question-id={q.id}
                ref={node => {
                  if (node) bankRowRefs.current.set(q.id, node)
                  else bankRowRefs.current.delete(q.id)
                }}
              >
                {questionRow(q, () => toggleFromBank(q.id), 'bank')}
              </div>
            ))}
            {moreBank > 0 && (
              <ShowMoreRow
                ref={loadMoreRef}
                label={`แสดงเพิ่มอีก ${Math.min(PICKER_PAGE_SIZE, moreBank)} ข้อ`}
                detail={`แสดงอยู่ ${shownBankQs.length} จาก ${filteredQs.length} ข้อ`}
                onClick={() => setPageState(prev => morePages(prev, filterKey, 'bank'))}
              />
            )}
          </>
        )}
      </div>

      {showSelectedFooter && selectedIds.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted-foreground mb-2">โจทย์ที่เลือก ({selectedIds.length} ข้อ)</p>
          <div className="flex flex-wrap gap-1.5">
            {selectedIds.map((id, i) => {
              const q = questions.find(qq => qq.id === id)
              return (
                <span key={id} className="flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-1 rounded-lg">
                  <span className="text-muted-foreground font-medium">{i + 1}.</span>
                  <span className="truncate max-w-[120px]">{q?.title ?? id}</span>
                  <button
                    type="button"
                    onClick={() => onToggle(id)}
                    className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                  >×</button>
                </span>
              )
            })}
          </div>
        </div>
      )}
    </Surface>
    <QuestionListPreviewDialog
      ids={previewId ? [previewId] : []}
      open={previewId !== null}
      title="ตัวอย่างโจทย์"
      onOpenChange={open => { if (!open) setPreviewId(null) }}
      loadQuestions={loadPreviewQuestions}
    />
    </>
  )
}

/** The next page of a part of the list, under its last drawn card. */
function ShowMoreRow({ label, detail, onClick, ref }: {
  label: string
  detail: string
  onClick: () => void
  ref?: React.Ref<HTMLDivElement>
}) {
  return (
    <div ref={ref} className="flex flex-wrap items-center justify-center gap-x-2 text-xs text-muted-foreground">
      <Button type="button" variant="link" size="xs" onClick={onClick} className="pointer-coarse:min-h-11">
        {label}
      </Button>
      <span>{detail}</span>
    </div>
  )
}

function CardSurface({ children }: { children: React.ReactNode }) {
  return <Card padding="xl" className="min-w-0 space-y-4">{children}</Card>
}

function PlainSurface({ children }: { children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-2">{children}</div>
}
