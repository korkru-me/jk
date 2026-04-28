import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const metadata = { title: 'การส่งงาน — KorKru' }

export default async function MySubmissionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: submissions } = await supabase
    .from('submissions')
    .select('*, assignments(title, classrooms(name))')
    .eq('student_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">ประวัติการส่งงาน</h1>

      {!submissions || submissions.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-4xl mb-3">📝</p>
          <p className="text-gray-500">ยังไม่มีการส่งงาน</p>
          <Link href="/assignments" className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}>
            ดูชุดข้อสอบ
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map((s: any) => {
            const done = s.status === 'submitted' || s.status === 'graded'
            const pct = done && s.max_score > 0
              ? Math.round((s.total_score / s.max_score) * 100)
              : null

            return (
              <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{s.assignments?.title}</p>
                    <p className="text-sm text-gray-500">{s.assignments?.classrooms?.name}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(s.created_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {done ? (
                      <>
                        <p className="text-lg font-bold text-gray-900">
                          {s.total_score}/{s.max_score}
                        </p>
                        <p className={`text-xs font-medium ${
                          pct! >= 75 ? 'text-green-600' : pct! >= 50 ? 'text-yellow-600' : 'text-red-500'
                        }`}>{pct}%</p>
                        <Link
                          href={`/submissions/${s.id}`}
                          className="text-xs text-blue-600 hover:underline mt-1 block"
                        >
                          ดูเฉลย →
                        </Link>
                      </>
                    ) : (
                      <Link
                        href={`/assignments/${s.assignment_id}/take`}
                        className={cn(buttonVariants({ size: 'sm' }))}
                      >
                        ทำต่อ →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
