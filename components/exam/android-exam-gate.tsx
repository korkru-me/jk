'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Smartphone } from 'lucide-react'
import {
  activateAndroidExamSession,
  getAndroidExamApprovalStatus,
  requestAndroidExamAccess,
} from '@/lib/actions/android-exam'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

type ApprovalState = 'checking' | 'none' | 'pending' | 'approved' | 'denied' | 'expired' | 'error'

export function AndroidExamGate({ assignmentId }: { assignmentId: string }) {
  const router = useRouter()
  const [state, setState] = useState<ApprovalState>('checking')
  const [message, setMessage] = useState<string | null>(null)
  const [isRequesting, startRequestTransition] = useTransition()
  const [isActivating, startActivateTransition] = useTransition()

  const activate = useCallback(() => {
    startActivateTransition(async () => {
      const result = await activateAndroidExamSession(assignmentId)
      if ('error' in result) {
        setState('error')
        setMessage(result.error ?? 'เปิดห้องสอบไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      router.replace(`/assignments/${assignmentId}/take`)
      router.refresh()
    })
  }, [assignmentId, router])

  const checkStatus = useCallback(async () => {
    const result = await getAndroidExamApprovalStatus(assignmentId)
    if ('error' in result) {
      setState('error')
      setMessage(result.error ?? 'ตรวจสถานะคำขอไม่สำเร็จ')
      return
    }
    setMessage(null)
    setState(result.status)
    if (result.status === 'approved') activate()
  }, [activate, assignmentId])

  useEffect(() => {
    void checkStatus()
  }, [checkStatus])

  useEffect(() => {
    if (state !== 'pending') return
    const timer = window.setInterval(() => void checkStatus(), 4_000)
    return () => window.clearInterval(timer)
  }, [checkStatus, state])

  function requestAccess() {
    startRequestTransition(async () => {
      setMessage(null)
      const result = await requestAndroidExamAccess(assignmentId)
      if ('error' in result) {
        setState('error')
        setMessage(result.error ?? 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      setState(result.status)
      if (result.status === 'approved') activate()
    })
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-xl items-center px-4 py-10">
      <Card className="w-full space-y-5 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-warning/10 p-3 text-warning">
            <Smartphone className="h-7 w-7" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">ห้องรอสอบสำหรับ Android</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              ยื่นโทรศัพท์ให้ครูตรวจและรอครูกดอนุมัติก่อน ระบบจะยังไม่เริ่มจับเวลาและยังไม่เปิดข้อสอบ
            </p>
          </div>
        </div>

        <Card padding="md" radius="md" className="border-warning/30 bg-warning/5">
          <div className="flex gap-3 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
            <p className="leading-6 text-muted-foreground">
              Android แบบเว็บไม่ใช่ Safe Exam Browser และป้องกันภาพแคประดับระบบไม่ได้ ระบบทำได้เพียงบังคับเต็มจอ
              บันทึกเมื่อออกจากแท็บ/แอป และแจ้งครูในห้องคุมสอบ
            </p>
          </div>
        </Card>

        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          <li>ปิดการแจ้งเตือนและปิดแอปอื่นให้ครูตรวจ</li>
          <li>แสดงหน้ารายการแอปล่าสุดและจำนวนอุปกรณ์ที่นำเข้าห้อง</li>
          <li>กลับมาหน้านี้ แล้วกดส่งคำขอโดยให้ครูมองเห็นเครื่องอยู่</li>
        </ol>

        {state === 'checking' ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" /> ตรวจสถานะคำขอ…
          </div>
        ) : state === 'pending' ? (
          <Card padding="md" radius="md" className="border-primary/30 bg-primary/5">
            <div className="flex gap-3 text-sm">
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-primary" aria-hidden="true" />
              <div>
                <p className="font-medium text-foreground">ส่งคำขอแล้ว กำลังรอครูอนุมัติ</p>
                <p className="mt-1 text-muted-foreground">อย่าออกจากหน้านี้ ระบบตรวจสถานะให้อัตโนมัติ</p>
              </div>
            </div>
          </Card>
        ) : state === 'approved' || isActivating ? (
          <div className="flex items-center gap-3 text-sm text-success">
            {isActivating
              ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              : <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
            ครูอนุมัติแล้ว กำลังเปิดข้อสอบ…
          </div>
        ) : (
          <div className="space-y-3">
            {(state === 'denied' || state === 'expired' || state === 'error') && (
              <Card padding="md" radius="md" className="border-destructive/30 bg-destructive/5">
                <p className="text-sm text-destructive">
                  {message ?? (state === 'denied'
                    ? 'ครูยังไม่อนุมัติ กรุณาให้ครูตรวจเครื่องแล้วส่งคำขอใหม่'
                    : 'คำอนุมัติหมดอายุ กรุณาให้ครูตรวจเครื่องอีกครั้ง')}
                </p>
              </Card>
            )}
            <Button type="button" onClick={requestAccess} disabled={isRequesting || isActivating} className="w-full sm:w-auto">
              {isRequesting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Smartphone aria-hidden="true" />}
              {isRequesting ? 'กำลังส่งคำขอ…' : state === 'none' ? 'ส่งคำขอให้ครูตรวจเครื่อง' : 'ส่งคำขอใหม่'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
