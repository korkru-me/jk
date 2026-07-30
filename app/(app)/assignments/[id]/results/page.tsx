import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ExportButton } from '@/components/assignments/export-button'
import { computePassed } from '@/lib/grading'
import { selectOfficialAttempt, rescaleToDisplayMax } from '@/lib/scoring'
import { CheckCircle2, XCircle } from 'lucide-react'

export const metadata = { title: 'ผลคะแนน — KorKru' }

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // No explicit created_by filter — RLS (assignments_org_teacher_all /
  // assignments_co_teacher_all) already scopes this to owner or co-teacher.
  const { data: assignment } = await supabase
    .from('assignments')
    .select('*, classrooms(name)')
    .eq('id', id)
    .maybeSingle()

  if (!assignment) notFound()

  const { data: submissions } = await supabase
    .from('submissions')
    .select('*, users(full_name, email)')
    .eq('assignment_id', id)
    .order('total_score', { ascending: false })

  const submittedAttempts = rescaleToDisplayMax(
    (submissions ?? []).filter((s: any) => s.status === 'submitted' || s.status === 'graded'),
    () => assignment.display_max_score
  )

  // A student may have multiple attempts — reduce to the "official" score
  // per the assignment's score_strategy, so retries don't inflate the table.
  const attemptsByStudent = new Map<string, any[]>()
  for (const s of submittedAttempts) {
    const arr = attemptsByStudent.get(s.student_id) ?? []
    arr.push(s)
    attemptsByStudent.set(s.student_id, arr)
  }
  const submitted = Array.from(attemptsByStudent.values())
    .map(attempts => {
      const official = selectOfficialAttempt(attempts, assignment.score_strategy)
      return official ? { ...official.representative, total_score: official.total_score, max_score: official.max_score } : null
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0))

  const avgScore = submitted.length > 0
    ? submitted.reduce((sum: number, s: any) => sum + (s.total_score ?? 0), 0) / submitted.length
    : null

  const maxScore = submitted[0]?.max_score ?? assignment.display_max_score ?? assignment.question_ids.length

  const hasPassingThreshold = assignment.passing_type != null && assignment.passing_value != null
  const passCount = submitted.filter(
    (s: any) => computePassed(s.total_score, s.max_score, assignment.passing_type, assignment.passing_value) === true
  ).length

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href={`/assignments/${id}`} className="text-sm text-gray-500 hover:text-blue-600">
            ← กลับ
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{assignment.title}</h1>
          <p className="text-sm text-gray-500">{(assignment as any).classrooms?.name}</p>
        </div>
        <ExportButton submissions={submitted} title={assignment.title} />
      </div>

      {/* Summary cards */}
      <div className={`grid gap-3 ${hasPassingThreshold ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500">ส่งแล้ว</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{submitted.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500">คะแนนเฉลี่ย</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {avgScore !== null ? avgScore.toFixed(1) : '—'}/{maxScore}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500">กำลังทำ</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {(submissions ?? []).filter((s: any) => s.status === 'in_progress').length}
          </p>
        </div>
        {hasPassingThreshold && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500">
              ผ่านเกณฑ์ ({assignment.passing_type === 'percent' ? `${assignment.passing_value}%` : `${assignment.passing_value} คะแนน`})
            </p>
            <p className="text-2xl font-bold mt-1">
              <span className="text-green-600">{passCount}</span>
              <span className="text-gray-300"> / </span>
              <span className="text-red-500">{submitted.length - passCount}</span>
            </p>
          </div>
        )}
      </div>

      {/* Score table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ชื่อ</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">คะแนน</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">%</th>
              {hasPassingThreshold && (
                <th className="text-center px-4 py-3 font-medium text-gray-600">ผลเกณฑ์</th>
              )}
              <th className="text-left px-4 py-3 font-medium text-gray-600">เวลาส่ง</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {submitted.length === 0 ? (
              <tr>
                <td colSpan={hasPassingThreshold ? 6 : 5} className="text-center py-10 text-gray-400">
                  ยังไม่มีการส่งงาน
                </td>
              </tr>
            ) : (
              submitted.map((s: any, i: number) => {
                const pct = s.max_score > 0 ? Math.round((s.total_score / s.max_score) * 100) : 0
                const passed = computePassed(s.total_score, s.max_score, assignment.passing_type, assignment.passing_value)
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3">
                      <Link href={`/submissions/${s.id}`} className="font-medium text-gray-900 hover:text-blue-600 hover:underline">
                        {s.users?.full_name}
                      </Link>
                      <p className="text-xs text-gray-400">{s.users?.email}</p>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-gray-900">
                      {s.total_score}/{s.max_score}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        pct >= 75 ? 'bg-green-100 text-green-700'
                        : pct >= 50 ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-600'
                      }`}>
                        {pct}%
                      </span>
                    </td>
                    {hasPassingThreshold && (
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                        }`}>
                          {passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {passed ? 'ผ่าน' : 'ไม่ผ่าน'}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {s.submitted_at
                        ? new Date(s.submitted_at).toLocaleTimeString('th-TH', { timeStyle: 'short' })
                        : '—'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

