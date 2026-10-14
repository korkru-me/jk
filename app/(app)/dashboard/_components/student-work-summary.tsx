import Link from 'next/link'
import { CheckCircle2, ChevronRight, Clock, History, ListChecks, ListTodo } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
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
  return (
    <section id="work-summary" aria-labelledby="student-work-heading" className="flex min-w-0 scroll-mt-20 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="student-work-heading" className="flex items-center gap-2 text-xl font-bold">
          <ListChecks className="size-5 text-primary" aria-hidden="true" /> สรุปงานของฉัน
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs" role="group" aria-label="สรุปจำนวนงาน">
          <Badge variant="statusWarning">ต้องทำ <strong>{data.pendingWork.length}</strong></Badge>
          <Badge variant="statusDestructive">ใกล้/เลยกำหนด <strong>{data.urgentCount}</strong></Badge>
          <Badge variant="statusSuccess">ส่งแล้ว <strong>{data.doneCount}</strong></Badge>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <ListTodo className="size-4 text-primary" aria-hidden="true" /> งานที่ต้องทำ
        </h3>
        <p className="text-xs text-muted-foreground">{data.pendingWork.length} รายการ · เรียงตามกำหนดส่ง</p>
      </div>
      {data.pendingWork.length ? (
        <ul className="flex flex-col gap-2">
          {data.pendingWork.map(work => <li key={work.id}><WorkRow work={work} now={now} /></li>)}
        </ul>
      ) : (
        <Card padding="md" className="flex items-center gap-3">
          <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">{data.history.length ? 'ทำงานครบแล้ว ไม่มีงานค้าง' : 'ยังไม่มีงานที่ต้องทำ'}</p>
            <p className="text-xs text-muted-foreground">งานที่ครูมอบหมายจะรวมอยู่ตรงนี้</p>
          </div>
        </Card>
      )}

      {data.history.length > 0 && (
        <Card className="overflow-hidden">
          <details>
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <span className="ml-1 inline-flex items-center gap-2">
                <History className="size-4 text-primary" aria-hidden="true" /> ประวัติการสอบทั้งหมด
                <span className="text-xs font-normal text-muted-foreground">{data.history.length} รายการ</span>
              </span>
            </summary>
            <ul className="divide-y border-t">
              {data.history.map(entry => (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium line-clamp-2">{entry.title}</p>
                    <p className="text-xs text-muted-foreground">{entry.classroomName} · {formatThaiDate(entry.createdAt, { dateStyle: 'short' })}</p>
                  </div>
                  <div className="flex max-w-[50%] shrink-0 flex-col items-end gap-1 text-right">
                    <p className="text-xs font-semibold">{entry.score ? entry.score.total === null ? 'รอครูตรวจ' : `${entry.score.total}/${entry.score.max}` : 'ครูกำหนดไม่แสดงคะแนน'}</p>
                    <Link href={`/submissions/${entry.id}`} className="flex items-center gap-0.5 text-xs text-primary hover:underline">
                      {entry.reviewLabel}<ChevronRight className="size-3" aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </Card>
      )}
    </section>
  )
}

function WorkRow({ work, now }: { work: StudentWorkItem; now: number }) {
  const meta = parseDescription(work.classroom?.description ?? null)
  const cover = coverOf(meta)
  const due = dueInfo(work.endAt, now)
  const roomNames = [work.classroom?.name, ...work.otherClassroomNames].filter(Boolean).join(' · ')

  return (
    <Card radius="md" className={cn('relative overflow-hidden', cover?.surface)} data-work-row data-classroom-id={work.classroom?.id}>
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', cover?.solid ?? 'bg-muted-foreground')} />
      <div className="flex items-center gap-3 py-2.5 pl-4 pr-3">
        <div className={cn('hidden size-9 shrink-0 items-center justify-center rounded-lg sm:flex', cover ? `${cover.surface} ${cover.text}` : 'bg-muted text-foreground')}>
          <ClassroomIcon iconKey={meta.iconKey} className="size-5" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold leading-snug line-clamp-2">{work.title}</p>
            {work.inProgress && <Badge variant="statusWarning">กำลังทำ</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className={cn('max-w-full truncate font-medium', cover?.textMuted ?? 'text-muted-foreground')} title={roomNames}>
              {roomNames || 'งานที่ได้รับ'}
            </span>
            <Badge variant={due.variant} title={work.endAt ? formatThaiDateTime(work.endAt) : undefined}>
              <Clock aria-hidden="true" />{due.label}
            </Badge>
            {work.durationMinutes != null && <span className="text-foreground/75">{work.durationMinutes} นาที</span>}
            {work.previousScore && <span className="text-foreground/75">คะแนนเดิม {work.previousScore.total ?? 'รอตรวจ'}/{work.previousScore.max}</span>}
          </div>
        </div>
        <Link href={`/assignments/${work.id}/take`} className={cn(buttonVariants({ size: 'sm', variant: work.inProgress || work.hasPreviousAttempt ? 'outline' : 'default' }), 'shrink-0')}>
          {work.inProgress ? 'ทำต่อ' : work.hasPreviousAttempt ? 'ลองใหม่' : 'เริ่มทำ'}
        </Link>
      </div>
    </Card>
  )
}
