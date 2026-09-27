'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Grid3x3 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { updateAssignmentGroupTargets } from '@/lib/actions/assignments'
import {
  GroupTargetPicker, groupTargetsComplete,
  type AssignmentGroupOption, type GroupTargets,
} from '@/components/assignments/group-target-picker'

interface Props {
  assignmentId: string
  /** Linked rooms this teacher manages that have กลุ่มย่อย. */
  classrooms: { id: string; name: string }[]
  groupsByClassroom: Record<string, AssignmentGroupOption[]>
  initial: GroupTargets
}

function sameTargets(a: GroupTargets, b: GroupTargets, ids: string[]) {
  return ids.every(id => {
    const x = a[id] ?? null
    const y = b[id] ?? null
    if (x === null || y === null) return x === y
    return x.length === y.length && x.every(g => y.includes(g))
  })
}

/**
 * "มอบหมายให้" on the edit page. Saved on its own, apart from the rest of the
 * form: who receives a งาน is not a property of its questions, and changing it
 * is safe at any time — unlike the question list, it is not frozen once
 * students start.
 */
export function AssignmentGroupTargetsCard({ assignmentId, classrooms, groupsByClassroom, initial }: Props) {
  const router = useRouter()
  const [saved, setSaved] = useState(initial)
  const [targets, setTargets] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const ids = classrooms.map(c => c.id)
  const dirty = !sameTargets(targets, saved, ids)
  const complete = groupTargetsComplete(targets, ids)

  function save() {
    const payload = Object.fromEntries(ids.map(id => [id, targets[id] ?? null]))
    startTransition(async () => {
      const res = await updateAssignmentGroupTargets(assignmentId, payload)
      if (res?.error) { toast.error(res.error); return }
      setSaved(payload)
      toast.success('บันทึกการมอบหมายแล้ว')
      router.refresh()
    })
  }

  return (
    <Card padding="lg" className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tint-1/10 text-tint-1">
          <Grid3x3 className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">มอบหมายให้</h2>
          <p className="text-xs text-muted-foreground">
            เปลี่ยนได้ทุกเมื่อ นักเรียนนอกกลุ่มที่เลือกจะมองไม่เห็นงานนี้ ยกเว้นคนที่เริ่มทำไปแล้ว
          </p>
        </div>
      </div>

      <GroupTargetPicker
        classrooms={classrooms}
        groupsByClassroom={groupsByClassroom}
        value={targets}
        onChange={setTargets}
        idPrefix="edit-target"
      />

      <div className="flex justify-end gap-2">
        {dirty && (
          <Button type="button" variant="outline" size="sm" onClick={() => setTargets(saved)} disabled={isPending}>
            ยกเลิก
          </Button>
        )}
        <Button type="button" size="sm" onClick={save} disabled={!dirty || !complete || isPending}>
          {isPending ? 'กำลังบันทึก…' : 'บันทึกการมอบหมาย'}
        </Button>
      </div>
    </Card>
  )
}
