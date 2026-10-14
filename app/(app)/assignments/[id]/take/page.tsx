import { redirect } from 'next/navigation'
import { readSubmissionEntry } from '@/lib/actions/submissions'
import { ExamClient, type ExamConfig } from '@/components/exam/exam-client'
import { AccessCodeForm } from '@/components/exam/access-code-form'
import { parseSections } from '@/lib/question-set-sections'
import { getExamTakingData } from '@/lib/exam-taking'
import { SecureExamLaunchGate } from '@/components/exam/secure-exam-launch-gate'
import { ExamWaitingClient } from '@/components/exam/exam-waiting-client'
import { waitingResumeId } from '@/lib/exam-waiting-room'
import { isAttemptExpired } from '@/lib/grading'

export const metadata = { title: 'ทำข้อสอบ — KorKru' }

export default async function TakeExamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sebChallenge?: string | string[]; attempt?: string | string[] }>
}) {
  const { id } = await params
  const query = await searchParams
  const rawChallenge = query.sebChallenge
  const sebChallenge = typeof rawChallenge === 'string' ? rawChallenge : undefined

  // Exam/exercise GET/prefetch never creates or grades an attempt. Only the
  // waiting room's explicit POST starts one.
  const result = await readSubmissionEntry(id, sebChallenge)

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
        configUrl={result.configUrl ?? null}
        configured={result.sebConfigured === true}
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

  // A bare receipt from an old entry implementation must not restore the
  // former start-on-GET path. Only current, authorized waiting metadata counts.
  if (!result.waitingRoom) redirect('/assignments')
  const submissionId = waitingResumeId(result.waitingRoom, query.attempt)
  if (!submissionId) {
    return <ExamWaitingClient key={`${id}:${result.waitingRoom.previousSubmissionId ?? 'new'}`}
      assignmentId={id} summary={result.waitingRoom} sebChallenge={sebChallenge} />
  }
  const exam = await getExamTakingData(submissionId)
  if (!exam) redirect(`/assignments/${id}/take`)
  if (result.waitingRoom) {
    // A slow safe-data read may cross the timer/deadline boundary. Do not
    // serialize the questions then: show question-free recovery instead.
    const expired = isAttemptExpired(exam.submission.started_at, exam.assignment.duration_minutes)
    const deadlinePassed = result.waitingRoom.endAt != null && new Date(result.waitingRoom.endAt).getTime() < Date.now()
    if (expired || deadlinePassed) {
      return <ExamWaitingClient assignmentId={id} sebChallenge={sebChallenge}
        summary={{ ...result.waitingRoom, activeSubmissionId: null, expired: expired || deadlinePassed,
          blockedReason: null }} />
    }
  }

  // A streak has variable length. Initialize its first row only in the
  // explicit waiting POST for both exams and exercises, never on GET.
  if (result.waitingRoom && exam.assignment.completion_rule === 'streak' && exam.answers.length === 0) {
    // An interrupted POST may have opened a header before drawing. Resume it
    // deliberately from the waiting room; GET/prefetch must not draw or grade.
    return <ExamWaitingClient assignmentId={id} summary={result.waitingRoom} sebChallenge={sebChallenge} />
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
    assignmentType: assignment.type,
    proctoringEnabled: assignment.proctoring_enabled,
    // SEB already owns OS-level kiosk/fullscreen behavior. Asking the DOM to
    // enter fullscreen on top of it causes false overlays on iOS/macOS.
    isFullscreenEnforced: assignment.fullscreen_required && !assignment.secure_browser_verified,
    blockClipboard: assignment.block_clipboard,
    watermarkText: assignment.watermark_text,
    solutionWatermark: assignment.solution_watermark,
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
        submissionId={submissionId}
        storageOwnerId={submission.student_id}
        answers={answers}
        initialWorkArtifacts={artifacts}
        durationMinutes={assignment.duration_minutes}
        startedAt={submission.started_at}
        expiresAt={result.waitingRoom.expiresAt}
        serverNow={new Date().toISOString()}
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
