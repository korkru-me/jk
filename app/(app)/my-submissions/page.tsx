import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ListChecks, ListTodo, AlertTriangle, CheckCircle2, XCircle, Clock, ChevronRight } from 'lucide-react'
import { computePassed } from '@/lib/grading'
import { selectOfficialAttempt, rescaleToDisplayMax } from '@/lib/scoring'

export const metadata = { title: 'สรุปงานของฉัน — KorKru' }

// Same urgency thresholds as the dashboard's due-date widget, so a deadline
// reads the same way everywhere in the app.
function getDueInfo(endAt: string | null): { label: string; urgent: boolean; overdue: boolean } {
  if (!endAt) return { label: 'ไม่มีกำหนดส่ง', urgent: false, overdue: false }
  const diff = new Date(endAt).getTime() - Date.now()
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (diff < 0) return { label: 'เลยกำหนดส่งแล้ว', urgent: true, overdue: true }
  if (hours < 24) return { label: `ด่วน · เหลืออีก ${Math.max(1, hours)} ชม.`, urgent: true, overdue: false }
  if (days <= 2) return { label: `ใกล้ครบกำหนด · อีก ${days} วัน`, urgent: true, overdue: false }
  return { label: `ถึง ${new Date(endAt).toLocaleDateString('th-TH', { dateStyle: 'medium' })}`, urgent: false, overdue: false }
}

export default async function MySubmissionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: submissions } = await supabase
    .from('submissions')
    .select('*, assignments(title, type, classrooms(name), duration_minutes, passing_type, passing_value, score_strategy, display_max_score, show_results)')
    .eq('student_id', user.id)
    .order('created_at', { ascending: false })

  const all = rescaleToDisplayMax(
    (submissions ?? []) as any[],
    row => row.assignments?.display_max_score ?? null
  )
  const completed = all.filter((s: any) => s.status === 'submitted' || s.status === 'graded')
  const inProgress = all.filter((s: any) => s.status === 'in_progress')
  const inProgressIds = new Set(inProgress.map((s: any) => s.assignment_id))

  // Official (per the assignment's score_strategy) submitted/graded attempt
  // per assignment — used to decide per-assignment completion/pass state
  // instead of counting raw submission rows, so multiple retries count as
  // one assignment.
  const attemptsByAssignment = new Map<string, any[]>()
  for (const s of completed) {
    const arr = attemptsByAssignment.get(s.assignment_id) ?? []
    arr.push(s)
    attemptsByAssignment.set(s.assignment_id, arr)
  }
  const bestByAssignment = new Map<string, any>()
  for (const [assignmentId, attempts] of attemptsByAssignment) {
    const official = selectOfficialAttempt(attempts, attempts[0].assignments?.score_strategy ?? 'best')
    if (official) {
      bestByAssignment.set(assignmentId, {
        ...official.representative,
        total_score: official.total_score,
        max_score: official.max_score,
      })
    }
  }

  // An exercise with a passing threshold isn't "done" until the best attempt
  // clears it — the student is expected to retry. Exams always count once
  // submitted, since they're single-attempt.
  function isAssignmentDone(s: any): boolean {
    const a = s.assignments
    if (a?.type === 'exercise') {
      const passed = computePassed(s.total_score, s.max_score, a.passing_type, a.passing_value)
      if (passed === false) return false
    }
    return true
  }

  const doneAssignments = Array.from(bestByAssignment.values()).filter(isAssignmentDone)
  const doneCount = doneAssignments.length
  const doneAssignmentIds = new Set(doneAssignments.map((s: any) => s.assignment_id))

  // "ต้องทำส่ง" = every published assignment across the student's classrooms
  // that isn't done yet — including ones never even started (no row in
  // `submissions` at all), not just the ones currently in_progress.
  const { data: memberships } = await supabase
    .from('classroom_students')
    .select('classroom_id')
    .eq('student_id', user.id)
  const classroomIds = (memberships ?? []).map((m: any) => m.classroom_id)

  const { data: links } = classroomIds.length > 0
    ? await supabase
        .from('assignment_classrooms')
        .select('assignment_id')
        .in('classroom_id', classroomIds)
    : { data: [] }
  const assignedIds = Array.from(new Set((links ?? []).map((l: any) => l.assignment_id)))

  const { data: publishedAssignments } = assignedIds.length > 0
    ? await supabase
        .from('assignments')
        .select('id, title, end_at, duration_minutes, classrooms(name)')
        .in('id', assignedIds)
        .eq('status', 'published')
    : { data: [] }

  const pendingAssignments = (publishedAssignments ?? [])
    .filter((a: any) => !doneAssignmentIds.has(a.id))
    .map((a: any) => ({
      ...a,
      isInProgress: inProgressIds.has(a.id),
      previousScore: bestByAssignment.get(a.id) ?? null,
    }))
    .sort((a: any, b: any) => {
      const at = a.end_at ? new Date(a.end_at).getTime() : Infinity
      const bt = b.end_at ? new Date(b.end_at).getTime() : Infinity
      return at - bt
    })

  const pendingCount = pendingAssignments.length
  const urgentCount = pendingAssignments.filter((a: any) => {
    if (!a.end_at) return false
    return new Date(a.end_at).getTime() - Date.now() <= 3 * 24 * 60 * 60 * 1000
  }).length

  const hasAnyData = pendingCount > 0 || all.length > 0

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ListChecks size={22} className="text-blue-600 dark:text-blue-400" />
          สรุปงานของฉัน
        </h1>
        <p className="text-muted-foreground text-sm mt-1">งานที่ต้องทำ งานที่ใกล้กำหนดส่ง และประวัติคะแนน</p>
      </div>

      {!hasAnyData ? (
        <div className="text-center py-20 border-2 border-dashed rounded-2xl">
          <p className="text-4xl mb-3">📝</p>
          <p className="text-muted-foreground">ยังไม่มีชุดข้อสอบที่ได้รับ</p>
          <Link href="/assignments" className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}>
            ดูชุดข้อสอบ
          </Link>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'ต้องทำส่ง', value: String(pendingCount), icon: <ListTodo size={18} className="text-amber-500" /> },
              { label: 'ใกล้/เลยกำหนด', value: String(urgentCount), icon: <AlertTriangle size={18} className="text-red-500" /> },
              { label: 'ส่งงานแล้ว', value: String(doneCount), icon: <CheckCircle2 size={18} className="text-green-500" /> },
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

          {/* Pending work, closest deadline first */}
          <div className="bg-card border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <ListTodo size={16} className="text-amber-500" />
                งานที่ต้องทำ
              </h2>
              <span className="text-xs text-muted-foreground">{pendingCount} รายการ</span>
            </div>

            {pendingCount === 0 ? (
              <div className="text-center py-10">
                <p className="text-3xl mb-2">🎉</p>
                <p className="text-sm text-muted-foreground">ทำงานครบหมดแล้ว ไม่มีงานค้าง</p>
              </div>
            ) : (
              <div className="divide-y">
                {pendingAssignments.map((a: any) => {
                  const due = getDueInfo(a.end_at)
                  return (
                    <div
                      key={a.id}
                      className={cn(
                        'px-5 py-4 flex items-center gap-4',
                        due.overdue ? 'bg-red-500/5' : due.urgent ? 'bg-amber-500/5' : ''
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{a.title}</p>
                          {a.isInProgress && (
                            <span className="shrink-0 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                              กำลังทำอยู่
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{a.classrooms?.name}</p>
                        <p className={cn(
                          'text-xs mt-1 flex items-center gap-1 font-medium',
                          due.overdue ? 'text-red-500' : due.urgent ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                        )}>
                          <Clock size={11} /> {due.label}
                        </p>
                      </div>

                      <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                        {a.previousScore && a.previousScore.assignments?.show_results !== 'never' && (
                          <p className="text-xs text-muted-foreground">
                            ครั้งก่อน {a.previousScore.total_score}/{a.previousScore.max_score}
                          </p>
                        )}
                        <Link
                          href={`/assignments/${a.id}/take`}
                          className={cn(
                            buttonVariants({ size: 'sm' }),
                            'text-xs',
                            (a.isInProgress || a.previousScore) ? 'bg-amber-500 hover:bg-amber-600 text-white border-0' : ''
                          )}
                        >
                          {a.isInProgress ? 'ทำต่อ →' : a.previousScore ? 'ลองใหม่' : 'เริ่มทำ'}
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* History */}
          {completed.length > 0 && (
            <div className="bg-card border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <h2 className="font-semibold">ประวัติการสอบทั้งหมด</h2>
                <span className="text-xs text-muted-foreground">{completed.length} รายการ</span>
              </div>

              <div className="divide-y">
                {completed.map((s: any) => {
                  const canShowResults = s.assignments?.show_results !== 'never'
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
                        !canShowResults
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                          : pct >= 75
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : pct >= 50
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}>
                        {!canShowResults || pct >= 75 ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.assignments?.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.assignments?.classrooms?.name} · {new Date(s.created_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                        </p>
                        {canShowResults ? (
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden max-w-[120px]">
                              <div className={`h-full rounded-full ${bgBar}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className={`text-xs font-bold ${pctColor}`}>{s.total_score}/{s.max_score}</span>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-1.5">ครูกำหนดไม่แสดงผลลัพธ์</p>
                        )}
                      </div>

                      {/* Percentage + Link */}
                      <div className="text-right shrink-0">
                        {canShowResults && <p className={`text-lg font-black ${pctColor}`}>{pct}%</p>}
                        <Link
                          href={`/submissions/${s.id}`}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 justify-end mt-0.5"
                        >
                          {s.assignments?.show_results === 'never'
                            ? 'ดูสถานะ'
                            : s.assignments?.show_results === 'score_only'
                              ? 'ดูคะแนน'
                              : 'ดูเฉลย'} <ChevronRight size={12} />
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
