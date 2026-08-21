import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { startSubmission } from '@/lib/actions/submissions'
import { ExamClient, type ExamConfig } from '@/components/exam/exam-client'
import { AccessCodeForm } from '@/components/exam/access-code-form'

export const metadata = { title: 'ทำข้อสอบ — KorKru' }

export default async function TakeExamPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Start or resume submission
  const result = await startSubmission(id)

  if ('unauthenticated' in result && result.unauthenticated) {
    redirect('/login')
  }

  if (result.requiresAccessCode) {
    return <AccessCodeForm assignmentId={id} />
  }

  if (result.error) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <p className="text-4xl mb-4">⚠️</p>
        <p className="text-lg font-semibold text-foreground">{result.error}</p>
        <a href="/assignments" className="text-primary hover:underline text-sm mt-4 inline-block">
          ← กลับ
        </a>
      </div>
    )
  }

  if (result.alreadySubmitted) {
    redirect(`/submissions/${result.submissionId}`)
  }

  // The submission header and its answer snapshots are independent once we
  // know the attempt id. Load them together instead of paying two serial
  // database round trips on every resume/reload.
  const supabase = await createClient()
  const [submissionRes, answersRes] = await Promise.all([
    supabase
      .from('submissions')
      .select('*, assignments(title, duration_minutes, end_at, require_work_image)')
      .eq('id', result.submissionId!)
      .single(),
    supabase
      .from('submission_answers')
      .select('*, questions(title, question_text, question_type, answer_unit, mcq_options, variables, answer_parts, extra_data, image_urls, requires_work_image)')
      .eq('submission_id', result.submissionId!)
      .order('order_index'),
  ])
  const submission = submissionRes.data
  const answers = answersRes.data

  // Reorder options per the persisted shuffle (option_order) and strip the
  // answer key — the exam-taking client must never receive it before the
  // student submits.
  const safeAnswers = (answers ?? []).map((a: any) => {
    const q = a.questions
    if (!q?.mcq_options) return a
    const order: number[] | null = a.option_order

    if (q.question_type === 'mcq') {
      const ordered = order ? order.map(i => q.mcq_options[i]) : q.mcq_options
      return {
        ...a,
        questions: {
          ...q,
          mcq_options: ordered.map((o: any) => ({ text: o.text, image_url: o.image_url })),
        },
      }
    }

    // Matching pairs are stored side by side in mcq_options, so sending them
    // as-is would hand over the answer key: pair i's right_text *is* the
    // answer for prompt i. The two columns are split apart instead, and only
    // the right-hand one is shuffled (option_order), leaving the prompts in
    // their authored order — which is the order grading expects them back in.
    if (q.question_type === 'matching') {
      const pairs = q.mcq_options as any[]
      const rightOrder = order ?? pairs.map((_, i) => i)
      return {
        ...a,
        questions: {
          ...q,
          mcq_options: pairs.map((p: any) => ({ left_text: p.left_text, left_image: p.left_image })),
          matching_options: rightOrder
            .filter(i => pairs[i])
            .map(i => ({ right_text: pairs[i].right_text, right_image: pairs[i].right_image })),
        },
      }
    }

    return a
  })

  const assignment = (submission as any).assignments

  // Mock teacher config — replace with DB columns when added to schema
  const examConfig: ExamConfig = {
    isCalculatorEnabled: true,
    isFullscreenEnforced: false,
    isWorkImageEnforced: assignment.require_work_image ?? true,
  }

  return (
    <div className="h-full flex flex-col">
      <ExamClient
        submissionId={result.submissionId!}
        answers={safeAnswers as any}
        durationMinutes={assignment.duration_minutes}
        startedAt={submission!.started_at}
        config={examConfig}
      />
    </div>
  )
}
