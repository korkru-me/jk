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

export type StudentDashboardPost = {
  id: string
  classroom_id: string
  body: string
  created_at: string
  users: { full_name: string } | null
  classrooms: { name: string } | null
}

export function StudentDashboard({ user, data, calendarNow, recentPosts, initialJoinCode = '', joinAction, backHref = '/dashboard#classrooms' }: {
  user: Pick<User, 'id' | 'full_name' | 'role'>
  data: StudentLearningData
  calendarNow?: string
  recentPosts: StudentDashboardPost[]
  initialJoinCode?: string
  joinAction?: JoinClassroomAction
  backHref?: string
}) {
  const hour = thaiHour()
  const greeting = hour < 12 ? 'สวัสดีตอนเช้า' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น'

  return (
    <div className="flex max-w-6xl flex-col gap-3" data-student-dashboard>
      <h1 className="sr-only">พื้นที่เรียนรู้ของฉัน</h1>
      <p className="text-xs text-muted-foreground">{greeting} 👋 {user.full_name}</p>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <section id="classrooms" aria-labelledby="student-classrooms-heading" className="scroll-mt-20">
            <StudentView classrooms={data.classrooms} pendingCountMap={data.pendingCountMap} initialJoinCode={initialJoinCode} joinAction={joinAction} embedded backHref={backHref} />
          </section>
          <StudentWorkSummary data={data} now={calendarNow ? Date.parse(calendarNow) : undefined} />
          {recentPosts.length > 0 && (
            <section aria-labelledby="student-announcements-heading" className="flex flex-col gap-3">
              <h2 id="student-announcements-heading" className="flex items-center gap-2 text-sm font-semibold">
                <Megaphone className="size-4 text-primary" aria-hidden="true" /> ประกาศล่าสุด
              </h2>
              <Card className="divide-y overflow-hidden">
                {recentPosts.map(p => (
                  <Link key={p.id} href={`/classrooms/${p.classroom_id}`} className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/30">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="font-semibold">{p.classrooms?.name}</span>
                      <span className="text-muted-foreground">{p.users?.full_name}</span>
                      <span className="ml-auto text-muted-foreground">{formatThaiDate(p.created_at, { dateStyle: 'short' })}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm line-clamp-2">{p.body}</p>
                  </Link>
                ))}
              </Card>
            </section>
          )}
        </div>
        <aside aria-label="ปฏิทินกำหนดส่งงาน">
          <AssignmentCalendar events={data.calendarEvents} initialNow={calendarNow} />
        </aside>
      </div>
    </div>
  )
}
