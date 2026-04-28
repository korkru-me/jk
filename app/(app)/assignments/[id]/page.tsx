import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { AssignmentActions } from './_actions'
import type { Assignment, Question } from '@/lib/types'

export const metadata = { title: 'ชุดข้อสอบ — KorKru' }

const statusLabel: Record<string, string> = {
  draft: 'ร่าง',
  published: 'เผยแพร่แล้ว',
  closed: 'ปิดแล้ว',
}

const statusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-green-100 text-green-700',
  closed: 'bg-red-100 text-red-600',
}

export default async function AssignmentDetailPage({
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
    .maybeSingle()

  if (!assignment) notFound()

  const a = assignment as Assignment & { classrooms: { name: string } }
  const isOwner = a.created_by === user.id

  if (!isOwner) redirect('/assignments')

  const { data: questions } = await supabase
    .from('questions')
    .select('id, title, question_type, difficulty')
    .in('id', a.question_ids)

  const { data: submissions } = await supabase
    .from('submissions')
    .select('id, student_id, status, total_score, max_score, submitted_at, users(full_name)')
    .eq('assignment_id', id)
    .order('submitted_at', { ascending: false })

  const submittedCount = (submissions ?? []).filter((s: any) =>
    s.status === 'submitted' || s.status === 'graded'
  ).length

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[a.status] ?? ''}`}>
              {statusLabel[a.status]}
            </span>
            <Badge variant="outline" className="text-xs">
              {a.mode === 'online' ? '💻 ออนไลน์' : '🖨️ พิมพ์'}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{a.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{a.classrooms?.name}</p>
          {a.description && <p className="text-sm text-gray-600 mt-2">{a.description}</p>}
        </div>
      </div>

      {/* Status actions */}
      <AssignmentActions assignmentId={id} currentStatus={a.status} mode={a.mode} />

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InfoCard label="โจทย์" value={`${a.question_ids.length} ข้อ`} />
        <InfoCard label="ส่งแล้ว" value={`${submittedCount} คน`} />
        {a.duration_minutes && (
          <InfoCard label="เวลา" value={`${a.duration_minutes} นาที`} />
        )}
        {a.end_at && (
          <InfoCard
            label="กำหนดส่ง"
            value={new Date(a.end_at).toLocaleDateString('th-TH', { dateStyle: 'short' })}
          />
        )}
      </div>

      {/* Questions list */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 mb-3">โจทย์ ({(questions ?? []).length} ข้อ)</h2>
        <div className="space-y-2">
          {(questions ?? []).map((q: any, i: number) => (
            <div key={q.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-400 w-5 shrink-0">{i + 1}.</span>
              <span className="text-sm text-gray-900 flex-1 truncate">{q.title}</span>
              <Badge variant="outline" className="text-xs shrink-0">
                {q.difficulty === 'easy' ? 'ง่าย'
                  : q.difficulty === 'medium' ? 'กลาง'
                  : q.difficulty === 'hard' ? 'ยาก' : 'วิเคราะห์'}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Submissions summary */}
      {(submissions ?? []).length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">การส่งงาน</h2>
            <Link
              href={`/assignments/${id}/results`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              ดูคะแนน →
            </Link>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(submissions ?? []).slice(0, 10).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-gray-700">{s.users?.full_name ?? '—'}</span>
                <div className="flex items-center gap-2">
                  {s.status === 'in_progress' ? (
                    <span className="text-xs text-amber-600">กำลังทำ</span>
                  ) : (
                    <span className="font-medium">{s.total_score}/{s.max_score}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  )
}
