'use client'

import { deleteQuestion } from '@/lib/actions/questions'

export function DeleteQuestionButton({ id }: { id: string }) {
  async function handleDelete() {
    if (!confirm('ลบโจทย์นี้?')) return
    await deleteQuestion(id)
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg transition-colors"
    >
      ลบ
    </button>
  )
}
