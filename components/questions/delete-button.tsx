'use client'

import { deleteQuestion } from '@/lib/actions/questions'
import { useConfirm } from '@/components/ui/confirm-dialog'

export function DeleteQuestionButton({ id }: { id: string }) {
  const [confirm, confirmDialog] = useConfirm()

  async function handleDelete() {
    const ok = await confirm({
      title: 'ลบโจทย์นี้?',
      description: 'โจทย์จะถูกลบถาวร กู้คืนไม่ได้',
      confirmLabel: 'ลบถาวร',
      variant: 'destructive',
    })
    if (!ok) return
    await deleteQuestion(id)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDelete}
        className="px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 rounded-lg transition-colors"
      >
        ลบ
      </button>
      {confirmDialog}
    </>
  )
}
