'use client'

import { useEffect, useEffectEvent, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startAssignmentFromWaiting } from '@/lib/actions/submissions'
import { ExamWaitingRoom } from '@/components/exam/exam-waiting-room'
import type { ExamWaitingSummary } from '@/lib/exam-waiting-room'
import { attemptExpiresAt } from '@/lib/attempt-expiry'
import { jitterDelayMs } from '@/lib/attempt-clock'
import { useAttemptClock } from '@/hooks/use-attempt-clock'
import { ExpiredAttemptStatus } from '@/components/exam/expired-attempt-status'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'

export function ExamWaitingClient({ assignmentId, summary, sebChallenge, autoEnterExercise = true, retryExercise = false }: {
  assignmentId: string
  summary: ExamWaitingSummary
  sebChallenge?: string
  autoEnterExercise?: boolean
  retryExercise?: boolean
}) {
  const router = useRouter()
  return <ExamWaitingFlow summary={summary} autoEnterExercise={autoEnterExercise} retryExercise={retryExercise}
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

/** Every waiting device reaches the opening second together. Spreading the
 * reload over a few seconds keeps that one second from becoming hundreds of
 * simultaneous page renders; the student still presses เริ่ม afterwards. */
const OPEN_RELOAD_JITTER_MS = 5_000
const ONLINE_RELOAD_JITTER_MS = 3_000

interface StartResult { submissionId?: string; alreadySubmitted?: boolean; error?: string }

/** Shared controller. Production always supplies the authenticated server
 * action above; the isolated screen lab supplies an in-memory simulator. */
export function ExamWaitingFlow({ summary, requestStart, onEntered, onReload, confirmExpired, autoEnterExercise = true, retryExercise = false }: {
  summary: ExamWaitingSummary
  requestStart: (code?: string) => Promise<StartResult>
  onEntered: (receipt: { submissionId: string; alreadySubmitted: boolean }) => void
  onReload: () => void
  autoEnterExercise?: boolean
  retryExercise?: boolean
  confirmExpired?: (id: string) => Promise<{ success?: boolean; error?: string }>
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const starting = useRef(false)
  const autoStarted = useRef(false)
  const [clockExpired, setClockExpired] = useState(false)
  const secondsLeft = useAttemptClock(summary.expiresAt ?? (summary.startedAt
    ? attemptExpiresAt(summary.startedAt, summary.durationMinutes, summary.endAt) : null),
  summary.serverNow, () => setClockExpired(true))
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const reloadSoon = useEffectEvent((maxDelayMs: number) => {
    clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(onReload, jitterDelayMs(maxDelayMs))
  })
  useEffect(() => () => clearTimeout(reloadTimer.current), [])
  const secondsUntilOpen = useAttemptClock(summary.opensAt, summary.serverNow, () => reloadSoon(OPEN_RELOAD_JITTER_MS))
  useEffect(() => {
    if (!summary.expired && summary.expiresAt && summary.serverNow && Date.parse(summary.expiresAt) > Date.parse(summary.serverNow)) setClockExpired(false)
  }, [summary.expired, summary.expiresAt, summary.serverNow])
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') onReload() }
    // A classroom's Wi-Fi returns for every device at once; spread the reloads.
    const online = () => reloadSoon(ONLINE_RELOAD_JITTER_MS)
    window.addEventListener('online', online); document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('online', online); document.removeEventListener('visibilitychange', refresh) }
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
          setError(result.error ?? 'สถานะงานเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่')
          return
        }
        onEntered({ submissionId: result.submissionId, alreadySubmitted: result.alreadySubmitted === true })
      } catch {
        // No automatic replay: a lost response may have started the timer.
        setError('ยังยืนยันสถานะรอบทำงานไม่ได้ กรุณาโหลดหน้าใหม่ ระบบจะใช้รอบเดิมหากเริ่มแล้ว')
      } finally {
        starting.current = false
      }
    })
  }
  const exercise = summary.assignmentType === 'exercise'
  const autoOpen = exercise && autoEnterExercise && (retryExercise || !summary.finishedSubmissionId)
    && !summary.requiresAccessCode && !summary.blockedReason && !summary.expired
    && !clockExpired && !summary.completedSubmissionId
  const startAutomatically = useEffectEvent(start)
  useEffect(() => {
    if (!autoOpen || autoStarted.current) return
    autoStarted.current = true
    startAutomatically()
  }, [autoOpen])
  if ((summary.expired || clockExpired) && summary.previousSubmissionId && !summary.completedSubmissionId && !summary.finishedSubmissionId) {
    return <ExpiredAttemptStatus submissionId={summary.previousSubmissionId} confirm={confirmExpired} timeExpired={summary.closeReason !== 'manual'} onTimeChanged={onReload}
      onConfirmed={() => onEntered({ submissionId: summary.previousSubmissionId!, alreadySubmitted: true })} />
  }
  if (exercise) {
    const resultId = summary.completedSubmissionId ?? summary.finishedSubmissionId
    const loading = pending || (autoOpen && !error)
    return (
      <Card padding="md" className="flex w-full max-w-lg flex-col gap-3">
        <h1 className="text-lg font-semibold">{summary.title}</h1>
        {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />กำลังเปิดแบบฝึกหัด…
        </p>}
        {(summary.blockedReason || error) && <p role="alert" className="text-sm text-destructive">{summary.blockedReason ?? error}</p>}
        {!loading && !summary.blockedReason && !summary.completedSubmissionId && (
          <form className="flex flex-col gap-2" onSubmit={event => { event.preventDefault(); start() }}>
            {summary.requiresAccessCode && <Field>
              <FieldLabel htmlFor="exercise-entry-code">รหัสเข้าทำแบบฝึกหัด</FieldLabel>
              <Input id="exercise-entry-code" type="password" autoComplete="off" maxLength={256} value={code}
                onChange={event => { setCode(event.target.value); setError(null) }} className="min-h-11" />
            </Field>}
            <Button type="submit" variant="workExercise" className="min-h-11 self-start"
              disabled={summary.requiresAccessCode && !code.trim()}>
              {summary.finishedSubmissionId ? 'เริ่มรอบใหม่' : summary.activeSubmissionId ? 'ทำต่อ' : 'เริ่มทำแบบฝึกหัด'}
            </Button>
          </form>
        )}
        {!loading && <div className="flex flex-wrap items-center gap-2">
          {resultId && <a className={buttonVariants({ variant: 'outline', className: 'min-h-11' })} href={`/submissions/${resultId}`}>ดูผลรอบเดิม</a>}
          {summary.blockedReason && <Button type="button" variant="outline" className="min-h-11" onClick={onReload}>ตรวจสอบอีกครั้ง</Button>}
          <a className={buttonVariants({ variant: 'ghost', className: 'min-h-11' })} href="/assignments">กลับไปงานที่ได้รับ</a>
        </div>}
      </Card>
    )
  }
  return <ExamWaitingRoom summary={summary} secondsLeft={secondsLeft} secondsUntilOpen={secondsUntilOpen} busy={pending} error={error} code={code}
    onCodeChange={value => { setCode(value); setError(null) }} onStart={start} onReload={onReload} />
}
