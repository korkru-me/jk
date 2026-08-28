import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { notFound, redirect } from 'next/navigation'
import { ExamClient } from '@/components/exam/exam-client'
import { buildAssignmentAttempt } from '@/lib/assignment-attempt'
import { parseSections } from '@/lib/question-set-sections'
import type { Assignment, MCQOption, Question, MatchingPair } from '@/lib/types'

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
    // Positions in the question's own option list, kept through the shuffle:
    // an mcq answer is recorded as MCQ:<position>, so the preview has to send
    // the same positions the real exam route does or it grades the wrong
    // option. See the MCQ: branch in lib/assignment-attempt.ts.
    const optionPositions: number[] = s.option_order
      ?? ((q.mcq_options ?? []) as unknown[]).map((_, i) => i)

    const orderedOptions =
      q.question_type === 'mcq' && q.mcq_options
        ? optionPositions
            .filter(i => (q.mcq_options as MCQOption[])[i])
            .map(i => ({ ...(q.mcq_options as MCQOption[])[i], index: i }))
        : null

    // Matching splits its two columns apart the same way the exam route does,
    // so the preview shows a pairing exercise rather than the answer key.
    const pairs = (q.mcq_options ?? []) as unknown as MatchingPair[]
    const matching = q.question_type === 'matching'
      ? {
          prompts: pairs.map(p => ({ left_text: p.left_text, left_image: p.left_image })),
          options: optionPositions
            .filter(i => pairs[i])
            .map(i => ({ right_text: pairs[i].right_text, right_image: pairs[i].right_image })),
        }
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
        mcq_options: matching
          ? matching.prompts
          : orderedOptions
            ? orderedOptions.map(o => ({ text: o.text, image_url: o.image_url, index: o.index }))
            : null,
        matching_options: matching?.options ?? null,
        variables: q.variables,
        answer_parts: q.answer_parts,
        extra_data: q.extra_data,
        image_urls: q.image_urls,
        answer_tolerance: q.answer_tolerance,
      },
    }
  })

  const examConfig = {
    proctoringEnabled: false,
    isFullscreenEnforced: false,
    blockClipboard: false,
    watermarkText: a.exam_watermark_enabled ? 'ตัวอย่างผู้เข้าสอบ • PREVIEW' : null,
    isWorkImageEnforced: a.require_work_image ?? false,
  }

  return (
    <div className="h-full flex flex-col pt-9">
      <ExamClient
        submissionId={`preview-${id}`}
        answers={previewAnswers as any}
        durationMinutes={a.duration_minutes}
        startedAt={new Date().toISOString()}
        config={examConfig}
        sections={a.show_sections === false ? [] : parseSections(a.sections)}
        previewMode
        previewReturnHref={`/assignments/${id}`}
      />
    </div>
  )
}
