'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { RotateCcw, Trash2, BookOpen, Clock } from 'lucide-react'
import { restoreClassroom, permanentDeleteClassroom } from '@/lib/actions/classrooms'
import type { Classroom } from '@/lib/types'
import { cn } from '@/lib/utils'
import { displayDescription } from '@/app/(app)/classrooms/_components/classroom-meta'
import { useConfirm } from '@/components/ui/confirm-dialog'

interface Props {
  classroom: Classroom
  daysLeft: number
}

export function TrashActionsClient({ classroom, daysLeft }: Props) {
  const [isPending, startTransition] = useTransition()
  const [confirm, confirmDialog] = useConfirm()

  function handleRestore() {
    startTransition(async () => {
      const res = await restoreClassroom(classroom.id)
      if (res?.error) toast.error(res.error)
      else toast.success(`กู้คืน "${classroom.name}" แล้ว`)
    })
  }

  async function handlePermanentDelete() {
    const ok = await confirm({
      title: `ลบ “${classroom.name}” อย่างถาวร?`,
      description: 'ห้องเรียน งาน และข้อมูลการส่งทั้งหมดจะถูกลบถาวร กู้คืนไม่ได้',
      confirmLabel: 'ลบถาวร',
      variant: 'destructive',
    })
    if (!ok) return
    startTransition(async () => {
      const res = await permanentDeleteClassroom(classroom.id)
      if (res?.error) toast.error(res.error)
      else toast.success(`ลบถาวรแล้ว`)
    })
  }

  const isUrgent = daysLeft <= 7

  return (
    <div className="flex items-center gap-4 p-4 hover:bg-muted transition-colors">
      <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
        <BookOpen className="w-4 h-4 text-destructive" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground truncate">{classroom.name}</p>
        {displayDescription(classroom.description) && (
          <p className="text-xs text-muted-foreground truncate">{displayDescription(classroom.description)}</p>
        )}
        <div className={cn(
          'flex items-center gap-1 mt-1 text-xs font-medium',
          isUrgent ? 'text-destructive' : 'text-muted-foreground'
        )}>
          <Clock className="w-3 h-3" />
          {daysLeft > 0 ? `ลบถาวรใน ${daysLeft} วัน` : 'กำลังจะถูกลบ'}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleRestore}
          disabled={isPending}
          className="flex items-center gap-1 text-xs text-success hover:text-success/80 font-medium px-2.5 py-1.5 rounded-lg hover:bg-success/10 transition-colors disabled:opacity-50"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          กู้คืน
        </button>
        <button
          onClick={handlePermanentDelete}
          disabled={isPending}
          className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 font-medium px-2.5 py-1.5 rounded-lg hover:bg-destructive/10 transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          ลบถาวร
        </button>
      </div>
      {confirmDialog}
    </div>
  )
}
