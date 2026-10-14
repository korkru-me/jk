'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startAssignmentFromWaiting } from '@/lib/actions/submissions'
import { ExamWaitingRoom } from '@/components/exam/exam-waiting-room'
import type { ExamWaitingSummary } from '@/lib/exam-waiting-room'
import { attemptExpiresAt } from '@/lib/attempt-expiry'
import { useAttemptClock } from '@/hooks/use-attempt-clock'
import { ExpiredAttemptStatus } from '@/components/exam/expired-attempt-status'

export function ExamWaitingClient({ assignmentId, summary, sebChallenge }: {
  assignmentId: string
  summary: ExamWaitingSummary
  sebChallenge?: string
}) {
  const router = useRouter()
  return <ExamWaitingFlow summary={summary}
    requestStart={code => startAssignmentFromWaiting(assignmentId, summary.previousSubmissionId,
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
export function ExamWaitingFlow({ summary, requestStart, onEntered, onReload, confirmExpired }: {
  summary: ExamWaitingSummary
  requestStart: (code?: string) => Promise<StartResult>
  onEntered: (receipt: { submissionId: string; alreadySubmitted: boolean }) => void
  onReload: () => void
  confirmExpired?: (id: string) => Promise<{ success?: boolean; error?: string }>
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const starting = useRef(false)
  const [clockExpired, setClockExpired] = useState(false)
  const secondsLeft = useAttemptClock(summary.expiresAt ?? (summary.startedAt
    ? attemptExpiresAt(summary.startedAt, summary.durationMinutes, summary.endAt) : null),
  summary.serverNow, () => setClockExpired(true))
  useEffect(() => {
    if (!summary.expired && summary.expiresAt && summary.serverNow && Date.parse(summary.expiresAt) > Date.parse(summary.serverNow)) setClockExpired(false)
  }, [summary.expired, summary.expiresAt, summary.serverNow])
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') onReload() }
    window.addEventListener('online', refresh); document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [onReload])
  function start() {
    if (starting.current || clockExpired || summary.expired || summary.blockedReason || summary.completedSubmissionId
      || (summary.requiresAccessCode && !code.trim())) return
    starting.current = true
    setError(null)
    startTransition(async () => {
      try {
        const result = await requestStart(code.trim() || undefined)
        if (result.error || !result.submissionId) {
          setError(result.error ?? 'สถานะงานเปลี่ยนแล้ว กรุณาโหลดหน้ารอใหม่')
          return
        }
        onEntered({ submissionId: result.submissionId, alreadySubmitted: result.alreadySubmitted === true })
      } catch {
        // No automatic replay: a lost response may have started the timer.
        setError('ยังยืนยันสถานะรอบทำงานไม่ได้ กรุณาโหลดหน้ารอใหม่ ระบบจะใช้รอบเดิมหากเริ่มแล้ว')
      } finally {
        starting.current = false
      }
    })
  }
  if ((summary.expired || clockExpired) && summary.previousSubmissionId && !summary.completedSubmissionId && !summary.finishedSubmissionId) {
    return <ExpiredAttemptStatus submissionId={summary.previousSubmissionId} confirm={confirmExpired} timeExpired={summary.closeReason !== 'manual'} onTimeChanged={onReload}
      onConfirmed={() => onEntered({ submissionId: summary.previousSubmissionId!, alreadySubmitted: true })} />
  }
  return <ExamWaitingRoom summary={summary} secondsLeft={secondsLeft} busy={pending} error={error} code={code}
    onCodeChange={value => { setCode(value); setError(null) }} onStart={start} onReload={onReload} />
}
