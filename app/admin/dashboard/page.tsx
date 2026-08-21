import { createAdminClient } from '@/lib/supabase/admin'

async function getStats() {
  const admin = createAdminClient()

  const [
    { count: totalUsers },
    { count: teachers },
    { count: students },
    { count: classrooms },
    { count: totalQuestions },
    { count: publicQuestions },
    { count: privateQuestions },
    { count: pendingQuestions },
    { count: totalSubmissions },
    { count: todaySubmissions },
  ] = await Promise.all([
    admin.from('users').select('id', { count: 'exact', head: true }),
    admin.from('users').select('id', { count: 'exact', head: true }).eq('role', 'teacher'),
    admin.from('users').select('id', { count: 'exact', head: true }).eq('role', 'student'),
    admin.from('classrooms').select('id', { count: 'exact', head: true }),
    admin.from('questions').select('id', { count: 'exact', head: true }),
    admin.from('questions').select('id', { count: 'exact', head: true }).eq('visibility', 'public'),
    admin.from('questions').select('id', { count: 'exact', head: true }).eq('visibility', 'private'),
    admin.from('questions').select('id', { count: 'exact', head: true }).eq('visibility', 'pending'),
    admin.from('submissions').select('id', { count: 'exact', head: true }),
    admin.from('submissions')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
  ])

  return {
    totalUsers: totalUsers ?? 0,
    teachers: teachers ?? 0,
    students: students ?? 0,
    classrooms: classrooms ?? 0,
    totalQuestions: totalQuestions ?? 0,
    publicQuestions: publicQuestions ?? 0,
    privateQuestions: privateQuestions ?? 0,
    pendingQuestions: pendingQuestions ?? 0,
    totalSubmissions: totalSubmissions ?? 0,
    todaySubmissions: todaySubmissions ?? 0,
  }
}

function StatCard({
  label,
  value,
  sub,
  color = 'blue',
}: {
  label: string
  value: number
  sub?: string
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple'
}) {
  const colors = {
    blue:   'bg-primary/10 border-primary/20 text-primary',
    green:  'bg-success/10 border-success/20 text-success',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    red:    'bg-destructive/10 border-destructive/20 text-destructive',
    purple: 'bg-tint-1/10 border-tint-1/20 text-tint-1',
  }
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <p className="text-sm font-medium opacity-75">{label}</p>
      <p className="text-3xl font-bold mt-1">{value.toLocaleString()}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  )
}

export default async function AdminDashboard() {
  const s = await getStats()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">ภาพรวมระบบ KorKru</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">ผู้ใช้</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="ผู้ใช้ทั้งหมด" value={s.totalUsers} color="blue" />
          <StatCard label="ครู" value={s.teachers} color="green" />
          <StatCard label="นักเรียน" value={s.students} color="purple" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">คลังโจทย์</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="โจทย์ทั้งหมด" value={s.totalQuestions} color="blue" />
          <StatCard label="Public" value={s.publicQuestions} color="green" />
          <StatCard label="Private" value={s.privateQuestions} color="yellow" />
          <StatCard label="รออนุมัติ" value={s.pendingQuestions} color="red"
            sub={s.pendingQuestions > 0 ? '⚠️ มีโจทย์รอตรวจ' : undefined}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">การเรียน</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="ห้องเรียน" value={s.classrooms} color="purple" />
          <StatCard label="Submissions วันนี้" value={s.todaySubmissions} color="green" />
          <StatCard label="Submissions ทั้งหมด" value={s.totalSubmissions} color="blue" />
        </div>
      </section>
    </div>
  )
}
