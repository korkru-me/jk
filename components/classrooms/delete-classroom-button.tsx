'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { deleteClassroom } from '@/lib/actions/classrooms'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'

export function DeleteClassroomButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [confirm, confirmDialog] = useConfirm()

  async function handleDelete() {
    const ok = await confirm({
      title: 'ย้ายห้องเรียนไปถังขยะ?',
      description: 'ห้องเรียนและข้อมูลภายในจะถูกซ่อนจากรายการหลัก แต่เจ้าของยังกู้คืนได้จากถังขยะก่อนลบถาวร',
      confirmLabel: 'ย้ายไปถังขยะ',
      variant: 'destructive',
    })
    if (!ok) return
    startTransition(async () => {
      const res = await deleteClassroom(id)
      if (res?.error) toast.error(res.error)
      else { toast.success('ย้ายห้องเรียนไปถังขยะแล้ว'); router.push('/classrooms') }
    })
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        onClick={handleDelete}
        disabled={isPending}
      >
        {isPending ? 'กำลังย้าย...' : 'ย้ายไปถังขยะ'}
      </Button>
      {confirmDialog}
    </>
  )
}
