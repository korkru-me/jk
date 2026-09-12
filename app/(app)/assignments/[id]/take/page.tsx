import { redirect } from 'next/navigation'
import { drawNextStreakQuestion, startSubmission } from '@/lib/actions/submissions'
import { ExamClient, type ExamConfig } from '@/components/exam/exam-client'
import { AccessCodeForm } from '@/components/exam/access-code-form'
import { parseSections } from '@/lib/question-set-sections'
import { getExamTakingData } from '@/lib/exam-taking'
import { SecureExamLaunchGate } from '@/components/exam/secure-exam-launch-gate'
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
      <SecureExamLaunchGate
        assignmentId={id}
        challenge={result.challenge ?? ''}
        configUrl={process.env.NEXT_PUBLIC_SEB_CONFIG_URL?.trim() || null}
        configured={result.sebConfigured === true && readSebEnvironment() !== null}
        androidMonitoredAllowed={result.androidMonitoredAllowed === true}
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

  let exam = await getExamTakingData(result.submissionId!)
  if (!exam) redirect('/assignments')

  // A "ถูกติดต่อกัน" attempt is created with no ข้อ at all — its length is an
  // outcome, so startSubmission has nothing to freeze. The first ข้อ is drawn
  // here, through the same action the ข้อต่อไป button uses, so there is one
  // place that decides which ข้อ a student gets and one that builds the row.
  // Idempotent, so a reload finds the ข้อ already waiting instead of skipping
  // one the student never saw.
  if (exam.assignment.completion_rule === 'streak' && exam.answers.length === 0) {
    const drawn = await drawNextStreakQuestion(result.submissionId!)
    if (drawn && 'error' in drawn) {
      return (
        <div className="max-w-md mx-auto mt-16 text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-lg font-semibold text-foreground">{drawn.error}</p>
          <a href="/assignments" className="text-primary hover:underline text-sm mt-4 inline-block">
            ← กลับ
          </a>
        </div>
      )
    }
    exam = await getExamTakingData(result.submissionId!)
    if (!exam) redirect('/assignments')
  }

  const { assignment, submission, answers, artifacts } = exam

  // Nothing to show and nothing to draw: a คลัง emptied out after the attempt
  // opened. Better to say so than to render an exam page with no ข้อ on it.
  if (answers.length === 0) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <p className="text-4xl mb-4">📭</p>
        <p className="text-lg font-semibold text-foreground">ยังไม่มีโจทย์ให้ทำในงานนี้</p>
        <p className="text-sm text-muted-foreground mt-1">กรุณาแจ้งครูผู้สอน</p>
        <a href="/assignments" className="text-primary hover:underline text-sm mt-4 inline-block">
          ← กลับ
        </a>
      </div>
    )
  }

  const examConfig: ExamConfig = {
    proctoringEnabled: assignment.proctoring_enabled,
    // SEB already owns OS-level kiosk/fullscreen behavior. Asking the DOM to
    // enter fullscreen on top of it causes false overlays on iOS/macOS.
    isFullscreenEnforced: assignment.fullscreen_required && !assignment.secure_browser_verified,
    blockClipboard: assignment.block_clipboard,
    watermarkText: assignment.watermark_text,
    isWorkImageEnforced: assignment.require_work_image ?? false,
    // แบบฝึกหัด: ตรวจทีละข้อระหว่างทำได้ ไม่ต้องรอกดส่งตอนจบเหมือนข้อสอบ
    instantCheck: assignment.instant_check,
    instantCheckAnswerKey: assignment.instant_check_answer_key,
    calculatorEnabled: assignment.calculator_enabled,
    scratchpadEnabled: assignment.scratchpad_enabled,
  }

  return (
    <div className="h-full flex flex-col">
      <ExamClient
        submissionId={result.submissionId!}
        storageOwnerId={submission.student_id}
        answers={answers}
        initialWorkArtifacts={artifacts}
        durationMinutes={assignment.duration_minutes}
        startedAt={submission.started_at}
        config={examConfig}
        sections={assignment.show_sections === false ? [] : parseSections(assignment.sections)}
        questionsPerPage={assignment.questions_per_page}
        // Only a "ถูกติดต่อกัน" งาน gets this, and its absence is what keeps
        // every other attempt on the paging layout untouched. askedCount is
        // the rows handed out so far — the attempt's length is not decided
        // until the run is.
        streak={assignment.completion_rule === 'streak' && assignment.streak_target
          ? {
              target: assignment.streak_target,
              current: submission.current_streak,
              best: submission.best_streak,
              reached: submission.streak_reached,
              askedCount: answers.length,
              questionCap: assignment.streak_question_cap,
            }
          : undefined}
      />
    </div>
  )
}
