import Link from 'next/link'
import { ChevronLeft, GraduationCap, Users, Home, Megaphone } from 'lucide-react'
import { ClassroomStream } from './classroom-stream'
import { AssignmentCalendar, type CalendarEvent } from '@/app/(app)/dashboard/_components/assignment-calendar'
import type { Classroom, ClassroomPost } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { displayDescription } from '@/app/(app)/classrooms/_components/classroom-meta'

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
}

export function HomeroomStudentView({
  classroom, teacherName, studentCount, classmates,
  calendarEvents, complianceRate, complianceSubmitted, complianceTotal, posts,
}: Props) {
  return (
    <div className="space-y-6 max-w-5xl">
      <Link
        href="/classrooms"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> ห้องเรียนทั้งหมด
      </Link>

      {/* Header card — deliberately themed like the teacher-side homeroom
          header so students recognize this as their advisory class, not a
          subject classroom. */}
      <div className="bg-gradient-to-br from-slate-800 via-slate-800 to-indigo-900 rounded-2xl p-6 text-white">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary mb-1.5">
          <Home className="w-3 h-3" /> ครูที่ปรึกษาประจำชั้น
        </p>
        <h1 className="text-2xl font-bold leading-tight">{classroom.name}</h1>
        {displayDescription(classroom.description) && (
          <p className="text-white/50 text-sm mt-1">{displayDescription(classroom.description)}</p>
        )}
        <div className="flex items-center gap-5 mt-4 flex-wrap text-sm">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-white/50" />
            <span className="text-white/50">ครูที่ปรึกษา:</span>
            <span className="font-medium">{teacherName}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-white/50" />
            <span className="font-semibold">{studentCount}</span>
            <span className="text-white/50">คนในห้องนี้</span>
          </div>
        </div>
      </div>

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
      <div>
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-muted-foreground" /> ประกาศจากครูที่ปรึกษา
        </h2>
        <ClassroomStream classroomId={classroom.id} canPost={false} initialPosts={posts} />
      </div>
    </div>
  )
}
