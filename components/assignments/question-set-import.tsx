'use client'

import { useState } from 'react'
import { Check, ChevronDown, Eye, Minus, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  onToggle: (set: AssignmentQuestionSetOption) => void
  onPreview: (set: AssignmentQuestionSetOption) => void
}

interface SetRow {
  set: AssignmentQuestionSetOption
  /** Questions in this แฟ้ม that still exist in the teacher's คลัง. */
  usable: number
  /** …of those, how many are already picked. */
  added: number
  /** Ids the แฟ้ม lists that no longer resolve to a โจทย์. */
  missing: number
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

  if (sets.length === 0) return null

  const picked = new Set(selectedIds)
  const rows: SetRow[] = sets.map(set => {
    const usableIds = [...new Set(set.question_ids)].filter(id => bankIds.has(id))
    return {
      set,
      usable: usableIds.length,
      added: usableIds.filter(id => picked.has(id)).length,
      missing: new Set(set.question_ids).size - usableIds.length,
    }
  })

  const term = query.trim().toLowerCase()
  const matching = term
    ? rows.filter(r =>
        r.set.title.toLowerCase().includes(term)
        || (r.set.description ?? '').toLowerCase().includes(term))
    : rows
  // แฟ้ม with nothing left to give sink to the bottom instead of being hidden:
  // a teacher looking for one they know exists must still find it, and read
  // why it can't be used. Order is otherwise the คลัง's own (newest first),
  // and importing does not reshuffle the list under the cursor.
  const visible = [
    ...matching.filter(r => r.usable > 0),
    ...matching.filter(r => r.usable === 0),
  ]

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
        <span className="text-xs font-normal text-muted-foreground">{sets.length} แฟ้ม</span>
        <ChevronDown
          className={cn('ml-auto text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </Button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-border p-3">
          <p data-assignment-description className="text-xs text-muted-foreground">
            กดแฟ้มเพื่อเลือกทุกข้อ กดซ้ำเมื่อเลือกครบเพื่อเอาข้อในแฟ้มออก — ปรับทีละข้อได้ด้านล่าง
          </p>

          {sets.length > SEARCH_THRESHOLD && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="ค้นหาแฟ้มจากชื่อ..."
                className="h-8 pl-9 text-sm"
              />
            </div>
          )}

          {term && (
            <p className="text-xs text-muted-foreground">
              พบ {visible.length} แฟ้ม จากทั้งหมด {sets.length} แฟ้ม
            </p>
          )}

          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
            {visible.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                ไม่พบแฟ้มที่ชื่อตรงกับ “{query.trim()}”
              </p>
            ) : visible.map(row => {
              const selected = row.usable > 0 && row.added === row.usable
              const partial = row.added > 0 && !selected
              return (
                <div key={row.set.id} className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={selected ? 'navigation' : 'outline'}
                    disabled={row.usable === 0}
                    aria-pressed={selected}
                    aria-label={`${selected ? 'ยกเลิก' : 'เลือก'}แฟ้ม ${row.set.title}`}
                    onClick={() => onToggle(row.set)}
                    className="h-auto min-w-0 flex-1 justify-start gap-2 px-2.5 py-2 text-left"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate">{row.set.title}</span>
                      <span className="truncate text-xs font-normal">{statusLine(row)}</span>
                    </span>
                    {selected ? <Check aria-hidden="true" /> : partial ? <Minus aria-hidden="true" /> : row.usable > 0 ? <Plus aria-hidden="true" /> : null}
                  </Button>
                  <Button type="button" variant="outline" size="icon-lg" aria-label={`ดูโจทย์ในแฟ้ม ${row.set.title}`} title={`ดูโจทย์ในแฟ้ม ${row.set.title}`} onClick={() => onPreview(row.set)}>
                    <Eye aria-hidden="true" />
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** What this แฟ้ม can still contribute, in the teacher's own terms — the
 *  count alone can't tell "already added" apart from "nothing left to add". */
function statusLine({ usable, added, missing }: SetRow): string {
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
