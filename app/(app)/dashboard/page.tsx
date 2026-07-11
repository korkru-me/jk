import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { User } from '@/lib/types'
import { TeacherDashboard } from './_components/teacher-dashboard'
import { StreakGamification } from '@/components/student/streak-gamification'
import { Clock, BookOpen, ChevronRight, TrendingUp, Flame, AlertCircle } from 'lucide-react'

export const metadata = { title: 'หน้าหลัก — KorKru' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  if (!profile) redirect('/login')

  const user = profile as User

  if (user.role === 'teacher' || user.role === 'admin') {
    const [questionsRes, classroomsRes, assignmentsRes] = await Promise.all([
      supabase
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', user.id),
      supabase
        .from('classrooms')
        .select('id')
        .eq('teacher_id', user.id),
      supabase
        .from('assignments')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', user.id),
    ])

    const classroomIds = (classroomsRes.data ?? []).map((c: any) => c.id)
    const studentsRes = classroomIds.length > 0
      ? await supabase
          .from('classroom_students')
          .select('id', { count: 'exact', head: true })
          .in('classroom_id', classroomIds)
      : { count: 0 as number | null }

    return (
      <TeacherDashboard
        user={user}
        questionsCount={questionsRes.count ?? 0}
        studentsCount={studentsRes.count ?? 0}
        assignmentsCount={assignmentsRes.count ?? 0}
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
      .select('total_score, max_score, status, assignment_id, created_at')
      .eq('student_id', user.id),
  ])

  const classroomIds = (membershipsRes.data ?? []).map((m: any) => m.classroom_id)
  const allSubmissions = submissionsRes.data ?? []
  const completed = allSubmissions.filter(
    (s: any) => s.status === 'submitted' || s.status === 'graded'
  )
  const avgPct = completed.length > 0
    ? Math.round(
        completed.reduce((sum: number, s: any) =>
          sum + (s.max_score > 0 ? (s.total_score ?? 0) / s.max_score : 0), 0
        ) / completed.length * 100
      )
    : null

  let pendingAssignments: any[] = []
  if (classroomIds.length > 0) {
    const submittedIds = new Set(completed.map((s: any) => s.assignment_id))
    const inProgressMap = new Map(
      allSubmissions
        .filter((s: any) => s.status === 'in_progress')
        .map((s: any) => [s.assignment_id, s])
    )

    const { data: allAssignments } = await supabase
      .from('assignments')
      .select('id, title, question_ids, classrooms(name), end_at, duration_minutes')
      .in('classroom_id', classroomIds)
      .eq('status', 'published')
      .order('end_at', { ascending: true, nullsFirst: false })

    pendingAssignments = (allAssignments ?? [])
      .filter((a: any) => !submittedIds.has(a.id))
      .slice(0, 6)
      .map((a: any) => ({
        ...a,
        inProgress: inProgressMap.has(a.id),
        submissionId: inProgressMap.get(a.id)?.id ?? null,
      }))
  }

  return (
    <StudentDashboard
      user={user}
      classroomsCount={classroomIds.length}
      avgPct={avgPct}
      completedCount={completed.length}
      pendingAssignments={pendingAssignments}
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
}: {
  user: User
  classroomsCount: number
  avgPct: number | null
  completedCount: number
  pendingAssignments: any[]
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
          ดูสมรรถนะ
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

      {/* Gamification */}
      <StreakGamification
        completedCount={completedCount}
        avgPct={avgPct}
        classroomsCount={classroomsCount}
      />

      {/* Pending assignments */}
      {pendingAssignments.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <BookOpen size={16} className="text-blue-600 dark:text-blue-400" />
              ชุดข้อสอบที่รอทำ
              <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {pendingAssignments.length}
              </span>
            </h2>
            <Link href="/assignments" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
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
        <div className="bg-card border border-dashed rounded-2xl p-8 text-center">
          <p className="text-3xl mb-3">🎉</p>
          <p className="font-semibold">ทำงานครบหมดแล้ว!</p>
          <p className="text-sm text-muted-foreground mt-1">ไม่มีชุดข้อสอบที่ค้างอยู่ในตอนนี้</p>
        </div>
      ) : (
        <div className="bg-card border-2 border-dashed border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/20 rounded-2xl p-10 text-center">
          <p className="text-4xl mb-3">🏫</p>
          <h3 className="font-semibold mb-1">เข้าร่วมห้องเรียนแรกของคุณ</h3>
          <p className="text-sm text-muted-foreground mb-4">ขอรหัส Class Code จากครู แล้วกรอกในหน้าห้องเรียน</p>
          <Link href="/classrooms" className={cn(buttonVariants())}>
            ไปที่ห้องเรียน
          </Link>
        </div>
      )}
    </div>
  )
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
    blue: 'text-blue-600 dark:text-blue-400',
    green: 'text-green-600 dark:text-green-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
  }[accent]

  const inner = (
    <div className="bg-card border rounded-2xl p-4 flex flex-col gap-2 hover:shadow-md transition-shadow h-full">
      <div className="flex items-center justify-between">
        {icon}
        <span className={`text-xl font-black ${accentClass}`}>{value}</span>
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )

  if (href) return <Link href={href} className="block">{inner}</Link>
  return inner
}

function getDueInfo(endAt: string | null): { label: string; urgent: boolean; color: string } {
  if (!endAt) return { label: 'ไม่มีกำหนด', urgent: false, color: 'text-muted-foreground' }
  const diff = new Date(endAt).getTime() - Date.now()
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (diff < 0) return { label: 'เลยกำหนด', urgent: true, color: 'text-red-600 dark:text-red-400' }
  if (hours < 24) return { label: `อีก ${hours} ชม.`, urgent: true, color: 'text-orange-600 dark:text-orange-400' }
  if (days <= 2) return { label: `อีก ${days} วัน`, urgent: true, color: 'text-amber-600 dark:text-amber-400' }
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
      due.urgent ? 'border-orange-300 dark:border-orange-800' : ''
    }`}>
      <div className="flex items-start gap-2">
        {due.urgent && (
          <AlertCircle size={15} className="text-orange-500 shrink-0 mt-0.5" />
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
            ? 'bg-amber-500 hover:bg-amber-600 text-white border-0'
            : ''
        )}
      >
        {a.inProgress ? '▶ ทำต่อ' : '▶ เริ่มทำข้อสอบ'}
      </Link>
    </div>
  )
}
