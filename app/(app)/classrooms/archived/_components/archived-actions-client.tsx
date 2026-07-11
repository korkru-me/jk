'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { RotateCcw, Trash2, BookOpen } from 'lucide-react'
import { restoreClassroom, deleteClassroom } from '@/lib/actions/classrooms'
import type { Classroom } from '@/lib/types'

export function ArchivedActionsClient({ classroom }: { classroom: Classroom }) {
  const [isPending, startTransition] = useTransition()

  function handleRestore() {
    startTransition(async () => {
      const res = await restoreClassroom(classroom.id)
      if (res?.error) toast.error(res.error)
      else toast.success(`กู้คืน "${classroom.name}" แล้ว`)
    })
  }

  function handleMoveToTrash() {
    startTransition(async () => {
      const res = await deleteClassroom(classroom.id)
      if (res?.error) toast.error(res.error)
      else toast.success(`ย้าย "${classroom.name}" ไปถังขยะแล้ว`)
    })
  }

  return (
    <div className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
      <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
        <BookOpen className="w-4 h-4 text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">{classroom.name}</p>
        {classroom.description && (
          <p className="text-xs text-gray-400 truncate">{classroom.description}</p>
        )}
        <p className="text-xs text-gray-400 mt-0.5">รหัส: {classroom.class_code}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={`/classrooms/${classroom.id}`}
          className="text-xs text-blue-600 hover:underline px-2 py-1"
        >
          ดูข้อมูล
        </Link>
        <button
          onClick={handleRestore}
          disabled={isPending}
          className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-50"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          กู้คืน
        </button>
        <button
          onClick={handleMoveToTrash}
          disabled={isPending}
          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-medium px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          ลบ
        </button>
      </div>
    </div>
  )
}
