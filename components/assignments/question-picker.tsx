'use client'

import { useLayoutEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DIFF_META, TYPE_SHORT, questionExcerpt } from '@/lib/question-display'
import { filterQuestions, tagsMatchingTerm } from '@/lib/question-search'
import type { AssignmentQuestionOption } from '@/components/assignments/create-assignment-form'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const DIFFICULTY_FILTERS = ['all', 'easy', 'medium', 'hard', 'analytical'] as const

interface Props {
  questions: AssignmentQuestionOption[]
  selectedIds: string[]
  onToggle: (id: string) => void
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
   * marks each row จะเพิ่ม / จะเอาออก instead of silently changing, and keeps
   * a question the teacher just unticked pinned where they can put it back.
   */
  baselineIds?: string[]
  /** What the picks go into, for the จะเพิ่ม/จะเอาออก notes on each row. */
  collectionNoun?: string
}

export function QuestionPicker({
  questions, selectedIds, onToggle, search, onSearchChange, diffFilter, onDiffFilterChange,
  title = 'เลือกโจทย์', toolbar, banner, showSelectedFooter = true, showHeader = true, surface = 'card',
  baselineIds, collectionNoun = 'แฟ้ม',
}: Props) {
  const allTags = Array.from(new Set(questions.flatMap(q => q.tags ?? []))).sort()
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

  // Title, body text and tags, word by word — see lib/question-search.
  const filteredQs = filterQuestions(questions, { search, difficulty: diffFilter })
  const hasFilters = search.trim().length > 0 || diffFilter !== 'all'

  function clearFilters() {
    onSearchChange('')
    onDiffFilterChange('all')
  }

  const baseline = baselineIds ?? []
  const filteredById = new Map(filteredQs.map(question => [question.id, question]))
  // Keep a review copy of each pick at the top, but leave the original row in
  // its bank position too. Teachers can keep scanning from the same place and
  // the original checkbox remains the visible source of truth.
  const selectedQs = selectedIds
    .map(id => filteredById.get(id))
    .filter((question): question is AssignmentQuestionOption => question !== undefined)

  const listRef = useRef<HTMLDivElement>(null)
  const bankRowRefs = useRef(new Map<string, HTMLDivElement>())
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

  function toggleFromBank(id: string) {
    const row = bankRowRefs.current.get(id)
    if (row) pendingAnchorRef.current = { id, top: row.getBoundingClientRect().top }
    onToggle(id)
  }

  const Surface = surface === 'plain' ? PlainSurface : CardSurface

  function questionRow(q: AssignmentQuestionOption, toggle: () => void, location: 'selected' | 'bank') {
    const diff = DIFF_META[q.difficulty]
    const isSelected = selectedIds.includes(q.id)
    const wasSelected = baseline.includes(q.id)
    const pending = !baselineIds ? null
      : isSelected && !wasSelected ? 'add'
      : !isSelected && wasSelected ? 'remove'
      : null
    const orderNumber = isSelected ? selectedIds.indexOf(q.id) + 1 : null

    return (
      <label
        className={cn(
          'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all',
          pending === 'add' && 'border-success/30 bg-success/10',
          pending === 'remove' && 'border-destructive/30 bg-destructive/10',
          !pending && isSelected && 'border-border bg-primary/10',
          !pending && !isSelected && 'border-transparent hover:bg-muted',
        )}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={toggle}
          aria-label={`${isSelected ? 'ยกเลิกการเลือก' : 'เลือก'}โจทย์ ${q.title}${location === 'selected' ? ' จากกลุ่มโจทย์ที่เลือก' : ''}`}
          className="mt-0.5 accent-primary"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {orderNumber !== null && (
              <span className="mr-1.5 font-semibold text-primary">ข้อ {orderNumber}</span>
            )}
            {q.title}
          </p>
          {pending ? (
            <p className={cn('mt-0.5 text-xs font-medium', pending === 'add' ? 'text-success' : 'text-destructive')}>
              {pending === 'add' ? `+ จะเพิ่มเข้า${collectionNoun}` : `− จะเอาออกจาก${collectionNoun}`}
            </p>
          ) : (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{questionExcerpt(q.question_text)}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cn('rounded border px-1.5 py-0.5 text-xs', diff ? `${diff.badge} ${diff.border}` : 'border-border bg-muted text-muted-foreground')}>
            {diff?.label ?? q.difficulty}
          </span>
          <span className="text-xs text-muted-foreground">{TYPE_SHORT[q.question_type] ?? q.question_type}</span>
        </div>
      </label>
    )
  }

  return (
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

      <div ref={listRef} className="max-h-96 overflow-y-auto space-y-1.5 pr-1">
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
                {selectedQs.map(q => (
                  <div key={`selected-${q.id}`}>
                    {questionRow(q, () => onToggle(q.id), 'selected')}
                  </div>
                ))}
                <p className="px-1 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  โจทย์ทั้งหมด
                </p>
              </>
            )}
            {filteredQs.map(q => (
              <div
                key={`bank-${q.id}`}
                ref={node => {
                  if (node) bankRowRefs.current.set(q.id, node)
                  else bankRowRefs.current.delete(q.id)
                }}
              >
                {questionRow(q, () => toggleFromBank(q.id), 'bank')}
              </div>
            ))}
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
  )
}

function CardSurface({ children }: { children: React.ReactNode }) {
  return <Card padding="xl" className="min-w-0 space-y-4">{children}</Card>
}

function PlainSurface({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 space-y-4">{children}</div>
}
