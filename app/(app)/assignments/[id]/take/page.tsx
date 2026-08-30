import { redirect } from 'next/navigation'
import { startSubmission } from '@/lib/actions/submissions'
import { ExamClient, type ExamConfig } from '@/components/exam/exam-client'
import { AccessCodeForm } from '@/components/exam/access-code-form'
import { parseSections } from '@/lib/question-set-sections'
import { getExamTakingData } from '@/lib/exam-taking'
import { SebLaunchGate } from '@/components/exam/seb-launch-gate'
import { readSebEnvironment } from '@/lib/seb'

export const metadata = { title: 'ทำข้อสอบ — KorKru' }

export default async function TakeExamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sebChallenge?: string | string[] }>
}) {
  const { id } = await params
  const rawChallenge = (await searchParams).sebChallenge
  const sebChallenge = typeof rawChallenge === 'string' ? rawChallenge : undefined

  // Start or resume submission
  const result = await startSubmission(id, undefined, sebChallenge)

  if ('unauthenticated' in result && result.unauthenticated) {
    redirect('/login')
  }

  if (result.requiresAccessCode) {
    return <AccessCodeForm assignmentId={id} />
  }

  if ('requiresSecureBrowser' in result && result.requiresSecureBrowser) {
    if (result.challenge && result.challenge !== sebChallenge) {
      redirect(`/assignments/${id}/take?sebChallenge=${encodeURIComponent(result.challenge)}`)
    }
    return (
      <SebLaunchGate
        assignmentId={id}
        challenge={result.challenge ?? ''}
        configUrl={process.env.NEXT_PUBLIC_SEB_CONFIG_URL?.trim() || null}
        configured={result.sebConfigured === true && readSebEnvironment() !== null}
      />
    )
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

  const examConfig: ExamConfig = {
    proctoringEnabled: assignment.proctoring_enabled,
    // SEB already owns OS-level kiosk/fullscreen behavior. Asking the DOM to
    // enter fullscreen on top of it causes false overlays on iOS/macOS.
    isFullscreenEnforced: assignment.fullscreen_required && !assignment.secure_browser_verified,
    blockClipboard: assignment.block_clipboard,
    watermarkText: assignment.watermark_text,
    isWorkImageEnforced: assignment.require_work_image ?? false,
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
