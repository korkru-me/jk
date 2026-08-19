import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateAssignmentForm } from '@/components/assignments/create-assignment-form'
import type { AssignmentClassroomOption, AssignmentQuestionOption, AssignmentQuestionSetOption } from '@/components/assignments/create-assignment-form'

export const metadata = { title: 'สร้างงานที่มอบหมาย — KorKru' }

interface Props {
  searchParams: Promise<{ classroom?: string; set?: string }>
}

export default async function NewAssignmentPage({ searchParams }: Props) {
  const { classroom: classroomParam, set: setParam } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const preselectedSetQuery = setParam
    ? supabase
        .from('question_sets')
        .select('id, title, description, question_ids')
        .eq('id', setParam)
        .maybeSingle()
    : Promise.resolve({ data: null })

  const [
    { data: profile },
    { data: ownedClassrooms },
    { data: coTeaching },
    { data: questions },
    { data: questionSets },
    { data: preselectedSetRow },
  ] = await Promise.all([
    supabase.from('users').select('role').eq('id', user.id).single(),
    supabase
      .from('classrooms')
      .select('id, name, description, status, classroom_type')
      .eq('teacher_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    supabase
      .from('classroom_co_teachers')
      .select('classrooms(id, name, description, status, classroom_type)')
      .eq('user_id', user.id)
      .in('permission', ['admin', 'manage']),
    supabase
      .from('questions')
      .select('id, title, question_text, difficulty, question_type, requires_work_image, tags')
      .eq('created_by', user.id)
      .neq('visibility', 'pending')
      .order('created_at', { ascending: false }),
    supabase
      .from('question_sets')
      .select('id, title, description, question_ids')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false }),
    preselectedSetQuery,
  ])

  if (profile?.role !== 'teacher' && profile?.role !== 'admin') redirect('/dashboard')

  // Home Room classrooms are for the homeroom teacher's pastoral oversight,
  // not subject content — assignments (exams/exercises) only ever belong to
  // subject classrooms, so Home Room is excluded from this picker entirely.
  const seen = new Set<string>()
  const classrooms: AssignmentClassroomOption[] = []
  for (const c of [...(ownedClassrooms ?? []), ...((coTeaching ?? []).map((r: any) => r.classrooms).filter(Boolean))]) {
    if (c.status === 'active' && c.classroom_type !== 'homeroom' && !seen.has(c.id)) {
      seen.add(c.id)
      classrooms.push({ id: c.id, name: c.name, description: c.description })
    }
  }

  const preselectedClassroomId = classroomParam && seen.has(classroomParam) ? classroomParam : undefined
  const preselectedSet = (preselectedSetRow ?? undefined) as AssignmentQuestionSetOption | undefined

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">สร้างงานที่มอบหมาย</h1>
        <p className="text-sm text-gray-500 mt-1">รวบรวมโจทย์ทำเป็นข้อสอบหรือแบบฝึกหัด แล้วมอบหมายให้นักเรียน</p>
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
        questions={(questions ?? []) as unknown as AssignmentQuestionOption[]}
        questionSets={(questionSets ?? []) as AssignmentQuestionSetOption[]}
        preselectedClassroomId={preselectedClassroomId}
        preselectedSet={preselectedSet}
      />
    </div>
  )
}
