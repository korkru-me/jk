import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { Assignment } from '@/lib/types'

export const metadata = { title: 'ชุดข้อสอบ — KorKru' }

const statusLabel: Record<string, { label: string; color: string }> = {
  draft: { label: 'ร่าง', color: 'bg-gray-100 text-gray-600' },
  published: { label: 'เผยแพร่แล้ว', color: 'bg-green-100 text-green-700' },
  closed: { label: 'ปิดแล้ว', color: 'bg-red-100 text-red-600' },
}

export default async function AssignmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin'
  const isStudent = profile?.role === 'student'

  if (isTeacher) {
    const { data: assignments } = await supabase
      .from('assignments')
      .select('*, classrooms(name)')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })

    return (
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">ชุดข้อสอบของฉัน</h1>
          <Link href="/assignments/new" className={cn(buttonVariants())}>
            + สร้างชุดข้อสอบ
          </Link>
        </div>

        {!assignments || assignments.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-500">ยังไม่มีชุดข้อสอบ</p>
            <Link href="/assignments/new" className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}>
              สร้างชุดข้อสอบแรก
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((a: any) => {
              const st = statusLabel[a.status] ?? statusLabel.draft
              return (
                <Link
                  key={a.id}
                  href={`/assignments/${a.id}`}
                  className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{a.title}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{(a as any).classrooms?.name}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.color}`}>
                        {st.label}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {a.mode === 'online' ? '💻 ออนไลน์' : '🖨️ พิมพ์'}
                      </Badge>
                    </div>
                  </div>
                  {a.end_at && (
                    <p className="text-xs text-gray-400 mt-2">
                      สิ้นสุด: {new Date(a.end_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                    </p>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  if (isStudent) {
    // Fetch student's classrooms → published assignments
    const { data: memberships } = await supabase
      .from('classroom_students')
      .select('classroom_id')
      .eq('student_id', user.id)

    const classroomIds = (memberships ?? []).map((m: any) => m.classroom_id)

    const { data: assignments } = classroomIds.length > 0
      ? await supabase
          .from('assignments')
          .select('*, classrooms(name), submissions(id, status, total_score, max_score)')
          .in('classroom_id', classroomIds)
          .eq('status', 'published')
          .order('created_at', { ascending: false })
      : { data: [] }

    return (
      <div className="max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">ชุดข้อสอบที่ได้รับ</h1>

        {!assignments || assignments.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
            <p className="text-4xl mb-3">📝</p>
            <p className="text-gray-500">ยังไม่มีชุดข้อสอบ</p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((a: any) => {
              const mySubmission = a.submissions?.[0]
              const done = mySubmission?.status === 'submitted' || mySubmission?.status === 'graded'
              return (
                <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{a.title}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{a.classrooms?.name}</p>
                    </div>
                    {done ? (
                      <div className="text-right shrink-0">
                        <p className="text-xs text-green-600 font-medium">ส่งแล้ว</p>
                        <p className="text-sm font-bold text-gray-900 mt-0.5">
                          {mySubmission.total_score}/{mySubmission.max_score} คะแนน
                        </p>
                      </div>
                    ) : (
                      <Link
                        href={`/assignments/${a.id}/take`}
                        className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}
                      >
                        เริ่มทำ →
                      </Link>
                    )}
                  </div>
                  {done && mySubmission && (
                    <Link
                      href={`/submissions/${mySubmission.id}`}
                      className="text-xs text-blue-600 hover:underline mt-2 inline-block"
                    >
                      ดูเฉลย →
                    </Link>
                  )}
                  {a.end_at && (
                    <p className="text-xs text-gray-400 mt-2">
                      กำหนดส่ง: {new Date(a.end_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  redirect('/dashboard')
}
