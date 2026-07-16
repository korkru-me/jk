import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateAssignmentForm } from '@/components/assignments/create-assignment-form'
import { getQuestionSet } from '@/lib/actions/question-sets'
import type { Question, Classroom } from '@/lib/types'

export const metadata = { title: 'สร้างชุดข้อสอบ — KorKru' }

interface Props {
  searchParams: Promise<{ classroom?: string; set?: string }>
}

export default async function NewAssignmentPage({ searchParams }: Props) {
  const { classroom: classroomParam, set: setParam } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'teacher' && profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: ownedClassrooms }, { data: coTeaching }, { data: questions }] = await Promise.all([
    supabase
      .from('classrooms')
      .select('*')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('classroom_co_teachers')
      .select('classrooms(*)')
      .eq('user_id', user.id)
      .in('permission', ['admin', 'manage']),
    supabase
      .from('questions')
      .select('id, title, question_text, difficulty, question_type, visibility')
      .eq('created_by', user.id)
      .neq('visibility', 'pending')
      .order('created_at', { ascending: false }),
  ])

  const seen = new Set<string>()
  const classrooms: Classroom[] = []
  for (const c of [...(ownedClassrooms ?? []), ...((coTeaching ?? []).map((r: any) => r.classrooms).filter(Boolean))]) {
    if (!seen.has(c.id)) { seen.add(c.id); classrooms.push(c as Classroom) }
  }

  const preselectedClassroomId = classroomParam && seen.has(classroomParam) ? classroomParam : undefined
  const preselectedSetRow = setParam ? await getQuestionSet(setParam) : null
  const preselectedSet = preselectedSetRow ?? undefined

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">สร้างชุดข้อสอบ</h1>
        <p className="text-sm text-gray-500 mt-1">รวบรวมโจทย์และมอบหมายให้นักเรียน</p>
      </div>

      {classrooms.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          คุณยังไม่มีห้องเรียน กรุณา{' '}
          <a href="/classrooms/new" className="underline font-medium">สร้างห้องเรียน</a>
          {' '}ก่อน
        </div>
      )}

      <CreateAssignmentForm
        classrooms={classrooms}
        questions={(questions ?? []) as Question[]}
        preselectedClassroomId={preselectedClassroomId}
        preselectedSet={preselectedSet}
      />
    </div>
  )
}
