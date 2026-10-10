'use client'

import { Clock3, Loader2, LogIn } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { ExamWaitingSummary } from '@/lib/exam-waiting-room'

interface Props {
  summary: ExamWaitingSummary
  busy: boolean
  error: string | null
  code: string
  onCodeChange: (code: string) => void
  onStart: () => void
  onReload: () => void
}

/** Uses the repository's Card API (intentionally no header/footer slots).
 * It contains metadata only, never an ExamClient/countdown or question input. */
export function ExamWaitingRoom({ summary, busy, error, code, onCodeChange, onStart, onReload }: Props) {
  const active = summary.activeSubmissionId !== null
  return (
    <Card padding="xl" className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">ห้องรอสอบ{summary.accessMode === 'seb' ? ' · Safe Exam Browser' : ''}</p>
        <h1 className="text-2xl font-semibold text-foreground">{summary.title}</h1>
        {summary.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{summary.description}</p>}
      </header>
      <section aria-label="ข้อมูลก่อนเข้าห้องสอบ" className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm">
          <Clock3 className="size-5 text-muted-foreground" aria-hidden="true" />
          {summary.durationMinutes == null ? 'ไม่จำกัดเวลาต่อรอบ' : `เวลาทำข้อสอบ ${summary.durationMinutes} นาที`}
        </p>
        <p className="text-sm text-muted-foreground">
          {summary.questionCount == null ? 'จำนวนข้อขึ้นอยู่กับเงื่อนไขการทำข้อสอบ' : `ชุดข้อสอบที่กำหนด ${summary.questionCount} ข้อ`}
        </p>
        {summary.endAt && <p className="text-sm text-muted-foreground">ปิดรับวันที่ {new Date(summary.endAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>}
        <p role="status" className="text-sm font-medium">
          {summary.completedSubmissionId ? 'ทำข้อสอบครบตามเงื่อนไขแล้ว สามารถดูผลรอบเดิมได้'
            : summary.expired ? 'รอบเดิมหมดเวลาทำแล้ว กดตรวจสอบเพื่อยืนยันผลรอบเดิม โดยยังไม่เริ่มรอบใหม่'
              : active ? 'รอบนี้เริ่มสอบแล้ว เวลายังเดินต่อจากเวลาเริ่มเดิม การกลับเข้าหน้านี้ไม่เริ่มเวลาใหม่'
                : 'ยังไม่เปิดโจทย์ และยังไม่เริ่มจับเวลา เมื่อพร้อมแล้วจึงกดเข้าห้องสอบ'}
        </p>
        {summary.accessMode === 'seb' && <p className="text-sm text-muted-foreground">ใช้การตั้งค่า SEB ที่ผ่านการตรวจแล้ว กรณีฉุกเฉินให้ติดต่อครูเพื่อขอรหัสออก</p>}
        {summary.accessMode === 'android_monitored' && <p className="text-sm text-muted-foreground">ใช้โหมด Android ที่ครูอนุมัติ ไม่ใช่ Safe Exam Browser</p>}
        {!active && !summary.completedSubmissionId && !summary.expired && <p className="text-sm text-muted-foreground">เมื่อเริ่มแล้ว ให้ทำและส่งข้อสอบก่อนหมดเวลาที่กำหนด การโหลดหน้าใหม่หรือเน็ตหลุดไม่หยุดเวลา</p>}
        {summary.blockedReason && <p role="alert" className="text-sm text-destructive">{summary.blockedReason}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </section>
      <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); onStart() }}>
        {summary.requiresAccessCode && <FieldGroup>
          <Field data-invalid={Boolean(error)} data-disabled={busy}>
            <FieldLabel htmlFor="exam-entry-code">รหัสเข้าทำข้อสอบที่ครูกำหนด</FieldLabel>
            <Input id="exam-entry-code" value={code} onChange={event => onCodeChange(event.target.value)} disabled={busy}
              aria-invalid={Boolean(error)} autoComplete="off" maxLength={256} />
            <FieldDescription>กรอกเฉพาะข้อสอบที่ครูกำหนดรหัสไว้</FieldDescription>
          </Field>
        </FieldGroup>}
        <footer className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {summary.completedSubmissionId
            ? <a className={buttonVariants()} href={`/submissions/${summary.completedSubmissionId}`}>ดูผลรอบสอบเดิม</a>
            : <Button type="submit" disabled={busy || Boolean(summary.blockedReason) || (summary.requiresAccessCode && !code.trim())}>
              {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <LogIn data-icon="inline-start" />}
              {busy ? 'กำลังตรวจสอบรอบสอบ…' : summary.expired ? 'ตรวจสอบผลรอบสอบเดิม' : active ? 'กลับเข้าห้องสอบรอบเดิม'
                : summary.durationMinutes == null ? 'เข้าห้องสอบและเริ่มทำข้อสอบ' : 'เข้าห้องสอบและเริ่มจับเวลา'}
            </Button>}
          {(error || summary.blockedReason) && <Button type="button" variant="outline" disabled={busy} onClick={onReload}>โหลดหน้ารอสอบใหม่</Button>}
          <a className={buttonVariants({ variant: 'outline' })} href="/assignments">กลับไปงานที่ได้รับ</a>
        </footer>
      </form>
    </Card>
  )
}
