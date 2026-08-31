'use client'

import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DIFF_META, TYPE_SHORT, questionExcerpt } from '@/lib/question-display'
import { filterQuestions, tagsMatchingTerm } from '@/lib/question-search'
import type { AssignmentQuestionOption } from '@/components/assignments/create-assignment-form'
import { Card } from '@/components/ui/card'

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

  // Pin selected questions to the top, in the order they were picked — with
  // a bank of hundreds/thousands of questions, scrolling to find whichever
  // ones are already checked is painful, so piling them up front instead
  // makes review/toggling fast regardless of list size.
  const filteredIdSet = new Set(filteredQs.map(q => q.id))
  // Pending removals stay pinned alongside the picks: unticking a question
  // must not fling it back into a bank of thousands, where undoing the
  // mistake means finding it again.
  const baseline = baselineIds ?? []
  const pinnedIds = baselineIds
    ? [...selectedIds, ...baseline.filter(id => !selectedIds.includes(id))]
    : selectedIds
  const pinnedQs = pinnedIds
    .filter(id => filteredIdSet.has(id))
    .map(id => filteredQs.find(q => q.id === id)!)
  const pinnedIdSet = new Set(pinnedQs.map(q => q.id))
  const restQs = filteredQs.filter(q => !pinnedIdSet.has(q.id))
  const orderedQs = [...pinnedQs, ...restQs]

  const Surface = surface === 'plain' ? PlainSurface : CardSurface

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
        <div className="flex gap-1 flex-wrap">
          {['all', 'easy', 'medium', 'hard', 'analytical'].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => onDiffFilterChange(d)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                diffFilter === d ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:border-ring'
              }`}
            >
              {d === 'all' ? 'ทั้งหมด' : DIFF_META[d]?.label ?? d}
            </button>
          ))}
        </div>
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

      <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1">
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
        ) : orderedQs.map((q, i) => {
          const diff = DIFF_META[q.difficulty]
          const isSelected = selectedIds.includes(q.id)
          const wasSelected = baseline.includes(q.id)
          const pending = !baselineIds ? null
            : isSelected && !wasSelected ? 'add'
            : !isSelected && wasSelected ? 'remove'
            : null
          const orderNumber = isSelected ? selectedIds.indexOf(q.id) + 1 : null
          // Divider right where the pinned (selected) block ends, only when
          // both groups are present — makes the reordering self-explanatory
          // instead of the list just silently jumping around.
          const showDivider = i === pinnedQs.length && pinnedQs.length > 0 && restQs.length > 0
          return (
            <div key={q.id}>
              {showDivider && (
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-1 pt-1 pb-1.5">
                  โจทย์อื่นๆ
                </p>
              )}
              <label
                className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                  pending === 'add' ? 'bg-success/10 border-success/30'
                    : pending === 'remove' ? 'bg-destructive/10 border-destructive/30'
                    : isSelected ? 'bg-primary/10 border-primary/20'
                    : 'border-transparent hover:bg-muted'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(q.id)}
                  className="mt-0.5 accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {/* Which number this question will carry in the finished
                        paper. The footer chips numbered the picks already; the
                        rows did not, so the order was only visible by counting
                        chips against a list of titles. */}
                    {orderNumber !== null && (
                      <span className="text-primary font-semibold mr-1.5">ข้อ {orderNumber}</span>
                    )}
                    {q.title}
                  </p>
                  {pending ? (
                    <p className={`text-xs mt-0.5 font-medium ${pending === 'add' ? 'text-success' : 'text-destructive'}`}>
                      {pending === 'add' ? `+ จะเพิ่มเข้า${collectionNoun}` : `− จะเอาออกจาก${collectionNoun}`}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{questionExcerpt(q.question_text)}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${diff ? `${diff.badge} ${diff.border}` : 'bg-muted text-muted-foreground border-border'}`}>
                    {diff?.label ?? q.difficulty}
                  </span>
                  <span className="text-xs text-muted-foreground">{TYPE_SHORT[q.question_type] ?? q.question_type}</span>
                </div>
              </label>
            </div>
          )
        })}
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
