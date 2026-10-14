import Link from 'next/link'
import { ChevronLeft, Users } from 'lucide-react'
import { ClassroomStream } from './classroom-stream'
import { AssignmentCalendar, type CalendarEvent } from '@/app/(app)/dashboard/_components/assignment-calendar'
import type { Classroom, ClassroomPost } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { StudentClassroomHeader } from './student-classroom-header'

interface Classmate { id: string; full_name: string }

interface Props {
  classroom: Classroom
  teacherName: string
  studentCount: number
  classmates: Classmate[]
  calendarEvents: CalendarEvent[]
  complianceRate: number | null
  complianceSubmitted: number
  complianceTotal: number
  posts: ClassroomPost[]
  backHref?: string
  trackSeen?: boolean
}

export function HomeroomStudentView({
  classroom, teacherName, studentCount, classmates,
  calendarEvents, complianceRate, complianceSubmitted, complianceTotal, posts, backHref = '/dashboard#classrooms', trackSeen = true,
}: Props) {
  return (
    <div className="flex min-w-0 max-w-5xl flex-col gap-4">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> ห้องเรียนของฉัน
      </Link>

      <StudentClassroomHeader classroom={classroom} teacherName={teacherName} studentCount={studentCount} />

      {/* Personal compliance — visible only to this student, never to classmates */}
      <Card padding="lg">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">ภาพรวมของฉัน</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {complianceTotal > 0
                ? `ส่งงานตรงเวลาแล้ว ${complianceSubmitted}/${complianceTotal} รายการ (นับทุกวิชา) · เห็นเฉพาะคุณ`
                : 'ยังไม่มีงานที่ครบกำหนดส่ง'}
            </p>
          </div>
          {complianceRate !== null && (
            <p className={`text-2xl font-bold shrink-0 ${
              complianceRate >= 80 ? 'text-success'
                : complianceRate >= 50 ? 'text-warning'
                : 'text-destructive'
            }`}>
              {complianceRate}%
            </p>
          )}
        </div>
      </Card>

      {/* Calendar — due dates aggregated from every subject classroom this
          student belongs to, since the homeroom itself has no assignments. */}
      <AssignmentCalendar events={calendarEvents} />

      {/* Classmates — names only, no scores or submission status */}
      <div>
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" /> เพื่อนร่วมห้อง
        </h2>
        {classmates.length === 0 ? (
          <Card edge="dashed" padding="xl" className="text-center text-sm text-muted-foreground">
            ยังไม่มีเพื่อนคนอื่นในห้องนี้
          </Card>
        ) : (
          <Card padding="md" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {classmates.map(s => (
              <div key={s.id} className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                  {s.full_name.charAt(0)}
                </div>
                <span className="text-sm truncate">{s.full_name}</span>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Stream — the advisor's channel: attendance, forms, school-wide notices */}
      <ClassroomStream
        classroomId={classroom.id}
        canPost={false}
        initialPosts={posts}
        variant="panel"
        maxHeightClass="max-h-[680px]"
        title="ประกาศจากครูที่ปรึกษา"
        trackSeen={trackSeen}
      />
    </div>
  )
}
