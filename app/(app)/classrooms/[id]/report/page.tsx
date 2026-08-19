import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getHomeroomAggregate } from '@/lib/homeroom-data'
import { computePassed } from '@/lib/grading'
import { selectOfficialAttempt } from '@/lib/scoring'
import { PrintReportButton } from './_components/print-report-button'

export const metadata = { title: 'รายงานผู้ปกครอง — KorKru' }

export default async function HomeroomReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const admin = createAdminClient()
  const [{ data: { user: authUser } }, { data: classroom }] = await Promise.all([
    supabase.auth.getUser(),
    admin.from('classrooms').select('id, name, teacher_id, classroom_type').eq('id', id).maybeSingle(),
  ])
  if (!authUser) redirect('/login')
  if (!classroom) notFound()
  const c = classroom
  if (c.classroom_type !== 'homeroom') notFound()

  const isOwner = c.teacher_id === authUser.id
  const myCoTeacherRow = isOwner
    ? null
    : (await admin
        .from('classroom_co_teachers')
        .select('permission')
        .eq('classroom_id', id)
        .eq('user_id', authUser.id)
        .maybeSingle()).data
  const canManage = isOwner || myCoTeacherRow?.permission === 'admin' || myCoTeacherRow?.permission === 'manage'
  if (!canManage) notFound()

  const { data: memberships } = await admin
    .from('classroom_students')
    .select('student_id, users!inner(id, full_name)')
    .eq('classroom_id', id)
  const students = (memberships ?? []).map((m: any) => m.users) as { id: string; full_name: string }[]

  const { assignments, submissions } = await getHomeroomAggregate(admin, id, students.map(s => s.id))

  const now = Date.now()
  const isDone = (status?: string) => status === 'submitted' || status === 'graded'
  const dueAssignments = assignments.filter(a => !a.end_at || new Date(a.end_at).getTime() <= now)

  const strategyByAssignment = new Map(assignments.map(a => [a.id, a.score_strategy]))
  const attemptsByKey = new Map<string, typeof submissions>()
  for (const s of submissions) {
    const key = `${s.assignment_id}::${s.student_id}`
    const arr = attemptsByKey.get(key) ?? []
    arr.push(s)
    attemptsByKey.set(key, arr)
  }
  const bestSubmission = new Map<string, typeof submissions[number]>()
  for (const [key, attempts] of attemptsByKey) {
    const strategy = strategyByAssignment.get(attempts[0].assignment_id) ?? 'best'
    const official = selectOfficialAttempt(attempts, strategy)
    if (official) {
      bestSubmission.set(key, { ...official.representative, total_score: official.total_score, max_score: official.max_score })
    }
  }

  const today = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="p-8 print:p-0 max-w-3xl mx-auto">
      <style>{`
        @media print {
          @page { size: A4; margin: 1.5cm; }
          nav, header, footer, .no-print { display: none !important; }
          .student-report { page-break-after: always; }
          .student-report:last-child { page-break-after: auto; }
          body { font-size: 11pt; color: black; }
        }
      `}</style>

      <div className="mb-6 print:hidden flex items-center justify-between no-print">
        <div>
          <h1 className="text-xl font-bold">รายงานสำหรับผู้ปกครอง: {c.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{students.length} คน · {assignments.length} รายการงาน</p>
        </div>
        <PrintReportButton />
      </div>

      {students.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">ยังไม่มีนักเรียนในห้องนี้</p>
        </div>
      ) : (
        students.map(student => {
          const submitted = dueAssignments.filter(a => isDone(bestSubmission.get(`${a.id}::${student.id}`)?.status)).length
          const rate = dueAssignments.length > 0 ? Math.round((submitted / dueAssignments.length) * 100) : 100
          return (
            <div key={student.id} className="student-report border-b border-gray-200 pb-8 mb-8 last:border-0">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs text-gray-400">รายงานความรับผิดชอบด้านการเรียน</p>
                  <h2 className="text-lg font-bold text-gray-900">{student.full_name}</h2>
                  <p className="text-xs text-gray-500">{c.name} · ณ วันที่ {today}</p>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-bold ${rate >= 80 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                    {rate}%
                  </p>
                  <p className="text-xs text-gray-500">ส่งงานตรงเวลา ({submitted}/{dueAssignments.length})</p>
                </div>
              </div>

              {assignments.length === 0 ? (
                <p className="text-sm text-gray-400">ยังไม่มีการบ้านจากห้องเรียนวิชาของนักเรียนคนนี้</p>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-300 text-left text-xs text-gray-500 uppercase">
                      <th className="py-1.5 pr-2">วิชา</th>
                      <th className="py-1.5 pr-2">งาน</th>
                      <th className="py-1.5 pr-2">กำหนดส่ง</th>
                      <th className="py-1.5 text-right">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map(a => {
                      const sub = bestSubmission.get(`${a.id}::${student.id}`)
                      const done = isDone(sub?.status)
                      const overdue = !done && (!a.end_at || new Date(a.end_at).getTime() <= now)
                      const passed = done
                        ? computePassed(sub!.total_score, sub!.max_score, a.passing_type, a.passing_value)
                        : null
                      return (
                        <tr key={a.id} className="border-b border-gray-100">
                          <td className="py-1.5 pr-2 text-gray-600">{a.classroomName}</td>
                          <td className="py-1.5 pr-2 text-gray-900">{a.title}</td>
                          <td className="py-1.5 pr-2 text-gray-500">
                            {a.end_at ? new Date(a.end_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : 'ไม่กำหนด'}
                          </td>
                          <td className="py-1.5 text-right">
                            {done ? (
                              <span className={passed === false ? 'text-red-600 font-medium' : 'text-emerald-600 font-medium'}>
                                {sub!.total_score ?? 0}/{sub!.max_score}
                              </span>
                            ) : overdue ? (
                              <span className="text-red-500 font-medium">ยังไม่ส่ง (เลยกำหนด)</span>
                            ) : (
                              <span className="text-gray-400">รอส่ง</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}

              <div className="mt-8 flex justify-end text-xs text-gray-400">
                <span>ลงชื่อผู้ปกครอง ____________________</span>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
