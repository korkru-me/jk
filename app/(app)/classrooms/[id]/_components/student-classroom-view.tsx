import { ClassroomTheme } from '@/components/classrooms/classroom-theme'
import { parseDescription } from '../../_components/classroom-meta'
import { ClassroomStream } from './classroom-stream'
import { StudentClassroomTabs } from './student-classroom-tabs'
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
  trackSeen?: boolean
  assignmentHrefs?: Record<string, string>
  initialNow?: string
  practiceLibraries?: ClassroomPracticeLibrariesResult | null
  previewLabel?: string
}

export function StudentClassroomView({ classroom, teacherName, studentCount, assignments, categories, posts, trackSeen = true, assignmentHrefs, initialNow, practiceLibraries, previewLabel }: Props) {
  const calendarEvents = classroomCalendarEvents(assignments, classroom.name).map(event => ({ ...event, href: assignmentHrefs?.[event.id] }))

  return (
    <ClassroomTheme cover={parseDescription(classroom.description).cover} className="student-learning-stage @container/subject flex w-full min-w-0 flex-col gap-3" data-student-subject>
      {previewLabel && <p className="text-xs text-muted-foreground">{previewLabel}</p>}
      <StudentClassroomTabs assignments={assignments} categories={categories} classroomDescription={classroom.description}
        classroomName={classroom.name} assignmentHrefs={assignmentHrefs}
        initialNow={initialNow ?? new Date().toISOString()} liveTime={initialNow === undefined}
        header={<StudentClassroomHeader classroom={classroom} teacherName={teacherName} studentCount={studentCount} />}
        calendar={<AssignmentCalendar events={calendarEvents} initialNow={initialNow} scopeLabel={classroom.name} />}
        practiceLibraries={practiceLibraries ? <ClassroomPracticeLibraries result={practiceLibraries} studentView classroomDescription={classroom.description} /> : null}
        announcements={posts.length > 0 ? (
          <ClassroomStream classroomId={classroom.id} canPost={false} initialPosts={posts}
            variant="panel" maxHeightClass="max-h-[680px]" title="ประกาศจากครู" trackSeen={trackSeen} />
        ) : (
          <Card data-classroom-panel padding="sm" className="flex flex-wrap items-center justify-between gap-2">
            <h2 data-classroom-heading className="text-sm font-semibold">ประกาศจากครู</h2>
            <p className="text-xs text-muted-foreground">ยังไม่มีประกาศ</p>
          </Card>
        )}
      />
    </ClassroomTheme>
  )
}
