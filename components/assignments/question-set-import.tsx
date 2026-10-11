'use client'

import { useState } from 'react'
import { Check, ChevronDown, Eye, Minus, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parseSections, questionIdsForSections, type QuestionSetSection } from '@/lib/question-set-sections'
import { cn } from '@/lib/utils'
import type { AssignmentQuestionSetOption } from '@/components/assignments/create-assignment-form'

/** Past this many แฟ้ม the list gets a search box of its own. Below it,
 *  everything fits on screen and a second search field next to the โจทย์ one
 *  is just a thing to mistype into. */
const SEARCH_THRESHOLD = 6

interface Props {
  sets: AssignmentQuestionSetOption[]
  /** Ids the คลัง can actually supply. A แฟ้ม saved months ago can point at
   *  โจทย์ that have since been deleted, and those can never be added. */
  bankIds: ReadonlySet<string>
  selectedIds: string[]
  onToggle: (choice: QuestionSetImportChoice) => void
  onPreview: (choice: QuestionSetImportChoice) => void
}

export interface QuestionSetImportChoice {
  title: string
  toastLabel: string
  questionIds: string[]
  sections: QuestionSetSection[]
}

interface ChoiceRow {
  choice: QuestionSetImportChoice
  /** Questions in this แฟ้ม that still exist in the teacher's คลัง. */
  usable: number
  /** …of those, how many are already picked. */
  added: number
  /** Ids the แฟ้ม lists that no longer resolve to a โจทย์. */
  missing: number
}

interface SetRow {
  set: AssignmentQuestionSetOption
  whole: ChoiceRow
  sections: ChoiceRow[]
}

/**
 * The "เพิ่มจากแฟ้มโจทย์ที่มีอยู่" shortcut, folded away until asked for.
 *
 * It lives inside the เลือกโจทย์ card rather than in a card above it: the
 * bank list is long, and a teacher halfway down it should not have to
 * remember that a card scrolled off the top is where แฟ้ม come from.
 */
export function QuestionSetImport({ sets, bankIds, selectedIds, onToggle, onPreview }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expandedSetIds, setExpandedSetIds] = useState<Set<string>>(() => new Set())

  if (sets.length === 0) return null

  const picked = new Set(selectedIds)
  const rows: SetRow[] = sets.map(set => {
    const sections = parseSections(set.sections)
    const whole = choiceRow({
      title: 'ทุกข้อในแฟ้ม',
      toastLabel: `แฟ้ม "${set.title}"`,
      questionIds: set.question_ids,
      sections,
    }, bankIds, picked)
    return {
      set,
      whole,
      sections: sections.map(section => choiceRow({
        title: section.title || 'แฟ้มย่อยไม่มีชื่อ',
        toastLabel: `แฟ้มย่อย "${section.title || 'แฟ้มย่อยไม่มีชื่อ'}" ในแฟ้ม "${set.title}"`,
        questionIds: questionIdsForSections(sections, [section.id], set.question_ids),
        sections: [section],
      }, bankIds, picked)),
    }
  })

  const term = query.trim().toLowerCase()
  const matching = term
    ? rows.filter(r =>
        r.set.title.toLowerCase().includes(term)
        || (r.set.description ?? '').toLowerCase().includes(term)
        || r.sections.some(section => section.choice.title.toLowerCase().includes(term)))
    : rows
  // แฟ้ม with nothing left to give sink to the bottom instead of being hidden:
  // a teacher looking for one they know exists must still find it, and read
  // why it can't be used. Order is otherwise the คลัง's own (newest first),
  // and importing does not reshuffle the list under the cursor.
  const visible = [
    ...matching.filter(r => r.whole.usable > 0),
    ...matching.filter(r => r.whole.usable === 0),
  ]

  function toggleExpanded(setId: string) {
    setExpandedSetIds(current => {
      const next = new Set(current)
      if (next.has(setId)) next.delete(setId)
      else next.add(setId)
      return next
    })
  }

  function updateQuery(value: string) {
    setQuery(value)
    const nextTerm = value.trim().toLowerCase()
    if (!nextTerm) return
    setExpandedSetIds(current => {
      const next = new Set(current)
      for (const row of rows) {
        if (row.sections.some(section => section.choice.title.toLowerCase().includes(nextTerm))) {
          next.add(row.set.id)
        }
      }
      return next
    })
  }

  return (
    <div className="rounded-xl border border-border">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="h-auto w-full justify-start gap-2 rounded-xl px-3 py-2.5"
      >
        <span className="text-foreground">เพิ่มจากแฟ้มโจทย์ที่มีอยู่</span>
        <span className="text-xs font-normal text-foreground">{sets.length} แฟ้ม</span>
        <ChevronDown
          className={cn('ml-auto transition-transform', open && 'rotate-180')}
        />
      </Button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-border p-3">
          <p data-assignment-description className="text-xs text-muted-foreground">
            กดแฟ้มแล้วเลือกเฉพาะแฟ้มย่อย หรือเลือก “ทุกข้อในแฟ้ม” ด้านล่างสุด — ปรับทีละข้อได้ด้านล่าง
          </p>

          {sets.length > SEARCH_THRESHOLD && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => updateQuery(e.target.value)}
                placeholder="ค้นหาแฟ้มหรือแฟ้มย่อย..."
                className="h-8 pl-9 text-sm"
              />
            </div>
          )}

          {term && (
            <p className="text-xs text-muted-foreground">
              พบ {visible.length} แฟ้ม จากทั้งหมด {sets.length} แฟ้ม
            </p>
          )}

          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
            {visible.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                ไม่พบแฟ้มหรือแฟ้มย่อยที่ชื่อตรงกับ “{query.trim()}”
              </p>
            ) : visible.map(row => {
              const hasSections = row.sections.length > 0
              const expanded = hasSections && expandedSetIds.has(row.set.id)
              const selected = row.whole.usable > 0 && row.whole.added === row.whole.usable
              const partial = row.whole.added > 0 && !selected
              return (
                <div key={row.set.id} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={selected ? 'default' : 'outline'}
                      disabled={!hasSections && row.whole.usable === 0}
                      aria-expanded={hasSections ? expanded : undefined}
                      aria-pressed={hasSections ? undefined : selected}
                      aria-label={hasSections
                        ? `${expanded ? 'ปิด' : 'เปิด'}แฟ้ม ${row.set.title} เพื่อเลือกทั้งแฟ้มหรือแฟ้มย่อย`
                        : `${selected ? 'ยกเลิก' : 'เลือก'}แฟ้ม ${row.set.title}`}
                      onClick={() => hasSections ? toggleExpanded(row.set.id) : onToggle(row.whole.choice)}
                      className="h-auto min-w-0 flex-1 justify-start gap-2 px-2.5 py-2 text-left"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate">{row.set.title}</span>
                        <span className="truncate text-xs font-normal">
                          {statusLine(row.whole)}{hasSections ? ` · ${row.sections.length} แฟ้มย่อย` : ''}
                        </span>
                      </span>
                      {hasSections ? (
                        <ChevronDown
                          aria-hidden="true"
                          className={cn('transition-transform', expanded && 'rotate-180')}
                        />
                      ) : selected ? <Check aria-hidden="true" /> : partial ? <Minus aria-hidden="true" /> : row.whole.usable > 0 ? <Plus aria-hidden="true" /> : null}
                    </Button>
                    <Button type="button" variant="outline" size="icon-lg" aria-label={`ดูโจทย์ในแฟ้ม ${row.set.title}`} title={`ดูโจทย์ในแฟ้ม ${row.set.title}`} onClick={() => onPreview(row.whole.choice)}>
                      <Eye aria-hidden="true" />
                    </Button>
                  </div>

                  {expanded && (
                    <div className="ml-3 flex flex-col gap-2 border-l border-border pl-3">
                      <p className="text-xs font-medium text-muted-foreground">แฟ้มย่อย</p>
                      {row.sections.map(section => (
                        <ChoiceAction
                          key={section.choice.sections[0]?.id ?? section.choice.title}
                          row={section}
                          onToggle={onToggle}
                          onPreview={onPreview}
                        />
                      ))}
                      <ChoiceAction row={row.whole} onToggle={onToggle} onPreview={onPreview} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function choiceRow(
  choice: QuestionSetImportChoice,
  bankIds: ReadonlySet<string>,
  picked: ReadonlySet<string>,
): ChoiceRow {
  const uniqueIds = [...new Set(choice.questionIds)]
  const usableIds = uniqueIds.filter(id => bankIds.has(id))
  return {
    choice,
    usable: usableIds.length,
    added: usableIds.filter(id => picked.has(id)).length,
    missing: uniqueIds.length - usableIds.length,
  }
}

function ChoiceAction({ row, onToggle, onPreview }: {
  row: ChoiceRow
  onToggle: (choice: QuestionSetImportChoice) => void
  onPreview: (choice: QuestionSetImportChoice) => void
}) {
  const selected = row.usable > 0 && row.added === row.usable
  const partial = row.added > 0 && !selected
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={selected ? 'default' : 'outline'}
        disabled={row.usable === 0}
        aria-pressed={selected}
        aria-label={`${selected ? 'ยกเลิก' : 'เลือก'}${row.choice.toastLabel}`}
        onClick={() => onToggle(row.choice)}
        className="h-auto min-w-0 flex-1 justify-start gap-2 px-2.5 py-2 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate">{row.choice.title}</span>
          <span className="truncate text-xs font-normal">{statusLine(row)}</span>
        </span>
        {selected ? <Check aria-hidden="true" /> : partial ? <Minus aria-hidden="true" /> : row.usable > 0 ? <Plus aria-hidden="true" /> : null}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label={`ดูโจทย์ใน${row.choice.toastLabel}`}
        title={`ดูโจทย์ใน${row.choice.toastLabel}`}
        onClick={() => onPreview(row.choice)}
      >
        <Eye aria-hidden="true" />
      </Button>
    </div>
  )
}

/** What this แฟ้ม can still contribute, in the teacher's own terms — the
 *  count alone can't tell "already added" apart from "nothing left to add". */
function statusLine({ usable, added, missing }: ChoiceRow): string {
  if (usable === 0) {
    return missing > 0
      ? `ไม่มีโจทย์ที่เพิ่มได้ — ${missing} ข้อในแฟ้มนี้ถูกลบไปแล้ว`
      : 'ยังไม่มีโจทย์ในแฟ้มนี้'
  }
  const parts = [`${usable} ข้อ`]
  if (added === usable) parts.push('เลือกแล้ว')
  else if (added > 0) parts.push(`เลือกบางส่วน ${added}/${usable} ข้อ`)
  if (missing > 0) parts.push(`ข้าม ${missing} ข้อที่ถูกลบไปแล้ว`)
  return parts.join(' · ')
}
