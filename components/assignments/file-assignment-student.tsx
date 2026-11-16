'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileUp, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RichText } from '@/components/ui/rich-text'
import { Textarea } from '@/components/ui/textarea'
import { FileAssignmentTextAndLink } from './file-assignment-text-and-link'
import { InstructionAttachment } from './instruction-attachment'
import { FileSubmissionUpload } from '@/components/exam/file-submission-upload'
import { saveAnswer } from '@/lib/actions/submissions'
import { startFileAssignment, submitFileAssignment, withdrawFileAssignment } from '@/lib/actions/file-assignments'
import {
  EMPTY_FILE_ASSIGNMENT_RESPONSE,
  MAX_FILE_ASSIGNMENT_LINK_LENGTH,
  MAX_FILE_ASSIGNMENT_TEXT_LENGTH,
  fileAssignmentSubmitError,
  hasFileAssignmentResponse,
  normalizeFileAssignmentLink,
  serializeFileAssignmentResponse,
  type FileAssignmentResponse,
  type FileAssignmentView,
} from '@/lib/file-assignment'
import type { SubmittedFile } from '@/lib/types'
import { useConfirm } from '@/components/ui/confirm-dialog'

interface Props {
  view: FileAssignmentView
  localOnly?: boolean
  onStart?: () => Promise<{ error?: string } | void>
  onSave?: (response: FileAssignmentResponse) => Promise<{ error?: string } | void>
  onSubmit?: () => Promise<{ error?: string } | void>
  onWithdraw?: () => Promise<{ error?: string } | void>
}

const dateTime = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' })

export function FileAssignmentStudent({ view, localOnly = false, onStart, onSave, onSubmit, onWithdraw }: Props) {
  const router = useRouter()
  const [saved, setSaved] = useState(view.submission?.response ?? EMPTY_FILE_ASSIGNMENT_RESPONSE)
  const [draft, setDraft] = useState(saved)
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [confirm, confirmation] = useConfirm()
  const submitted = view.submission && view.submission.status !== 'in_progress'
  const graded = view.submission?.status === 'graded'
  const closed = view.status !== 'published' || Boolean(view.endAt && Date.parse(view.endAt) <= Date.now())
  const upcoming = Boolean(view.startAt && Date.parse(view.startAt) > Date.now())
  const draftChanged = draft.text !== saved.text || draft.link !== saved.link || draft.files !== saved.files

  function act(action: () => Promise<{ error?: string } | void>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result?.error) toast.error(result.error)
      else {
        toast.success(success)
        if (!localOnly) router.refresh()
      }
    })
  }

  async function persist(response: FileAssignmentResponse) {
    const result = onSave ? await onSave(response) : await saveAnswer(view.submission!.answerId, serializeFileAssignmentResponse(response))
    if (result?.error) return result.error
    setSaved(response)
    return null
  }

  function saveFiles(files: SubmittedFile[]) {
    setDraft(current => ({ ...current, files }))
    setError(null)
    startTransition(async () => {
      try {
        setError(await persist({ ...saved, files }))
      } catch {
        setError('บันทึกไฟล์ไม่สำเร็จ กรุณาลองบันทึกฉบับร่างอีกครั้ง')
      }
    })
  }

  function saveDraft(send: boolean) {
    if (!view.submission || pending || attachmentBusy || closed || upcoming) return
    const link = draft.link.trim() ? normalizeFileAssignmentLink(draft.link) : ''
    if (link === null) {
      setError('กรุณาใส่ลิงก์ที่ขึ้นต้นด้วย https:// หรือ http:// ให้ครบถ้วน')
      return
    }
    const response = { ...draft, text: draft.text.trim(), link }
    const validationError = send ? fileAssignmentSubmitError(response) : null
    setError(validationError)
    if (validationError) return
    const submissionId = view.submission.id
    startTransition(async () => {
      try {
        if (draftChanged) {
          const saveError = await persist(response)
          if (saveError) { setError(saveError); return }
          setDraft(response)
        }
        if (!send) { toast.success('บันทึกฉบับร่างแล้ว'); return }
        const result = onSubmit ? await onSubmit() : await submitFileAssignment(view.id, submissionId)
        if (result?.error) { setError(result.error); return }
        toast.success('ส่งงานแล้ว รอครูตรวจ')
        if (!localOnly) router.refresh()
      } catch {
        setError(send ? 'ส่งงานไม่สำเร็จ กรุณาลองอีกครั้ง' : 'บันทึกฉบับร่างไม่สำเร็จ กรุณาลองอีกครั้ง')
      }
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
      {view.attachments.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{view.attachments.map(url => <InstructionAttachment key={url} url={url} localOnly={localOnly} />)}</div>}
    </Card>
    <Card padding="md"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">งานของคุณ</h2>
      <p role="status" className="text-sm text-muted-foreground">{graded ? 'ครูตรวจแล้ว' : submitted ? 'ส่งแล้ว · รอครูตรวจ' : pending ? 'กำลังบันทึก…' : 'ยังไม่ได้ส่ง'}</p></div>
      {!view.submission ? <Button disabled={pending || closed || upcoming} onClick={() => act(onStart ?? (() => startFileAssignment(view.id)), 'เริ่มทำงานได้แล้ว')}>เริ่มทำงาน</Button>
        : submitted ? <div className="flex flex-col gap-3">
          <FileAssignmentTextAndLink response={saved} />
          {saved.files.length > 0 && <ul aria-label="ไฟล์ที่แนบ" className="flex flex-wrap gap-2">{saved.files.map(file => <li key={file.url} className="min-w-0"><Button variant="outline" className="max-w-full" render={<a href={file.url} target="_blank" rel="noopener noreferrer" />}><Paperclip data-icon="inline-start" /><span className="max-w-56 truncate">{file.name}</span></Button></li>)}</ul>}
          {view.submission.submittedAt && <p className="text-xs text-muted-foreground">ส่งเมื่อ {dateTime.format(new Date(view.submission.submittedAt))}</p>}
          {view.withdrawalError ? <p className="text-xs text-muted-foreground">{view.withdrawalError}</p> : <Button variant="outline" disabled={pending} onClick={async () => {
            if (await confirm({ title: 'ถอนส่งเพื่อแก้ไขงาน?', description: 'คำตอบเดิมจะยังอยู่ครบ หลังแก้ไขให้กดส่งงานอีกครั้งก่อนกำหนดส่ง', confirmLabel: 'ถอนส่ง' })) {
              act(onWithdraw ?? (() => withdrawFileAssignment(view.id, view.submission!.id)), 'ถอนส่งแล้ว แก้ไขคำตอบและส่งใหม่ได้')
            }
          }}>ถอนส่งเพื่อแก้ไข</Button>}
        </div> : <form onSubmit={event => { event.preventDefault(); saveDraft(true) }}>
          <fieldset disabled={pending || closed || upcoming} className="flex min-w-0 flex-col gap-3">
            <p className="text-sm text-muted-foreground">เลือกส่งอย่างน้อยหนึ่งแบบ ครูให้คะแนนรวมทั้งงาน</p>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="file-assignment-response-text">ข้อความคำตอบ</FieldLabel>
              <Textarea id="file-assignment-response-text" rows={3} maxLength={MAX_FILE_ASSIGNMENT_TEXT_LENGTH} value={draft.text}
                placeholder="พิมพ์คำตอบที่นี่" onChange={event => {
                  const text = event.target.value
                  setDraft(current => ({ ...current, text }))
                  setError(null)
                }} />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="file-assignment-response-link">ลิงก์ผลงาน</FieldLabel>
              <Input id="file-assignment-response-link" className="min-h-11" inputMode="url" autoCapitalize="none" spellCheck={false}
                maxLength={MAX_FILE_ASSIGNMENT_LINK_LENGTH} placeholder="https://…" value={draft.link} onChange={event => {
                  const link = event.target.value
                  setDraft(current => ({ ...current, link }))
                  setError(null)
                }} />
            </Field>
            <FileSubmissionUpload submissionAnswerId={view.submission.answerId} value={draft.files} onChange={saveFiles}
              localOnly={localOnly} separateImagePicker onBusyChange={setAttachmentBusy} />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="min-h-11" disabled={attachmentBusy || !hasFileAssignmentResponse(draft)}>ส่งงาน</Button>
              <Button type="button" variant="outline" className="min-h-11" disabled={attachmentBusy || !draftChanged} onClick={() => saveDraft(false)}>บันทึกฉบับร่าง</Button>
            </div>
          </fieldset>
        </form>}
      {closed && !submitted && <p className="mt-2 text-sm text-muted-foreground">งานนี้ปิดรับแล้ว</p>}
      {upcoming && <p className="mt-2 text-sm text-muted-foreground">ยังไม่ถึงเวลาเปิดรับงาน</p>}
    </Card>
  </div>
}
