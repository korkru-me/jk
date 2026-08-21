import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/auth/server'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { User } from '@/lib/types'
import {
  TeacherDashboard, type DashboardClassroom,
} from './_components/teacher-dashboard'
import { AssignmentCalendar, type CalendarEvent } from './_components/assignment-calendar'
import { computePassed } from '@/lib/grading'
import { rescaleToDisplayMax } from '@/lib/scoring'
import { Clock, BookOpen, ChevronRight, TrendingUp, AlertCircle, Megaphone } from 'lucide-react'
import { Card } from '@/components/ui/card'

export const metadata = { title: 'หน้าหลัก — KorKru' }

/** How many rows each "recent" list on the teacher home shows. */
const RECENT_LIMIT = 5

export default async function DashboardPage() {
  const supabase = await createClient()
  const authUser = await getAuthUser()
  if (!authUser) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('id, full_name, role')
    .eq('id', authUser.id)
    .single()

  if (!profile) redirect('/login')

  const user = profile as Pick<User, 'id' | 'full_name' | 'role'>

  if (user.role === 'teacher' || user.role === 'admin') {
    // Everything shown to a teacher is their own real data. Counts come back
    // with the first page of rows (`count: 'exact'` alongside `limit`), so the
    // totals and the previews cost one query each rather than two.
    const [classroomsRes, questionsRes, setsRes] = await Promise.all([
      // Roster and assignment tallies ride along on the classroom relation,
      // the same way the classroom list page reads them.
      admin
        .from('classrooms')
        .select('id, name, classroom_type, created_at, classroom_students(count), assignment_classrooms(count)')
        .eq('teacher_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      supabase
        .from('questions')
        .select('id, title, question_type', { count: 'exact' })
        .eq('created_by', user.id)
        // Grouped questions are stored one row per member; only the first row
        // represents the question in a list.
        .or('group_id.is.null,order_in_group.eq.0')
        .order('created_at', { ascending: false })
        .limit(RECENT_LIMIT),
      supabase
        .from('question_sets')
        .select('id, title, question_ids', { count: 'exact' })
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(RECENT_LIMIT),
    ])

    // A set's question_ids keep pointing at deleted questions, so the stored
    // length overstates the set. Resolve which ids still exist and count only
    // those — the same rule the set library itself displays.
    const setRows = (setsRes.data ?? []) as any[]
    const referencedIds = Array.from(new Set(setRows.flatMap(set => set.question_ids ?? [])))
    const { data: liveQuestions } = referencedIds.length > 0
      ? await supabase.from('questions').select('id').in('id', referencedIds)
      : { data: [] as { id: string }[] }
    const liveQuestionIds = new Set((liveQuestions ?? []).map(q => q.id))

    const classroomRows = (classroomsRes.data ?? []) as any[]
    const classrooms: DashboardClassroom[] = classroomRows.map(row => ({
      id: row.id,
      name: row.name,
      classroom_type: row.classroom_type,
      studentCount: row.classroom_students?.[0]?.count ?? 0,
      assignmentCount: row.assignment_classrooms?.[0]?.count ?? 0,
    }))

    return (
      <TeacherDashboard
        user={user}
        classroomsCount={classrooms.length}
        questionsCount={questionsRes.count ?? 0}
        setsCount={setsRes.count ?? 0}
        studentsCount={classrooms.reduce((sum, c) => sum + c.studentCount, 0)}
        classrooms={classrooms.slice(0, RECENT_LIMIT)}
        questionSets={setRows.map(set => ({
          id: set.id,
          title: set.title,
          questionCount: ((set.question_ids ?? []) as string[])
            .filter(id => liveQuestionIds.has(id)).length,
        }))}
        questions={((questionsRes.data ?? []) as any[]).map(question => ({
          id: question.id,
          title: question.title,
          question_type: question.question_type,
        }))}
      />
    )
  }

  // ─── Student path ─────────────────────────────────────────────────────────────
  const [membershipsRes, submissionsRes] = await Promise.all([
    supabase
      .from('classroom_students')
      .select('classroom_id')
      .eq('student_id', user.id),
    supabase
      .from('submissions')
      .select('id, total_score, max_score, status, assignment_id, created_at, assignments(display_max_score, show_results)')
      .eq('student_id', user.id),
  ])

  const classroomIds = (membershipsRes.data ?? []).map((m: any) => m.classroom_id)
  const rawSubmissions = submissionsRes.data ?? []

  // Fetch score-display settings through the submission relation so every
  // attempt can be rescaled without a second assignment lookup.
  const displayMaxByAssignment = new Map(rawSubmissions.map((s: any) => [
    s.assignment_id as string,
    (s.assignments?.display_max_score ?? null) as number | null,
  ]))
  const showResultsByAssignment = new Map(rawSubmissions.map((s: any) => [
    s.assignment_id as string,
    s.assignments?.show_results as string | undefined,
  ]))
  const allSubmissions = rescaleToDisplayMax(
    rawSubmissions as any[],
    row => displayMaxByAssignment.get(row.assignment_id) ?? null
  )
  const completed = allSubmissions.filter(
    (s: any) => s.status === 'submitted' || s.status === 'graded'
  )
  const completedWithVisibleResults = completed.filter(
    (s: any) => showResultsByAssignment.get(s.assignment_id) !== 'never'
  )
  const avgPct = completedWithVisibleResults.length > 0
    ? Math.round(
        completedWithVisibleResults.reduce((sum: number, s: any) =>
          sum + (s.max_score > 0 ? (s.total_score ?? 0) / s.max_score : 0), 0
        ) / completedWithVisibleResults.length * 100
      )
    : null

  // Once memberships are known, assignments and announcements are
  // independent and can be loaded in the same database round-trip window.
  // The inner join replaces the old links -> assignment-id -> assignments
  // waterfall while still using assignment_classrooms as the source of truth.
  const [assignmentsRes, recentPostsRes] = classroomIds.length > 0
    ? await Promise.all([
        supabase
          .from('assignments')
          .select('id, title, question_ids, classrooms(name), end_at, duration_minutes, type, passing_type, passing_value, assignment_classrooms!inner(classroom_id)')
          .in('assignment_classrooms.classroom_id', classroomIds)
          .eq('status', 'published')
          .order('end_at', { ascending: true, nullsFirst: false }),
        supabase
          .from('classroom_posts')
          .select('id, classroom_id, body, created_at, users(full_name), classrooms(name)')
          .in('classroom_id', classroomIds)
          .order('created_at', { ascending: false })
          .limit(5),
      ])
    : [{ data: [] }, { data: [] }]

  const allAssignments = assignmentsRes.data ?? []
  const recentPosts = recentPostsRes.data ?? []

  let pendingAssignments: any[] = []
  let calendarEvents: CalendarEvent[] = []

  if (classroomIds.length > 0) {
    const inProgressMap = new Map(
      allSubmissions
        .filter((s: any) => s.status === 'in_progress')
        .map((s: any) => [s.assignment_id, s])
    )
    // Best (highest-scoring) submitted/graded attempt per assignment — an
    // exercise may have several retry attempts behind it.
    const bestByAssignment = new Map<string, any>()
    for (const s of completed) {
      const prev = bestByAssignment.get(s.assignment_id)
      if (!prev || (s.total_score ?? -1) > (prev.total_score ?? -1)) {
        bestByAssignment.set(s.assignment_id, s)
      }
    }

    // An exercise submission that hasn't cleared its passing threshold isn't
    // "done" yet — the student is expected to retry. Exams count once submitted.
    function isDone(a: any): boolean {
      const best = bestByAssignment.get(a.id)
      if (!best) return false
      if (a.type === 'exercise') {
        if (computePassed(best.total_score, best.max_score, a.passing_type, a.passing_value) === false) return false
      }
      return true
    }

    pendingAssignments = (allAssignments ?? [])
      .filter((a: any) => !isDone(a))
      .slice(0, 6)
      .map((a: any) => ({
        id: a.id,
        title: a.title,
        question_ids: a.question_ids,
        classrooms: a.classrooms,
        end_at: a.end_at,
        duration_minutes: a.duration_minutes,
        inProgress: inProgressMap.has(a.id),
        submissionId: inProgressMap.get(a.id)?.id ?? null,
      }))

    calendarEvents = (allAssignments ?? [])
      .filter((a: any) => a.end_at)
      .map((a: any) => ({
        id: a.id,
        title: a.title,
        classroomName: (a.classrooms as any)?.name ?? '',
        endAt: a.end_at as string,
        done: isDone(a),
        submissionId: bestByAssignment.get(a.id)?.id ?? null,
      }))
  }

  return (
    <StudentDashboard
      user={user}
      classroomsCount={classroomIds.length}
      avgPct={avgPct}
      completedCount={completed.length}
      pendingAssignments={pendingAssignments}
      calendarEvents={calendarEvents}
      recentPosts={recentPosts}
    />
  )
}

// ─── Student Dashboard ────────────────────────────────────────────────────────

function StudentDashboard({
  user,
  classroomsCount,
  avgPct,
  completedCount,
  pendingAssignments,
  calendarEvents,
  recentPosts,
}: {
  user: Pick<User, 'id' | 'full_name' | 'role'>
  classroomsCount: number
  avgPct: number | null
  completedCount: number
  pendingAssignments: any[]
  calendarEvents: CalendarEvent[]
  recentPosts: any[]
}) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'สวัสดีตอนเช้า' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น'

  return (
    <div className="space-y-6 max-w-5xl">
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

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          value={String(classroomsCount)}
          label="ห้องเรียน"
          icon={<span className="text-2xl">🏫</span>}
          href="/classrooms"
          accent="blue"
        />
        <StatCard
          value={String(completedCount)}
          label="ส่งงานแล้ว"
          icon={<span className="text-2xl">✅</span>}
          href="/my-submissions"
          accent="green"
        />
        <StatCard
          value={avgPct !== null ? `${avgPct}%` : '—'}
          label="คะแนนเฉลี่ย"
          icon={<span className="text-2xl">⭐</span>}
          accent={avgPct !== null && avgPct >= 75 ? 'green' : avgPct !== null && avgPct >= 50 ? 'amber' : 'red'}
        />
      </div>

      {/* Due-date calendar */}
      <AssignmentCalendar events={calendarEvents} />

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pendingAssignments.map((a: any) => (
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
        <div className="bg-card border-2 border-dashed border-primary/20 bg-primary/10 rounded-2xl p-10 text-center">
          <p className="text-4xl mb-3">🏫</p>
          <h3 className="font-semibold mb-1">เข้าร่วมห้องเรียนแรกของคุณ</h3>
          <p className="text-sm text-muted-foreground mb-4">ขอรหัส Class Code จากครู แล้วกรอกในหน้าห้องเรียน</p>
          <Link href="/classrooms" className={cn(buttonVariants())}>
            ไปที่ห้องเรียน
          </Link>
        </div>
      )}

      {/* Recent announcements across all classrooms */}
      {recentPosts.length > 0 && (
        <div>
          <h2 className="font-semibold flex items-center gap-2 mb-3">
            <Megaphone size={16} className="text-tint-1 dark:text-tint-1" />
            ประกาศล่าสุด
          </h2>
          <Card className="divide-y">
            {recentPosts.map((p: any) => (
              <Link
                key={p.id}
                href={`/classrooms/${p.classroom_id}`}
                className="flex items-start gap-3 p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-tint-1/10 flex items-center justify-center shrink-0 text-tint-1 dark:text-tint-1">
                  <Megaphone size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-tint-1 dark:text-tint-1 truncate">{p.classrooms?.name}</span>
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
  return new Date(iso).toLocaleDateString('th-TH', { dateStyle: 'short' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  value, label, icon, href, accent = 'blue',
}: {
  value: string
  label: string
  icon: React.ReactNode
  href?: string
  accent?: 'blue' | 'green' | 'amber' | 'red'
}) {
  const accentClass = {
    blue: 'text-primary',
    green: 'text-success',
    amber: 'text-warning',
    red: 'text-destructive',
  }[accent]

  const inner = (
    <Card padding="md" className="flex flex-col gap-2 hover:shadow-md transition-shadow h-full">
      <div className="flex items-center justify-between">
        {icon}
        <span className={`text-xl font-black ${accentClass}`}>{value}</span>
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  )

  if (href) return <Link href={href} className="block">{inner}</Link>
  return inner
}

function getDueInfo(endAt: string | null): { label: string; urgent: boolean; color: string } {
  if (!endAt) return { label: 'ไม่มีกำหนด', urgent: false, color: 'text-muted-foreground' }
  const diff = new Date(endAt).getTime() - Date.now()
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (diff < 0) return { label: 'เลยกำหนด', urgent: true, color: 'text-destructive' }
  if (hours < 24) return { label: `อีก ${hours} ชม.`, urgent: true, color: 'text-flag dark:text-flag' }
  if (days <= 2) return { label: `อีก ${days} วัน`, urgent: true, color: 'text-warning' }
  return {
    label: new Date(endAt).toLocaleDateString('th-TH', { dateStyle: 'short' }),
    urgent: false,
    color: 'text-muted-foreground',
  }
}

function AssignmentCard({ assignment: a }: { assignment: any }) {
  const due = getDueInfo(a.end_at)
  const questionCount = (a.question_ids as string[] | null)?.length ?? 0

  return (
    <div className={`bg-card border rounded-2xl p-4 flex flex-col gap-3 hover:shadow-md transition-all ${
      due.urgent ? 'border-flag/20 dark:border-flag' : ''
    }`}>
      <div className="flex items-start gap-2">
        {due.urgent && (
          <AlertCircle size={15} className="text-flag shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm line-clamp-2 leading-snug">{a.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {(a.classrooms as any)?.name}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <BookOpen size={11} />
          {questionCount} ข้อ
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
          buttonVariants({ size: 'sm' }),
          'w-full justify-center gap-1 text-xs',
          a.inProgress
            ? 'bg-warning hover:bg-warning/90 text-white border-0'
            : ''
        )}
      >
        {a.inProgress ? '▶ ทำต่อ' : '▶ เริ่มทำข้อสอบ'}
      </Link>
    </div>
  )
}
