'use client'

import { useState, useTransition } from 'react'
import { FileUp } from 'lucide-react'
import { toast } from 'sonner'
import { createFileAssignment, type CreateFileAssignmentInput } from '@/lib/actions/file-assignments'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { RichText } from '@/components/ui/rich-text'
import { Input } from '@/components/ui/input'
import { thaiLocalDateTimeToIso, toThaiLocalDateTimeInput } from '@/lib/thai-time'
import { AssignmentAnnouncementEditor } from './assignment-announcement-editor'
import { QuestionFileUpload } from '@/components/questions/question-file-upload'
import { ClassroomPicker } from './classroom-picker'
import { SubmissionModeFields } from './submission-mode-fields'
import { exerciseGroupRangeError } from '@/lib/exercise-group'

interface Props {
  classrooms: Array<{ id: string; name: string; description?: string | null }>
  preselectedClassroomId?: string
  localOnly?: boolean
  initial?: Partial<CreateFileAssignmentInput>
  editing?: boolean
  contentLocked?: boolean
  onCreate?: (input: CreateFileAssignmentInput) => Promise<{ error?: string; success?: boolean } | void>
}

export function FileAssignmentForm({ classrooms, preselectedClassroomId, localOnly = false, onCreate = createFileAssignment, initial, editing = false, contentLocked = false }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [submissionMode, setSubmissionMode] = useState<'solo' | 'group'>(initial?.submission_mode ?? 'solo')
  const [minMembers, setMinMembers] = useState(String(initial?.group_min_members ?? 3))
  const [maxMembers, setMaxMembers] = useState(String(initial?.group_max_members ?? 5))
  const [instructions, setInstructions] = useState(initial?.instructions ?? '')
  const [attachments, setAttachments] = useState<string[]>(initial?.attachment_urls ?? [])
  const [points, setPoints] = useState(String(initial?.max_score ?? 10))
  const [selected, setSelected] = useState<string[]>(preselectedClassroomId ? [preselectedClassroomId] : initial?.classroom_ids ?? [])
  const initialDue = toThaiLocalDateTimeInput(initial?.due_at)
  const [due, setDue] = useState(initialDue)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [attachmentsBusy, setAttachmentsBusy] = useState(false)
  const classroomOptions = classrooms.map(room => ({ ...room, description: room.description ?? null }))
  const primaryClassroom = classrooms.find(room => room.id === preselectedClassroomId)

  function toggleClassroom(id: string) {
    if (editing || pending || id === primaryClassroom?.id) return
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  }

  function submit(status: 'draft' | 'published') {
    setError(null)
    if (attachmentsBusy) { setError('กรุณารอแนบไฟล์ให้เสร็จก่อนบันทึก'); return }
    if (!title.trim()) { setError('กรุณาระบุชื่องาน'); return }
    if (!selected.length) { setError('กรุณาเลือกห้องเรียน'); return }
    const groupError = submissionMode === 'group' ? exerciseGroupRangeError(Number(minMembers), Number(maxMembers)) : null
    if (groupError) { setError(groupError); return }
    const maxScore = Number(points)
    if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 1_000_000) {
      setError('คะแนนเต็มต้องมากกว่า 0 และไม่เกิน 1,000,000')
      return
    }
    const dueAt = editing && due === initialDue ? initial?.due_at ?? null : thaiLocalDateTimeToIso(due)
    if (due && !dueAt) { setError('กรุณาระบุวันและเวลากำหนดส่งให้ถูกต้อง'); return }
    startTransition(async () => {
      const result = await onCreate({ classroom_ids: selected, title, instructions, attachment_urls: attachments,
        submission_mode: submissionMode, group_min_members: submissionMode === 'group' ? Number(minMembers) : null,
        group_max_members: submissionMode === 'group' ? Number(maxMembers) : null,
        copy_source_assignment_id: initial?.copy_source_assignment_id, max_score: maxScore, due_at: dueAt, status })
      if (result?.error) setError(result.error)
      else if (localOnly) toast.success(status === 'draft' ? 'บันทึกร่างตัวอย่างแล้ว' : 'มอบหมายงานตัวอย่างแล้ว')
    })
  }

  return <form onSubmit={event => { event.preventDefault(); submit(editing ? initial?.status ?? 'draft' : 'published') }} className="flex min-w-0 flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h1 className="flex items-center gap-2 text-xl font-bold"><FileUp className="size-5 text-primary" />{editing ? 'แก้ไขงานอัปโหลดไฟล์' : 'มอบหมายงานอัปโหลดไฟล์'}</h1>
        <p className="text-sm text-muted-foreground">นักเรียนส่งเป็นข้อความ ลิงก์ ไฟล์ PDF หรือรูปภาพได้ จะใช้หลายแบบในงานชิ้นเดียวก็ได้</p></div>
      <div className="flex gap-2">{!editing && <Button type="button" size="sm" variant="outline" disabled={pending || attachmentsBusy} onClick={() => submit('draft')}>บันทึกร่าง</Button>}
        <Button type="submit" size="sm" disabled={pending || attachmentsBusy}>{pending ? 'กำลังบันทึก…' : editing ? 'บันทึกการแก้ไข' : 'มอบหมายงาน'}</Button></div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Card padding="md"><FieldGroup>
      <SubmissionModeFields mode={submissionMode} min={minMembers} max={maxMembers} onModeChange={setSubmissionMode}
        onMinChange={setMinMembers} onMaxChange={setMaxMembers} disabled={contentLocked || pending} />
      <Field><FieldLabel htmlFor="file-assignment-title">ชื่องาน <span aria-hidden="true" className="text-destructive">*</span></FieldLabel><Input id="file-assignment-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} placeholder="เช่น ใบงานเรื่องการเคลื่อนที่" required /></Field>
      <fieldset disabled={contentLocked} className="flex min-w-0 flex-col gap-3"><Field><FieldLabel>คำสั่ง (ไม่บังคับ)</FieldLabel><>{contentLocked ? <RichText text={instructions} blocks /> : <AssignmentAnnouncementEditor value={instructions} onChange={setInstructions} rows={5} />}</></Field>
      <Field><FieldLabel>เอกสารหรือรูปประกอบคำสั่ง</FieldLabel><QuestionFileUpload value={attachments} onChange={setAttachments} localOnly={localOnly} compact maxFiles={10} removeFromStorage={false} allowDrop allowDocuments disabled={contentLocked || pending} onUploadingChange={setAttachmentsBusy} /></Field></fieldset>
      {contentLocked && <p className="text-xs text-muted-foreground">เผยแพร่แล้ว คำสั่ง เอกสาร และคะแนนเต็มคงตามงานที่นักเรียนได้รับ</p>}
    </FieldGroup></Card>
    <Card padding="md"><FieldGroup>
      <Field><FieldLabel>มอบหมายให้{!primaryClassroom && selected.length > 1 ? ` (${selected.length} ห้อง)` : ''} <span className="text-destructive">*</span></FieldLabel>
        {primaryClassroom && <p className="truncate text-sm font-medium" title={primaryClassroom.name}>{primaryClassroom.name}</p>}
        <fieldset disabled={editing || pending} className="min-w-0">
          <ClassroomPicker classrooms={classroomOptions} selectedIds={selected} onToggle={toggleClassroom} primaryClassroomId={primaryClassroom?.id} />
        </fieldset>
        {!classrooms.length && <p className="text-sm text-muted-foreground">ยังไม่มีห้องเรียนที่มอบหมายงานได้</p>}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field><FieldLabel htmlFor="file-assignment-points">คะแนนเต็มทั้งงาน <span aria-hidden="true" className="text-destructive">*</span></FieldLabel><Input id="file-assignment-points" disabled={contentLocked} required type="number" min="0.01" max="1000000" step="any" value={points} onChange={event => setPoints(event.target.value)} /></Field>
        <Field><FieldLabel htmlFor="file-assignment-due">กำหนดส่ง (เวลาไทย)</FieldLabel><Input id="file-assignment-due" type="datetime-local" value={due} onChange={event => setDue(event.target.value)} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">{submissionMode === 'group'
        ? 'ตัวแทนส่งงานหนึ่งครั้ง ครูตรวจและให้คะแนนรวมร่วมกันทุกคน หากส่งแล้วต้องแก้ไขให้ติดต่อครูผู้สอน'
        : 'ครูตรวจและให้คะแนนรวมทั้งงาน นักเรียนถอนส่งมาแก้ไขได้ก่อนกำหนดส่งและก่อนครูตรวจ'}</p>
    </FieldGroup></Card>
  </form>
}
