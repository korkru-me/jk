'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { RotateCcw, Trash2, BookOpen, Clock } from 'lucide-react'
import { restoreClassroom, permanentDeleteClassroom } from '@/lib/actions/classrooms'
import type { Classroom } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  classroom: Classroom
  daysLeft: number
}

export function TrashActionsClient({ classroom, daysLeft }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleRestore() {
    startTransition(async () => {
      const res = await restoreClassroom(classroom.id)
      if (res?.error) toast.error(res.error)
      else toast.success(`กู้คืน "${classroom.name}" แล้ว`)
    })
  }

  function handlePermanentDelete() {
    if (!confirm(`ลบ "${classroom.name}" อย่างถาวร? ไม่สามารถกู้คืนได้`)) return
    startTransition(async () => {
      const res = await permanentDeleteClassroom(classroom.id)
      if (res?.error) toast.error(res.error)
      else toast.success(`ลบถาวรแล้ว`)
    })
  }

  const isUrgent = daysLeft <= 7

  return (
    <div className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
      <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
        <BookOpen className="w-4 h-4 text-red-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">{classroom.name}</p>
        {classroom.description && (
          <p className="text-xs text-gray-400 truncate">{classroom.description}</p>
        )}
        <div className={cn(
          'flex items-center gap-1 mt-1 text-xs font-medium',
          isUrgent ? 'text-red-500' : 'text-gray-400'
        )}>
          <Clock className="w-3 h-3" />
          {daysLeft > 0 ? `ลบถาวรใน ${daysLeft} วัน` : 'กำลังจะถูกลบ'}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleRestore}
          disabled={isPending}
          className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-50"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          กู้คืน
        </button>
        <button
          onClick={handlePermanentDelete}
          disabled={isPending}
          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          ลบถาวร
        </button>
      </div>
    </div>
  )
}
