import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateAssignmentForm } from '@/components/assignments/create-assignment-form'
import type { Question, Classroom } from '@/lib/types'

export const metadata = { title: 'สร้างชุดข้อสอบ — KorKru' }

export default async function NewAssignmentPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'teacher' && profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: classrooms }, { data: questions }] = await Promise.all([
    supabase
      .from('classrooms')
      .select('*')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('questions')
      .select('id, title, question_text, difficulty, question_type, visibility')
      .eq('created_by', user.id)
      .neq('visibility', 'pending')
      .order('created_at', { ascending: false }),
  ])

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">สร้างชุดข้อสอบ</h1>
        <p className="text-sm text-gray-500 mt-1">รวบรวมโจทย์และมอบหมายให้นักเรียน</p>
      </div>

      {(!classrooms || classrooms.length === 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          คุณยังไม่มีห้องเรียน กรุณา{' '}
          <a href="/classrooms/new" className="underline font-medium">สร้างห้องเรียน</a>
          {' '}ก่อน
        </div>
      )}

      <CreateAssignmentForm
        classrooms={(classrooms ?? []) as Classroom[]}
        questions={(questions ?? []) as Question[]}
      />
    </div>
  )
}
