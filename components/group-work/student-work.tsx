'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { CheckCircle2, Paperclip, Send, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { submitGroupWork } from '@/lib/actions/classroom-group-work'
import {
  GROUP_WORK_BUCKET, GROUP_WORK_FILE_ACCEPT, GROUP_WORK_FILE_COUNT, GROUP_WORK_FILE_MAX,
  formatGroupWorkTime, groupWorkError, groupWorkFileType, type GroupWorkDetail,
} from '@/lib/classroom-group-work'
import { createClient } from '@/lib/supabase/client'
import { GroupMemberList, GroupWorkContent } from './work-content'

export function GroupWorkStudent({ roomId, data }: { roomId: string; data: GroupWorkDetail }) {
  const submission = data.submissions[0]
  const work = data.work
  const group = work.mode === 'group'
  if (submission) return <div className="grid items-start gap-3 @min-[60rem]:grid-cols-[minmax(0,1fr)_21rem]">
    <GroupWorkContent key={submission.id} item={submission} />
    <Card padding="md" className="flex min-w-0 flex-col gap-3">
      <Alert variant="success" role="status"><CheckCircle2 aria-hidden="true" /><AlertTitle>ส่งแล้ว</AlertTitle>
        <AlertDescription>ส่งเมื่อ {formatGroupWorkTime(submission.submitted_at)} น.</AlertDescription>
      </Alert>
      {group && <GroupMemberList members={submission.members} authorId={submission.submitted_by} />}
      <Separator />
      {submission.published_score != null ? <div>
        <h2 className="font-semibold">{group ? 'คะแนนกลุ่ม' : 'คะแนนของคุณ'}</h2>
        <p className="text-2xl font-bold text-primary" data-testid="group-work-published-score">{submission.published_score} / {work.max_score} คะแนน</p>
        {group && <p className="text-sm text-muted-foreground">สมาชิกทุกคนได้รับคะแนนเท่ากัน</p>}
        {submission.published_feedback && <div className="mt-2 text-sm"><p className="font-semibold">ข้อเสนอแนะจากครู</p>
          <p className="whitespace-pre-wrap break-words">{submission.published_feedback}</p></div>}
      </div> : <p className="text-sm text-muted-foreground">ครูยังไม่เผยแพร่คะแนน</p>}
    </Card>
  </div>
  return <NewSubmission key={work.id} roomId={roomId} data={data} />
}

type FileDraft = { file: File; path: string; type: string; uploaded: boolean }

function NewSubmission({ roomId, data }: { roomId: string; data: GroupWorkDetail }) {
  const { actorId, work, roster } = data
  const router = useRouter()
  const [peers, setPeers] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [response, setResponse] = useState('')
  const [files, setFiles] = useState<FileDraft[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const requestId = useRef<string>(null)
  const uploadInput = useRef<HTMLInputElement>(null)
  const group = work.mode === 'group'
  const tally = 1 + peers.length
  const otherRoster = roster.filter(p => p.id !== actorId)
  const missingPeer = peers.some(id => !otherRoster.some(p => p.id === id && !p.submitted))
  const reason = missingPeer ? 'มีรายชื่อที่เลือกไม่ได้แล้ว กรุณาเอารายชื่อนั้นออก'
    : tally < work.min_members ? `เลือกเพื่อนเพิ่มอีก ${work.min_members - tally} คน`
    : tally > work.max_members ? `สมาชิกต้องไม่เกิน ${work.max_members} คน`
    : !response.trim() && !files.length ? 'เขียนคำตอบหรือแนบไฟล์อย่างน้อยหนึ่งไฟล์' : null
  const needle = search.trim().toLocaleLowerCase('th')
  const matching = otherRoster.filter(person => !needle || person.name.toLocaleLowerCase('th').includes(needle) || String(person.number ?? '').includes(needle))

  function toggle(id: string) {
    setConfirmed(false)
    setPeers(current => current.includes(id) ? current.filter(peer => peer !== id) :
      current.length + 1 < work.max_members && otherRoster.some(p => p.id === id && !p.submitted) ? [...current, id] : current)
  }

  function pickFiles(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    if (!chosen.length || busy) return
    if (files.length + chosen.length > GROUP_WORK_FILE_COUNT) { setError('แนบไฟล์ได้ไม่เกิน 10 ไฟล์'); return }
    if (chosen.some(file => !groupWorkFileType(file.name) || file.size < 1 || file.size > GROUP_WORK_FILE_MAX || file.name.length > 180)) {
      setError('ไฟล์ต้องเป็นชนิดที่รองรับ ขนาดไม่เกิน 10 MB และชื่อไม่เกิน 180 ตัวอักษร'); return
    }
    setError(''); setConfirmed(false)
    setFiles(list => [...list, ...chosen.map(file => ({
      file, path: `${work.id}/${actorId}/${crypto.randomUUID()}`, type: groupWorkFileType(file.name), uploaded: false,
    }))])
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (reason || !confirmed || busy) return
    setBusy(true); setError('')
    const id = requestId.current ??= crypto.randomUUID()
    try {
      const client = createClient()
      const waiting = files.filter(item => !item.uploaded)
      if (waiting.length) {
        const reservation = await client.rpc('reserve_classroom_group_work_uploads', {
          p_work: work.id, p_tokens: waiting.map(item => item.path.split('/').at(-1)),
        })
        if (reservation.error) throw new Error(groupWorkError(reservation.error.message))
      }
      const bucket = client.storage.from(GROUP_WORK_BUCKET)
      for (const [index, item] of files.entries()) {
        if (item.uploaded) continue
        setProgress(`กำลังแนบไฟล์ ${index + 1} จาก ${files.length}`)
        const uploaded = await bucket.upload(item.path, item.file, { upsert: false, contentType: item.type })
        if (uploaded.error) {
          const existing = await bucket.info(item.path)
          if (existing.error || !existing.data || existing.data.size !== item.file.size)
            throw new Error(`แนบไฟล์ “${item.file.name}” ไม่สำเร็จ กรุณาลองอีกครั้ง`)
        }
        setFiles(current => current.map(row => row.path === item.path ? { ...row, uploaded: true } : row))
      }
      setProgress('กำลังส่งผลงาน…')
      const result = await submitGroupWork(roomId, work.id, id, peers, response, files.map(item => ({ path: item.path, name: item.file.name })))
      if ('error' in result && result.error) {
        setError(result.error)
        if ('rosterChanged' in result && result.rosterChanged) router.refresh()
      } else router.refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'ส่งงานไม่สำเร็จ กรุณาลองอีกครั้ง') }
    finally { setProgress(''); setBusy(false) }
  }

  return <form onSubmit={send} className="grid items-start gap-3 @min-[60rem]:grid-cols-[minmax(0,1fr)_21rem]">
    <div className="flex min-w-0 flex-col gap-3">
      {work.instructions && <Card padding="sm"><h2 className="font-semibold">คำสั่งงาน</h2><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{work.instructions}</p></Card>}
      {group && <Card padding="md" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">สมาชิกกลุ่ม</h2>
          <Badge variant={tally >= work.min_members ? 'statusSuccess' : 'statusWarning'}>{tally} / {work.max_members} คน</Badge>
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {work.min_members === work.max_members ? `กลุ่มละ ${work.min_members} คน` : `สมาชิก ${work.min_members}–${work.max_members} คน`} รวมผู้ส่ง ·{' '}
          {tally < work.min_members ? `เลือกเพื่อนเพิ่มอีก ${work.min_members - tally} คน` : tally === work.max_members ? 'ครบจำนวนสูงสุดแล้ว' : `เพิ่มได้อีก ${work.max_members - tally} คน`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{roster.find(p => p.id === actorId)?.name ?? 'คุณ'} (ผู้ส่ง)</Badge>
          {peers.map(id => <Button key={id} type="button" size="xs" variant="outline" className="pointer-coarse:min-h-11"
            aria-label={`เอา ${otherRoster.find(p => p.id === id)?.name ?? 'สมาชิก'} ออกจากกลุ่ม`} disabled={busy} onClick={() => toggle(id)}>
            {otherRoster.find(p => p.id === id)?.name ?? 'สมาชิกที่เลือกไม่ได้'}<X data-icon="inline-end" />
          </Button>)}
        </div>
        <Field className="gap-1"><FieldLabel htmlFor="group-peer-search">รายชื่อเพื่อนในห้อง</FieldLabel>
          <Input id="group-peer-search" type="search" placeholder="ค้นหาชื่อหรือเลขที่" value={search} onChange={event => setSearch(event.target.value)} />
        </Field>
        <ul className="flex max-h-64 flex-col overflow-y-auto">
          {matching.map(peer => {
            const checked = peers.includes(peer.id)
            return <li key={peer.id} className="border-b border-border last:border-b-0">
              <label className="flex min-h-9 items-center gap-2 px-2 py-1 text-sm has-enabled:cursor-pointer pointer-coarse:min-h-11">
                <Checkbox checked={checked} disabled={busy || (!checked && (peer.submitted || tally >= work.max_members))} onCheckedChange={() => toggle(peer.id)} />
                {peer.number != null && <span className="text-muted-foreground">{peer.number}</span>}<span>{peer.name}</span>
                {peer.submitted && <Badge variant="statusWarning" className="ml-auto">ส่งกับกลุ่มอื่นแล้ว</Badge>}
              </label>
            </li>
          })}
        </ul>
        {matching.length === 0 && <p className="text-sm text-muted-foreground">ไม่พบรายชื่อที่ตรงกับการค้นหา</p>}
      </Card>}
      <Card padding="md" className="flex min-w-0 flex-col gap-2">
        <h2 className="font-semibold">ผลงาน</h2>
        <Field className="gap-1"><FieldLabel htmlFor="group-work-response">คำตอบที่เขียน</FieldLabel>
          <Textarea id="group-work-response" rows={3} value={response} maxLength={10000} disabled={busy}
            placeholder="เขียนคำตอบหรือแนบไฟล์" onChange={event => { setResponse(event.target.value); setConfirmed(false) }} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={uploadInput} type="file" aria-label="เลือกไฟล์งาน" accept={GROUP_WORK_FILE_ACCEPT} className="hidden" multiple onChange={pickFiles} />
          <Button type="button" variant="outline" className="pointer-coarse:min-h-11" disabled={busy || files.length >= GROUP_WORK_FILE_COUNT} onClick={() => uploadInput.current?.click()}>
            <Paperclip data-icon="inline-start" />แนบไฟล์งาน
          </Button>
          <span className="text-xs text-muted-foreground">PDF รูปภาพ เอกสาร หรือ ZIP · ไม่เกิน 10 MB ต่อไฟล์</span>
        </div>
        {files.length > 0 && <ul className="flex flex-col gap-1" aria-label="ไฟล์ที่แนบ">
          {files.map(item => <li key={item.path} className="flex min-w-0 items-center justify-between gap-2 text-sm">
            <span className="break-all">{item.file.name}</span>
            <Button type="button" size="icon-sm" variant="ghost" className="shrink-0 pointer-coarse:size-11" disabled={busy}
              aria-label={`เอาไฟล์ ${item.file.name} ออก`} onClick={() => { setFiles(current => current.filter(file => file.path !== item.path)); setConfirmed(false) }}><X /></Button>
          </li>)}
        </ul>}
      </Card>
    </div>
    <Card padding="md" className="flex min-w-0 flex-col gap-3">
      <h2 className="font-semibold">ตรวจสอบก่อนส่ง</h2>
      {group && <ul className="flex flex-col gap-1 text-sm" aria-label="นักเรียนที่จะได้รับการส่ง">
        <li>{roster.find(p => p.id === actorId)?.name ?? 'คุณ'} (ผู้ส่ง)</li>
        {peers.map(id => <li key={id}>{otherRoster.find(p => p.id === id)?.name ?? 'สมาชิกที่เลือกไม่ได้'}</li>)}
      </ul>}
      <p className="text-sm text-muted-foreground">{response.trim() ? 'มีคำตอบที่เขียน · ' : ''}แนบ {files.length} ไฟล์</p>
      <Separator />
      <Field orientation="horizontal" className="items-center gap-2">
        <Checkbox id="group-submit-confirm" checked={confirmed} disabled={Boolean(reason) || busy} onCheckedChange={setConfirmed} />
        <FieldLabel htmlFor="group-submit-confirm" className="cursor-pointer pointer-coarse:min-h-11">
          {group ? 'ตรวจผลงานและรายชื่อสมาชิกแล้ว' : 'ตรวจผลงานแล้ว'}
        </FieldLabel>
      </Field>
      {reason && <FieldDescription>{reason}</FieldDescription>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {progress && <p role="status" className="text-sm">{progress}</p>}
      <Button type="submit" disabled={Boolean(reason) || busy || !confirmed} className="pointer-coarse:min-h-11">
        <Send data-icon="inline-start" />{group ? `ส่งงานให้สมาชิก ${tally} คน` : 'ส่งงาน'}
      </Button>
    </Card>
  </form>
}
