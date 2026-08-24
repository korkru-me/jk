import { redirect } from 'next/navigation'
import { startSubmission } from '@/lib/actions/submissions'
import { ExamClient, type ExamConfig } from '@/components/exam/exam-client'
import { AccessCodeForm } from '@/components/exam/access-code-form'
import { parseSections } from '@/lib/question-set-sections'
import { getExamTakingData } from '@/lib/exam-taking'

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

  const exam = await getExamTakingData(result.submissionId!)
  if (!exam) redirect('/assignments')
  const { assignment, submission, answers } = exam

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
        answers={answers}
        durationMinutes={assignment.duration_minutes}
        startedAt={submission.started_at}
        config={examConfig}
        sections={assignment.show_sections === false ? [] : parseSections(assignment.sections)}
      />
    </div>
  )
}
