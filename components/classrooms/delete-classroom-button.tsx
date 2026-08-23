'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { deleteClassroom } from '@/lib/actions/classrooms'
import { useConfirm } from '@/components/ui/confirm-dialog'

export function DeleteClassroomButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [confirm, confirmDialog] = useConfirm()

  async function handleDelete() {
    const ok = await confirm({
      title: 'ลบห้องเรียนนี้?',
      description: 'ข้อมูลทั้งหมดในห้องเรียนจะหายไป',
      confirmLabel: 'ลบห้องเรียน',
      variant: 'destructive',
    })
    if (!ok) return
    startTransition(async () => {
      const res = await deleteClassroom(id)
      if (res?.error) toast.error(res.error)
      else { toast.success('ลบห้องเรียนแล้ว'); router.push('/classrooms') }
    })
  }

  return (
    <>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="text-sm text-destructive hover:text-destructive/80 px-3 py-1.5 border border-destructive/20 rounded-lg hover:bg-destructive/10 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'กำลังลบ...' : 'ลบห้องเรียน'}
      </button>
      {confirmDialog}
    </>
  )
}
