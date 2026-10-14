'use client'

import { useEffect, useRef, useState } from 'react'
import { finalizeExpiredSubmission } from '@/lib/actions/submissions'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Clock, Loader2 } from 'lucide-react'

/** Confirmation is retryable/idempotent. A lost response never implies an
 * unsent attempt, and offline time never reopens the answer inputs. */
export function ExpiredAttemptStatus({ submissionId, confirm = finalizeExpiredSubmission, onConfirmed, onTimeChanged, timeExpired = true }: {
  submissionId: string
  confirm?: (id: string) => Promise<{ success?: boolean; error?: string; notExpired?: true }>
  onConfirmed?: () => void
  onTimeChanged?: () => void
  timeExpired?: boolean
}) {
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const confirmation = useRef(confirm)
  const entered = useRef(onConfirmed)
  const timeChanged = useRef(onTimeChanged)
  const retry = useRef<() => void>(() => {})
  useEffect(() => { confirmation.current = confirm; entered.current = onConfirmed; timeChanged.current = onTimeChanged }, [confirm, onConfirmed, onTimeChanged])
  useEffect(() => {
    let disposed = false
    let running = false
    let timer: ReturnType<typeof setTimeout> | undefined
    async function attempt() {
      if (disposed || running) return
      clearTimeout(timer)
      const disconnected = !navigator.onLine
      setOffline(disconnected)
      if (disconnected) return
      running = true; setBusy(true)
      try {
        const result = await confirmation.current(submissionId)
        if (disposed) return
        if (result.notExpired) { timeChanged.current?.(); setError(result.error ?? null); return }
        if (result.success) {
          disposed = true
          if (entered.current) entered.current()
          else window.location.replace(`/submissions/${submissionId}`)
          return
        }
        setError(result.error ?? 'ยังยืนยันการส่งไม่ได้ ระบบจะลองใหม่')
      } catch {
        if (!disposed) setError('ยังยืนยันการส่งไม่ได้ ระบบจะลองใหม่เมื่อเชื่อมต่อได้')
      } finally {
        running = false
        if (!disposed) { setBusy(false); timer = setTimeout(() => void attempt(), 5000) }
      }
    }
    retry.current = () => void attempt()
    const online = () => { setOffline(false); void attempt() }
    const disconnected = () => setOffline(true)
    void attempt()
    window.addEventListener('online', online); window.addEventListener('offline', disconnected)
    return () => {
      disposed = true; clearTimeout(timer)
      window.removeEventListener('online', online); window.removeEventListener('offline', disconnected)
    }
  }, [submissionId])
  return <Card padding="lg" className="assignment-waiting-stage mx-auto flex w-full max-w-3xl flex-col gap-4">
    <h1 className="flex items-center gap-2 text-xl font-semibold"><Clock aria-hidden="true" /> {timeExpired ? 'หมดเวลาทำแล้ว' : 'รอบนี้ปิดรับคำตอบแล้ว'}</h1>
    {timeExpired && <p className="text-3xl font-semibold tabular-nums">00:00</p>}
    <p role="status" aria-live="polite">{offline ? 'อินเทอร์เน็ตหลุด · รอยืนยันการส่งเมื่อเชื่อมต่อ' : 'กำลังยืนยันการส่งคำตอบของรอบเดิม'}</p>
    <p className="text-sm text-muted-foreground">รอบนี้ปิดรับคำตอบแล้ว ระบบใช้คำตอบที่บันทึกสำเร็จก่อนปิดรอบ คำตอบที่รอซิงก์ในเครื่องจะไม่ถูกส่งย้อนหลัง</p>
    {error && !offline && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => retry.current()} disabled={busy || offline}>{busy && <Loader2 data-icon="inline-start" className="animate-spin" />}ยืนยันการส่งอีกครั้ง</Button>
      <a className={buttonVariants({ variant: 'outline' })} href="/assignments">กลับไปงานที่ได้รับ</a>
    </div>
  </Card>
}
