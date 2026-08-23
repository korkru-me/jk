import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { fetchBankQuestions } from '@/lib/question-bank'
import { redirect } from 'next/navigation'
import { CreateAssignmentForm } from '@/components/assignments/create-assignment-form'
import type { AssignmentClassroomOption, AssignmentQuestionSetOption } from '@/components/assignments/create-assignment-form'
import { filterSectionsToQuestions, parseSections, questionIdsForSections } from '@/lib/question-set-sections'

export const metadata = { title: 'สร้างงานที่มอบหมาย — KorKru' }

interface Props {
  searchParams: Promise<{ classroom?: string; set?: string; sections?: string }>
}

export default async function NewAssignmentPage({ searchParams }: Props) {
  const { classroom: classroomParam, set: setParam, sections: sectionsParam } = await searchParams

  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const preselectedSetQuery = setParam
    ? supabase
        .from('question_sets')
        .select('id, title, description, question_ids, sections')
        .eq('id', setParam)
        .maybeSingle()
    : Promise.resolve({ data: null })

  const [
    { data: profile },
    { data: ownedClassrooms },
    { data: coTeaching },
    questions,
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
    fetchBankQuestions(supabase, user.id),
    supabase
      .from('question_sets')
      .select('id, title, description, question_ids, sections')
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
  let preselectedSet = (preselectedSetRow ?? undefined) as AssignmentQuestionSetOption | undefined

  // ?sections=... — assigning only part of a แฟ้ม ("this week, projectiles
  // only"). Narrowed here rather than in the client so an unknown section id
  // simply selects nothing instead of quietly falling back to the whole แฟ้ม.
  if (preselectedSet && sectionsParam) {
    const wanted = sectionsParam.split(',').map(id => id.trim()).filter(Boolean)
    const allSections = parseSections(preselectedSet.sections)
    const chosen = allSections.filter(section => wanted.includes(section.id))
    if (chosen.length > 0) {
      // Ordered by the แฟ้ม and deduped: a question two of the chosen
      // แฟ้มย่อย both hold must be assigned once.
      const questionIds = questionIdsForSections(allSections, wanted, preselectedSet.question_ids)
      preselectedSet = {
        ...preselectedSet,
        // One แฟ้มย่อย names the งาน; several keep the แฟ้ม's own name.
        title: chosen.length === 1 && chosen[0].title
          ? `${preselectedSet.title} — ${chosen[0].title}`
          : preselectedSet.title,
        question_ids: questionIds,
        sections: filterSectionsToQuestions(chosen, questionIds),
      }
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">สร้างงานที่มอบหมาย</h1>
        <p className="text-sm text-muted-foreground mt-1">รวบรวมโจทย์ทำเป็นข้อสอบหรือแบบฝึกหัด แล้วมอบหมายให้นักเรียน</p>
      </div>

      {classrooms.length === 0 && (
        <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 text-sm text-warning">
          คุณยังไม่มีห้องเรียน กรุณา{' '}
          <a href="/classrooms/new" className="underline font-medium">สร้างห้องเรียน</a>
          {' '}ก่อน
        </div>
      )}

      <CreateAssignmentForm
        classrooms={classrooms}
        questions={questions}
        questionSets={(questionSets ?? []) as AssignmentQuestionSetOption[]}
        preselectedClassroomId={preselectedClassroomId}
        preselectedSet={preselectedSet}
      />
    </div>
  )
}
