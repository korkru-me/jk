'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startExamFromWaiting } from '@/lib/actions/submissions'
import { ExamWaitingRoom } from '@/components/exam/exam-waiting-room'
import type { ExamWaitingSummary } from '@/lib/exam-waiting-room'

export function ExamWaitingClient({ assignmentId, summary, sebChallenge }: {
  assignmentId: string
  summary: ExamWaitingSummary
  sebChallenge?: string
}) {
  const router = useRouter()
  return <ExamWaitingFlow summary={summary}
    requestStart={code => startExamFromWaiting(assignmentId, summary.previousSubmissionId,
      summary.activeSubmissionId ? 'resume' : summary.expired ? 'recover' : 'start', code, sebChallenge)}
    onEntered={result => {
      if (result.alreadySubmitted) {
        router.replace(`/submissions/${result.submissionId}`)
        return
      }
      const params = new URLSearchParams({ attempt: result.submissionId })
      if (sebChallenge) params.set('sebChallenge', sebChallenge)
      router.replace(`/assignments/${assignmentId}/take?${params}`)
    }} onReload={() => router.refresh()} />
}

interface StartResult { submissionId?: string; alreadySubmitted?: boolean; error?: string }

/** Shared controller. Production always supplies the authenticated server
 * action above; the isolated screen lab supplies an in-memory simulator. */
export function ExamWaitingFlow({ summary, requestStart, onEntered, onReload }: {
  summary: ExamWaitingSummary
  requestStart: (code?: string) => Promise<StartResult>
  onEntered: (receipt: { submissionId: string; alreadySubmitted: boolean }) => void
  onReload: () => void
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const starting = useRef(false)
  function start() {
    if (starting.current || summary.blockedReason || summary.completedSubmissionId
      || (summary.requiresAccessCode && !code.trim())) return
    starting.current = true
    setError(null)
    startTransition(async () => {
      try {
        const result = await requestStart(code.trim() || undefined)
        if (result.error || !result.submissionId) {
          setError(result.error ?? 'สถานะเข้าสอบเปลี่ยนแล้ว กรุณาโหลดหน้ารอสอบใหม่')
          return
        }
        onEntered({ submissionId: result.submissionId, alreadySubmitted: result.alreadySubmitted === true })
      } catch {
        // No automatic replay: a lost response may have started the timer.
        setError('ยังยืนยันสถานะรอบสอบไม่ได้ กรุณาโหลดหน้ารอสอบใหม่ ระบบจะใช้รอบเดิมหากเริ่มแล้ว')
      } finally {
        starting.current = false
      }
    })
  }
  return <ExamWaitingRoom summary={summary} busy={pending} error={error} code={code}
    onCodeChange={value => { setCode(value); setError(null) }} onStart={start} onReload={onReload} />
}
