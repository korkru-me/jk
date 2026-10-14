import { GraduationCap, School } from 'lucide-react'
import { JoinClassroomForm, type JoinClassroomAction } from '@/components/classrooms/join-classroom-form'
import { Card } from '@/components/ui/card'
import type { Classroom } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ClassroomCard } from './classroom-card'

export type StudentClassroom = Pick<Classroom, 'id' | 'name' | 'description' | 'status' | 'classroom_type'>

export function StudentView({
  classrooms,
  pendingCountMap,
  initialJoinCode,
  joinAction,
  embedded = false,
  backHref,
}: {
  classrooms: StudentClassroom[]
  pendingCountMap: Record<string, number>
  initialJoinCode: string
  joinAction?: JoinClassroomAction
  embedded?: boolean
  backHref?: string
}) {
  const Heading = embedded ? 'h2' : 'h1'
  const GroupHeading = embedded ? 'h3' : 'h2'
  const homeroomClassrooms = classrooms.filter(c => c.classroom_type === 'homeroom')
  const subjectClassrooms = classrooms.filter(c => c.classroom_type !== 'homeroom')

  function renderClassroom(classroom: StudentClassroom) {
    return (
      <ClassroomCard
        key={classroom.id}
        classroom={classroom}
        backHref={backHref}
        studentSummary={{ pendingCount: pendingCountMap[classroom.id] ?? 0 }}
      />
    )
  }

  return (
    <div className="@container flex flex-col gap-4">
      <div className="flex flex-col gap-3 @min-[34rem]:flex-row @min-[34rem]:flex-wrap @min-[34rem]:items-center @min-[34rem]:justify-between">
        <div className="flex shrink-0 flex-wrap items-baseline gap-2">
          <Heading id="student-classrooms-heading" className="text-xl font-bold">ห้องเรียนของฉัน</Heading>
          <p className="text-xs text-muted-foreground">{classrooms.length} ห้องเรียน</p>
        </div>
        <Card padding="sm" className="w-full @min-[34rem]:ml-auto @min-[34rem]:w-[19rem] @min-[34rem]:shrink-0">
          <JoinClassroomForm initialCode={initialJoinCode} compact joinAction={joinAction} />
        </Card>
      </div>

      {classrooms.length === 0 ? (
        <Card edge="dashed" className="py-16 text-center">
          <School className="mx-auto mb-3 size-10 text-primary" aria-hidden="true" />
          <p className="font-medium text-muted-foreground">ยังไม่ได้เข้าร่วมห้องเรียนใด</p>
          <p className="mt-1 text-sm text-muted-foreground">กรอกรหัสห้องเรียนจากครูเพื่อเริ่มต้น</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {homeroomClassrooms.length > 0 && (
            <section className="flex flex-col gap-3" aria-labelledby="student-homerooms-heading">
              <GroupHeading id="student-homerooms-heading" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <GraduationCap className="size-3.5" aria-hidden="true" /> ห้อง Homeroom
              </GroupHeading>
              <div className={cn('grid grid-cols-1 gap-3 @min-[32rem]:grid-cols-2', !embedded && '@min-[52rem]:grid-cols-3')}>
                {homeroomClassrooms.map(renderClassroom)}
              </div>
            </section>
          )}

          {subjectClassrooms.length > 0 && (
            <section className="flex flex-col gap-3" aria-labelledby="student-subjects-heading">
              <GroupHeading id="student-subjects-heading" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <School className="size-3.5" aria-hidden="true" /> ห้องเรียนวิชา
              </GroupHeading>
              <div className={cn('grid grid-cols-1 gap-3 @min-[32rem]:grid-cols-2', !embedded && '@min-[52rem]:grid-cols-3')}>
                {subjectClassrooms.map(renderClassroom)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
