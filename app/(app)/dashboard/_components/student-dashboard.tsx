import Link from 'next/link'
import { Clock, BookOpen, School, ChevronRight, TrendingUp, AlertCircle, Megaphone } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { User, Assignment } from '@/lib/types'
import { assignmentSizeLabel } from '@/lib/assignment-size-label'
import { formatThaiDate, thaiHour } from '@/lib/thai-time'
import { AssignmentCalendar, type CalendarEvent } from './assignment-calendar'

type PendingAssignment = Pick<Assignment, 'id' | 'title' | 'question_ids' | 'random_question_count' | 'completion_rule' | 'streak_target' | 'end_at' | 'duration_minutes'> & {
  classrooms: { name: string } | null
  inProgress: boolean
  submissionId: string | null
}
export type StudentDashboardPost = {
  id: string
  classroom_id: string
  body: string
  created_at: string
  users: { full_name: string } | null
  classrooms: { name: string } | null
}

export function StudentDashboard({
  user,
  classroomsCount,
  pendingAssignments,
  calendarEvents,
  calendarNow,
  recentPosts,
}: {
  user: Pick<User, 'id' | 'full_name' | 'role'>
  classroomsCount: number
  pendingAssignments: PendingAssignment[]
  calendarEvents: CalendarEvent[]
  calendarNow?: string
  recentPosts: StudentDashboardPost[]
}) {
  const hour = thaiHour()
  const greeting = hour < 12 ? 'สวัสดีตอนเช้า' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น'

  return (
    <div className="flex max-w-5xl flex-col gap-4" data-student-dashboard>
      {/* Header greeting */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-muted-foreground text-sm">{greeting} 👋</p>
          <h1 className="text-2xl font-bold mt-0.5">{user.full_name}</h1>
          <p className="text-muted-foreground text-sm mt-1">พร้อมเรียนรู้วันนี้แล้วหรือยัง?</p>
        </div>
        <Link
          href="/my-submissions"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2')}
        >
          <TrendingUp size={14} />
          ดูสรุปงานของฉัน
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="order-2 flex min-w-0 flex-col gap-5 md:order-1">
          {/* Pending assignments */}
          {pendingAssignments.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <BookOpen size={16} className="text-primary" />
                  ชุดข้อสอบที่รอทำ
                  <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {pendingAssignments.length}
                  </span>
                </h2>
                <Link href="/assignments" className="text-sm text-primary hover:underline flex items-center gap-1">
                  ดูทั้งหมด <ChevronRight size={14} />
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {pendingAssignments.map(a => (
                  <AssignmentCard key={a.id} assignment={a} />
                ))}
              </div>
            </div>
          ) : classroomsCount > 0 ? (
            <Card edge="dashed" padding="2xl" className="text-center">
              <p className="text-3xl mb-3">🎉</p>
              <p className="font-semibold">ทำงานครบหมดแล้ว!</p>
              <p className="text-sm text-muted-foreground mt-1">ไม่มีชุดข้อสอบที่ค้างอยู่ในตอนนี้</p>
            </Card>
          ) : (
            <Card edge="dashed" padding="2xl" className="bg-primary/10 text-center">
              <School className="mx-auto mb-3 size-10 text-primary" aria-hidden="true" />
              <h3 className="font-semibold mb-1">เข้าร่วมห้องเรียนแรกของคุณ</h3>
              <p className="text-sm text-muted-foreground mb-4">ขอรหัส Class Code จากครู แล้วกรอกในหน้าห้องเรียน</p>
              <Link href="/classrooms" className={cn(buttonVariants())}>
                ไปที่ห้องเรียน
              </Link>
            </Card>
          )}

          {/* Recent announcements across all classrooms */}
          {recentPosts.length > 0 && (
            <div>
              <h2 className="font-semibold flex items-center gap-2 mb-3">
                <Megaphone size={16} className="text-tint-1" />
                ประกาศล่าสุด
              </h2>
              <Card className="divide-y">
                {recentPosts.map(p => (
                  <Link
                    key={p.id}
                    href={`/classrooms/${p.classroom_id}`}
                    className="flex items-start gap-3 p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="size-8 rounded-lg bg-tint-1/10 flex items-center justify-center shrink-0 text-tint-1">
                      <Megaphone size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-tint-1 truncate">{p.classrooms?.name}</span>
                        <span className="text-xs text-muted-foreground">· {p.users?.full_name}</span>
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">{timeAgo(p.created_at)}</span>
                      </div>
                      <p className="text-sm mt-1 line-clamp-2 whitespace-pre-wrap">{p.body}</p>
                    </div>
                  </Link>
                ))}
              </Card>
            </div>
          )}
        </div>
        <aside className="order-1 md:order-2">
          <AssignmentCalendar events={calendarEvents} initialNow={calendarNow} />
        </aside>
      </div>
    </div>
  )
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'เมื่อสักครู่'
  if (mins < 60) return `${mins} นาทีที่แล้ว`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ชม.ที่แล้ว`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} วันที่แล้ว`
  return formatThaiDate(iso, { dateStyle: 'short' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function getDueInfo(endAt: string | null): { label: string; urgent: boolean; color: string } {
  if (!endAt) return { label: 'ไม่มีกำหนด', urgent: false, color: 'text-muted-foreground' }
  const diff = new Date(endAt).getTime() - Date.now()
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (diff < 0) return { label: 'เลยกำหนด', urgent: true, color: 'text-destructive' }
  if (hours < 24) return { label: `อีก ${hours} ชม.`, urgent: true, color: 'text-foreground' }
  if (days <= 2) return { label: `อีก ${days} วัน`, urgent: true, color: 'text-foreground' }
  return {
    label: formatThaiDate(endAt, { dateStyle: 'short' }),
    urgent: false,
    color: 'text-muted-foreground',
  }
}

function AssignmentCard({ assignment: a }: { assignment: PendingAssignment }) {
  const due = getDueInfo(a.end_at)

  return (
    <Card padding="md" className={cn('flex flex-col gap-3 transition-shadow hover:shadow-md', due.urgent && 'border-flag/40')}>
      <div className="flex items-start gap-2">
        {due.urgent && (
          <AlertCircle size={15} className="text-flag shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm line-clamp-2 leading-snug">{a.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {a.classrooms?.name}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <BookOpen size={11} />
          {assignmentSizeLabel({
            question_ids: (a.question_ids as string[] | null) ?? [],
            random_question_count: a.random_question_count,
            completion_rule: a.completion_rule,
            streak_target: a.streak_target,
          })}
        </span>
        {a.duration_minutes && (
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {a.duration_minutes} นาที
          </span>
        )}
        <span className={`flex items-center gap-1 ml-auto font-medium ${due.color}`}>
          <Clock size={11} />
          {due.label}
        </span>
      </div>

      <Link
        href={`/assignments/${a.id}/take`}
        className={cn(
          buttonVariants({ size: 'sm', variant: a.inProgress ? 'outline' : 'default' }),
          'w-full justify-center gap-1 text-xs',
          a.inProgress
            ? 'border-warning/40'
            : ''
        )}
      >
        {a.inProgress ? '▶ ทำต่อ' : '▶ เริ่มทำข้อสอบ'}
      </Link>
    </Card>
  )
}
