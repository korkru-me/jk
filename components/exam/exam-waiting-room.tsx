'use client'

import { Clock3, Loader2, LogIn } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import type { ExamWaitingSummary } from '@/lib/exam-waiting-room'

interface Props {
  summary: ExamWaitingSummary
  busy: boolean
  error: string | null
  code: string
  onCodeChange: (code: string) => void
  onStart: () => void
  onReload: () => void
  previewMode?: boolean
  returnHref?: string
}

/** Uses the repository's Card API (intentionally no header/footer slots).
 * It contains metadata only, never an ExamClient/countdown or question input. */
export function ExamWaitingRoom({ summary, busy, error, code, onCodeChange, onStart, onReload,
  previewMode = false, returnHref = '/assignments' }: Props) {
  const active = summary.activeSubmissionId !== null
  return (
    <Card padding="xl" className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">หน้ารอเข้าห้องสอบ{summary.accessMode === 'seb' ? ' · Safe Exam Browser' : ''}</p>
        <h1 className="text-2xl font-semibold text-foreground">{summary.title}</h1>
        {previewMode && <p className="text-sm text-muted-foreground">มุมมองตัวอย่างสำหรับครู · ไม่สร้างรอบสอบ ไม่บันทึกคำตอบหรือคะแนนจริง และไม่ตรวจเครื่อง SEB หรือรหัสเข้าทำข้อสอบจริง</p>}
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
        {summary.blockedReason && <p role="alert" className="text-sm text-destructive">{summary.blockedReason}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </section>
      <Separator />
      <section aria-labelledby="exam-waiting-rules" className="flex flex-col gap-3">
        <h2 id="exam-waiting-rules" className="text-lg font-semibold">กติกาก่อนเข้าห้องสอบ</h2>
        {summary.description && <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">คำชี้แจงจากครู</h3>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{summary.description}</p>
        </div>}
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
          <li>อ่านคำชี้แจงและเตรียมอุปกรณ์ให้พร้อม แล้วจึงกดเข้าห้องสอบ</li>
          <li>{summary.completedSubmissionId ? 'รอบเดิมสิ้นสุดแล้ว การดูผลไม่เริ่มรอบสอบใหม่'
            : summary.expired ? 'รอบเดิมหมดเวลาแล้ว การตรวจสอบผลยืนยันเฉพาะรอบเดิม ไม่เริ่มรอบใหม่'
              : active ? 'ทำต่อในรอบเดิมและใช้เวลาเริ่มเดิม เวลายังเดินระหว่างที่อยู่หน้ารอ'
                : summary.durationMinutes == null ? 'ข้อสอบนี้ไม่จำกัดเวลาต่อรอบ แต่ยังต้องส่งภายในเวลาปิดรับ หากครูกำหนดไว้'
                  : 'เวลาเริ่มเมื่อกดเข้าห้องสอบ การโหลดหน้าใหม่หรือเน็ตหลุดไม่หยุดเวลาและไม่เพิ่มเวลา'}</li>
          <li>เมื่อทำเสร็จให้กดส่งคำตอบ การปิดหน้าเว็บไม่ใช่การส่งข้อสอบ</li>
          <li>หากพบปัญหาระหว่างสอบ ให้แจ้งครูผู้คุมสอบก่อนดำเนินการต่อ</li>
        </ul>
      </section>
      <form className="flex flex-col gap-4" onSubmit={event => {
        event.preventDefault()
        if (!busy && !summary.blockedReason && !summary.completedSubmissionId
          && (!summary.requiresAccessCode || code.trim())) onStart()
      }}>
        {summary.requiresAccessCode && <FieldGroup>
          <Field data-invalid={Boolean(error)} data-disabled={busy}>
            <FieldLabel htmlFor="exam-entry-code">รหัสเข้าทำข้อสอบที่ครูกำหนด</FieldLabel>
            <Input id="exam-entry-code" value={code} onChange={event => onCodeChange(event.target.value)} disabled={busy}
              aria-invalid={Boolean(error)} autoComplete="off" maxLength={256} />
            <FieldDescription>{previewMode ? 'โหมดตัวอย่าง: กรอกค่าใดก็ได้เพื่อจำลองขั้นตอนนี้ ไม่ตรวจรหัสจริง' : 'กรอกเฉพาะข้อสอบที่ครูกำหนดรหัสไว้'}</FieldDescription>
          </Field>
        </FieldGroup>}
        <footer className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {summary.completedSubmissionId
            ? <a className={buttonVariants()} href={`/submissions/${summary.completedSubmissionId}`}>ดูผลรอบสอบเดิม</a>
            : <Button type="submit" disabled={busy || Boolean(summary.blockedReason) || (summary.requiresAccessCode && !code.trim())}>
              {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <LogIn data-icon="inline-start" />}
              {busy ? previewMode ? 'กำลังเปิดตัวอย่าง…' : 'กำลังตรวจสอบรอบสอบ…'
                : previewMode ? 'เข้าห้องสอบตัวอย่าง' : summary.expired ? 'ตรวจสอบผลรอบสอบเดิม' : active ? 'กลับเข้าห้องสอบรอบเดิม'
                : summary.durationMinutes == null ? 'เข้าห้องสอบและเริ่มทำข้อสอบ' : 'เข้าห้องสอบและเริ่มจับเวลา'}
            </Button>}
          {(error || summary.blockedReason) && <Button type="button" variant="outline" disabled={busy} onClick={onReload}>โหลดหน้ารอสอบใหม่</Button>}
          <a className={buttonVariants({ variant: 'outline' })} href={returnHref}>{previewMode ? 'กลับไปรายละเอียดข้อสอบ' : 'กลับไปงานที่ได้รับ'}</a>
        </footer>
      </form>
    </Card>
  )
}
