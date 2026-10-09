'use client'

import { Clock3, ShieldCheck, LogIn, RotateCcw, Loader2, CircleCheck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { SebWaitingView } from '@/lib/seb-waiting-room'

export interface SebWaitingRoomProps {
  view: SebWaitingView
  busy?: boolean
  error?: string | null
  onVerify: () => void
  onStart: () => void
  onResume: () => void
  onReceipt: () => void
}

/** Uses KorKru's existing Card primitive (it intentionally has no slot API).
 * No application navigation, questions, answer keys or running countdown. */
export function SebWaitingRoom({ view, busy = false, error, onVerify, onStart, onResume, onReceipt }: SebWaitingRoomProps) {
  return (
    <Card padding="xl" className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">ห้องรอสอบ · Safe Exam Browser</p>
        <h1 className="text-2xl font-semibold text-foreground">{view.title}</h1>
        <p className="text-sm text-muted-foreground">หน้านี้ใช้สำหรับข้อสอบนี้เท่านั้น</p>
      </header>
      <section className="flex flex-col gap-4" aria-label="ข้อมูลก่อนเข้าห้องสอบ">
        <p className="flex items-center gap-2 text-sm">
          <Clock3 className="size-5 text-muted-foreground" aria-hidden="true" />
          {view.durationMinutes === null ? 'ไม่จำกัดเวลาต่อรอบ' : `เวลาทำข้อสอบ ${view.durationMinutes} นาที`}
        </p>
        <p className="text-sm text-muted-foreground">
          {view.phase === 'active'
            ? 'เวลาของรอบเดิมไม่หยุดเมื่อเน็ตหลุดหรือโหลดหน้าใหม่'
            : view.phase === 'submitted'
              ? 'ระบบยืนยันการส่งจากเซิร์ฟเวอร์ก่อนแสดงทางออก'
              : 'ยังไม่เริ่มจับเวลา และยังไม่เปิดโจทย์ เมื่อพร้อมแล้วจึงกดเข้าห้องสอบ'}
        </p>
        <p className="text-sm text-muted-foreground">
          เมื่อเริ่มสอบแล้ว ออกตามปกติได้หลังส่งสำเร็จ กรณีฉุกเฉินให้ติดต่อครูเพื่อขอรหัสออก
        </p>
        <p role="status" aria-live="polite" className="text-sm font-medium">{view.message}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </section>
      <footer className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {view.phase !== 'submitted' && (
          <Button variant="outline" disabled={busy} onClick={onVerify}>
            <ShieldCheck data-icon="inline-start" />
            {view.verified ? 'ตรวจเครื่องอีกครั้ง' : 'ตรวจเครื่อง SEB'}
          </Button>
        )}
        {view.phase === 'ready' && (
          <Button disabled={busy || !view.canStart} onClick={onStart}>
            {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <LogIn data-icon="inline-start" />}
            {busy ? 'กำลังเข้าห้องสอบ…' : 'เข้าห้องสอบและเริ่มจับเวลา'}
          </Button>
        )}
        {view.phase === 'active' && (
          <Button disabled={busy || !view.canResume} onClick={onResume}>
            <RotateCcw data-icon="inline-start" />กลับเข้าสอบรอบเดิม
          </Button>
        )}
        {view.hasReceipt && (
          <Button disabled={busy} onClick={onReceipt}>
            <CircleCheck data-icon="inline-start" />ดูสถานะการส่ง
          </Button>
        )}
      </footer>
    </Card>
  )
}
