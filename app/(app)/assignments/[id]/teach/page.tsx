import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import { buildAssignmentAttempt } from '@/lib/assignment-attempt'
import { getTeachingBoards } from '@/lib/actions/math-work'
import { TeachingModeClient, type TeachingQuestionView } from '@/components/assignments/teaching-mode-client'
import type { Assignment, Question } from '@/lib/types'
import { backHrefFromSearchParams } from '@/lib/back-link'

export const metadata = { title: 'โหมดสอน — KorKru' }

export default async function AssignmentTeachingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const backHref = backHrefFromSearchParams(sp, `/assignments/${id}`)
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const [{ data: assignment }, { data: canManage }] = await Promise.all([
    supabase.from('assignments').select('*').eq('id', id).maybeSingle(),
    supabase.rpc('can_manage_math_tools_assignment', { p_assignment_id: id }),
  ])
  if (!assignment) notFound()
  const a = assignment as Assignment

  if (a.question_ids.length === 0) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <p className="text-lg font-semibold">งานนี้ยังไม่มีโจทย์สำหรับเปิดโหมดสอน</p>
        <Link href={backHref} className="mt-4 inline-block text-sm text-primary hover:underline">← กลับไปที่งาน</Link>
      </div>
    )
  }

  const { data: questionRows } = await supabase
    .from('questions')
    .select('*')
    .in('id', a.question_ids)
  if (!questionRows || questionRows.length === 0) notFound()

  const questionsById = new Map((questionRows as Question[]).map(question => [question.id, question]))
  const orderedQuestions = a.question_ids
    .map(questionId => questionsById.get(questionId))
    .filter((question): question is Question => Boolean(question))
  if (orderedQuestions.length === 0) notFound()

  // Teaching mode shows every authored question in assignment order. It still
  // generates one realistic set of random values and correct answers so a
  // teacher can solve the same concrete numbers that are visible on screen.
  const skeletons = buildAssignmentAttempt({
    ...a,
    shuffle_questions: false,
    shuffle_options: false,
    random_question_count: null,
  }, orderedQuestions)
  const skeletonByQuestion = new Map(skeletons.map(skeleton => [skeleton.question_id, skeleton]))
  const teachingQuestions: TeachingQuestionView[] = orderedQuestions.map(question => {
    const skeleton = skeletonByQuestion.get(question.id)
    return {
      ...question,
      randomValues: skeleton?.random_values ?? {},
      correctAnswer: skeleton?.correct_answer ?? '',
    }
  })

  const initial = await getTeachingBoards(id, teachingQuestions[0].id)

  return (
    <TeachingModeClient
      assignmentId={id}
      assignmentTitle={a.title}
      backHref={backHref}
      currentUserId={user.id}
      canManage={canManage === true}
      questions={teachingQuestions}
      questionsPerPage={a.questions_per_page ?? 1}
      initialBoards={initial && !('error' in initial) ? initial.boards : []}
      initialBoardsError={initial && 'error' in initial ? initial.error : undefined}
    />
  )
}
