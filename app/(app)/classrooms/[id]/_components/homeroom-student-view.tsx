import Link from 'next/link'
import { ChevronLeft, Users } from 'lucide-react'
import { ClassroomStream } from './classroom-stream'
import { AssignmentCalendar, type CalendarEvent } from '@/app/(app)/dashboard/_components/assignment-calendar'
import type { Classroom, ClassroomPost } from '@/lib/types'
import type { HomeroomClassmate } from '@/lib/student-homeroom-classmates'
import { Card } from '@/components/ui/card'
import { StudentClassroomHeader } from './student-classroom-header'

interface Props {
  classroom: Classroom
  teacherName: string
  studentCount: number
  classmates: HomeroomClassmate[]
  calendarEvents: CalendarEvent[]
  posts: ClassroomPost[]
  backHref?: string
  trackSeen?: boolean
  initialNow?: string
  previewLabel?: string
}

export function HomeroomStudentView({
  classroom, teacherName, studentCount, classmates,
  calendarEvents, posts, backHref = '/dashboard#classrooms', trackSeen = true, initialNow, previewLabel,
}: Props) {
  return (
    <div className="student-learning-stage @container/homeroom flex w-full min-w-0 flex-col gap-3" data-student-homeroom>
      {previewLabel && <p className="text-xs text-muted-foreground">{previewLabel}</p>}
      <Link href={backHref} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden="true" /> ห้องเรียนของฉัน
      </Link>
      <div className="grid items-start gap-4 @min-[46rem]/homeroom:grid-cols-[minmax(0,1fr)_14rem] @min-[64rem]/homeroom:grid-cols-[minmax(0,1fr)_16rem]" data-student-homeroom-grid>
        <div className="flex min-w-0 flex-col gap-4" data-student-homeroom-content>
          <StudentClassroomHeader classroom={classroom} teacherName={teacherName} studentCount={studentCount} />
          <ClassroomStream classroomId={classroom.id} canPost={false} initialPosts={posts} variant="panel"
            maxHeightClass="max-h-[min(28rem,60dvh)]" title="ประกาศจากครูที่ปรึกษา" trackSeen={trackSeen} />
          <section aria-labelledby="homeroom-classmates-heading" className="min-w-0">
            <Card className="@container/classmates overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <h2 id="homeroom-classmates-heading" className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="size-4 text-primary" aria-hidden="true" /> เพื่อนร่วมห้อง
                </h2>
                <span className="text-xs text-muted-foreground">{classmates.length} คน</span>
              </div>
              {classmates.length ? (
                <div className="max-h-[min(22rem,50dvh)] overflow-y-auto px-4 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  tabIndex={0} role="region" aria-label="รายชื่อเพื่อนร่วมห้อง เรียงตามเลขที่" data-classmates-scroll>
                  <ul className="grid gap-x-4 @min-[24rem]/classmates:grid-cols-2 @min-[42rem]/classmates:grid-cols-3">
                    {classmates.map(student => (
                      <li key={student.id} className="flex min-w-0 items-start gap-2.5 border-b border-border/60 py-2.5" data-classmate-number={student.class_number ?? ''}>
                        <span className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-primary/10 py-1 text-primary">
                          <span className="text-[9px] leading-none">เลขที่</span>
                          <span className="text-sm font-bold tabular-nums">{student.class_number ?? '—'}</span>
                        </span>
                        <span className="min-w-0 break-words pt-1 text-sm font-medium">{student.full_name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : <p className="px-4 py-6 text-center text-sm text-muted-foreground">ยังไม่มีเพื่อนคนอื่นในห้องนี้</p>}
            </Card>
          </section>
        </div>
        <aside aria-label="ปฏิทินกำหนดส่งงาน" className="min-w-0 self-start @min-[46rem]/homeroom:sticky @min-[46rem]/homeroom:top-0" data-sticky-homeroom-calendar>
          <AssignmentCalendar events={calendarEvents} initialNow={initialNow} scopeLabel="งานรวมทุกวิชา" />
        </aside>
      </div>
    </div>
  )
}
