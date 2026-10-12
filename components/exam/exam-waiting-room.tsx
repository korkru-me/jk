'use client'

import { Clock3, Loader2, LogIn } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RichText } from '@/components/ui/rich-text'
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
  const exercise = summary.assignmentType === 'exercise'
  const task = exercise ? 'แบบฝึกหัด' : 'ข้อสอบ'
  const room = exercise ? 'ห้องทำแบบฝึกหัด' : 'ห้องสอบ'
  const round = exercise ? 'รอบทำแบบฝึกหัด' : 'รอบสอบ'
  const details = exercise ? summary.exerciseDetails : undefined
  const actionClassName = 'h-auto min-h-8 whitespace-normal py-1.5'
  return (
    <Card padding="xl" className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">หน้ารอเข้า{room}{summary.accessMode === 'seb' ? ' · Safe Exam Browser' : ''}</p>
        <h1 className="text-2xl font-semibold text-foreground">{summary.title}</h1>
        {previewMode && <p className="text-sm text-muted-foreground">มุมมองตัวอย่างสำหรับครู · ไม่สร้าง{round} ไม่บันทึกคำตอบหรือคะแนนจริง และไม่ตรวจ{exercise ? `รหัสเข้าทำ${task}จริง` : 'เครื่อง SEB หรือรหัสเข้าทำข้อสอบจริง'}</p>}
      </header>
      <section aria-label={`ข้อมูลก่อนเข้า${room}`} className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm">
          <Clock3 className="size-5 text-muted-foreground" aria-hidden="true" />
          {summary.durationMinutes == null ? 'ไม่จำกัดเวลาต่อรอบ' : `เวลาทำ${task} ${summary.durationMinutes} นาที`}
        </p>
        <p className="text-sm text-muted-foreground">
          {summary.questionCount == null ? `จำนวนข้อขึ้นอยู่กับเงื่อนไขการทำ${task}` : `ชุด${task}ที่กำหนด ${summary.questionCount} ข้อ`}
        </p>
        {details && <>
          <p className="text-sm text-muted-foreground">
            {details.completion === 'streak' ? `เงื่อนไขจบ: ตอบถูกติดต่อกัน ${details.streakTarget} ข้อ หากตอบผิดจะเริ่มนับใหม่`
              : details.completion === 'threshold' ? `เงื่อนไขผ่าน: ได้คะแนนอย่างน้อย ${details.passingValue}${details.passingType === 'percent' ? '%' : ' คะแนน'} ทำซ้ำได้จนกว่าจะผ่านภายในเวลาปิดรับ`
                : `จำนวนครั้งที่ทำได้ทั้งหมด: ${details.maxAttempts == null ? 'ไม่จำกัดครั้ง' : `${details.maxAttempts} ครั้ง`}`}
          </p>
          {details.completion === 'complete' && <p className="text-sm text-muted-foreground">คะแนนที่ใช้: {details.scoreStrategy === 'average' ? 'ค่าเฉลี่ยทุกรอบ' : details.scoreStrategy === 'latest' ? 'รอบล่าสุด' : 'รอบที่ได้คะแนนดีที่สุด'}</p>}
          {details.completion === 'streak' && details.streakQuestionCap != null && <p className="text-sm text-muted-foreground">แต่ละรอบทำได้สูงสุด {details.streakQuestionCap} ข้อ หากยังไม่ครบเงื่อนไขจะจบรอบเป็นยังไม่ผ่าน</p>}
        </>}
        {summary.endAt && <p className="text-sm text-muted-foreground">ปิดรับวันที่ {new Date(summary.endAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>}
        <p role="status" className="text-sm font-medium">
          {summary.completedSubmissionId ? `ทำ${task}ครบตามเงื่อนไขแล้ว สามารถดูผลรอบเดิมได้`
            : summary.expired ? 'รอบเดิมหมดเวลาทำแล้ว กดตรวจสอบเพื่อยืนยันผลรอบเดิม โดยยังไม่เริ่มรอบใหม่'
              : active ? summary.durationMinutes == null ? `รอบนี้เริ่มทำ${task}แล้ว การกลับเข้าหน้านี้จะทำต่อในรอบเดิม ไม่เปิดรอบใหม่`
                : `รอบนี้เริ่มทำ${task}แล้ว เวลายังเดินต่อจากเวลาเริ่มเดิม การกลับเข้าหน้านี้ไม่เริ่มเวลาใหม่`
                : `ยังไม่เปิดโจทย์ และยังไม่เริ่ม${summary.durationMinutes == null ? `ทำ${task}` : 'จับเวลา'} เมื่อพร้อมแล้วจึงกดเข้า${room}`}
        </p>
        {summary.accessMode === 'seb' && <p className="text-sm text-muted-foreground">ใช้การตั้งค่า SEB ที่ผ่านการตรวจแล้ว กรณีฉุกเฉินให้ติดต่อครูเพื่อขอรหัสออก</p>}
        {summary.accessMode === 'android_monitored' && <p className="text-sm text-muted-foreground">ใช้โหมด Android ที่ครูอนุมัติ ไม่ใช่ Safe Exam Browser</p>}
        {summary.blockedReason && <p role="alert" className="text-sm text-destructive">{summary.blockedReason}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </section>
      {summary.description && <>
        <Separator />
        <section aria-labelledby="exam-waiting-announcement">
          <Card radius="md" edge="none" padding="md" className="flex flex-col gap-2 bg-primary/10">
            <h2 id="exam-waiting-announcement" className="text-lg font-semibold text-foreground">ประกาศจากครู</h2>
            <RichText
              text={summary.description}
              blocks
              className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
            />
          </Card>
        </section>
      </>}
      <Separator />
      <section aria-labelledby="exam-waiting-rules" className="flex flex-col gap-3">
        <h2 id="exam-waiting-rules" className="text-lg font-semibold">กติกาก่อนเข้า{room}</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
          <li>อ่านคำชี้แจงและเตรียมอุปกรณ์ให้พร้อม แล้วจึงกดเข้า{room}</li>
          <li>{summary.completedSubmissionId ? `รอบเดิมสิ้นสุดแล้ว การดูผลไม่เริ่ม${round}ใหม่`
            : summary.expired ? 'รอบเดิมหมดเวลาแล้ว การตรวจสอบผลยืนยันเฉพาะรอบเดิม ไม่เริ่มรอบใหม่'
              : active ? summary.durationMinutes == null ? 'ทำต่อในรอบเดิมโดยไม่ใช้สิทธิ์รอบใหม่ แต่ยังต้องส่งภายในเวลาปิดรับ หากครูกำหนดไว้'
                : 'ทำต่อในรอบเดิมและใช้เวลาเริ่มเดิม เวลายังเดินระหว่างที่อยู่หน้ารอ'
                : summary.durationMinutes == null ? `${task}นี้ไม่จำกัดเวลาต่อรอบ แต่ยังต้องส่งภายในเวลาปิดรับ หากครูกำหนดไว้`
                  : `เวลาเริ่มเมื่อกดเข้า${room} การโหลดหน้าใหม่หรือเน็ตหลุดไม่หยุดเวลาและไม่เพิ่มเวลา`}</li>
          {details?.instantCheck && <li>ตรวจคำตอบรายข้อได้สำหรับชนิดโจทย์ที่รองรับ {details.revealCheckAnswer ? 'พร้อมแสดงคำตอบที่ถูกต้อง' : 'แสดงเฉพาะผลถูกหรือผิด ไม่แสดงคำตอบที่ถูกต้อง'} โจทย์ที่ต้องตรวจด้วยครูจะรอครูให้คะแนน</li>}
          {details?.retryWrongOnly && <li>หากทำซ้ำได้ รอบถัดไปจะให้ทำเฉพาะข้อที่ยังไม่ได้คะแนนเต็ม และเก็บคะแนนข้อที่ได้เต็มจากรอบก่อน จำนวนข้อที่ต้องทำซ้ำจึงอาจน้อยลง</li>}
          {details?.requireWorkImage && <li>แนบภาพแสดงวิธีทำให้ครบตามที่ครูกำหนดก่อนส่งคำตอบ</li>}
          <li>{details?.completion === 'streak' ? 'ทำตามเงื่อนไขถูกติดต่อกันจนระบบยืนยันว่าจบรอบ การปิดหน้าเว็บไม่ใช่การส่งแบบฝึกหัด' : `เมื่อทำเสร็จให้กดส่งคำตอบ การปิดหน้าเว็บไม่ใช่การส่ง${task}`}</li>
          <li>หากพบปัญหาระหว่าง{exercise ? 'ทำแบบฝึกหัด ให้แจ้งครูผู้สอน' : 'สอบ ให้แจ้งครูผู้คุมสอบ'}ก่อนดำเนินการต่อ</li>
        </ul>
      </section>
      <form className="flex flex-col gap-4" onSubmit={event => {
        event.preventDefault()
        if (!busy && !summary.blockedReason && !summary.completedSubmissionId
          && (!summary.requiresAccessCode || code.trim())) onStart()
      }}>
        {summary.requiresAccessCode && <FieldGroup>
          <Field data-invalid={Boolean(error)} data-disabled={busy}>
            <FieldLabel htmlFor="exam-entry-code">รหัสเข้าทำ{task}ที่ครูกำหนด</FieldLabel>
            <Input id="exam-entry-code" value={code} onChange={event => onCodeChange(event.target.value)} disabled={busy}
              aria-invalid={Boolean(error)} autoComplete="off" maxLength={256} />
            <FieldDescription>{previewMode ? 'โหมดตัวอย่าง: กรอกค่าใดก็ได้เพื่อจำลองขั้นตอนนี้ ไม่ตรวจรหัสจริง' : `กรอกเฉพาะ${task}ที่ครูกำหนดรหัสไว้`}</FieldDescription>
          </Field>
        </FieldGroup>}
        <footer className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {summary.completedSubmissionId
            ? <a className={buttonVariants({ className: actionClassName })} href={`/submissions/${summary.completedSubmissionId}`}>ดูผล{round}เดิม</a>
            : <Button type="submit" className={actionClassName} disabled={busy || Boolean(summary.blockedReason) || (summary.requiresAccessCode && !code.trim())}>
              {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <LogIn data-icon="inline-start" />}
              {busy ? previewMode ? 'กำลังเปิดตัวอย่าง…' : `กำลังตรวจสอบ${round}…`
                : previewMode ? `เข้า${room}ตัวอย่าง` : summary.expired ? `ตรวจสอบผล${round}เดิม` : active ? `กลับเข้า${room}รอบเดิม`
                : summary.durationMinutes == null ? `เข้า${room}และเริ่มทำ${task}` : `เข้า${room}และเริ่มจับเวลา`}
            </Button>}
          {(error || summary.blockedReason) && <Button type="button" variant="outline" className={actionClassName} disabled={busy} onClick={onReload}>โหลดหน้ารอ{exercise ? 'ทำแบบฝึกหัด' : 'สอบ'}ใหม่</Button>}
          <a className={buttonVariants({ variant: 'outline', className: actionClassName })} href={returnHref}>{previewMode ? `กลับไปรายละเอียด${task}` : 'กลับไปงานที่ได้รับ'}</a>
        </footer>
      </form>
    </Card>
  )
}
