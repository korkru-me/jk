import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ClassroomStream } from './classroom-stream'
import { AssignmentList } from './assignment-list'
import type { StudentAssignmentRow } from './assignment-status'
import type { Classroom, ClassroomPost } from '@/lib/types'
import type { AssignmentCategory } from '@/lib/assignment-categories'
import { Card } from '@/components/ui/card'
import { StudentClassroomHeader } from './student-classroom-header'
import { ClassroomPracticeLibraries } from '@/components/practice/classroom-practice-libraries'
import type { ClassroomPracticeLibrariesResult } from '@/lib/classroom-practice-libraries'
import { AssignmentCalendar } from '@/app/(app)/dashboard/_components/assignment-calendar'
import { classroomCalendarEvents } from '@/lib/student-classroom-work'

export type { StudentAssignmentRow }

interface Props {
  classroom: Classroom
  teacherName: string
  studentCount: number
  assignments: StudentAssignmentRow[]
  categories: AssignmentCategory[]
  posts: ClassroomPost[]
  backHref?: string
  trackSeen?: boolean
  assignmentHrefs?: Record<string, string>
  initialNow?: string
  practiceLibraries?: ClassroomPracticeLibrariesResult | null
  previewLabel?: string
}

export function StudentClassroomView({ classroom, teacherName, studentCount, assignments, categories, posts, backHref = '/dashboard#classrooms', trackSeen = true, assignmentHrefs, initialNow, practiceLibraries, previewLabel }: Props) {
  const calendarEvents = classroomCalendarEvents(assignments, classroom.name).map(event => ({ ...event, href: assignmentHrefs?.[event.id] }))

  return (
    <div className="student-learning-stage @container/subject flex w-full min-w-0 flex-col gap-3" data-student-subject>
      {previewLabel && <p className="text-xs text-muted-foreground">{previewLabel}</p>}
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="size-4" /> ห้องเรียนของฉัน
      </Link>

      <div className="grid items-start gap-4 @min-[46rem]/subject:grid-cols-[minmax(0,1fr)_14rem] @min-[64rem]/subject:grid-cols-[minmax(0,1fr)_16rem]" data-student-subject-grid>
      <div className="flex min-w-0 flex-col gap-4" data-student-subject-content>
      <StudentClassroomHeader classroom={classroom} teacherName={teacherName} studentCount={studentCount} />

      {/* Stream — bounded like the teacher's board, so a term of announcements
          never pushes the งาน a student came here to do off the screen. */}
      {posts.length > 0 ? <ClassroomStream
        classroomId={classroom.id}
        canPost={false}
        initialPosts={posts}
        variant="panel"
        maxHeightClass="max-h-[680px]"
        title="ประกาศจากครู"
        trackSeen={trackSeen}
      /> : <Card padding="sm" className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">ประกาศจากครู</h2>
        <p className="text-xs text-muted-foreground">ยังไม่มีประกาศ</p>
      </Card>}

      {practiceLibraries && <ClassroomPracticeLibraries result={practiceLibraries} studentView />}

      {/* Assignments */}
      <section aria-labelledby="classroom-work-heading" className="flex min-w-0 flex-col gap-2.5">
        <h2 id="classroom-work-heading" className="font-semibold">งานที่มอบหมายในห้องนี้</h2>
        {assignments.length === 0 ? (
          <Card edge="dashed" padding="md" className="text-center">
            <p className="text-3xl mb-3">📝</p>
            <p className="font-semibold">ยังไม่มีงานที่มอบหมาย</p>
            <p className="text-sm text-muted-foreground mt-1">ครูจะมอบหมายแบบฝึกหัดหรือข้อสอบให้ที่นี่</p>
          </Card>
        ) : (
          <AssignmentList assignments={assignments} categories={categories} classroomDescription={classroom.description} assignmentHrefs={assignmentHrefs} initialNow={initialNow} />
        )}
      </section>
      </div>
      <aside aria-label={`ปฏิทินงาน ${classroom.name}`} className="min-w-0 self-start @min-[46rem]/subject:sticky @min-[46rem]/subject:top-0" data-sticky-subject-calendar>
        <AssignmentCalendar events={calendarEvents} initialNow={initialNow} scopeLabel={classroom.name} />
      </aside>
      </div>
    </div>
  )
}
