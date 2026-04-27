'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { deleteClassroom } from '@/lib/actions/classrooms'

export function DeleteClassroomButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleDelete() {
    if (!confirm('ลบห้องเรียนนี้? ข้อมูลทั้งหมดจะหายไป')) return
    startTransition(async () => {
      const res = await deleteClassroom(id)
      if (res?.error) toast.error(res.error)
      else { toast.success('ลบห้องเรียนแล้ว'); router.push('/classrooms') }
    })
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="text-sm text-red-500 hover:text-red-700 px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
    >
      {isPending ? 'กำลังลบ...' : 'ลบห้องเรียน'}
    </button>
  )
}
