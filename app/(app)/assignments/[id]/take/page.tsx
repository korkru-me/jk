import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { startSubmission } from '@/lib/actions/submissions'
import { ExamClient } from '@/components/exam/exam-client'

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
    .select('*, questions(title, question_text, question_type, answer_unit, mcq_options, variables)')
    .eq('submission_id', result.submissionId!)
    .order('created_at')

  const assignment = (submission as any).assignments

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-2xl mx-auto mb-6">
        <h1 className="text-xl font-bold text-gray-900">{assignment.title}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {(answers ?? []).length} ข้อ
          {assignment.duration_minutes && ` · ${assignment.duration_minutes} นาที`}
        </p>
      </div>

      <ExamClient
        submissionId={result.submissionId!}
        answers={(answers ?? []) as any}
        durationMinutes={assignment.duration_minutes}
        startedAt={submission!.started_at}
      />
    </div>
  )
}
