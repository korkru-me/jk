import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { notFound, redirect } from 'next/navigation'
import { ExamClient } from '@/components/exam/exam-client'
import { buildAssignmentAttempt } from '@/lib/assignment-attempt'
import type { Assignment, MCQOption, Question } from '@/lib/types'

export const metadata = { title: 'ตัวอย่างมุมมองนักเรียน — KorKru' }

export default async function AssignmentPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // No explicit ownership check — RLS (assignments_org_teacher_all /
  // assignments_co_teacher_all) already scopes this row to a teacher who may
  // manage the assignment; a null result means unauthorized.
  const { data: assignment } = await supabase
    .from('assignments')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!assignment) notFound()
  const a = assignment as Assignment

  if (a.question_ids.length === 0) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <p className="text-lg font-semibold text-foreground">ชุดข้อสอบนี้ยังไม่มีโจทย์</p>
        <a href={`/assignments/${id}`} className="text-primary hover:underline text-sm mt-4 inline-block">
          ← กลับ
        </a>
      </div>
    )
  }

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .in('id', a.question_ids)

  if (!questions || questions.length === 0) notFound()

  // Same computation real students get (correct answers, per-attempt
  // question/option shuffle, max_score) — just never persisted to a
  // submission row, so previewing costs nothing and leaves no trace.
  const skeletons = buildAssignmentAttempt(a, questions as Question[])
  const questionsById = new Map((questions as Question[]).map(q => [q.id, q]))

  const previewAnswers = skeletons.map(s => {
    const q = questionsById.get(s.question_id) as Question
    const orderedOptions: MCQOption[] | null =
      q.question_type === 'mcq' && q.mcq_options
        ? (s.option_order ? s.option_order.map(i => (q.mcq_options as MCQOption[])[i]) : q.mcq_options)
        : null

    return {
      id: `preview-${s.question_id}`,
      question_id: s.question_id,
      random_values: s.random_values,
      correct_answer: s.correct_answer,
      student_answer: null,
      work_images: [],
      // Only needed so the preview can grade itself client-side after
      // submit (see ExamClient's previewMode) — the real exam-taking route
      // never sends this since grading there happens server-side.
      max_score: s.max_score,
      questions: {
        title: q.title,
        question_text: q.question_text,
        question_type: q.question_type,
        answer_unit: q.answer_unit,
        // Same strip as the real exam-taking route — never send is_correct
        // to a client before submission.
        mcq_options: orderedOptions ? orderedOptions.map(o => ({ text: o.text })) : null,
        variables: q.variables,
        answer_parts: q.answer_parts,
        extra_data: q.extra_data,
        image_urls: q.image_urls,
        requires_work_image: q.requires_work_image,
        answer_tolerance: q.answer_tolerance,
      },
    }
  })

  const examConfig = {
    isCalculatorEnabled: true,
    isFullscreenEnforced: false,
    isWorkImageEnforced: a.require_work_image ?? true,
  }

  return (
    <div className="h-full flex flex-col pt-9">
      <ExamClient
        submissionId={`preview-${id}`}
        answers={previewAnswers as any}
        durationMinutes={a.duration_minutes}
        startedAt={new Date().toISOString()}
        config={examConfig}
        previewMode
        previewReturnHref={`/assignments/${id}`}
      />
    </div>
  )
}
