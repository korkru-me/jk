'use client'

import { useMemo, useState } from 'react'
import { Check, Search, Shuffle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  GROUP_COLOR_IDS, GROUP_NAME_MAX, MAX_GROUPS_PER_CLASSROOM,
  type ClassroomGroup, type GroupColorId,
} from '@/lib/classroom-groups'
import { groupPreset } from '@/app/(app)/classrooms/_components/group-colors'

export { groupPreset }

export interface GroupStudent { id: string; full_name: string }

// ── Colour swatches ────────────────────────────────────────────────────────

export function GroupColorSwatches({
  value, onChange, idPrefix, ariaLabel = 'สีของกลุ่ม',
}: {
  value: GroupColorId
  onChange: (color: GroupColorId) => void
  idPrefix: string
  ariaLabel?: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {GROUP_COLOR_IDS.map(id => {
        const preset = groupPreset(id)
        const selected = value === id
        return (
          <Button
            key={id}
            id={`${idPrefix}-${id}`}
            type="button"
            variant="ghost"
            role="radio"
            aria-checked={selected}
            aria-label={preset.label}
            title={preset.label}
            onClick={() => onChange(id)}
            // The colour sits on an inner disc: the button's own hover wash
            // would otherwise paint over the swatch under the pointer.
            className="size-8 rounded-full p-0 hover:bg-transparent dark:hover:bg-transparent"
          >
            <span
              className={cn(
                'flex size-7 items-center justify-center rounded-full transition-all',
                preset.solid,
                selected ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : 'opacity-70 hover:opacity-100',
              )}
            >
              {selected && <Check className="size-4 text-background" />}
            </span>
          </Button>
        )
      })}
    </div>
  )
}

// ── Create a group ─────────────────────────────────────────────────────────

export function CreateGroupDialog({
  open, onOpenChange, suggestedName, suggestedColor, pending, onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  suggestedName: string
  suggestedColor: GroupColorId
  pending: boolean
  onSubmit: (input: { name: string; color: GroupColorId }) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Remounted on every open so the fields start from the suggestion again. */}
      {open && (
        <CreateGroupForm
          suggestedName={suggestedName}
          suggestedColor={suggestedColor}
          pending={pending}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
        />
      )}
    </Dialog>
  )
}

function CreateGroupForm({
  suggestedName, suggestedColor, pending, onCancel, onSubmit,
}: {
  suggestedName: string
  suggestedColor: GroupColorId
  pending: boolean
  onCancel: () => void
  onSubmit: (input: { name: string; color: GroupColorId }) => void
}) {
  const [name, setName] = useState(suggestedName)
  const [color, setColor] = useState<GroupColorId>(suggestedColor)
  const trimmed = name.trim()
  const preset = groupPreset(color)

  return (
    <DialogContent className="sm:max-w-md">
      <form
        className="grid gap-4"
        onSubmit={e => {
          e.preventDefault()
          if (trimmed) onSubmit({ name: trimmed, color })
        }}
      >
        <DialogHeader>
          <DialogTitle>เพิ่มกลุ่มใหม่</DialogTitle>
          <DialogDescription>ตั้งชื่อและเลือกสีของกลุ่ม เปลี่ยนภายหลังได้ทุกเมื่อ</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="new-group-name">ชื่อกลุ่ม</Label>
          <Input
            id="new-group-name"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={GROUP_NAME_MAX}
            placeholder="เช่น กลุ่มปลาโลมา"
            autoFocus
            onFocus={e => e.currentTarget.select()}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium leading-none">สีของกลุ่ม</p>
          <GroupColorSwatches value={color} onChange={setColor} idPrefix="new-group-color" />
        </div>

        {/* What the header of the new group will look like. */}
        <div className={cn('rounded-xl border-2 px-3 py-2.5', preset.surface)}>
          <span className={cn('text-sm font-bold', preset.text)}>{trimmed || 'ชื่อกลุ่ม'}</span>
          <span className={cn('ml-2 text-xs', preset.textMuted)}>0 คน</span>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>ยกเลิก</Button>
          <Button type="submit" disabled={!trimmed || pending}>
            {pending ? 'กำลังเพิ่ม…' : 'เพิ่มกลุ่ม'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}

// ── Pick students for one group ────────────────────────────────────────────

/**
 * Ticked = in this group. Opens with the group's current members ticked, so
 * the same list both adds (tick) and takes out (untick) — ตกลง applies the
 * difference. A student ticked from another group moves here; nobody can be
 * in two groups of one room.
 */
export function AddStudentsDialog({
  open, onOpenChange, group, students, members, groupsById, onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: ClassroomGroup | null
  students: GroupStudent[]
  members: Record<string, string>
  groupsById: Map<string, ClassroomGroup>
  onSubmit: (change: { add: string[]; remove: string[] }) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && group && (
        <AddStudentsForm
          group={group}
          students={students}
          members={members}
          groupsById={groupsById}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
        />
      )}
    </Dialog>
  )
}

function AddStudentsForm({
  group, students, members, groupsById, onCancel, onSubmit,
}: {
  group: ClassroomGroup
  students: GroupStudent[]
  members: Record<string, string>
  groupsById: Map<string, ClassroomGroup>
  onCancel: () => void
  onSubmit: (change: { add: string[]; remove: string[] }) => void
}) {
  const initial = useMemo(
    () => new Set(students.filter(s => members[s.id] === group.id).map(s => s.id)),
    [students, members, group.id],
  )
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initial))
  const [query, setQuery] = useState('')
  const [onlyUngrouped, setOnlyUngrouped] = useState(false)

  const term = query.trim().toLowerCase()
  // This group's members first, then nobody's, then other groups' — the
  // order a teacher filling a group reads in.
  const rank = (s: GroupStudent) => (members[s.id] === group.id ? 0 : members[s.id] ? 2 : 1)
  const visible = students
    .filter(s => !term || s.full_name.toLowerCase().includes(term))
    .filter(s => !onlyUngrouped || !members[s.id] || members[s.id] === group.id)
    .sort((a, b) => rank(a) - rank(b))

  const add = [...checked].filter(id => !initial.has(id))
  const remove = [...initial].filter(id => !checked.has(id))
  const movedFromOthers = add.filter(id => members[id] && members[id] !== group.id).length
  const allVisibleChecked = visible.length > 0 && visible.every(s => checked.has(s.id))
  const preset = groupPreset(group.color)

  function toggle(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    setChecked(prev => {
      const next = new Set(prev)
      for (const s of visible) {
        if (allVisibleChecked) next.delete(s.id)
        else next.add(s.id)
      }
      return next
    })
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>
          เลือกนักเรียนเข้า <span className={preset.text}>{group.name}</span>
        </DialogTitle>
        <DialogDescription>ติ๊กชื่อนักเรียนที่อยู่ในกลุ่มนี้ แล้วกดตกลง</DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อนักเรียน..."
            className="pl-8"
            aria-label="ค้นหาชื่อนักเรียน"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <label className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyUngrouped}
              onChange={e => setOnlyUngrouped(e.target.checked)}
              className="size-3.5 accent-primary"
            />
            ซ่อนคนที่อยู่กลุ่มอื่นแล้ว
          </label>
          {visible.length > 0 && (
            <Button type="button" variant="link" size="xs" className="h-auto p-0" onClick={toggleAllVisible}>
              {allVisibleChecked ? 'ไม่เลือกทั้งหมด' : `เลือกทั้งหมด (${visible.length})`}
            </Button>
          )}
        </div>
      </div>

      <ul className="-mx-1 max-h-[min(22rem,50dvh)] space-y-0.5 overflow-y-auto px-1" aria-label="รายชื่อนักเรียน">
        {visible.map(s => {
          const otherGroup = members[s.id] && members[s.id] !== group.id ? groupsById.get(members[s.id]) : null
          const otherPreset = otherGroup ? groupPreset(otherGroup.color) : null
          return (
            <li key={s.id}>
              <label className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted',
                checked.has(s.id) && 'bg-primary/5',
              )}>
                <input
                  type="checkbox"
                  checked={checked.has(s.id)}
                  onChange={() => toggle(s.id)}
                  className="size-4 shrink-0 accent-primary"
                />
                <span className="min-w-0 flex-1 truncate text-foreground">{s.full_name}</span>
                {otherGroup && otherPreset && (
                  <span className={cn('shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium', otherPreset.surface, otherPreset.text)}>
                    {otherGroup.name}
                  </span>
                )}
              </label>
            </li>
          )
        })}
        {visible.length === 0 && (
          <li className="py-8 text-center text-xs text-muted-foreground">
            {students.length === 0 ? 'ห้องนี้ยังไม่มีนักเรียน' : 'ไม่พบนักเรียนที่ตรงกับคำค้น'}
          </li>
        )}
      </ul>

      {movedFromOthers > 0 && (
        <p className="text-xs text-warning">
          นักเรียน {movedFromOthers} คนจะถูกย้ายออกจากกลุ่มเดิมมาอยู่กลุ่มนี้
        </p>
      )}

      <DialogFooter className="sm:items-center">
        <p className="mr-auto hidden text-xs text-muted-foreground sm:block">
          ในกลุ่มนี้ {checked.size} คน
          {(add.length > 0 || remove.length > 0) && ` · เพิ่ม ${add.length} · เอาออก ${remove.length}`}
        </p>
        <Button type="button" variant="outline" onClick={onCancel}>ยกเลิก</Button>
        <Button
          type="button"
          disabled={add.length === 0 && remove.length === 0}
          onClick={() => onSubmit({ add, remove })}
        >
          ตกลง
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

// ── Random split ───────────────────────────────────────────────────────────

export function RandomSplitDialog({
  open, onOpenChange, studentCount, groupCount, pending, onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  studentCount: number
  groupCount: number
  pending: boolean
  onConfirm: (createCount?: number) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <RandomSplitForm
          studentCount={studentCount}
          groupCount={groupCount}
          pending={pending}
          onCancel={() => onOpenChange(false)}
          onConfirm={onConfirm}
        />
      )}
    </Dialog>
  )
}

function RandomSplitForm({
  studentCount, groupCount, pending, onCancel, onConfirm,
}: {
  studentCount: number
  groupCount: number
  pending: boolean
  onCancel: () => void
  onConfirm: (createCount?: number) => void
}) {
  const needsGroups = groupCount === 0
  const [countText, setCountText] = useState(String(Math.max(2, Math.min(4, Math.ceil(studentCount / 2)))))
  const count = Number(countText)
  const countValid = Number.isInteger(count) && count >= 2 && count <= MAX_GROUPS_PER_CLASSROOM
  const groups = needsGroups ? (countValid ? count : 0) : groupCount
  const perGroup = groups > 0 ? studentCount / groups : 0
  const sizeHint = groups > 0
    ? (Number.isInteger(perGroup) ? `กลุ่มละ ${perGroup} คน` : `กลุ่มละ ${Math.floor(perGroup)}–${Math.ceil(perGroup)} คน`)
    : ''

  return (
    <DialogContent className="sm:max-w-md">
      <form
        className="grid gap-4"
        onSubmit={e => {
          e.preventDefault()
          if (needsGroups && !countValid) return
          onConfirm(needsGroups ? count : undefined)
        }}
      >
        <DialogHeader>
          <DialogTitle>แบ่งกลุ่มแบบสุ่ม</DialogTitle>
          <DialogDescription render={<div />}>
            {needsGroups
              ? <>ห้องนี้ยังไม่มีกลุ่ม จะสร้างกลุ่มใหม่ตามจำนวนที่ตั้ง แล้วสุ่มนักเรียนทั้ง {studentCount} คนลงกลุ่ม</>
              : <>สุ่มนักเรียนทั้ง {studentCount} คนลงใน {groupCount} กลุ่มที่มีอยู่ ให้แต่ละกลุ่มมีจำนวนใกล้เคียงกัน</>}
          </DialogDescription>
        </DialogHeader>

        {needsGroups && (
          <div className="space-y-1.5">
            <Label htmlFor="random-group-count">จำนวนกลุ่ม</Label>
            <Input
              id="random-group-count"
              type="number"
              inputMode="numeric"
              min={2}
              max={MAX_GROUPS_PER_CLASSROOM}
              value={countText}
              onChange={e => setCountText(e.target.value)}
              aria-invalid={!countValid}
              className="w-28"
              autoFocus
            />
            {!countValid && (
              <p className="text-xs text-destructive">ใส่ได้ 2–{MAX_GROUPS_PER_CLASSROOM} กลุ่ม</p>
            )}
          </div>
        )}

        {sizeHint && studentCount > 0 && (
          <p className="text-sm text-foreground">ได้ประมาณ{sizeHint}</p>
        )}

        {!needsGroups && (
          <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
            การจัดกลุ่มที่ทำไว้ตอนนี้จะถูกแทนที่ทั้งหมด ชื่อและสีของกลุ่มยังอยู่เหมือนเดิม
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>ยกเลิก</Button>
          <Button type="submit" disabled={pending || studentCount === 0 || (needsGroups && !countValid)} className="gap-1.5">
            <Shuffle className="size-3.5" />
            {pending ? 'กำลังสุ่ม…' : 'สุ่มเลย'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
