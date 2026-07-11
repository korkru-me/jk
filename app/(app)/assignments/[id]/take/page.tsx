import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { startSubmission } from '@/lib/actions/submissions'
import { ExamClient, type ExamConfig } from '@/components/exam/exam-client'

export const metadata = { title: 'ทำข้อสอบ — KorKru' }

export default async function TakeExamPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Start or resume submission
  const result = await startSubmission(id)

  if (result.error) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <p className="text-4xl mb-4">⚠️</p>
        <p className="text-lg font-semibold text-gray-900">{result.error}</p>
        <a href="/assignments" className="text-blue-600 hover:underline text-sm mt-4 inline-block">
          ← กลับ
        </a>
      </div>
    )
  }

  if (result.alreadySubmitted) {
    redirect(`/submissions/${result.submissionId}`)
  }

  // Load submission + answers + questions
  const { data: submission } = await supabase
    .from('submissions')
    .select('*, assignments(title, duration_minutes, end_at)')
    .eq('id', result.submissionId!)
    .single()

  const { data: answers } = await supabase
    .from('submission_answers')
    .select('*, questions(title, question_text, question_type, answer_unit, mcq_options, variables, answer_parts, extra_data, image_urls)')
    .eq('submission_id', result.submissionId!)
    .order('created_at')

  const assignment = (submission as any).assignments

  // Mock teacher config — replace with DB columns when added to schema
  const examConfig: ExamConfig = {
    isCalculatorEnabled: true,
    isFullscreenEnforced: false,
  }

  return (
    <div className="h-full flex flex-col">
      <ExamClient
        submissionId={result.submissionId!}
        answers={(answers ?? []) as any}
        durationMinutes={assignment.duration_minutes}
        startedAt={submission!.started_at}
        config={examConfig}
      />
    </div>
  )
}
