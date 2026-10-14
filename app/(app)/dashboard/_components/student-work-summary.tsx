'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowUp, ArrowDown, CheckCircle2, Clock, ListChecks } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { sortStudentWork, type StudentWorkDirection, type StudentWorkOrder } from '@/lib/student-work-sort'
import { ClassroomIcon } from '@/components/classrooms/classroom-icon'
import { coverOf, parseDescription } from '../../classrooms/_components/classroom-meta'
import { formatThaiDate, formatThaiDateTime } from '@/lib/thai-time'
import { cn } from '@/lib/utils'
import type { StudentLearningData, StudentWorkItem } from './student-learning-data'

function dueInfo(endAt: string | null, now: number) {
  if (!endAt) return { label: 'ไม่มีกำหนดส่ง', variant: 'outline' as const }
  const diff = Date.parse(endAt) - now
  if (diff < 0) return { label: 'เลยกำหนดส่งแล้ว', variant: 'statusDestructive' as const }
  if (diff < 86400000) return { label: `เหลือ ${Math.max(1, Math.ceil(diff / 3600000))} ชม.`, variant: 'statusWarning' as const }
  return { label: `ส่ง ${formatThaiDate(endAt, { dateStyle: 'short' })}`, variant: diff <= 3 * 86400000 ? 'statusWarning' as const : 'outline' as const }
}

export function StudentWorkSummary({ data, now = Date.now() }: { data: StudentLearningData; now?: number }) {
  const [order, setOrder] = useState<StudentWorkOrder>('due')
  const [direction, setDirection] = useState<StudentWorkDirection>('asc')
  function chooseOrder(next: StudentWorkOrder) {
    setDirection(next === order ? direction === 'asc' ? 'desc' : 'asc' : next === 'due' ? 'asc' : 'desc')
    setOrder(next)
  }
  const work = sortStudentWork([...data.pendingWork, ...data.completedWork], order, direction)
  const directionLabel = order === 'due' ? direction === 'asc' ? 'ใกล้ส่งก่อน' : 'ไกลส่งก่อน' : direction === 'desc' ? 'ใหม่ก่อน' : 'เก่าก่อน'
  return (
    <section id="work-summary" aria-labelledby="student-work-heading" className="min-w-0 scroll-mt-20">
      <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <h2 id="student-work-heading" className="flex items-center gap-2 text-xl font-bold">
          <ListChecks className="size-5 text-primary" aria-hidden="true" /> สรุปงานของฉัน
        </h2>
        <div className="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="สรุปจำนวนงาน">
          <Badge variant="statusWarning">ต้องทำ <strong>{data.pendingWork.length}</strong></Badge>
          <Badge variant="statusDestructive">ใกล้/เลยกำหนด <strong>{data.urgentCount}</strong></Badge>
          <Badge variant="statusSuccess">ส่งแล้ว <strong>{data.doneCount}</strong></Badge>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1" role="group" aria-label="เรียงงาน กดตัวเลือกเดิมเพื่อสลับทิศทาง">
          {(['due', 'latest'] as const).map(value => (
            <Button key={value} type="button" variant={order === value ? 'secondary' : 'ghost'} size="xs"
              aria-pressed={order === value} title={order === value ? `${directionLabel} · กดเพื่อสลับทิศทาง` : 'กดเพื่อเรียงงาน'}
              onClick={() => chooseOrder(value)}>
              {order === value && (direction === 'asc' ? <ArrowUp className="size-3.5" aria-hidden="true" /> : <ArrowDown className="size-3.5" aria-hidden="true" />)}
              {value === 'due' ? 'ใกล้กำหนดส่ง' : 'มอบหมายล่าสุด'}
              {order === value && <span className="sr-only">: {directionLabel}</span>}
            </Button>
          ))}
        </div>
      </div>
      {work.length ? (
        <div className="max-h-[min(28rem,60dvh)] overflow-y-auto p-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          tabIndex={0} role="region" aria-label="รายการงานของฉัน" data-student-work-scroll>
          <ul className="flex flex-col gap-2">
            {work.map(item => <li key={item.id}><WorkRow work={item} now={now} /></li>)}
          </ul>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4">
          <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">{data.doneCount ? 'ทำงานครบแล้ว ไม่มีงานค้าง' : 'ยังไม่มีงานที่ต้องทำ'}</p>
            <p className="text-xs text-muted-foreground">งานที่ครูมอบหมายจะรวมอยู่ตรงนี้</p>
          </div>
        </div>
      )}

      </Card>
    </section>
  )
}

function WorkRow({ work, now }: { work: StudentWorkItem; now: number }) {
  const meta = parseDescription(work.classroom?.description ?? null)
  const cover = coverOf(meta)
  const due = dueInfo(work.endAt, now)
  const roomNames = [work.classroom?.name, ...work.otherClassroomNames].filter(Boolean).join(' · ')

  return (
    <Link href={work.completed && work.submissionId ? `/submissions/${work.submissionId}` : `/assignments/${work.id}/take`} prefetch={false} aria-label={`${work.completed ? 'ดูงานที่ส่งแล้ว' : work.inProgress ? 'ทำต่อ' : work.hasPreviousAttempt ? 'ลองใหม่' : 'เริ่มทำ'}: ${work.title}`}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
    <Card radius="md" interactive className={cn('relative overflow-hidden', work.completed ? 'border-success/35 bg-success/5 ring-1 ring-success/15 shadow-[0_0_12px_color-mix(in_oklab,var(--success)_14%,transparent)]' : cover?.surface)} data-work-row data-classroom-id={work.classroom?.id} data-work-id={work.id} data-work-completed={work.completed}>
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', work.completed ? 'bg-success' : cover?.solid ?? 'bg-muted-foreground')} />
      <div className="flex items-center gap-3 py-2.5 pl-4 pr-3">
        <div className={cn('hidden size-9 shrink-0 items-center justify-center rounded-lg sm:flex', cover ? `${cover.surface} ${cover.text}` : 'bg-muted text-foreground')}>
          <ClassroomIcon iconKey={meta.iconKey} className="size-5" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold leading-snug line-clamp-2">{work.title}</p>
            {work.completed && <Badge variant="statusSuccess"><CheckCircle2 aria-hidden="true" />ส่งแล้ว</Badge>}
            {work.inProgress && <Badge variant="statusWarning">กำลังทำ</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className={cn('max-w-full truncate font-medium', cover?.textMuted ?? 'text-muted-foreground')} title={roomNames}>
              {roomNames || 'งานที่ได้รับ'}
            </span>
            {!work.completed && <Badge variant={due.variant} title={work.endAt ? formatThaiDateTime(work.endAt) : undefined}>
              <Clock aria-hidden="true" />{due.label}
            </Badge>}
            {work.durationMinutes != null && <span className="text-foreground/75">{work.durationMinutes} นาที</span>}
            {work.previousScore && <span className="text-foreground/75">{work.completed ? 'คะแนน' : 'คะแนนเดิม'} {work.previousScore.total ?? 'รอตรวจ'}/{work.previousScore.max}</span>}
          </div>
        </div>
        {work.completed ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="ส่งงานแล้ว" /> : <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />}
      </div>
    </Card>
    </Link>
  )
}
