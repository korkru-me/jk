'use client'

import { useState, useTransition } from 'react'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { setRequiresWorkImage } from '@/lib/actions/questions'
import { DIFF_META, TYPE_SHORT, questionExcerpt } from '@/lib/question-display'
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
}

export function QuestionPicker({
  questions, selectedIds, onToggle, search, onSearchChange, diffFilter, onDiffFilterChange,
  title = 'เลือกโจทย์', banner, showSelectedFooter = true, showHeader = true, surface = 'card',
  baselineIds,
}: Props) {
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [workImageOverrides, setWorkImageOverrides] = useState<Record<string, boolean>>({})
  const [, startTransition] = useTransition()
  const allTags = Array.from(new Set(questions.flatMap(q => q.tags ?? []))).sort()

  function handleToggleWorkImage(id: string, next: boolean) {
    setWorkImageOverrides(prev => ({ ...prev, [id]: next }))
    startTransition(async () => {
      const result = await setRequiresWorkImage(id, next)
      if (result?.error) {
        setWorkImageOverrides(prev => ({ ...prev, [id]: !next }))
        toast.error(result.error)
      }
    })
  }

  function addTagFilter(tag: string) {
    const t = tag.trim()
    if (!t || tagFilters.some(f => f.toLowerCase() === t.toLowerCase())) return
    setTagFilters(prev => [...prev, t])
    setTagInput('')
  }
  function removeTagFilter(tag: string) {
    setTagFilters(prev => prev.filter(f => f !== tag))
  }

  const filteredQs = questions.filter(q => {
    if (diffFilter !== 'all' && q.difficulty !== diffFilter) return false
    // Matched against the text a teacher can actually see: searching the raw
    // value hits markup ("class", "span") and misses a phrase that happens to
    // straddle a tag.
    if (search && !q.title.toLowerCase().includes(search.toLowerCase()) && !questionExcerpt(q.question_text).toLowerCase().includes(search.toLowerCase())) return false
    if (tagFilters.length > 0) {
      const qTags = (q.tags ?? []).map(t => t.toLowerCase())
      if (!tagFilters.every(f => qTags.includes(f.toLowerCase()))) return false
    }
    return true
  })

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

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหาโจทย์..."
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

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Input
            list="question-picker-tags"
            placeholder="พิมพ์แท็กแล้วกด Enter เพื่อเพิ่มตัวกรอง..."
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTagFilter(tagInput) }
            }}
            className="text-sm"
          />
          <datalist id="question-picker-tags">
            {allTags.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>
        {tagFilters.map(t => (
          <span key={t} className="flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded-lg">
            #{t}
            <button type="button" onClick={() => removeTagFilter(t)} className="text-primary hover:text-destructive transition-colors ml-0.5">×</button>
          </span>
        ))}
      </div>

      {banner}

      <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1">
        {filteredQs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">ไม่พบโจทย์ที่ตรงกัน</div>
        ) : orderedQs.map((q, i) => {
          const diff = DIFF_META[q.difficulty]
          const isSelected = selectedIds.includes(q.id)
          const wasSelected = baseline.includes(q.id)
          const pending = !baselineIds ? null
            : isSelected && !wasSelected ? 'add'
            : !isSelected && wasSelected ? 'remove'
            : null
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
                  <p className="text-sm font-medium text-foreground truncate">{q.title}</p>
                  {pending ? (
                    <p className={`text-xs mt-0.5 font-medium ${pending === 'add' ? 'text-success' : 'text-destructive'}`}>
                      {pending === 'add' ? '+ จะเพิ่มเข้าแฟ้ม' : '− จะเอาออกจากแฟ้ม'}
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
                  {q.question_type === 'written' && (
                    <div
                      className="flex items-center gap-1"
                      onClick={e => { e.preventDefault(); e.stopPropagation() }}
                      title="บังคับแนบรูปวิธีทำ"
                    >
                      <ToggleSwitch
                        checked={workImageOverrides[q.id] ?? q.requires_work_image}
                        onChange={next => handleToggleWorkImage(q.id, next)}
                      />
                    </div>
                  )}
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
