'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { duplicateIocForm } from '@/lib/actions/ioc-forms'

/**
 * The way into a second round after items came back below the threshold: the
 * header, indicators, items and panel come across, and nothing anybody judged
 * or signed does.
 */
export function IocDuplicateButton({
  formId,
  examTitle,
  variant = 'outline',
}: {
  formId: string
  examTitle: string
  variant?: 'outline' | 'ghost'
}) {
  const router = useRouter()
  const [confirm, confirmDialog] = useConfirm()
  const [pending, startTransition] = useTransition()

  async function handleDuplicate() {
    const ok = await confirm({
      title: `สร้างฟอร์มใหม่จาก “${examTitle}”?`,
      description:
        'ฟอร์มใหม่จะได้หัวเอกสาร เกณฑ์ ตัวชี้วัด ข้อสอบ และรายชื่อผู้ทรงคุณวุฒิชุดเดิม '
        + 'แต่ยังไม่มีผลประเมิน ลายเซ็น หรือลิงก์ใด ๆ · ฟอร์มเดิมยังอยู่ครบไม่เปลี่ยนแปลง',
      confirmLabel: 'สร้างฟอร์มใหม่',
    })
    if (!ok) return

    startTransition(async () => {
      const result = await duplicateIocForm(formId)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success('สร้างฟอร์มใหม่จากฟอร์มเดิมแล้ว')
      if ('form_id' in result && result.form_id) router.push(`/research/ioc/${result.form_id}`)
      router.refresh()
    })
  }

  return (
    <>
      <Button variant={variant} size="sm" disabled={pending} onClick={handleDuplicate}>
        {pending ? 'กำลังทำสำเนา…' : 'สร้างฟอร์มใหม่จากฟอร์มนี้'}
      </Button>
      {confirmDialog}
    </>
  )
}
