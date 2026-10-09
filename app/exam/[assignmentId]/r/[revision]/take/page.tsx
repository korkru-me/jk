import { redirect, notFound } from 'next/navigation'
import { authorizeWaitingExam, readWaitingExamData, type SebWaitingRouteParams } from '@/lib/seb-waiting.server'
import { getSebExamCsrfToken } from '@/lib/seb-exam-context.server'
import { sebExamBasePath } from '@/lib/seb-exam-transport-policy'
import { getExamTakingData } from '@/lib/exam-taking'
import { parseSections } from '@/lib/question-set-sections'
import { WaitingExamRunner } from '@/components/exam/seb-exam-runner'

export const dynamic = 'force-dynamic'
export default async function TakePage({ params }: { params: Promise<SebWaitingRouteParams> }) {
  const access = await authorizeWaitingExam(await params)
  if (!access.ok) notFound()
  const basePath = sebExamBasePath(access.context)
  const waiting = await readWaitingExamData({ assignmentId: access.context.assignmentId, revision: String(access.context.revision) })
  if (!waiting.ok && waiting.reason === 'profile') redirect(`${basePath}/profile`)
  if (!waiting.ok) notFound()
  if (waiting.view.phase === 'submitted') redirect(`${basePath}/submitted`)
  // Includes the per-student extension/global end time as well as duration.
  // This metadata guard runs before any question/answer DTO is materialized.
  if (waiting.view.phase !== 'active' || !waiting.view.canResume || waiting.view.needsFinalization) redirect(`${basePath}/waiting`)
  const { data: receipt, error } = await access.admin.from('submissions')
    .select('id, status, exam_access_mode, seb_config_revision')
    .eq('assignment_id', access.context.assignmentId).eq('student_id', access.user.id)
    .order('attempt_number', { ascending: false }).limit(1).maybeSingle()
  if (error) notFound()
  // GET is deliberately read-only. It cannot allocate an attempt, draw the
  // first question or restart a timer after a lost start response.
  if (!receipt) redirect(`${basePath}/waiting`)
  if (receipt.exam_access_mode !== 'seb' || receipt.seb_config_revision !== access.context.revision) notFound()
  if (receipt.status !== 'in_progress') redirect(`${basePath}/submitted`)
  const exam = await getExamTakingData(receipt.id)
  const csrf = getSebExamCsrfToken(access.context)
  if (!exam || !csrf || exam.answers.length === 0) redirect(`${basePath}/waiting`)
  const { assignment, submission, answers, artifacts } = exam
  if (waiting.view.closesAt && Date.parse(waiting.view.closesAt) <= Date.now()) redirect(`${basePath}/waiting`)
  if (assignment.completion_rule === 'streak') redirect(`${basePath}/waiting`)
  if (assignment.duration_minutes !== null && Date.parse(submission.started_at) + assignment.duration_minutes * 60_000 <= Date.now()) redirect(`${basePath}/waiting`)
  return <WaitingExamRunner basePath={basePath} csrf={csrf} submissionId={submission.id} storageOwnerId={submission.student_id}
      answers={answers} initialWorkArtifacts={artifacts} durationMinutes={assignment.duration_minutes} startedAt={submission.started_at}
      config={{
        proctoringEnabled: assignment.proctoring_enabled,
        isFullscreenEnforced: false, blockClipboard: assignment.block_clipboard,
        watermarkText: assignment.watermark_text, isWorkImageEnforced: assignment.require_work_image ?? false,
        instantCheck: false, instantCheckAnswerKey: false,
        calculatorEnabled: assignment.calculator_enabled, scratchpadEnabled: assignment.scratchpad_enabled,
      }}
      sections={assignment.show_sections === false ? [] : parseSections(assignment.sections)} questionsPerPage={assignment.questions_per_page}
    />
}
