'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { ChevronUp, ChevronDown, LayoutGrid, List, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { questionExcerpt } from '@/lib/question-display'
import { getQuestionClientDetail } from '@/lib/actions/questions'
import { getQuestionCardData } from '@/lib/actions/question-card-data'
import { EMPTY_CARD_DATA, type QuestionCardData } from '@/lib/question-card-data'
import { QuestionCard, type QuestionCardRow } from './question-card'
import type { QuestionDetailWithCategory } from './preview-modal'
import type { Question } from '@/lib/types'

const PreviewModal = dynamic(
  () => import('./preview-modal').then(mod => mod.PreviewModal),
  { ssr: false },
)

/** A โจทย์ as the แฟ้ม editor already holds it, before any card detail. */
export interface SetListQuestion {
  id: string
  title: string
  question_text?: string | null
  question_type: Question['question_type']
  difficulty: Question['difficulty']
  tags?: string[] | null
  requires_work_image?: boolean
  sub_question_count?: number
}

/**
 * Cards per page.
 *
 * The same 24 the คลังโจทย์ list uses, and for the same reason twice over: a
 * full card is a heavy thing to mount, and every per-card read below is asked
 * about exactly what is on screen. A แฟ้ม of eight hundred โจทย์ therefore
 * renders and fetches no more than a แฟ้ม of eight.
 */
const PER_PAGE = 24

function mergeData(a: QuestionCardData, b: QuestionCardData): QuestionCardData {
  return {
    details: { ...a.details, ...b.details },
    stats: { ...a.stats, ...b.stats },
    duplicateCounts: { ...a.duplicateCounts, ...b.duplicateCounts },
    subQuestionCounts: { ...a.subQuestionCounts, ...b.subQuestionCounts },
    setMemberships: { ...a.setMemberships, ...b.setMemberships },
  }
}

interface Props {
  /** Every โจทย์ the editor knows about, for looking ids up. */
  byId: Map<string, SetListQuestion>
  /** The แฟ้ม's list, in the order students will see. */
  questionIds: string[]
  /** question id → the แฟ้มย่อย inside this แฟ้ม that hold it. */
  sectionTitlesById: Map<string, string[]>
  selected: string[]
  onToggleSelected: (id: string) => void
  onSelectAll: (all: boolean) => void
  onMove: (id: string, delta: number) => void
  onRemove: (ids: string[]) => void
  /** Tags across the คลัง, offered by the in-card tag editor. */
  allTags: string[]
  myTeams: { id: string; name: string }[]
  /**
   * The แฟ้ม's id, once it has one. Absent while a แฟ้ม is still being created,
   * which is the one state where แก้ไข cannot be offered: there is nothing to
   * save the draft into before leaving for the โจทย์ editor.
   */
  setId?: string
  /** Writes the แฟ้ม draft down. Resolves false when the save failed. */
  onSaveBeforeEdit?: () => Promise<boolean>
  /** Card data for the first page, fetched with the page so it paints complete. */
  initialCardData?: QuestionCardData
}

/**
 * The โจทย์ of one แฟ้ม, as cards or as a list.
 *
 * Two views because the list answers two different questions, and no single
 * row height answers both. Reading and fixing โจทย์ — which is why this list
 * grew the คลังโจทย์ card at all, so a teacher can narrow a คลัง of hundreds
 * down to one แฟ้ม and work inside it — wants everything a โจทย์ is: its
 * badges, its wording, its item analysis, and the whole toolbox beside it.
 * Ordering wants the opposite. The numbers here are what students see on the
 * paper, and dragging ข้อ 80 up to ข้อ 3 past card after card is unusable, so
 * that view keeps the one-line rows it always had.
 *
 * ลบถาวร is the one control that does not sit with its neighbours. Everything
 * else on a card acts on this แฟ้ม; that one acts on the คลัง, and two similar
 * icons a few pixels apart is how a โจทย์ gets deleted when the teacher meant
 * to unfile it. It lives behind the ⋯ menu instead — see QuestionCard.
 */
export function SetQuestionList({
  byId, questionIds, sectionTitlesById, selected, onToggleSelected, onSelectAll,
  onMove, onRemove, allTags, myTeams, setId, onSaveBeforeEdit, initialCardData,
}: Props) {
  const [view, setView] = useState<'cards' | 'compact'>('cards')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [cardData, setCardData] = useState<QuestionCardData>(initialCardData ?? EMPTY_CARD_DATA)
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set())
  const [previewQ, setPreviewQ] = useState<QuestionDetailWithCategory | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null)

  // Ids already asked about, and ids whose answer has landed. Both are needed:
  // a โจทย์ the detail read returns nothing for (deleted under us) is settled
  // without ever appearing in `details`, and asking again forever would be the
  // alternative.
  const requestedIds = useRef(new Set<string>(Object.keys(initialCardData?.details ?? {})))
  const [settledIds, setSettledIds] = useState<Set<string>>(
    () => new Set(Object.keys(initialCardData?.details ?? {})),
  )

  const label = (id: string) => {
    const q = byId.get(id)
    if (!q) return 'โจทย์นี้ถูกลบไปแล้ว'
    return q.title || questionExcerpt(q.question_text) || 'ไม่มีชื่อ'
  }

  const term = search.trim().toLowerCase()
  const matchingIds = useMemo(() => {
    if (!term) return questionIds
    return questionIds.filter(id => {
      const q = byId.get(id)
      const haystack = [q?.title, q?.question_text, ...(q?.tags ?? [])].join(' ').toLowerCase()
      return haystack.includes(term)
    })
  }, [term, questionIds, byId])

  const pageCount = Math.max(1, Math.ceil(matchingIds.length / PER_PAGE))
  const currentPage = Math.min(page, pageCount)
  const visibleIds = view === 'cards'
    ? matchingIds.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE)
    : matchingIds

  // Searching or removing can shrink the list out from under the page number.
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])

  // The per-card reads, for the cards on screen and nothing else. Compact rows
  // print none of it, so that view costs nothing at all.
  const cardIdsKey = view === 'cards' ? visibleIds.join(',') : ''
  useEffect(() => {
    if (!cardIdsKey) return
    const missing = cardIdsKey.split(',').filter(id => id && !requestedIds.current.has(id))
    if (missing.length === 0) return
    for (const id of missing) requestedIds.current.add(id)

    let cancelled = false
    void getQuestionCardData(missing).then(data => {
      if (cancelled) return
      setCardData(prev => mergeData(prev, data))
      setSettledIds(prev => {
        const next = new Set(prev)
        for (const id of missing) next.add(id)
        return next
      })
    })
    return () => { cancelled = true }
  }, [cardIdsKey])

  async function openPreview(id: string) {
    setPreviewLoadingId(id)
    const result = await getQuestionClientDetail(id)
    setPreviewLoadingId(null)
    if ('error' in result) return
    setPreviewQ(result.data as unknown as QuestionDetailWithCategory)
  }

  function toggleFlag(id: string) {
    setFlaggedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** The card row, assembled from what the editor holds plus what has landed. */
  function cardRow(q: SetListQuestion): QuestionCardRow {
    const detail = cardData.details[q.id]
    return {
      id: q.id,
      title: q.title,
      question_text: q.question_text ?? '',
      question_type: q.question_type,
      difficulty: q.difficulty,
      tags: q.tags ?? null,
      requires_work_image: q.requires_work_image ?? false,
      group_id: detail?.group_id ?? null,
      order_in_group: detail?.order_in_group ?? null,
      subject: detail?.subject ?? null,
      question_categories: detail?.category ? { name: detail.category } : null,
    }
  }

  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.includes(id))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={event => { setSearch(event.target.value); setPage(1) }}
            placeholder="ค้นหาโจทย์ในแฟ้มนี้..."
            aria-label="ค้นหาโจทย์ในแฟ้มนี้"
            className="pl-9 pr-9 bg-card"
          />
          {search && (
            <IconButton
              label="ล้างคำค้นหา"
              size="2xs"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => { setSearch(''); setPage(1) }}
            >
              <X className="w-3.5 h-3.5" />
            </IconButton>
          )}
        </div>

        <div className="inline-flex w-fit items-center rounded-lg bg-muted p-[3px] gap-0.5 ml-auto">
          {([
            { value: 'cards' as const, label: 'การ์ด', icon: LayoutGrid },
            { value: 'compact' as const, label: 'รายการสั้น', icon: List },
          ]).map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setView(option.value)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 h-[26px] text-sm font-medium transition-all',
                view === option.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-foreground/60 hover:text-foreground/80',
              )}
            >
              <option.icon className="w-3.5 h-3.5" />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={() => onSelectAll(!allVisibleSelected)}
            className="accent-primary"
          />
          {view === 'cards' && pageCount > 1 ? `เลือกทั้งหน้า (${visibleIds.length} ข้อ)` : 'เลือกทั้งหมด'}
        </label>
        {term && (
          <p className="text-xs text-muted-foreground">
            ตรงกับคำค้นหา {matchingIds.length} จาก {questionIds.length} ข้อ
          </p>
        )}
        {view === 'compact' && (
          <p className="text-xs text-muted-foreground">
            มุมมองนี้ไว้จัดลำดับเลขข้อ — สลับไป “การ์ด” เพื่อแก้ไขโจทย์
          </p>
        )}
      </div>

      {matchingIds.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">ไม่พบโจทย์ที่ตรงกับคำค้นหาในแฟ้มนี้</p>
      ) : view === 'compact' ? (
        <ul className="space-y-0.5">
          {visibleIds.map(id => {
            const index = questionIds.indexOf(id)
            const titles = sectionTitlesById.get(id) ?? []
            const isSelected = selected.includes(id)

            return (
              <li
                key={id}
                className={cn(
                  'group flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-lg transition-colors',
                  isSelected ? 'bg-primary/[0.06]' : 'hover:bg-muted/50',
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelected(id)}
                  aria-label={`เลือก ${label(id)}`}
                  className="accent-primary shrink-0"
                />
                <span className="text-xs text-muted-foreground w-6 shrink-0 tabular-nums">{index + 1}.</span>
                <span className={cn('flex-1 min-w-0 text-sm truncate', byId.has(id) ? 'text-foreground' : 'text-destructive')}>
                  {label(id)}
                </span>

                {titles.length > 0 && (
                  <span className="hidden sm:flex items-center gap-1 shrink-0">
                    {titles.slice(0, 2).map(title => (
                      <span
                        key={title}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary whitespace-nowrap max-w-[8rem] truncate"
                      >
                        {title}
                      </span>
                    ))}
                    {titles.length > 2 && (
                      <span className="text-[11px] text-muted-foreground">+{titles.length - 2}</span>
                    )}
                  </span>
                )}

                {/* Hover-to-reveal only from sm up: on a phone there is no
                    hover, so controls that hide would be unreachable. */}
                <div className="flex items-center shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                  <IconButton label="ย้ายขึ้น" size="2xs" disabled={index <= 0} onClick={() => onMove(id, -1)}>
                    <ChevronUp className="w-3.5 h-3.5" />
                  </IconButton>
                  <IconButton
                    label="ย้ายลง"
                    size="2xs"
                    disabled={index === questionIds.length - 1}
                    onClick={() => onMove(id, 1)}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </IconButton>
                  <IconButton
                    label="เอาออกจากแฟ้ม"
                    size="2xs"
                    className="hover:text-destructive"
                    onClick={() => onRemove([id])}
                  >
                    <X className="w-3.5 h-3.5" />
                  </IconButton>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="space-y-3">
          {visibleIds.map(id => {
            const q = byId.get(id)
            const index = questionIds.indexOf(id)
            if (!q) {
              return (
                <Card key={id} edge="ring" padding="sm" className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-6 shrink-0 tabular-nums">{index + 1}.</span>
                  <span className="flex-1 text-sm text-destructive">โจทย์นี้ถูกลบไปแล้ว</span>
                  <Button size="sm" variant="outline" onClick={() => onRemove([id])}>เอาออกจากแฟ้ม</Button>
                </Card>
              )
            }
            return (
              <QuestionCard
                key={id}
                question={cardRow(q)}
                isFlagged={flaggedIds.has(id)}
                onPreview={() => void openPreview(id)}
                onToggleFlag={() => toggleFlag(id)}
                myTeams={myTeams}
                stats={cardData.stats[id]}
                detailsLoaded={settledIds.has(id)}
                allTags={allTags}
                duplicateCount={cardData.duplicateCounts[id] ?? 0}
                subQuestionCount={cardData.subQuestionCounts[id] ?? q.sub_question_count}
                setContext={{
                  order: index + 1,
                  selected: selected.includes(id),
                  onSelect: () => onToggleSelected(id),
                  onMoveUp: () => onMove(id, -1),
                  onMoveDown: () => onMove(id, 1),
                  canMoveUp: index > 0,
                  canMoveDown: index < questionIds.length - 1,
                  onRemove: () => onRemove([id]),
                  sectionTitles: sectionTitlesById.get(id) ?? [],
                  setId,
                  onBeforeEdit: onSaveBeforeEdit,
                }}
              />
            )
          })}

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                ← ก่อนหน้า
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {currentPage} / {pageCount}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                ถัดไป →
              </Button>
            </div>
          )}

          {!setId && (
            <p className="text-xs text-muted-foreground text-center">
              บันทึกแฟ้มนี้ก่อน จึงจะแก้ไขหรือลบโจทย์จากตรงนี้ได้
            </p>
          )}
        </div>
      )}

      {previewLoadingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" aria-label="กำลังโหลดตัวอย่างโจทย์">
          <div className="h-80 w-full max-w-2xl animate-pulse rounded-2xl bg-card" />
        </div>
      )}
      {previewQ && (
        <PreviewModal
          question={previewQ}
          isFlagged={flaggedIds.has(previewQ.id)}
          stats={cardData.stats[previewQ.id]}
          onClose={() => setPreviewQ(null)}
          onToggleFlag={() => toggleFlag(previewQ.id)}
        />
      )}
    </div>
  )
}
