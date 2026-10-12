'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExamWaitingRoom } from '@/components/exam/exam-waiting-room'
import type { ExamWaitingSummary } from '@/lib/exam-waiting-room'

export function ExamWaitingPreviewClient({ assignmentId, summary }: {
  assignmentId: string
  summary: ExamWaitingSummary
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <ExamWaitingPreviewRoom summary={summary} busy={pending}
    returnHref={`/assignments/${assignmentId}`}
    onReload={() => router.refresh()}
    onStartPreview={() => startTransition(() => {
      router.push(`/assignments/${assignmentId}/preview?preview=${summary.assignmentType ?? 'exam'}`)
    })} />
}

/** Teacher preview never imports/calls a submission action. The screen lab
 * exercises this same presentation with a clearly-labelled in-memory callback. */
export function ExamWaitingPreviewRoom({ summary, busy = false, returnHref, onStartPreview, onReload }: {
  summary: ExamWaitingSummary
  busy?: boolean
  returnHref: string
  onStartPreview: () => void
  onReload: () => void
}) {
  const [code, setCode] = useState('')
  return <ExamWaitingRoom summary={summary} busy={busy} error={null} code={code}
    onCodeChange={setCode} onStart={onStartPreview} onReload={onReload}
    previewMode returnHref={returnHref} />
}
