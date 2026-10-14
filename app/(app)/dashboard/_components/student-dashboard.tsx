import Link from 'next/link'
import { Megaphone } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { User } from '@/lib/types'
import { formatThaiDate, thaiHour } from '@/lib/thai-time'
import { StudentView } from '../../classrooms/_components/student-view'
import type { JoinClassroomAction } from '@/components/classrooms/join-classroom-form'
import { AssignmentCalendar } from './assignment-calendar'
import { StudentWorkSummary } from './student-work-summary'
import type { StudentLearningData } from './student-learning-data'
import { coverOf, parseDescription } from '../../classrooms/_components/classroom-meta'
import { ClassroomIcon } from '@/components/classrooms/classroom-icon'
import { cn } from '@/lib/utils'

export type StudentDashboardPost = {
  id: string
  classroom_id: string
  body: string
  created_at: string
  users: { full_name: string } | null
  classrooms: { name: string } | null
}

export function StudentDashboard({ user, data, calendarNow, recentPosts, initialJoinCode = '', joinAction, backHref = '/dashboard#classrooms', previewLabel }: {
  user: Pick<User, 'id' | 'full_name' | 'role'>
  data: StudentLearningData
  calendarNow?: string
  recentPosts: StudentDashboardPost[]
  initialJoinCode?: string
  joinAction?: JoinClassroomAction
  backHref?: string
  previewLabel?: string
}) {
  const hour = thaiHour()
  const greeting = hour < 12 ? 'สวัสดีตอนเช้า' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น'

  return (
    <div className="student-learning-stage @container/learning flex w-full min-w-0 flex-col gap-3 [--student-content-width:calc(100%-15rem)]" data-student-dashboard>
      <h1 className="sr-only">พื้นที่เรียนรู้ของฉัน</h1>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-base font-medium"><span>{greeting} 👋</span><span className="text-lg font-bold text-primary">{user.full_name}</span></p>
      {previewLabel && <p className="text-xs text-muted-foreground">{previewLabel}</p>}
      <div className="grid items-start gap-4 @min-[46rem]/learning:grid-cols-[minmax(0,var(--student-content-width))_minmax(0,1fr)]" data-student-learning-grid>
        <div className="flex min-w-0 flex-col gap-6">
          <section id="classrooms" aria-labelledby="student-classrooms-heading" className="scroll-mt-20">
            <StudentView classrooms={data.classrooms} pendingCountMap={data.pendingCountMap} initialJoinCode={initialJoinCode} joinAction={joinAction} embedded backHref={backHref} />
          </section>
          <StudentWorkSummary data={data} now={calendarNow ? Date.parse(calendarNow) : Date.now()} />
          {recentPosts.length > 0 && (
            <section aria-labelledby="student-announcements-heading" className="min-w-0">
              <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <h2 id="student-announcements-heading" className="flex items-center gap-2 text-xl font-bold">
                <Megaphone className="size-5 text-primary" aria-hidden="true" /> ประกาศล่าสุด
              </h2>
              <span className="text-xs text-muted-foreground">{recentPosts.length} ประกาศ</span>
              </div>
              <div className="max-h-[min(24rem,60dvh)] overflow-y-auto p-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" tabIndex={0} role="region" aria-label="รายการประกาศล่าสุด" data-student-announcements-scroll>
              <div className="flex flex-col gap-2">
                {recentPosts.map(p => {
                  const room = data.classrooms.find(c => c.id === p.classroom_id)
                  const meta = parseDescription(room?.description ?? null)
                  const cover = coverOf(meta)
                  return <Link key={p.id} href={`/classrooms/${p.classroom_id}`} className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <Card radius="md" interactive className={cn('relative flex gap-3 overflow-hidden py-3 pl-4 pr-3', cover?.surface)}>
                    <span className={cn('absolute inset-y-3 left-0 w-[3px] rounded-r-full', cover?.solid ?? 'bg-primary')} aria-hidden="true" />
                    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', cover?.text ?? 'text-primary')}><ClassroomIcon iconKey={meta.iconKey} className="size-5" /></span>
                    <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className={cn('font-bold', cover?.text)}>{room?.name ?? p.classrooms?.name}</span>
                      <span className="text-foreground/75">{p.users?.full_name}</span>
                      <span className="ml-auto text-foreground/75">{formatThaiDate(p.created_at, { dateStyle: 'short' })}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm line-clamp-2">{p.body}</p>
                    </div>
                    </Card>
                  </Link>
                })}
              </div>
              </div>
              </Card>
            </section>
          )}
        </div>
        <aside aria-label="ปฏิทินกำหนดส่งงาน" className="min-w-0 self-start @min-[46rem]/learning:sticky @min-[46rem]/learning:top-0" data-sticky-student-calendar>
          <AssignmentCalendar events={data.calendarEvents} initialNow={calendarNow} />
        </aside>
      </div>
    </div>
  )
}
