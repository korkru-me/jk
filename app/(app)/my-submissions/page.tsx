import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PisaRadar } from '@/components/student/pisa-radar'
import { TrendingUp, CheckCircle2, XCircle, Clock, ChevronRight } from 'lucide-react'

export const metadata = { title: 'ผลงานและสมรรถนะ — KorKru' }

export default async function MySubmissionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: submissions } = await supabase
    .from('submissions')
    .select('*, assignments(title, classrooms(name), duration_minutes)')
    .eq('student_id', user.id)
    .order('created_at', { ascending: false })

  const all = submissions ?? []
  const completed = all.filter((s: any) => s.status === 'submitted' || s.status === 'graded')
  const inProgress = all.filter((s: any) => s.status === 'in_progress')

  const avgPct = completed.length > 0
    ? Math.round(
        completed.reduce((sum: number, s: any) =>
          sum + (s.max_score > 0 ? (s.total_score ?? 0) / s.max_score : 0), 0
        ) / completed.length * 100
      )
    : null

  const highestPct = completed.length > 0
    ? Math.max(...completed.map((s: any) =>
        s.max_score > 0 ? Math.round((s.total_score / s.max_score) * 100) : 0
      ))
    : null

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp size={22} className="text-blue-600 dark:text-blue-400" />
          ผลงานและสมรรถนะ
        </h1>
        <p className="text-muted-foreground text-sm mt-1">ภาพรวมผลการเรียนและทักษะตามกรอบ PISA</p>
      </div>

      {all.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed rounded-2xl">
          <p className="text-4xl mb-3">📝</p>
          <p className="text-muted-foreground">ยังไม่มีประวัติการส่งงาน</p>
          <Link href="/assignments" className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}>
            ดูชุดข้อสอบ
          </Link>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'ทำสำเร็จแล้ว', value: String(completed.length), icon: <CheckCircle2 size={18} className="text-green-500" />, sub: 'ชุด' },
              { label: 'กำลังทำอยู่', value: String(inProgress.length), icon: <Clock size={18} className="text-amber-500" />, sub: 'ชุด' },
              { label: 'คะแนนเฉลี่ย', value: avgPct !== null ? `${avgPct}%` : '—', icon: <TrendingUp size={18} className="text-blue-500" />, sub: '' },
              { label: 'สูงสุด', value: highestPct !== null ? `${highestPct}%` : '—', icon: <span className="text-lg">🏆</span>, sub: '' },
            ].map(s => (
              <div key={s.label} className="bg-card border rounded-2xl p-4">
                <div className="flex items-center justify-between mb-1">
                  {s.icon}
                  <span className="text-xl font-black">{s.value}</span>
                </div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* PISA Competency Radar */}
          {completed.length >= 2 && (
            <div className="bg-card border rounded-2xl p-5">
              <div className="mb-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <span>🧠</span> โปรไฟล์สมรรถนะ (กรอบ PISA)
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  คำนวณจากผลการทำแบบทดสอบ {completed.length} ชุด — ทักษะวิทยาศาสตร์ตามกรอบประเมิน PISA
                </p>
              </div>
              <PisaRadar avgPct={avgPct} completedCount={completed.length} />
            </div>
          )}

          {/* History table */}
          <div className="bg-card border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">ประวัติการสอบทั้งหมด</h2>
              <span className="text-xs text-muted-foreground">{all.length} รายการ</span>
            </div>

            {/* In-progress */}
            {inProgress.length > 0 && (
              <div className="border-b px-5 py-3 bg-amber-500/5">
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1">
                  <Clock size={12} /> กำลังทำอยู่
                </p>
                <div className="space-y-2">
                  {inProgress.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{s.assignments?.title}</p>
                        <p className="text-xs text-muted-foreground">{s.assignments?.classrooms?.name}</p>
                      </div>
                      <Link
                        href={`/assignments/${s.assignment_id}/take`}
                        className={cn(buttonVariants({ size: 'sm' }), 'shrink-0 text-xs')}
                      >
                        ทำต่อ →
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completed list */}
            <div className="divide-y">
              {completed.map((s: any) => {
                const pct = s.max_score > 0
                  ? Math.round((s.total_score / s.max_score) * 100)
                  : 0

                const pctColor = pct >= 75
                  ? 'text-green-600 dark:text-green-400'
                  : pct >= 50
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-red-500'

                const bgBar = pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-400'

                return (
                  <div key={s.id} className="px-5 py-4 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                    {/* Score ring */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${
                      pct >= 75
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : pct >= 50
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    }`}>
                      {pct >= 75 ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.assignments?.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.assignments?.classrooms?.name} · {new Date(s.created_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                      </p>
                      {/* Score bar */}
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden max-w-[120px]">
                          <div className={`h-full rounded-full ${bgBar}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={`text-xs font-bold ${pctColor}`}>{s.total_score}/{s.max_score}</span>
                      </div>
                    </div>

                    {/* Percentage + Link */}
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-black ${pctColor}`}>{pct}%</p>
                      <Link
                        href={`/submissions/${s.id}`}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 justify-end mt-0.5"
                      >
                        ดูเฉลย <ChevronRight size={12} />
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
