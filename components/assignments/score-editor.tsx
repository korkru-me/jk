'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Pencil, Check, X } from 'lucide-react'
import { updateSubmissionAnswerScore } from '@/lib/actions/submissions'

interface Props {
  submissionAnswerId: string
  score: number
  maxScore: number
}

// Teacher-only inline score override for one question — click the badge to
// turn it into a bounded [0, maxScore] input. Shared by the per-student
// submission review page and the assignment results page's per-question
// grid, both calling the same server action so scoring stays consistent.
export function ScoreEditor({ submissionAnswerId, score, maxScore }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(score))
  const [currentScore, setCurrentScore] = useState(score)
  const [isPending, startTransition] = useTransition()

  function save() {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxScore) {
      toast.error(`คะแนนต้องอยู่ระหว่าง 0-${maxScore}`)
      return
    }
    startTransition(async () => {
      const res = await updateSubmissionAnswerScore(submissionAnswerId, parsed)
      if (res?.error) { toast.error(res.error); return }
      setCurrentScore(parsed)
      setEditing(false)
      toast.success('บันทึกคะแนนแล้ว')
    })
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(String(currentScore)); setEditing(true) }}
        className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border border-dashed border-blue-300 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
        title="แก้ไขคะแนนข้อนี้"
      >
        <Pencil className="w-3 h-3" />
        {currentScore}/{maxScore}
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={maxScore}
        step="any"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        disabled={isPending}
        autoFocus
        className="w-14 text-xs text-center rounded-lg border border-blue-300 py-0.5 outline-none focus:ring-2 focus:ring-blue-100"
      />
      <span className="text-xs text-muted-foreground">/{maxScore}</span>
      <button onClick={save} disabled={isPending} className="text-green-600 hover:text-green-700 disabled:opacity-50">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => setEditing(false)} disabled={isPending} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
