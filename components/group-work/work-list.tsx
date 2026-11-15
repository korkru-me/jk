'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { ChevronRight, Plus, UsersRound } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createGroupWork } from '@/lib/actions/classroom-group-work'
import { formatGroupWorkTime, groupWorkHref, type GroupWorkList } from '@/lib/classroom-group-work'

export function GroupWorkListScreen({ roomId, data }: { roomId: string; data: GroupWorkList }) {
  const [adding, setAdding] = useState(false)
  return <div className="flex flex-col gap-3">
    {data.role === 'teacher' && <Button type="button" className="w-fit pointer-coarse:min-h-11" variant={adding ? 'outline' : 'default'} aria-expanded={adding} aria-controls="group-new-form" onClick={() => setAdding(value => !value)}>
      <Plus data-icon="inline-start" />{adding ? 'พับฟอร์มมอบหมายงาน' : 'มอบหมายงาน'}
    </Button>}
    {adding && data.role === 'teacher' && <CreateWork id={roomId} />}
    <section className="flex flex-col gap-2" aria-label="งานในห้องเรียน">
      {!data.works.length && <Card padding="sm"><p className="text-sm text-muted-foreground">ยังไม่มีงานในรายการนี้</p></Card>}
      {data.works.map(item => <Card key={item.id} radius="md" interactive>
        <Link href={groupWorkHref(roomId, item.id)} className="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-xl px-3 py-2 outline-offset-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="min-w-0 break-words font-semibold">{item.title}</h2>
              <Badge variant={item.mode === 'group' ? 'workExercise' : 'secondary'}>{item.mode === 'group' ? 'งานกลุ่ม' : 'งานเดี่ยว'}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {item.mode === 'group' && `${item.min_members}–${item.max_members} คน · `}เต็ม {item.max_score} คะแนน
              {item.due_at && ` · กำหนดส่ง ${formatGroupWorkTime(item.due_at)} น.`}
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      </Card>)}
    </section>
  </div>
}

function CreateWork({ id }: { id: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<'' | 'solo' | 'group'>('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!mode || pending) return
    const form = new FormData(event.currentTarget)
    const dueInput = String(form.get('due') ?? '')
    const due = dueInput ? new Date(`${dueInput}+07:00`) : null
    if (due && !Number.isFinite(due.getTime())) { setError('กำหนดส่งไม่ถูกต้อง'); return }
    setPending(true); setError('')
    try {
      const result = await createGroupWork(id, {
        title: String(form.get('title') ?? ''), instructions: String(form.get('instructions') ?? ''),
        mode, min: mode === 'solo' ? 1 : Number(form.get('min')), max: mode === 'solo' ? 1 : Number(form.get('max')),
        score: Number(form.get('score')), dueAt: due?.toISOString() ?? null,
      })
      if ('id' in result) { router.push(groupWorkHref(id, result.id)); router.refresh() }
      else setError(result.error)
    } catch { setError('มอบหมายงานไม่สำเร็จ กรุณาลองอีกครั้ง') }
    finally { setPending(false) }
  }

  return <Card padding="md" className="max-w-4xl">
    <form id="group-new-form" onSubmit={submit} className="flex flex-col gap-3">
      <FieldGroup className="gap-3">
        <Field className="gap-1"><FieldLabel htmlFor="group-title">ชื่องาน</FieldLabel>
          <Input name="title" id="group-title" required maxLength={160} />
        </Field>
        <Field className="gap-1"><FieldLabel htmlFor="group-instructions">คำสั่งงาน</FieldLabel>
          <Textarea name="instructions" id="group-instructions" maxLength={5000} rows={2} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field className="gap-1"><FieldLabel htmlFor="group-max-score">คะแนนเต็ม</FieldLabel>
            <Input name="score" id="group-max-score" defaultValue="20" type="number" min="0.01" max={1000} step="0.01" required />
          </Field>
          <Field className="gap-1"><FieldLabel htmlFor="group-due">กำหนดส่ง (เวลาไทย)</FieldLabel>
            <Input name="due" id="group-due" type="datetime-local" />
          </Field>
        </div>
        <FieldSet className="gap-2">
          <FieldLegend variant="label">รูปแบบการส่ง (จำเป็น)</FieldLegend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 py-2 has-checked:border-primary has-checked:bg-primary/5">
              <input className="accent-primary" type="radio" name="mode" value="solo" required onChange={() => setMode('solo')} />
              <span><span className="block font-medium">งานเดี่ยว</span><span className="text-xs text-muted-foreground">ส่งงานของตนเอง</span></span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 py-2 has-checked:border-primary has-checked:bg-primary/5">
              <input className="accent-primary" type="radio" name="mode" value="group" required onChange={() => setMode('group')} />
              <span><span className="block font-medium">งานกลุ่ม</span><span className="text-xs text-muted-foreground">ตัวแทนส่งครั้งเดียว สมาชิกได้คะแนนเท่ากัน</span></span>
            </label>
          </div>
          {mode === 'group' && <>
            <div className="grid grid-cols-2 gap-3">
              <Field className="gap-1"><FieldLabel htmlFor="group-min-size">สมาชิกอย่างน้อย</FieldLabel>
                <Input name="min" id="group-min-size" type="number" required min={2} max={300} step={1} />
              </Field>
              <Field className="gap-1"><FieldLabel htmlFor="group-max-size">สมาชิกไม่เกิน</FieldLabel>
                <Input name="max" id="group-max-size" type="number" required min={2} max={300} step={1} />
              </Field>
            </div>
            <FieldDescription>นับรวมผู้ส่ง นักเรียนเลือกเพื่อนจากห้องเองตอนส่งงาน</FieldDescription>
          </>}
        </FieldSet>
      </FieldGroup>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Button type="submit" className="w-fit pointer-coarse:min-h-11" disabled={pending}>
        <UsersRound data-icon="inline-start" />{pending ? 'กำลังมอบหมาย…' : 'เผยแพร่ให้ห้องเรียน'}
      </Button>
    </form>
  </Card>
}
