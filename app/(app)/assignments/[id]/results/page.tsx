import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

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

  const { data: assignment } = await supabase
    .from('assignments')
    .select('*, classrooms(name)')
    .eq('id', id)
    .eq('created_by', user.id)
    .maybeSingle()

  if (!assignment) notFound()

  const { data: submissions } = await supabase
    .from('submissions')
    .select('*, users(full_name, email)')
    .eq('assignment_id', id)
    .order('total_score', { ascending: false })

  const submitted = (submissions ?? []).filter(
    (s: any) => s.status === 'submitted' || s.status === 'graded'
  )

  const avgScore = submitted.length > 0
    ? submitted.reduce((sum: number, s: any) => sum + (s.total_score ?? 0), 0) / submitted.length
    : null

  const maxScore = submitted[0]?.max_score ?? assignment.question_ids.length

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
      <div className="grid grid-cols-3 gap-3">
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
              <th className="text-left px-4 py-3 font-medium text-gray-600">เวลาส่ง</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {submitted.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400">
                  ยังไม่มีการส่งงาน
                </td>
              </tr>
            ) : (
              submitted.map((s: any, i: number) => {
                const pct = s.max_score > 0 ? Math.round((s.total_score / s.max_score) * 100) : 0
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{s.users?.full_name}</p>
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

function ExportButton({ submissions, title }: { submissions: any[]; title: string }) {
  'use client'
  // Simple CSV export via client-side script
  return (
    <button
      onClick={() => {
        const rows = [
          ['ชื่อ', 'อีเมล', 'คะแนน', 'คะแนนเต็ม', '%'],
          ...submissions.map((s: any) => [
            s.users?.full_name ?? '',
            s.users?.email ?? '',
            s.total_score ?? 0,
            s.max_score ?? 0,
            s.max_score > 0 ? Math.round((s.total_score / s.max_score) * 100) : 0,
          ]),
        ]
        const csv = rows.map(r => r.join(',')).join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${title}.csv`
        a.click()
      }}
      className="text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
    >
      ⬇️ Export CSV
    </button>
  )
}
