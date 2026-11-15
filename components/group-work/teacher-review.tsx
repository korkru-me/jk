'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Save, UsersRound } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { saveGroupWorkGrade } from '@/lib/actions/classroom-group-work'
import { formatGroupWorkTime, type GroupWorkDetail, type GroupWorkSubmission } from '@/lib/classroom-group-work'
import { GroupWorkContent, GroupMemberList } from './work-content'

function teamName(item: GroupWorkSubmission, group: boolean) {
  const name = item.members.find(member => member.id === item.submitted_by)?.name
  return group ? name ? `กลุ่มของ${name}` : 'กลุ่มนักเรียน' : name ?? 'นักเรียน'
}

export function GroupWorkTeacher({ roomId, data }: { roomId: string; data: GroupWorkDetail }) {
  const { work, roster, submissions } = data
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const current = submissions.find(item => item.id === selected) ?? submissions[0]
  const index = submissions.findIndex(item => item.id === current?.id)
  const total = roster.length
  const sent = roster.filter(student => student.submitted).length
  const group = work.mode === 'group'
  return <div className="flex min-w-0 flex-col gap-3">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="font-semibold">{group ? 'ตรวจงานกลุ่ม' : 'ตรวจงานเดี่ยว'}</h2>
        <p className="text-sm text-muted-foreground">{group && `ส่งแล้ว ${submissions.length} กลุ่ม · `}นักเรียนส่งแล้ว {sent} จาก {total} คน</p>
      </div>
      {current && <div className="flex max-w-full flex-wrap items-end gap-2">
        <Button type="button" size="icon" variant="outline" className="pointer-coarse:size-11" aria-label="ผลงานก่อนหน้า" disabled={saving || index <= 0} onClick={() => setSelected(submissions[index - 1].id)}><ChevronLeft /></Button>
        <Field className="w-44 max-w-full gap-1 sm:w-56">
          <FieldLabel htmlFor="group-review-select">{group ? 'กลุ่มที่ตรวจ' : 'นักเรียนที่ตรวจ'} · {index + 1} จาก {submissions.length}</FieldLabel>
          <NativeSelect id="group-review-select" value={current.id} disabled={saving} onChange={event => setSelected(event.target.value)}>
            {submissions.map(item => <option key={item.id} value={item.id}>{teamName(item, group)}{item.published_at ? ' · เผยแพร่แล้ว' : ''}</option>)}
          </NativeSelect>
        </Field>
        <Button type="button" size="icon" variant="outline" className="pointer-coarse:size-11" aria-label="ผลงานถัดไป" disabled={saving || index >= submissions.length - 1} onClick={() => setSelected(submissions[index + 1].id)}><ChevronRight /></Button>
      </div>}
    </div>
    {!current ? <Alert role="status"><ClipboardCheck aria-hidden="true" /><AlertTitle>ยังไม่มีผลงานให้ตรวจ</AlertTitle>
      <AlertDescription>เมื่อมีนักเรียนส่งงาน จะเปิดตรวจและให้คะแนนจากที่นี่ได้</AlertDescription></Alert> :
      <div className="grid items-start gap-3 @min-[60rem]:grid-cols-[minmax(0,1fr)_minmax(21rem,33%)]">
        <div className="flex min-w-0 flex-col gap-3">
          {work.instructions && <Card padding="sm"><h3 className="text-sm font-semibold">คำสั่งงาน</h3><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{work.instructions}</p></Card>}
          <GroupWorkContent key={current.id} item={current} />
        </div>
        <ReviewForm key={current.id} item={current} roomId={roomId} data={data} saving={saving} setSaving={setSaving} />
      </div>}
  </div>
}

function ReviewForm({ item, roomId, data, saving, setSaving }: {
  item: GroupWorkSubmission; roomId: string; data: GroupWorkDetail; saving: boolean; setSaving: (busy: boolean) => void
}) {
  const router = useRouter()
  const { work } = data
  const group = work.mode === 'group'
  const from = item.draft_score ?? item.published_score
  const [score, setScore] = useState(from == null ? '' : String(from))
  const [feedback, setFeedback] = useState(item.draft_feedback ?? item.published_feedback ?? '')
  const [revision, setRevision] = useState(item.revision ?? 0)
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null)
  const valid = /^\d+(\.\d{1,2})?$/.test(score.trim()) && Number(score) >= 0 && Number(score) <= work.max_score
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void save(true) }
  async function save(publish: boolean) {
    if (!valid || saving) return
    setSaving(true); setStatus(null)
    try {
      const result = await saveGroupWorkGrade(roomId, work.id, item.id, Number(score), feedback, publish, revision)
      if (typeof result.revision === 'number') {
        setRevision(result.revision)
        setStatus({ error: false, text: publish ? group ? `เผยแพร่ ${Number(score)}/${work.max_score} ให้สมาชิกทั้ง ${item.members.length} คนแล้ว` : 'เผยแพร่คะแนนแล้ว' : 'บันทึกฉบับร่างแล้ว นักเรียนยังไม่เห็นการแก้ไขนี้' })
        router.refresh()
      } else setStatus({ error: true, text: result.error ?? 'บันทึกคะแนนไม่สำเร็จ' })
    } catch { setStatus({ error: true, text: 'บันทึกคะแนนไม่สำเร็จ กรุณาลองอีกครั้ง' }) }
    finally { setSaving(false) }
  }

  return <Card padding="md" className="flex min-w-0 flex-col gap-3">
    <header>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{teamName(item, group)}</h3>
        <Badge variant={item.published_at ? 'statusSuccess' : 'statusWarning'}>{item.draft_score != null ? 'มีฉบับร่าง' : item.published_at ? 'เผยแพร่แล้ว' : 'ยังไม่เผยแพร่ผล'}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">ส่งเมื่อ {formatGroupWorkTime(item.submitted_at)} น.</p>
      {work.due_at && Date.parse(item.submitted_at) > Date.parse(work.due_at) && <Badge variant="statusWarning" className="mt-1">ส่งหลังครบกำหนด</Badge>}
    </header>
    {group && <><Separator /><GroupMemberList members={item.members} authorId={item.submitted_by} /></>}
    <Separator />
    <form onSubmit={submit} className="flex flex-col gap-3">
      <FieldGroup className="gap-3">
        <Field className="gap-1" data-invalid={Boolean(score && !valid)}>
          <FieldLabel htmlFor="group-score">{group ? 'คะแนนกลุ่ม' : 'คะแนน'}</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Input id="group-score" type="number" min={0} max={work.max_score} step="0.01" value={score} onChange={event => setScore(event.target.value)}
              className="w-28 pointer-coarse:min-h-11" aria-invalid={Boolean(score && !valid)} required disabled={saving} />
            <span className="text-sm text-muted-foreground">/ {work.max_score} คะแนน</span>
          </div>
        </Field>
        {group && <Alert role="status" className="border-primary/25 bg-primary/5">
          <UsersRound aria-hidden="true" /><AlertTitle>สมาชิกทั้ง {item.members.length} คนจะได้{valid ? ` ${Number(score)}/${work.max_score} ` : 'คะแนน'}เท่ากัน</AlertTitle>
        </Alert>}
        <Field className="gap-1"><FieldLabel htmlFor="group-feedback">{group ? 'ข้อเสนอแนะถึงกลุ่ม' : 'ข้อเสนอแนะ'}</FieldLabel>
          <Textarea id="group-feedback" value={feedback} maxLength={5000} rows={3} onChange={event => setFeedback(event.target.value)} disabled={saving} />
        </Field>
      </FieldGroup>
      {status && <Alert variant={status.error ? 'destructive' : 'success'} role={status.error ? 'alert' : 'status'}>
        <AlertDescription>{status.text}</AlertDescription></Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="grow pointer-coarse:min-h-11" disabled={!valid || saving} onClick={() => void save(false)}>
          <Save data-icon="inline-start" />บันทึกฉบับร่าง
        </Button>
        <Button type="submit" className="grow pointer-coarse:min-h-11" disabled={!valid || saving}>
          <CheckCircle2 data-icon="inline-start" />{group ? 'เผยแพร่ผลให้ทั้งกลุ่ม' : 'เผยแพร่ผล'}
        </Button>
      </div>
    </form>
  </Card>
}
