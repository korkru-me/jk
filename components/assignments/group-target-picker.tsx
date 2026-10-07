'use client'

import { Check, Grid3x3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { groupPreset } from '@/app/(app)/classrooms/_components/group-colors'

export interface AssignmentGroupOption {
  id: string
  name: string
  color: string
  memberCount: number
}

/** classroom id → the กลุ่มย่อย chosen there; null (or absent) = ทั้งห้อง. */
export type GroupTargets = Record<string, string[] | null>

/** True when every "เฉพาะกลุ่ม" choice names at least one group. */
export function groupTargetsComplete(targets: GroupTargets, classroomIds: string[]): boolean {
  return classroomIds.every(id => {
    const chosen = targets[id]
    return chosen == null || chosen.length > 0
  })
}

/** Only the entries for the rooms still ticked — what gets sent to the server. */
export function groupTargetsFor(targets: GroupTargets, classroomIds: string[]): GroupTargets {
  return Object.fromEntries(classroomIds.map(id => [id, targets[id] ?? null]))
}

interface Props {
  /** The rooms ticked for this งาน, in the order they appear above. */
  classrooms: { id: string; name: string }[]
  groupsByClassroom: Record<string, AssignmentGroupOption[]>
  value: GroupTargets
  onChange: (next: GroupTargets) => void
  /** Keeps radio names unique when two pickers share a page. */
  idPrefix?: string
}

/**
 * "มอบหมายให้" — the whole room (the default), or only some of its กลุ่มย่อย.
 * Students outside the chosen groups do not see the งาน at all; the server
 * and the database enforce that, this only records the choice.
 */
export function GroupTargetPicker({ classrooms, groupsByClassroom, value, onChange, idPrefix = 'target' }: Props) {
  // A room is offered when it has groups — or when it is limited to groups
  // that have all been deleted since, so the teacher can open it up again.
  const withGroups = classrooms.filter(c => (groupsByClassroom[c.id]?.length ?? 0) > 0 || (value[c.id] ?? null) !== null)

  if (withGroups.length === 0) {
    return (
      <p data-assignment-description className="text-xs text-muted-foreground">
        นักเรียนทุกคนในห้องที่เลือกจะได้รับงานนี้ · อยากมอบหมายเฉพาะบางกลุ่ม แบ่งกลุ่มได้ที่แท็บ “กลุ่มย่อย” ของห้องเรียน
      </p>
    )
  }

  function set(classroomId: string, groupIds: string[] | null) {
    onChange({ ...value, [classroomId]: groupIds })
  }

  return (
    <div className="space-y-2">
      {withGroups.map(classroom => {
        const groups = groupsByClassroom[classroom.id] ?? []
        const chosen = value[classroom.id] ?? null
        const onlyGroups = chosen !== null
        const reached = onlyGroups
          ? groups.filter(g => chosen.includes(g.id)).reduce((sum, g) => sum + g.memberCount, 0)
          : null
        const name = `${idPrefix}-${classroom.id}`
        return (
          <div key={classroom.id} className="space-y-2 rounded-xl border border-border p-3">
            {classrooms.length > 1 && (
              <p className="text-sm font-medium text-foreground">{classroom.name}</p>
            )}
            <div role="radiogroup" aria-label={`มอบหมายให้ใครใน ${classroom.name}`} className="flex flex-wrap gap-x-4 gap-y-1.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name={name}
                  checked={!onlyGroups}
                  onChange={() => set(classroom.id, null)}
                  className="size-4 accent-primary"
                />
                นักเรียนทุกคนในห้อง
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name={name}
                  checked={onlyGroups}
                  onChange={() => set(classroom.id, [])}
                  className="size-4 accent-primary"
                />
                เฉพาะกลุ่มที่เลือก
              </label>
            </div>

            {onlyGroups && (
              <>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="กลุ่มที่ได้รับงานนี้">
                  {groups.map(g => {
                    const preset = groupPreset(g.color)
                    const on = chosen.includes(g.id)
                    return (
                      <Button
                        key={g.id}
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-pressed={on}
                        onClick={() => set(classroom.id, on ? chosen.filter(id => id !== g.id) : [...chosen, g.id])}
                        className={cn(
                          'h-auto gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium',
                          on ? cn(preset.surface, preset.text, 'border-2') : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {on ? <Check className="size-3" /> : <span className={cn('size-2.5 rounded-full', preset.solid)} aria-hidden="true" />}
                        {g.name}
                        <span className="font-normal opacity-80">{g.memberCount} คน</span>
                      </Button>
                    )
                  })}
                </div>
                {groups.length === 0 ? (
                  <p className="text-xs text-destructive">
                    ห้องนี้ไม่มีกลุ่มย่อยเหลือแล้ว ตอนนี้จึงไม่มีนักเรียนคนไหนเห็นงานนี้ — เลือก “นักเรียนทุกคนในห้อง” เพื่อเปิดให้ทุกคน
                  </p>
                ) : chosen.length === 0 ? (
                  <p className="text-xs text-destructive">เลือกอย่างน้อย 1 กลุ่ม</p>
                ) : (
                  <p data-assignment-description className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Grid3x3 className="size-3" aria-hidden="true" />
                    นักเรียน {reached} คนในกลุ่มที่เลือกจะเห็นงานนี้ · คนนอกกลุ่มจะมองไม่เห็น
                  </p>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
