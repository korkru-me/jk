'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileUp, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RichText } from '@/components/ui/rich-text'
import { FileSubmissionUpload } from '@/components/exam/file-submission-upload'
import { saveAnswer } from '@/lib/actions/submissions'
import { startFileAssignment, submitFileAssignment, withdrawFileAssignment } from '@/lib/actions/file-assignments'
import { MAX_SUBMISSION_FILES, type FileAssignmentView } from '@/lib/file-assignment'
import type { SubmittedFile } from '@/lib/types'
import { useConfirm } from '@/components/ui/confirm-dialog'

interface Props {
  view: FileAssignmentView
  localOnly?: boolean
  onStart?: () => Promise<{ error?: string } | void>
  onSave?: (files: SubmittedFile[]) => Promise<{ error?: string } | void>
  onSubmit?: () => Promise<{ error?: string } | void>
  onWithdraw?: () => Promise<{ error?: string } | void>
}

const dateTime = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' })

export function FileAssignmentStudent({ view, localOnly = false, onStart, onSave, onSubmit, onWithdraw }: Props) {
  const router = useRouter()
  const [files, setFiles] = useState(view.submission?.files ?? [])
  const [uploading, setUploading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [confirm, confirmation] = useConfirm()
  const submitted = view.submission && view.submission.status !== 'in_progress'
  const graded = view.submission?.status === 'graded'
  const closed = view.status !== 'published' || Boolean(view.endAt && Date.parse(view.endAt) <= Date.now())
  const upcoming = Boolean(view.startAt && Date.parse(view.startAt) > Date.now())

  function act(action: () => Promise<{ error?: string } | void>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result?.error) toast.error(result.error)
      else { toast.success(success); router.refresh() }
    })
  }

  function save(next: SubmittedFile[]) {
    setFiles(next)
    setSaveError(null)
    startTransition(async () => {
      const result = onSave ? await onSave(next) : await saveAnswer(view.submission!.answerId, JSON.stringify(next))
      if (result?.error) setSaveError(result.error)
    })
  }

  return <div className="flex min-w-0 flex-col gap-3">
    {confirmation}
    <Link href={`/classrooms/${view.classroomId}?tab=assignments`} className="text-sm text-muted-foreground">← กลับห้องเรียน</Link>
    <Card padding="md"><div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><p className="flex items-center gap-1.5 text-xs font-medium text-primary"><FileUp className="size-4" />งานส่งไฟล์</p>
        <h1 className="mt-1 text-xl font-bold">{view.title}</h1></div>
      <p className="text-sm font-medium">{graded ? `${view.submission!.score ?? 0} / ${view.maxScore}` : `${view.maxScore} คะแนน`}</p>
    </div>
      {view.dueAt && <p className="mt-2 text-xs text-muted-foreground">กำหนดส่ง {dateTime.format(new Date(view.dueAt))}</p>}
      <div className="mt-3"><RichText text={view.instructions} blocks /></div>
      {view.attachments.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{view.attachments.map((url, index) => <Button key={url} variant="secondary" className="max-w-full" render={<a href={url} target="_blank" rel="noopener noreferrer" />}><Paperclip data-icon="inline-start" />เอกสารประกอบ {index + 1}</Button>)}</div>}
    </Card>
    <Card padding="md"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">งานของคุณ</h2>
      <p role="status" className="text-sm text-muted-foreground">{graded ? 'ครูตรวจแล้ว' : submitted ? 'ส่งแล้ว · รอครูตรวจ' : pending ? 'กำลังบันทึก…' : 'ยังไม่ได้ส่ง'}</p></div>
      {!view.submission ? <Button disabled={pending || closed || upcoming} onClick={() => act(onStart ?? (() => startFileAssignment(view.id)), 'เริ่มแนบไฟล์ได้แล้ว')}>เริ่มแนบไฟล์คำตอบ</Button>
        : submitted ? <div className="flex flex-col gap-3">
          <ul className="flex flex-wrap gap-2">{files.map(file => <li key={file.url}><Button variant="outline" render={<a href={file.url} target="_blank" rel="noopener noreferrer" />}><Paperclip data-icon="inline-start" /><span className="max-w-56 truncate">{file.name}</span></Button></li>)}</ul>
          {view.submission.submittedAt && <p className="text-xs text-muted-foreground">ส่งเมื่อ {dateTime.format(new Date(view.submission.submittedAt))}</p>}
          {view.withdrawalError ? <p className="text-xs text-muted-foreground">{view.withdrawalError}</p> : <Button variant="outline" disabled={pending} onClick={async () => {
            if (await confirm({ title: 'ถอนส่งเพื่อแก้ไขงาน?', description: 'ไฟล์เดิมยังอยู่ครบ หลังแก้ไขให้กดส่งงานอีกครั้งก่อนกำหนดส่ง', confirmLabel: 'ถอนส่ง' })) {
              act(onWithdraw ?? (() => withdrawFileAssignment(view.id, view.submission!.id)), 'ถอนส่งแล้ว แก้ไขไฟล์และส่งใหม่ได้')
            }
          }}>ถอนส่งเพื่อแก้ไข</Button>}
        </div> : <fieldset disabled={pending || closed || upcoming} className="flex min-w-0 flex-col gap-3">
          <FileSubmissionUpload submissionAnswerId={view.submission.answerId} value={files} onChange={save} localOnly={localOnly} onBusyChange={setUploading} />
          {saveError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive"><p>{saveError}</p><Button variant="outline" onClick={() => save(files)}>ลองบันทึกอีกครั้ง</Button></div>}
          <p className="text-xs text-muted-foreground">แนบรูปภาพหรือ PDF ได้รวมกันไม่เกิน {MAX_SUBMISSION_FILES} ไฟล์ ครูตรวจและให้คะแนนรวมทั้งงาน</p>
          <Button disabled={pending || uploading || Boolean(saveError) || !files.length || files.length > MAX_SUBMISSION_FILES} onClick={() => act(onSubmit ?? (() => submitFileAssignment(view.id, view.submission!.id)), 'ส่งงานแล้ว รอครูตรวจ')}>ส่งงาน</Button>
        </fieldset>}
      {closed && !submitted && <p className="mt-2 text-sm text-muted-foreground">งานนี้ปิดรับแล้ว</p>}
      {upcoming && <p className="mt-2 text-sm text-muted-foreground">ยังไม่ถึงเวลาเปิดรับงาน</p>}
    </Card>
  </div>
}
