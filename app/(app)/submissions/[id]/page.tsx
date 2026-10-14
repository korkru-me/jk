import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/auth/server'
import { canManageAssignment } from '@/lib/auth/assignment-access'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { SubmissionAnswerReview, QuestionText } from '@/components/student/submission-answer-review'
import { SubmissionScoreSummary } from '@/components/student/submission-score-summary'
import { SolutionWatermark } from '@/components/student/solution-watermark'
import { loadStudentSolutionWatermark } from '@/lib/solution-watermark-server'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, ChevronLeft, ChevronRight, RotateCcw, School } from 'lucide-react'
import { computePassed, formatPassingThreshold } from '@/lib/grading'
import { SCORE_STRATEGY_LABELS, rescaleToDisplayMax, officialSubmissionsByStudent } from '@/lib/scoring'
import { sortStudents } from '@/lib/student-sort'
import { ScoreEditor } from '@/components/assignments/score-editor'
import { Card } from '@/components/ui/card'
import { canStudentReviewAnswers, canStudentViewScore } from '@/lib/result-visibility'
import { MATH_WORK_BUCKET } from '@/lib/math-work'
import { shouldOfferSebExit } from '@/lib/seb-exit'
import { attemptItemHasSolution } from '@/lib/attempt-solutions'
import { loadAttemptSolutionItems, loadSolutionRelease } from '@/lib/attempt-solutions-server'
import { type SolutionRelease } from '@/lib/solution-release'
import { completionAttemptLimit, findPassingCompletion } from '@/lib/assignment-completion'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import {
  AttemptSolutionShortcut, AttemptSolutionsButton, AttemptSolutionsProvider,
} from '@/components/student/attempt-solutions'
import { SolutionLockNotice } from '@/components/student/solution-lock-notice'

// This page renders on the server, which runs in UTC on Vercel: a bare
// toLocaleString('th-TH') printed every time seven hours early, next to the
// เฉลยวิธีทำ lock notice that already reads Thai time.
const thaiDateTime = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
})

const PART_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ']

export const metadata = { title: 'ผลการสอบ — KorKru' }

/**
 * Puts the options back in the order the student saw them, keeping each one's
 * position in the question's own list alongside — the answer was recorded as
 * that position (MCQ:<index>), so the review needs it to say which option was
 * picked.
 */
function reorderOptions<T>(options: T[] | null, order: number[] | null): (T & { index: number })[] | null {
  if (!options) return null
  const positions = order ?? options.map((_, i) => i)
  return positions.filter(i => options[i]).map(i => ({ ...options[i], index: i }))
}

// A row nobody has decided yet. Auto-grading leaves is_correct null exactly
// when a person still has to read the answer: a whole-manual fill-blank, a
// mix of manual + auto blanks where the auto ones are already scored, a
// composite with a manual part, and an essay — which has no answer key at
// all (see the essay branch in gradeAnswer). A submitted row is graded, so
// null here means pending review, never "not looked at yet"; an attempt
// still in progress is redirected away above.
function isPendingTeacherReview(a: { is_correct: boolean | null }): boolean {
  return a.is_correct === null
}

export default async function SubmissionResultPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()

  // Student assignment rows are intentionally not readable directly because
  // they contain access_code. Use an exact owner filter through the trusted
  // server client, then attach only the small answer summary when review is
  // already released. A non-owner falls through to teacher-scoped RLS.
  const { data: ownSubmission } = await admin
    .from('submissions')
    .select(`
      id, assignment_id, student_id, status, total_score, score_adjustment, max_score, attempt_number, submitted_at, secure_browser_verified_at,
      users!submissions_student_id_fkey(full_name),
      assignments(id, title, show_results, show_solutions, end_at, duration_minutes, passing_type, passing_value, completion_rule, type, status, max_attempts, score_strategy, retry_scope, classroom_id, display_max_score, secure_browser_mode)
    `)
    .eq('id', id)
    .eq('student_id', user.id)
    .maybeSingle()

  let submission: any = null
  if (ownSubmission) {
    const ownAssignment = Array.isArray(ownSubmission.assignments)
      ? ownSubmission.assignments[0]
      : ownSubmission.assignments
    const mayReview = canStudentReviewAnswers(ownAssignment?.show_results, ownAssignment?.end_at)
    const { data: answerSummary } = mayReview
      ? await admin
          .from('submission_answers')
          .select('id, correct_answer, is_correct')
          .eq('submission_id', id)
      : { data: [] }
    submission = { ...ownSubmission, assignments: ownAssignment, submission_answers: answerSummary ?? [] }
  } else {
    // Not the student's own — so this is a teacher reading someone else's
    // answers. submissions has no co-teacher RLS policy (its teacher-side
    // policy is scoped to assignments.created_by), which is why this page
    // used to 404 for a co-teacher. The row is fetched with the service role
    // and then authorized explicitly: owner, or an admin/manage co-teacher.
    const { data: teacherVisibleSubmission } = await admin
      .from('submissions')
      .select(`
        id, assignment_id, student_id, status, total_score, score_adjustment, max_score, attempt_number, submitted_at, secure_browser_verified_at,
        users!submissions_student_id_fkey(full_name),
        assignments(title, show_results, end_at, passing_type, passing_value, type, status, max_attempts, score_strategy, retry_scope, classroom_id, display_max_score, secure_browser_mode),
        submission_answers(id, correct_answer, is_correct)
      `)
      .eq('id', id)
      .maybeSingle()
    const mayRead = teacherVisibleSubmission != null
      && await canManageAssignment(teacherVisibleSubmission.assignment_id, user.id)
    submission = mayRead ? teacherVisibleSubmission : null
  }

  if (!submission) notFound()

  const isOwnSubmission = submission.student_id === user.id
  const isTeacherViewer = !isOwnSubmission

  if (submission.status === 'in_progress') {
    if (!isOwnSubmission) notFound()
    redirect(`/assignments/${submission.assignment_id}/take`)
  }

  // Prev/next student navigation, teacher-only — same "official attempt per
  // student" reduction the results/classroom-scores pages use, sorted by
  // name so paging through a class is predictable. Only students who have
  // at least one submission for this assignment are included (there's
  // nothing to page to for a non-starter).
  let studentName: string | null = null
  let prevNav: { submissionId: string; label: string } | null = null
  let nextNav: { submissionId: string; label: string } | null = null
  if (isTeacherViewer) {
    const assignmentInfo = (submission as any).assignments
    studentName = (submission as any).users?.full_name ?? null

    // Service role for the same reason the submission above uses it, and
    // reached only after canManageAssignment already allowed this viewer.
    const { data: siblingSubs } = await admin
      .from('submissions')
      .select('id, student_id, status, total_score, score_adjustment, max_score, attempt_number, users!submissions_student_id_fkey(full_name)')
      .eq('assignment_id', submission.assignment_id)

    const normalized = (siblingSubs ?? []).map((s: any) => ({ ...s, attempt_number: s.attempt_number ?? 1 }))
    const officialByStudent = officialSubmissionsByStudent(normalized, assignmentInfo.score_strategy)

    const studentIds = Array.from(officialByStudent.keys())
    const { data: profileRows } = studentIds.length > 0
      ? await admin
          .from('student_profiles')
          .select('student_id, grade_level, section_number, class_number, student_code')
          .in('student_id', studentIds)
      : { data: [] }
    const profiles = Object.fromEntries((profileRows ?? []).map((p: any) => [p.student_id, p]))

    const roster = studentIds.map(sid => {
      const official = officialByStudent.get(sid)!
      return {
        id: sid,
        full_name: (official.representative as any).users?.full_name ?? '',
        submissionId: official.representative.id as string,
      }
    })
    const sorted = sortStudents(roster, profiles, 'name', 'asc')
    const idx = sorted.findIndex(s => s.id === submission.student_id)
    if (idx > 0) prevNav = { submissionId: sorted[idx - 1].submissionId, label: sorted[idx - 1].full_name }
    if (idx >= 0 && idx < sorted.length - 1) nextNav = { submissionId: sorted[idx + 1].submissionId, label: sorted[idx + 1].full_name }
  }

  const assignment = (submission as any).assignments
  const [{ total_score: displayScore, max_score: displayMax }] = rescaleToDisplayMax(
    [submission as { total_score: number | null; score_adjustment?: number; max_score: number }],
    () => assignment.display_max_score
  )
  const pct = displayMax > 0 ? Math.round(((displayScore ?? 0) / displayMax) * 100) : 0
  const passed = computePassed(displayScore, displayMax, assignment.passing_type, assignment.passing_value)
  const passingThreshold = formatPassingThreshold(assignment.passing_type, assignment.passing_value)
  // Teachers always see/grade results regardless of the student-facing
  // policy. `never` hides both the score summary and answer review from the
  // student, `score_only` permanently withholds the answer review, and
  // `after_due` withholds answer details only until the deadline passes.
  const canShowScore = isTeacherViewer || canStudentViewScore(assignment.show_results, assignment.end_at)
  const canShowAnswers = isTeacherViewer || canStudentReviewAnswers(assignment.show_results, assignment.end_at)
  const canExitSeb = shouldOfferSebExit({
    isOwnSubmission,
    secureBrowserMode: assignment.secure_browser_mode,
    secureBrowserVerifiedAt: submission.secure_browser_verified_at,
  })

  const answers = (submission as any).submission_answers as any[]
  const pendingManualCount = answers.filter(isPendingTeacherReview).length

  // The limit startSubmission enforces: a ข้อสอบ saved without max_attempts is
  // one attempt, not unlimited — otherwise this page offered a retry the
  // server then refused, next to a เฉลยวิธีทำ it had just opened for being done.
  const attemptLimit = completionAttemptLimit(assignment)
  const { data: ownAttempts, error: attemptsError } = isOwnSubmission
    ? await fetchAllRows((from, to) => admin.from('submissions')
        .select('id, status, total_score, score_adjustment, max_score, streak_reached, attempt_number')
        .eq('assignment_id', submission.assignment_id).eq('student_id', user.id)
        .order('attempt_number').range(from, to)).then(({ rows, error }) => ({ data: rows, error }))
    : { data: [], error: null }
  const attemptsUsed = (ownAttempts ?? []).reduce((highest, attempt) => Math.max(highest, attempt.attempt_number), 0)
  const attemptsRemaining = !attemptsError && !findPassingCompletion(assignment, ownAttempts ?? [])
    && (attemptLimit == null || attemptsUsed < attemptLimit)

  // A wrong-only retry only has something to reopen while a question is still
  // short of full marks. Questions waiting on the teacher are not counted:
  // they are carried into the next attempt rather than re-asked, so offering
  // the button for them would open an attempt with nothing in it. Counted in
  // JS because PostgREST cannot compare two columns in a filter.
  const isWrongOnlyRetry = assignment.retry_scope === 'wrong_only'
  let retryableCount: number | null = null
  if (isWrongOnlyRetry && isOwnSubmission && attemptsRemaining) {
    const { data: scoreRows } = await admin
      .from('submission_answers')
      .select('is_correct, score, max_score')
      .eq('submission_id', id)
    retryableCount = (scoreRows ?? []).filter(
      (r: any) => r.is_correct !== null && Number(r.score) < Number(r.max_score)
    ).length
  }

  const canRetry = isOwnSubmission && attemptsRemaining && assignment.status === 'published' &&
    (!assignment.end_at || new Date(assignment.end_at) > new Date()) &&
    (!isWrongOnlyRetry || (retryableCount ?? 0) > 0)

  // เฉลยวิธีทำ — the teacher's attached เฉลย, not the answer key above. Only
  // on the student's own summary, and only when at least one ข้อ of this
  // attempt has one: a lock promising a เฉลย that does not exist would send
  // them back for nothing. The เฉลย is read here only to learn which ข้อ have
  // one; nothing of it reaches the page until the viewer asks the Server
  // Action, which decides the release again.
  let solutionRelease: SolutionRelease = { state: 'off' }
  let solutionAnswerIds: string[] = []
  if (isOwnSubmission && assignment.show_solutions === true) {
    const [release, items] = await Promise.all([
      loadSolutionRelease(admin, {
        id: submission.assignment_id,
        show_solutions: true,
        status: assignment.status,
        type: assignment.type,
        end_at: assignment.end_at,
        max_attempts: assignment.max_attempts,
        duration_minutes: assignment.duration_minutes,
        completion_rule: assignment.completion_rule,
        passing_type: assignment.passing_type,
        passing_value: assignment.passing_value,
        display_max_score: assignment.display_max_score,
      }, user.id),
      loadAttemptSolutionItems(admin, id),
    ])
    solutionAnswerIds = (items ?? []).filter(attemptItemHasSolution).map(item => item.answerId)
    if (solutionAnswerIds.length > 0) solutionRelease = release
  }
  const solutionsOpen = solutionRelease.state === 'open'

  const solutionWatermark = (canShowAnswers || solutionsOpen)
    ? await loadStudentSolutionWatermark(admin, submission.student_id) : null
  const hasSolutionIdentity = solutionWatermark !== null

  const page = (
    <div className="max-w-3xl space-y-6">
      {solutionWatermark && <SolutionWatermark data={solutionWatermark} viewer={isTeacherViewer ? 'teacher' : 'student'} />}
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href={isTeacherViewer ? `/assignments/${submission.assignment_id}/results` : '/my-submissions'}
          className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
        >
          <ChevronLeft size={15} />
          {isTeacherViewer ? 'ผลคะแนนทั้งหมด' : 'ผลงานทั้งหมด'}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium truncate">{assignment.title}</span>
        {isTeacherViewer && studentName && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-semibold text-primary truncate">{studentName}</span>
          </>
        )}
      </div>

      {/* Prev/next student — teacher only */}
      {isTeacherViewer && (prevNav || nextNav) && (
        <Card radius="md" className="flex items-center justify-between text-sm px-4 py-2.5">
          {prevNav ? (
            <Link href={`/submissions/${prevNav.submissionId}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary min-w-0">
              <ChevronLeft size={15} className="shrink-0" /> <span className="truncate">{prevNav.label}</span>
            </Link>
          ) : <span />}
          {nextNav ? (
            <Link href={`/submissions/${nextNav.submissionId}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary ml-auto min-w-0">
              <span className="truncate">{nextNav.label}</span> <ChevronRight size={15} className="shrink-0" />
            </Link>
          ) : <span />}
        </Card>
      )}

      <SubmissionScoreSummary
        visible={canShowScore} score={displayScore} maxScore={displayMax} percentage={pct}
        passed={passed} threshold={passed !== null ? passingThreshold : null}
        counts={canShowAnswers ? { correct: answers.filter(a => a.is_correct === true).length, wrong: answers.filter(a => a.is_correct === false).length, pending: pendingManualCount } : null}
        submittedAt={submission.submitted_at ? thaiDateTime.format(new Date(submission.submitted_at)) : null}
        strategy={assignment.max_attempts !== 1 ? `การเก็บคะแนน: ${SCORE_STRATEGY_LABELS[assignment.score_strategy as 'best' | 'average' | 'latest']} (จากทั้งหมด ${submission.attempt_number} ครั้งที่ทำ)` : null}
      >
        {solutionsOpen && hasSolutionIdentity && <AttemptSolutionsButton />}
        {canRetry && <Button size="sm" render={<Link href={`/assignments/${submission.assignment_id}/take`} />}>
          <RotateCcw aria-hidden="true" />
          {isWrongOnlyRetry ? `แก้เฉพาะข้อที่ยังไม่ได้คะแนนเต็ม (${retryableCount} ข้อ)` : assignment.type === 'exam' ? 'เริ่มทำข้อสอบอีกครั้ง' : 'เริ่มทำแบบฝึกหัดอีกครั้ง'}
        </Button>}
        {assignment.classroom_id && <Button size="sm" variant="outline" render={<Link href={`/classrooms/${assignment.classroom_id}`} />}><School aria-hidden="true" />กลับไปห้องเรียน</Button>}
        {solutionRelease.state === 'locked' && <div className="basis-full"><SolutionLockNotice lock={solutionRelease} assignmentId={submission.assignment_id} canResume={assignment.status === 'published'} /></div>}
      </SubmissionScoreSummary>

      {canExitSeb && (
        <Card padding="lg" className="border-success/20 bg-success/5 text-center">
          <h2 className="font-bold">ออกจาก Safe Exam Browser</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ส่งคำตอบเสร็จแล้ว กดปุ่มด้านล่างเพื่อออกจากโหมดสอบโดยไม่ต้องกรอกรหัส
          </p>
          <a
            href="/exam/quit"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-success px-5 py-2.5 text-sm font-semibold text-success-foreground transition-colors hover:bg-success/90"
          >
            ออกจาก Safe Exam Browser
          </a>
          <p className="mt-2 text-xs text-muted-foreground">
            หากปุ่มไม่ปิดโปรแกรม ให้แจ้งครูผู้คุมสอบและใช้รหัสออกฉุกเฉินของครู
          </p>
        </Card>
      )}

      {/* Answer review */}
      {!canShowAnswers && (
        <Card edge="dashed" padding="xl" className="text-center text-sm text-muted-foreground">
          {assignment.show_results === 'never' ? (
            <>🔒 ครูกำหนดไม่แสดงคะแนนและคำตอบรายข้อสำหรับงานนี้</>
          ) : assignment.show_results === 'score_only' ? (
            <>🔒 งานนี้แสดงเฉพาะคะแนนรวม โดยไม่แสดงคำตอบรายข้อ</>
          ) : (
            <>
              🔒 คำตอบที่ถูกและคะแนนรายข้อจะแสดงหลังพ้นกำหนดส่งงาน
              {assignment.end_at && (
                <> ({thaiDateTime.format(new Date(assignment.end_at))})</>
              )}
            </>
          )}
        </Card>
      )}
      {(canShowAnswers || solutionsOpen) && !hasSolutionIdentity && <Card padding="md" role="alert">โหลดข้อมูลสำหรับลายน้ำไม่สำเร็จ กรุณาโหลดหน้าใหม่เพื่อดูเฉลย</Card>}
      {canShowAnswers && hasSolutionIdentity && (
        <Suspense fallback={(
          <Card padding="xl" className="text-center text-sm text-muted-foreground">
            กำลังโหลดรายละเอียดคำตอบ...
          </Card>
        )}>
          <SubmissionAnswerDetails
            submissionId={id}
            isTeacherViewer={isTeacherViewer}
            solutionAnswerIds={solutionsOpen ? solutionAnswerIds : []}
          />
        </Suspense>
      )}
    </div>
  )

  // The viewer's code is only sent to a student who can open it.
  return solutionsOpen && hasSolutionIdentity
    ? <AttemptSolutionsProvider submissionId={id}>{page}</AttemptSolutionsProvider>
    : page
}

async function SubmissionAnswerDetails({
  submissionId,
  isTeacherViewer,
  solutionAnswerIds,
}: {
  submissionId: string
  isTeacherViewer: boolean
  /** ข้อ whose เฉลยวิธีทำ this student may open — empty unless it is open. */
  solutionAnswerIds: string[]
}) {
  // A student reads their own answers through RLS, because that is what
  // enforces the show_results gating (can_current_user_view_submission_answers)
  // — never swap that for the service role. A teacher reaches this component
  // only after the page authorized them with canManageAssignment, and needs
  // the service role because submission_answers has no co-teacher policy.
  const reader = isTeacherViewer ? createAdminClient() : await createClient()
  const { data: answerRows } = await reader
    .from('submission_answers')
    .select(`
      id, question_id, correct_answer, is_correct, max_score, option_order, order_index,
      random_values, score, student_answer, work_images, carried_over, check_count,
      student_work_artifacts(id, part_key, source_type, preview_path, updated_at)
    `)
    .eq('submission_id', submissionId)
    .order('order_index')

  // The โจทย์ behind those answers, read with the service role for exactly
  // the ids RLS just returned. A student may not read `questions` rows
  // themselves: RLS grants a whole row, and the row carries the เฉลยวิธีทำ,
  // which opens on its own terms (lib/solution-release.ts) — so only the
  // columns this review shows are read here, and the เฉลย is not one of them.
  const questionIds = Array.from(new Set((answerRows ?? []).map((row: any) => row.question_id as string)))
  const { data: questionRows } = questionIds.length > 0
    ? await createAdminClient()
        .from('questions')
        .select('id, title, question_text, answer_parts, answer_unit, question_type, extra_data, mcq_options')
        .in('id', questionIds)
    : { data: [] }
  const questionById = new Map((questionRows ?? []).map((question: any) => [question.id as string, question]))
  // Deleting a โจทย์ cascades to its answers, so a missing one is a row about
  // to disappear anyway.
  const sortedAnswers = (answerRows ?? [])
    .map((row: any) => ({ ...row, questions: questionById.get(row.question_id) ?? null }))
    .filter((row: any) => row.questions !== null) as any[]
  const solutionIds = new Set(solutionAnswerIds)
  const artifactPreviewPaths = sortedAnswers.flatMap(answer => (
    (answer.student_work_artifacts ?? []).map((artifact: any) => artifact.preview_path as string)
  ))
  const { data: signedArtifactRows } = artifactPreviewPaths.length > 0
    ? await createAdminClient().storage
        .from(MATH_WORK_BUCKET)
        .createSignedUrls(Array.from(new Set(artifactPreviewPaths)), 5 * 60)
    : { data: [] }
  const signedArtifactUrls = new Map((signedArtifactRows ?? []).flatMap(row => (
    row.signedUrl ? [[row.path, row.signedUrl] as const] : []
  )))


  return (
    <>
      <div className="space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <span>📋</span> ตรวจเฉลยทีละข้อ
        </h2>
        {sortedAnswers.map((a: any, i: number) => {
          const q = a.questions
          const isCorrect = a.is_correct
          const isPendingManual = isPendingTeacherReview(a)

          return (
            <div
              key={a.id}
              className={`bg-card border-l-4 rounded-2xl overflow-hidden ${
                isPendingManual
                  ? 'border-l-amber-400'
                  : isCorrect === true
                  ? 'border-l-green-500'
                  : isCorrect === false
                  ? 'border-l-red-400'
                  : 'border-l-border'
              }`}
            >
              <div className="p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    isPendingManual
                      ? 'bg-warning/10 text-warning'
                      : isCorrect === true
                      ? 'bg-success/10 text-success'
                      : isCorrect === false
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {isPendingManual ? '⏳' : isCorrect === true
                      ? <CheckCircle2 size={16} />
                      : isCorrect === false
                      ? <XCircle size={16} />
                      : '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">ข้อ {i + 1}</p>
                      {q.title && <p className="text-xs text-muted-foreground truncate">{q.title}</p>}
                      {a.carried_over && (
                        <Badge variant="outline" className="text-xs">ยกมาจากครั้งก่อน</Badge>
                      )}
                      {/* แบบฝึกหัด ที่เปิดให้ตรวจทีละข้อ: คะแนนคิดจากคำตอบสุดท้าย
                          เสมอ ตัวเลขนี้จึงเป็นสิ่งเดียวที่แยก "ถูกตั้งแต่แรก"
                          ออกจาก "ตรวจแล้วแก้อีกหลายรอบ" */}
                      {a.check_count > 1 && (
                        <Badge variant="outline" className="text-xs">
                          ตรวจก่อนส่ง {a.check_count} ครั้ง
                        </Badge>
                      )}
                      <div className="ml-auto shrink-0">
                        {isTeacherViewer ? (
                          <ScoreEditor submissionAnswerId={a.id} score={a.score} maxScore={a.max_score} />
                        ) : (
                          <Badge variant="outline" className={`text-xs ${
                            isPendingManual ? 'border-warning/20 text-warning' : ''
                          }`}>
                            {isPendingManual ? `รอผล/${a.max_score}` : `${a.score}/${a.max_score}`}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <QuestionText
                      text={substituteVars(q.question_text, a.random_values)}
                      className="text-sm text-muted-foreground mt-1"
                    />
                  </div>
                </div>

                {Object.keys(a.random_values as Record<string, number>).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3 pl-11">
                    {Object.entries(a.random_values as Record<string, number>).map(([k, v]) => (
                      <span key={k} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded font-mono">
                        {k} = {v}
                      </span>
                    ))}
                  </div>
                )}

                <div className="pl-11">
                  <SubmissionAnswerReview
                    studentAnswer={a.student_answer}
                    correctAnswer={a.correct_answer}
                    isCorrect={isCorrect}
                    answerParts={q.answer_parts ?? null}
                    answerUnit={q.answer_unit}
                    questionType={q.question_type}
                    extraData={q.extra_data}
                    mcqOptions={
                      // For matching, option_order shuffled only the choices the
                      // student picked from — the pairs themselves must stay in
                      // authored order so pair i lines up with answer i.
                      q.question_type === 'matching'
                        ? q.mcq_options
                        : reorderOptions(q.mcq_options, a.option_order)
                    }
                    workImages={a.work_images ?? null}
                  />
                  <SubmittedWorkArtifacts
                    artifacts={(a.student_work_artifacts ?? []).map((artifact: any) => ({
                      id: artifact.id as string,
                      partKey: artifact.part_key as string,
                      sourceType: artifact.source_type as string,
                      previewUrl: signedArtifactUrls.get(artifact.preview_path as string) ?? null,
                    }))}
                  />
                  {solutionIds.has(a.id) && (
                    <div className="mt-3">
                      <AttemptSolutionShortcut answerId={a.id} number={i + 1} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>


    </>
  )
}

function SubmittedWorkArtifacts({
  artifacts,
}: {
  artifacts: Array<{ id: string; partKey: string; sourceType: string; previewUrl: string | null }>
}) {
  if (artifacts.length === 0) return null
  return (
    <div className="mt-3 rounded-xl border border-dashed border-border bg-muted/20 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
        <span aria-hidden="true">✍️</span> วิธีทำที่แนบ
      </p>
      <div className="flex flex-wrap gap-3">
        {artifacts.map(artifact => {
          const partIndex = /^part:(\d+)$/.exec(artifact.partKey)?.[1]
          const label = partIndex === undefined ? 'คำตอบ' : `ข้อย่อย ${PART_LABELS[Number(partIndex)] ?? Number(partIndex) + 1}`
          return (
            <div key={artifact.id} className="space-y-1">
              {artifact.previewUrl ? (
                <a href={artifact.previewUrl} target="_blank" rel="noopener noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={artifact.previewUrl}
                    alt={`วิธีทำ ${label}`}
                    loading="lazy"
                    decoding="async"
                    className="h-28 w-28 rounded-lg border bg-card object-cover transition-opacity hover:opacity-90"
                  />
                </a>
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-lg border bg-muted px-2 text-center text-[10px] text-muted-foreground">
                  เปิดภาพไม่สำเร็จ
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                {label} · {artifact.sourceType === 'scratchpad' ? 'กระดาษทด' : 'รูปภาพ'}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Display variables ────────────────────────────────────────────────────────

function substituteVars(text: string, values: Record<string, number>) {
  return text.replace(/\{(\w+)\}/g, (_, name) => {
    if (!(name in values)) return `{${name}}`
    return `${values[name]}`
  })
}
