'use client'

import { useState, useTransition } from 'react'
import { FileUp } from 'lucide-react'
import { toast } from 'sonner'
import { createFileAssignment, type CreateFileAssignmentInput } from '@/lib/actions/file-assignments'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { RichText } from '@/components/ui/rich-text'
import { Input } from '@/components/ui/input'
import { AssignmentAnnouncementEditor } from './assignment-announcement-editor'
import { QuestionFileUpload } from '@/components/questions/question-file-upload'

interface Props {
  classrooms: Array<{ id: string; name: string }>
  preselectedClassroomId?: string
  localOnly?: boolean
  initial?: Partial<CreateFileAssignmentInput>
  editing?: boolean
  contentLocked?: boolean
  onCreate?: (input: CreateFileAssignmentInput) => Promise<{ error?: string; success?: boolean } | void>
}

function local(value?: string | null) { return value ? new Date(Date.parse(value) + 7 * 60 * 60 * 1000).toISOString().slice(0, 16) : '' }

function iso(value: string) { return value ? new Date(value).toISOString() : null }

export function FileAssignmentForm({ classrooms, preselectedClassroomId, localOnly = false, onCreate = createFileAssignment, initial, editing = false, contentLocked = false }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [instructions, setInstructions] = useState(initial?.instructions ?? '')
  const [attachments, setAttachments] = useState<string[]>(initial?.attachment_urls ?? [])
  const [points, setPoints] = useState(String(initial?.max_score ?? 10))
  const [selected, setSelected] = useState<string[]>(preselectedClassroomId ? [preselectedClassroomId] : initial?.classroom_ids ?? [])
  const [start, setStart] = useState(local(initial?.start_at))
  const [due, setDue] = useState(local(initial?.due_at))
  const [end, setEnd] = useState(local(initial?.end_at))
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit(status: 'draft' | 'published') {
    setError(null)
    if (!title.trim() || !selected.length) { setError('กรุณาระบุชื่องานและเลือกห้องเรียน'); return }
    if (!instructions.replace(/<[^>]*>/g, '').trim() && !attachments.length) { setError('กรุณาเขียนคำสั่งหรือแนบใบงาน'); return }
    if (!Number.isFinite(Number(points)) || Number(points) <= 0) { setError('กรุณาระบุคะแนนเต็มมากกว่า 0'); return }
    startTransition(async () => {
      const result = await onCreate({ classroom_ids: selected, title, instructions, attachment_urls: attachments,
        copy_source_assignment_id: initial?.copy_source_assignment_id, max_score: Number(points), start_at: iso(start), due_at: iso(due), end_at: iso(end || due), status })
      if (result?.error) setError(result.error)
      else if (localOnly) toast.success(status === 'draft' ? 'บันทึกร่างตัวอย่างแล้ว' : 'มอบหมายงานตัวอย่างแล้ว')
    })
  }

  return <form onSubmit={event => { event.preventDefault(); submit(editing ? initial?.status ?? 'draft' : 'published') }} className="flex min-w-0 flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h1 className="flex items-center gap-2 text-xl font-bold"><FileUp className="size-5 text-primary" />{editing ? 'แก้ไขงานส่งไฟล์' : 'มอบหมายงานส่งไฟล์'}</h1>
        <p className="text-sm text-muted-foreground">เขียนคำสั่งหรือแนบใบงาน นักเรียนส่งคำตอบได้สูงสุด 10 ไฟล์ต่อคน</p></div>
      <div className="flex gap-2">{!editing && <Button type="button" variant="outline" disabled={pending} onClick={() => submit('draft')}>บันทึกร่าง</Button>}
        <Button type="submit" disabled={pending}>{pending ? 'กำลังบันทึก…' : editing ? 'บันทึกการแก้ไข' : 'มอบหมายงาน'}</Button></div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Card padding="md"><FieldGroup>
      <Field><FieldLabel htmlFor="file-assignment-title">ชื่องาน</FieldLabel><Input id="file-assignment-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} placeholder="เช่น ใบงานเรื่องการเคลื่อนที่" required /></Field>
      <fieldset disabled={contentLocked} className="flex min-w-0 flex-col gap-3"><Field><FieldLabel>คำสั่ง</FieldLabel><>{contentLocked ? <RichText text={instructions} blocks /> : <AssignmentAnnouncementEditor value={instructions} onChange={setInstructions} rows={5} />}</></Field>
      <Field><FieldLabel>เอกสารหรือรูปประกอบคำสั่ง</FieldLabel><QuestionFileUpload value={attachments} onChange={setAttachments} localOnly={localOnly} maxFiles={10} removeFromStorage={false} /></Field></fieldset>
      {contentLocked && <p className="text-xs text-muted-foreground">เผยแพร่แล้ว คำสั่ง เอกสาร และคะแนนเต็มคงตามงานที่นักเรียนได้รับ</p>}
    </FieldGroup></Card>
    <Card padding="md"><FieldGroup>
      <Field><FieldLabel>มอบหมายให้</FieldLabel><div className="flex flex-wrap gap-2">
        {classrooms.map(classroom => <label key={classroom.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <Checkbox disabled={editing} checked={selected.includes(classroom.id)} onCheckedChange={checked => setSelected(current => checked ? [...current, classroom.id] : current.filter(id => id !== classroom.id))} />{classroom.name}
        </label>)}
        {!classrooms.length && <p className="text-sm text-muted-foreground">ยังไม่มีห้องเรียนที่มอบหมายงานได้</p>}
      </div></Field>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field><FieldLabel htmlFor="file-assignment-points">คะแนนเต็มทั้งงาน</FieldLabel><Input id="file-assignment-points" disabled={contentLocked} type="number" min="0.01" max="1000000" step="any" value={points} onChange={event => setPoints(event.target.value)} /></Field>
        <Field><FieldLabel htmlFor="file-assignment-start">เปิดรับงาน</FieldLabel><Input id="file-assignment-start" type="datetime-local" value={start} onChange={event => setStart(event.target.value)} /></Field>
        <Field><FieldLabel htmlFor="file-assignment-due">กำหนดส่ง</FieldLabel><Input id="file-assignment-due" type="datetime-local" value={due} onChange={event => setDue(event.target.value)} /></Field>
        <Field><FieldLabel htmlFor="file-assignment-end">ปิดรับงาน</FieldLabel><Input id="file-assignment-end" type="datetime-local" value={end} onChange={event => setEnd(event.target.value)} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">ครูตรวจและให้คะแนนรวมทั้งงาน นักเรียนถอนส่งมาแก้ไขได้ก่อนกำหนดส่งและก่อนครูตรวจ</p>
    </FieldGroup></Card>
  </form>
}
