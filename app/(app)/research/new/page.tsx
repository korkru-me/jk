import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { parseSections, filterSectionsToQuestions } from '@/lib/question-set-sections'
import {
  researchQuestionMaxScore,
  type ResearchClassroomOption,
  type ResearchQuestionOption,
  type ResearchQuestionSetOption,
} from '@/lib/education-research'
import type { Question } from '@/lib/types'
import { ResearchProjectWizard } from './_components/research-project-wizard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'สร้างโครงการวิจัย — KorKru' }

type ResearchQuestionRow = Pick<
  Question,
  | 'id'
  | 'title'
  | 'question_text'
  | 'question_type'
  | 'difficulty'
  | 'tags'
  | 'extra_data'
  | 'answer_parts'
  | 'mcq_options'
>

export default async function NewResearchProjectPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const questionFields = 'id, title, question_text, question_type, difficulty, tags, extra_data, answer_parts, mcq_options'
  const questionsPromise = fetchAllRows<ResearchQuestionRow>((from, to) =>
    supabase
      .from('questions')
      .select(questionFields)
      .eq('created_by', user.id)
      .eq('is_research_snapshot', false)
      .neq('visibility', 'pending')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
  )

  const [
    { data: profile },
    { data: ownedClassrooms },
    { data: coTeachingRows },
    questionResult,
    { data: setRows },
  ] = await Promise.all([
    supabase.from('users').select('role').eq('id', user.id).maybeSingle(),
    supabase
      .from('classrooms')
      .select('id, name, description, status, classroom_type, classroom_students(count)')
      .eq('teacher_id', user.id)
      .eq('status', 'active')
      .eq('classroom_type', 'subject')
      .order('created_at', { ascending: false }),
    supabase
      .from('classroom_co_teachers')
      .select('classrooms(id, name, description, status, classroom_type, classroom_students(count))')
      .eq('user_id', user.id)
      .in('permission', ['admin', 'manage']),
    questionsPromise,
    supabase
      .from('question_sets')
      .select('id, title, description, question_ids, sections')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false }),
  ])

  if (profile?.role !== 'teacher' && profile?.role !== 'admin') redirect('/dashboard')

  const classroomById = new Map<string, ResearchClassroomOption>()
  const classroomRows = [
    ...(ownedClassrooms ?? []),
    ...((coTeachingRows ?? []).map(row => row.classrooms).filter(Boolean)),
  ] as Array<{
    id: string
    name: string
    description: string | null
    status: string
    classroom_type: string
    classroom_students: Array<{ count: number }>
  }>

  for (const classroom of classroomRows) {
    if (classroom.status !== 'active' || classroom.classroom_type !== 'subject') continue
    classroomById.set(classroom.id, {
      id: classroom.id,
      name: classroom.name,
      description: classroom.description,
      student_count: classroom.classroom_students?.[0]?.count ?? 0,
    })
  }

  const questions: ResearchQuestionOption[] = questionResult.rows.map(question => ({
    id: question.id,
    title: question.title,
    question_text: question.question_text,
    question_type: question.question_type,
    difficulty: question.difficulty,
    tags: question.tags,
    max_score: researchQuestionMaxScore(question),
  }))
  const availableQuestionIds = new Set(questions.map(question => question.id))

  const questionSets: ResearchQuestionSetOption[] = (setRows ?? []).flatMap(set => {
    const validIds = set.question_ids.filter((id: string) => availableQuestionIds.has(id))
    if (validIds.length === 0) return []
    return [{
      id: set.id,
      title: set.title,
      description: set.description,
      question_ids: validIds,
      sections: filterSectionsToQuestions(parseSections(set.sections), validIds),
    }]
  })

  return (
    <ResearchProjectWizard
      classrooms={[...classroomById.values()]}
      questions={questions}
      questionSets={questionSets}
    />
  )
}

