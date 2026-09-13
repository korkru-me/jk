'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { deleteIocForm } from '@/lib/actions/ioc-forms'

/**
 * Shown until someone has judged the form. After that the server refuses, and
 * so does this button by not being here — the ratings and signatures inside it
 * are the evidence the feature exists to produce.
 */
export function IocFormDeleteButton({ formId, examTitle }: { formId: string; examTitle: string }) {
  const router = useRouter()
  const [confirm, confirmDialog] = useConfirm()
  const [pending, startTransition] = useTransition()

  async function handleDelete() {
    const ok = await confirm({
      title: `ลบฟอร์ม “${examTitle}”?`,
      description: 'ข้อสอบที่คัดลอกเข้าฟอร์ม ตัวชี้วัดของฟอร์ม และลิงก์ที่ออกไปแล้วจะถูกลบไปด้วย โจทย์ในคลังและตัวชี้วัดที่จำไว้กับโจทย์ยังอยู่ครบ · ลบได้เพราะยังไม่มีผู้ทรงคุณวุฒิส่งผลประเมิน',
      confirmLabel: 'ลบถาวร',
      variant: 'destructive',
    })
    if (!ok) return

    startTransition(async () => {
      const result = await deleteIocForm(formId)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success('ลบฟอร์มแล้ว')
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="ghost" size="sm" disabled={pending} onClick={handleDelete}>
        {pending ? 'กำลังลบ…' : 'ลบ'}
      </Button>
      {confirmDialog}
    </>
  )
}
