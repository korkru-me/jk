'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { deleteIocFormDraft } from '@/lib/actions/ioc-forms'

/**
 * Only drafts can be thrown away. Once links exist the form is evidence, and
 * the server refuses — this button is simply not rendered for those.
 */
export function IocFormDeleteButton({ formId, examTitle }: { formId: string; examTitle: string }) {
  const router = useRouter()
  const [confirm, confirmDialog] = useConfirm()
  const [pending, startTransition] = useTransition()

  async function handleDelete() {
    const ok = await confirm({
      title: `ลบฉบับร่าง “${examTitle}”?`,
      description: 'ข้อสอบที่คัดลอกเข้าฟอร์มและตัวชี้วัดของฟอร์มนี้จะถูกลบไปด้วย โจทย์ในคลังและตัวชี้วัดที่จำไว้กับโจทย์ยังอยู่ครบ',
      confirmLabel: 'ลบถาวร',
      variant: 'destructive',
    })
    if (!ok) return

    startTransition(async () => {
      const result = await deleteIocFormDraft(formId)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success('ลบฉบับร่างแล้ว')
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
