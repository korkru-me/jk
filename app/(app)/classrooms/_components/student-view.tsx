import { GraduationCap, School } from 'lucide-react'
import { JoinClassroomForm, type JoinClassroomAction } from '@/components/classrooms/join-classroom-form'
import { Card } from '@/components/ui/card'
import type { Classroom } from '@/lib/types'
import { ClassroomCard } from './classroom-card'

export type StudentClassroom = Pick<Classroom, 'id' | 'name' | 'description' | 'status' | 'classroom_type'>

export function StudentView({
  classrooms,
  pendingCountMap,
  initialJoinCode,
  joinAction,
}: {
  classrooms: StudentClassroom[]
  pendingCountMap: Record<string, number>
  initialJoinCode: string
  joinAction?: JoinClassroomAction
}) {
  const homeroomClassrooms = classrooms.filter(c => c.classroom_type === 'homeroom')
  const subjectClassrooms = classrooms.filter(c => c.classroom_type !== 'homeroom')

  function renderClassroom(classroom: StudentClassroom) {
    return (
      <ClassroomCard
        key={classroom.id}
        classroom={classroom}
        studentSummary={{ pendingCount: pendingCountMap[classroom.id] ?? 0 }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="shrink-0">
          <h1 className="text-xl font-bold">ห้องเรียนของฉัน</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{classrooms.length} ห้องเรียน</p>
        </div>
        <Card padding="sm" className="w-full sm:ml-auto sm:w-80 sm:shrink-0">
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
        <div className="flex flex-col gap-6">
          {homeroomClassrooms.length > 0 && (
            <section className="flex flex-col gap-3" aria-labelledby="student-homerooms-heading">
              <h2 id="student-homerooms-heading" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <GraduationCap className="size-3.5" aria-hidden="true" /> ห้อง Homeroom
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {homeroomClassrooms.map(renderClassroom)}
              </div>
            </section>
          )}

          {subjectClassrooms.length > 0 && (
            <section className="flex flex-col gap-3" aria-labelledby="student-subjects-heading">
              <h2 id="student-subjects-heading" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <School className="size-3.5" aria-hidden="true" /> ห้องเรียนวิชา
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {subjectClassrooms.map(renderClassroom)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
