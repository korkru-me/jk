import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { User } from '@/lib/types'

export const metadata = { title: 'หน้าหลัก — KorKru' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const authUser = session?.user ?? null
  if (!authUser) redirect('/login')

  const { data: profile } = await supabase
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
        .select('id, title, status, question_ids, classrooms(name)')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(5),
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
        classroomsCount={classroomIds.length}
        studentsCount={studentsRes.count ?? 0}
        recentAssignments={(assignmentsRes.data ?? []) as any[]}
      />
    )
  }

  // Student
  const [membershipsRes, submissionsRes] = await Promise.all([
    supabase
      .from('classroom_students')
      .select('classroom_id')
      .eq('student_id', user.id),
    supabase
      .from('submissions')
      .select('total_score, max_score, status, assignment_id')
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
    const inProgressIds = new Set(
      allSubmissions.filter((s: any) => s.status === 'in_progress').map((s: any) => s.assignment_id)
    )

    const { data: allAssignments } = await supabase
      .from('assignments')
      .select('id, title, question_ids, classrooms(name), end_at')
      .in('classroom_id', classroomIds)
      .eq('status', 'published')
      .order('created_at', { ascending: false })

    pendingAssignments = (allAssignments ?? [])
      .filter((a: any) => !submittedIds.has(a.id))
      .slice(0, 5)
      .map((a: any) => ({ ...a, inProgress: inProgressIds.has(a.id) }))
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

// ─── Teacher Dashboard ────────────────────────────────────────────────────────

function TeacherDashboard({
  user,
  questionsCount,
  classroomsCount,
  studentsCount,
  recentAssignments,
}: {
  user: User
  questionsCount: number
  classroomsCount: number
  studentsCount: number
  recentAssignments: any[]
}) {
  const steps = [
    { done: questionsCount > 0, text: 'สร้างโจทย์แรกของคุณ', href: '/questions/new' },
    { done: classroomsCount > 0, text: 'สร้างห้องเรียน', href: '/classrooms/new' },
    { done: studentsCount > 0, text: 'แชร์ Class Code ให้นักเรียน', href: '/classrooms' },
    { done: recentAssignments.length > 0, text: 'สร้างชุดข้อสอบและมอบหมาย', href: '/assignments/new' },
  ]
  const allDone = steps.every(s => s.done)

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">สวัสดี, {user.full_name}</h1>
        <p className="text-gray-600 mt-1">ยินดีต้อนรับสู่ KorKru</p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <QuickActionCard icon="📝" title="สร้างโจทย์ใหม่" desc="เพิ่มโจทย์ฟิสิกส์พร้อมสูตรสุ่มตัวเลข" href="/questions/new" primary />
        <QuickActionCard icon="🏫" title="สร้างห้องเรียน" desc="สร้างห้องเรียนและรับ Class Code" href="/classrooms/new" />
        <QuickActionCard icon="📋" title="สร้างชุดข้อสอบ" desc="รวบรวมโจทย์เป็นชุดและมอบหมาย" href="/assignments/new" />
      </div>

      {/* Real stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="โจทย์ทั้งหมด" value={String(questionsCount)} icon="📚" href="/questions" />
        <StatCard label="ห้องเรียน" value={String(classroomsCount)} icon="🏫" href="/classrooms" />
        <StatCard label="นักเรียน" value={String(studentsCount)} icon="🎒" />
      </div>

      {/* Recent assignments */}
      {recentAssignments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">ชุดข้อสอบล่าสุด</CardTitle>
              <Link href="/assignments" className="text-sm text-blue-600 hover:underline">
                ดูทั้งหมด →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {recentAssignments.map((a: any) => (
              <Link
                key={a.id}
                href={`/assignments/${a.id}`}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 truncate">
                    {a.title}
                  </p>
                  <p className="text-xs text-gray-400">
                    {(a.classrooms as any)?.name} · {(a.question_ids as string[]).length} ข้อ
                  </p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ml-3 shrink-0 ${
                  a.status === 'published' ? 'bg-green-100 text-green-700'
                  : a.status === 'draft' ? 'bg-gray-100 text-gray-600'
                  : 'bg-red-100 text-red-600'
                }`}>
                  {a.status === 'published' ? 'เผยแพร่' : a.status === 'draft' ? 'ร่าง' : 'ปิด'}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Getting started checklist */}
      {!allDone && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">เริ่มต้นใช้งาน</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {steps.map((item, i) => (
              <Link
                key={i}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg transition-colors',
                  item.done ? 'opacity-60 cursor-default' : 'hover:bg-gray-50 group'
                )}
              >
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                  item.done
                    ? 'bg-green-100 text-green-600 border-2 border-green-400'
                    : 'border-2 border-gray-300 text-gray-500 group-hover:border-blue-500 group-hover:text-blue-500'
                )}>
                  {item.done ? '✓' : i + 1}
                </div>
                <span className={cn(
                  'text-sm font-medium flex-1',
                  item.done ? 'text-gray-400 line-through' : 'text-gray-700 group-hover:text-blue-600'
                )}>
                  {item.text}
                </span>
                {!item.done && (
                  <span className="text-gray-400 group-hover:text-blue-500">→</span>
                )}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
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
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">สวัสดี, {user.full_name}</h1>
        <p className="text-gray-600 mt-1">ยินดีต้อนรับสู่ KorKru</p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <QuickActionCard icon="🏫" title="ห้องเรียนของฉัน" desc="ดูห้องเรียนและเข้าร่วมห้องใหม่" href="/classrooms" primary />
        <QuickActionCard icon="📝" title="ประวัติการส่งงาน" desc="ดูผลคะแนนและเฉลยโจทย์" href="/my-submissions" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="ห้องเรียน" value={String(classroomsCount)} icon="🏫" href="/classrooms" />
        <StatCard label="ส่งงานแล้ว" value={String(completedCount)} icon="✅" href="/my-submissions" />
        <StatCard label="คะแนนเฉลี่ย" value={avgPct !== null ? `${avgPct}%` : '—'} icon="⭐" />
      </div>

      {/* Pending assignments */}
      {pendingAssignments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">ชุดข้อสอบที่รอทำ</CardTitle>
              <Link href="/assignments" className="text-sm text-blue-600 hover:underline">
                ดูทั้งหมด →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingAssignments.map((a: any) => (
              <div
                key={a.id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
                  <p className="text-xs text-gray-400">
                    {(a.classrooms as any)?.name} · {(a.question_ids as string[]).length} ข้อ
                    {a.end_at && (
                      <> · กำหนดส่ง {new Date(a.end_at).toLocaleDateString('th-TH', { dateStyle: 'short' })}</>
                    )}
                  </p>
                </div>
                <Link
                  href={`/assignments/${a.id}/take`}
                  className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}
                >
                  {a.inProgress ? 'ทำต่อ' : 'เริ่มทำ'} →
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Empty state: no classrooms */}
      {classroomsCount === 0 && (
        <Card className="border-dashed border-blue-200 bg-blue-50/50">
          <CardContent className="py-10 text-center">
            <p className="text-4xl mb-3">🏫</p>
            <h3 className="font-semibold text-gray-900 mb-1">เข้าร่วมห้องเรียนแรกของคุณ</h3>
            <p className="text-sm text-gray-500 mb-4">ขอรหัส Class Code จากครู แล้วกรอกในหน้าห้องเรียน</p>
            <Link href="/classrooms" className={cn(buttonVariants())}>
              ไปที่ห้องเรียน
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function QuickActionCard({
  icon, title, desc, href, primary,
}: {
  icon: string; title: string; desc: string; href: string; primary?: boolean
}) {
  return (
    <Card className={`hover:shadow-md transition-shadow ${primary ? 'border-blue-200 bg-blue-50' : ''}`}>
      <CardContent className="pt-6">
        <div className="space-y-3">
          <div className="text-3xl">{icon}</div>
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-gray-600 mt-0.5">{desc}</p>
          </div>
          <Link
            href={href}
            className={cn(buttonVariants({ variant: primary ? 'default' : 'outline', size: 'sm' }))}
          >
            ไปเลย →
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

function StatCard({
  label, value, icon, href,
}: {
  label: string; value: string; icon: string; href?: string
}) {
  const inner = (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-600">{label}</p>
        <p className="text-3xl font-bold mt-1">{value}</p>
      </div>
      <div className="text-4xl opacity-20">{icon}</div>
    </div>
  )

  return (
    <Card className={href ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}>
      <CardContent className="pt-6">
        {href ? <Link href={href} className="block">{inner}</Link> : inner}
      </CardContent>
    </Card>
  )
}
