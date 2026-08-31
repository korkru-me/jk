'use client'

import { useState } from 'react'
import { BookOpen, Check, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { coverOf, parseDescription, type CoverPreset } from '@/app/(app)/classrooms/_components/classroom-meta'
import type { AssignmentClassroomOption } from '@/components/assignments/create-assignment-form'

/** Past this many ห้องเรียน the list gets a search box. Below it, everything
 *  is on screen at once and a search field is one more thing to read past. */
const SEARCH_THRESHOLD = 6

interface Props {
  classrooms: AssignmentClassroomOption[]
  selectedIds: string[]
  onToggle: (id: string) => void
}

interface Row {
  classroom: AssignmentClassroomOption
  cover: CoverPreset | null
  /** The one line under the name: ระดับ · ภาคเรียน · what the teacher typed. */
  meta: string
  /** Everything a search should match, lowercased once. */
  haystack: string
}

/**
 * Which ห้องเรียน a งาน goes to.
 *
 * The list used to print every classroom at full height, so a teacher with
 * twenty rooms scrolled past a screen and a half of them before reaching the
 * rest of the form. It is now a fixed-height, scrollable list of compact rows
 * with a search box once there are enough rooms to need one.
 */
export function ClassroomPicker({ classrooms, selectedIds, onToggle }: Props) {
  const [query, setQuery] = useState('')

  const rows: Row[] = classrooms.map(classroom => {
    // `description` carries the create wizard's whole form flattened into text
    // (see classroom-meta.ts). Only ระดับ and ภาคเรียน say which room this is —
    // the cover id, access type and seat count are noise when picking one, and
    // the raw string was printing "หน้าปก: blue" at teachers.
    const meta = parseDescription(classroom.description)
    return {
      classroom,
      cover: coverOf(meta),
      meta: [meta.gradeLevel, meta.academicTerm, meta.description.trim()].filter(Boolean).join(' · '),
      haystack: [classroom.name, meta.gradeLevel, meta.academicTerm, meta.tags.join(' '), meta.description]
        .join(' ')
        .toLowerCase(),
    }
  })

  const term = query.trim().toLowerCase()
  const picked = new Set(selectedIds)
  // Picked rooms stay at the top and stay visible even when the search would
  // hide them: this field decides who sits the งาน, so what is already chosen
  // must never scroll — or filter — out of sight where it cannot be undone.
  const selectedRows = rows.filter(r => picked.has(r.classroom.id))
  const otherRows = rows.filter(r => !picked.has(r.classroom.id) && (!term || r.haystack.includes(term)))

  return (
    <div className="space-y-2">
      {classrooms.length > SEARCH_THRESHOLD && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ค้นหาห้องเรียนจากชื่อ ระดับ หรือภาคเรียน..."
            className="h-8 pl-9 text-sm"
          />
        </div>
      )}

      {term && (
        <p className="text-xs text-muted-foreground">
          พบ {otherRows.length} ห้อง จากทั้งหมด {classrooms.length} ห้อง
        </p>
      )}

      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
        {selectedRows.map(row => (
          <ClassroomRow key={row.classroom.id} row={row} selected onToggle={onToggle} />
        ))}

        {selectedRows.length > 0 && otherRows.length > 0 && (
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-1 pt-1">
            ห้องเรียนอื่น
          </p>
        )}

        {otherRows.map(row => (
          <ClassroomRow key={row.classroom.id} row={row} selected={false} onToggle={onToggle} />
        ))}

        {otherRows.length === 0 && term && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            ไม่พบห้องเรียนที่ตรงกับ “{query.trim()}”
          </p>
        )}
      </div>
    </div>
  )
}

function ClassroomRow({ row, selected, onToggle }: { row: Row; selected: boolean; onToggle: (id: string) => void }) {
  const { classroom, cover, meta } = row
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onToggle(classroom.id)}
      aria-pressed={selected}
      className={cn(
        'h-auto w-full justify-start gap-2.5 rounded-xl border p-2.5 text-left font-normal',
        selected
          ? 'border-primary bg-primary/10 hover:bg-primary/10 dark:hover:bg-primary/10'
          : 'border-border hover:border-ring',
      )}
    >
      {/* The cover colour the teacher gave this room, so the list can be
          recognised the same way the หน้าห้องเรียน grid is. */}
      <div
        className={cn(
          'w-7 h-7 rounded-lg border flex items-center justify-center shrink-0',
          cover ? `${cover.surface} ${cover.text}` : 'bg-muted text-muted-foreground border-transparent',
        )}
      >
        <BookOpen className="size-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{classroom.name}</p>
        {meta && <p className="text-xs text-muted-foreground truncate">{meta}</p>}
      </div>
      {selected && <Check className="size-4 text-primary shrink-0" />}
    </Button>
  )
}
