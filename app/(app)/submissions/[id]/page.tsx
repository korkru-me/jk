import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/auth/server'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { StudyPathPanel } from '@/components/student/study-path-panel'
import { CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight, Trophy, RotateCcw, School, FileText, EyeOff } from 'lucide-react'
import type { AnswerPart, FillBlankItem, SubmittedFile } from '@/lib/types'
import { getBlankType, isBlankCorrect } from '@/lib/fill-blank'
import { computePassed, formatPassingThreshold } from '@/lib/grading'
import { evaluateStudentAnswer } from '@/lib/math/evaluator'
import { SCORE_STRATEGY_LABELS, rescaleToDisplayMax, officialSubmissionsByStudent } from '@/lib/scoring'
import { sortStudents } from '@/lib/student-sort'
import { ScoreEditor } from '@/components/assignments/score-editor'

const PART_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ']
const CHOICE_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ']

export const metadata = { title: 'ผลการสอบ — KorKru' }

function reorderOptions<T>(options: T[] | null, order: number[] | null): T[] | null {
  if (!options) return null
  if (!order) return options
  return order.map(i => options[i])
}

function formatAnswer(n: number): string {
  if (Math.abs(n) >= 1e6 || (Math.abs(n) < 0.001 && n !== 0)) return n.toExponential(3)
  return parseFloat(n.toPrecision(4)).toString()
}

// Fill-blank is the only question type that can grade to a pending
// (null) is_correct — a whole-manual blank, or a mix of manual + auto
// blanks where the auto ones are already scored but the row still
// awaits a teacher's review of the manual blank(s).
function isManualFillBlank(a: any): boolean {
  return String(a.correct_answer ?? '').startsWith('FILL') && a.is_correct === null
}

export default async function SubmissionResultPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // No student_id filter here — RLS (submissions_student_own /
  // submissions_org_teacher_select) already scopes this to the owning
  // student or the assignment's teacher, so a teacher can review a
  // student's submission (including any attached work-images) too.
  // RLS reads the auth cookie directly, so the secured submission lookup can
  // run alongside getUser instead of waiting for a separate network round
  // trip first. An unauthenticated lookup simply returns no visible row.
  const [user, submissionRes] = await Promise.all([
    getAuthUser(),
    supabase
      .from('submissions')
      .select(`
        id, assignment_id, student_id, status, total_score, max_score, attempt_number, submitted_at,
        users(full_name),
        assignments(title, show_results, end_at, passing_type, passing_value, type, status, max_attempts, score_strategy, classroom_id, display_max_score),
        submission_answers(id, correct_answer, is_correct)
      `)
      .eq('id', id)
      .maybeSingle(),
  ])
  if (!user) redirect('/login')
  const submission = submissionRes.data

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

    const { data: siblingSubs } = await supabase
      .from('submissions')
      .select('id, student_id, status, total_score, max_score, attempt_number, users(full_name)')
      .eq('assignment_id', submission.assignment_id)

    const normalized = (siblingSubs ?? []).map((s: any) => ({ ...s, attempt_number: s.attempt_number ?? 1 }))
    const officialByStudent = officialSubmissionsByStudent(normalized, assignmentInfo.score_strategy)

    const admin = createAdminClient()
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
    [submission as { total_score: number | null; max_score: number }],
    () => assignment.display_max_score
  )
  const pct = displayMax > 0 ? Math.round(((displayScore ?? 0) / displayMax) * 100) : 0
  const passed = computePassed(displayScore, displayMax, assignment.passing_type, assignment.passing_value)
  const passingThreshold = formatPassingThreshold(assignment.passing_type, assignment.passing_value)
  // Teachers always see/grade results regardless of the student-facing
  // policy. `never` hides both the score summary and answer review from the
  // student, `score_only` permanently withholds the answer review, and
  // `after_due` withholds answer details only until the deadline passes.
  const canShowScore = isTeacherViewer || assignment.show_results !== 'never'
  const canShowAnswers =
    isTeacherViewer ||
    assignment.show_results === 'immediate' ||
    (assignment.show_results === 'after_due' && (
      !assignment.end_at || new Date(assignment.end_at) < new Date()
    ))

  const answers = (submission as any).submission_answers as any[]
  const pendingManualCount = answers.filter(isManualFillBlank).length

  const attemptsRemaining = assignment.max_attempts == null || submission.attempt_number < assignment.max_attempts
  const canRetry = isOwnSubmission && attemptsRemaining && assignment.status === 'published' &&
    (!assignment.end_at || new Date(assignment.end_at) > new Date())

  return (
    <div className="max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href={isTeacherViewer ? `/assignments/${submission.assignment_id}/results` : '/my-submissions'}
          className="text-sm text-muted-foreground hover:text-blue-600 flex items-center gap-1"
        >
          <ChevronLeft size={15} />
          {isTeacherViewer ? 'ผลคะแนนทั้งหมด' : 'ผลงานทั้งหมด'}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium truncate">{assignment.title}</span>
        {isTeacherViewer && studentName && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 truncate">{studentName}</span>
          </>
        )}
      </div>

      {/* Prev/next student — teacher only */}
      {isTeacherViewer && (prevNav || nextNav) && (
        <div className="flex items-center justify-between text-sm bg-card border rounded-xl px-4 py-2.5">
          {prevNav ? (
            <Link href={`/submissions/${prevNav.submissionId}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-blue-600 min-w-0">
              <ChevronLeft size={15} className="shrink-0" /> <span className="truncate">{prevNav.label}</span>
            </Link>
          ) : <span />}
          {nextNav ? (
            <Link href={`/submissions/${nextNav.submissionId}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-blue-600 ml-auto min-w-0">
              <span className="truncate">{nextNav.label}</span> <ChevronRight size={15} className="shrink-0" />
            </Link>
          ) : <span />}
        </div>
      )}

      {/* Score summary */}
      <div className="bg-card border rounded-2xl p-8 text-center relative overflow-hidden">
        {/* Background decoration */}
        <div className={`absolute inset-0 opacity-5 ${
          !canShowScore ? 'bg-blue-500' : pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
        }`} />

        <div className="relative">
          {canShowScore ? (
            <>
              {passed !== null && (
                <div className="flex flex-col items-center gap-1 mb-3">
                  <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
                    passed
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                  }`}>
                    {passed ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                    {passed ? 'ผ่านเกณฑ์' : 'ยังไม่ผ่านเกณฑ์'}
                  </div>
                  {passingThreshold && (
                    <p className="text-xs text-muted-foreground">เกณฑ์ผ่าน: ต้องได้ {passingThreshold} ขึ้นไป</p>
                  )}
                </div>
              )}
              {pct >= 90 && (
                <div className="flex justify-center mb-3">
                  <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full px-3 py-1 text-xs font-semibold">
                    <Trophy size={13} />
                    ยอดเยี่ยม!
                  </div>
                </div>
              )}

              <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full text-3xl font-black mb-4 ${
                pct >= 75
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : pct >= 50
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
              }`}>
                {pct}%
              </div>

              <p className="text-4xl font-black">{displayScore}/{displayMax}</p>
              <p className="text-muted-foreground mt-1 text-sm">คะแนนที่ได้</p>

              <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle2 size={13} />
                  ถูก {answers.filter(a => a.is_correct === true).length} ข้อ
                </span>
                <span className="flex items-center gap-1 text-red-500">
                  <XCircle size={13} />
                  ผิด {answers.filter(a => a.is_correct === false).length} ข้อ
                </span>
                {pendingManualCount > 0 && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <Clock size={13} />
                    รอตรวจ {pendingManualCount} ข้อ
                  </span>
                )}
              </div>

              {pendingManualCount > 0 && (
                <div className="mt-3 inline-flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs font-medium px-3 py-1.5 rounded-full">
                  ⏳ มี {pendingManualCount} ข้อรอครูตรวจ — คะแนนจะอัปเดตภายหลัง
                </div>
              )}

              {assignment.max_attempts !== 1 && (
                <p className="text-xs text-muted-foreground mt-3">
                  {`การเก็บคะแนน: ${SCORE_STRATEGY_LABELS[assignment.score_strategy as 'best' | 'average' | 'latest']} (จากทั้งหมด ${submission.attempt_number} ครั้งที่ทำ)`}
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4">
                <EyeOff size={32} />
              </div>
              <h2 className="text-xl font-bold">ส่งคำตอบเรียบร้อยแล้ว</h2>
              <p className="text-sm text-muted-foreground mt-2 max-w-md">
                ครูกำหนดไม่แสดงคะแนนและเฉลยสำหรับงานนี้
              </p>
            </div>
          )}

          {submission.submitted_at && (
            <p className="text-xs text-muted-foreground mt-3">
              ส่งเมื่อ {new Date(submission.submitted_at).toLocaleString('th-TH')}
            </p>
          )}

          {(canRetry || assignment.classroom_id) && (
            <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
              {canRetry && (
                <Link
                  href={`/assignments/${submission.assignment_id}/take`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 transition-colors"
                >
                  <RotateCcw size={15} />
                  {assignment.type === 'exam' ? 'เริ่มทำข้อสอบอีกครั้ง' : 'เริ่มทำแบบฝึกหัดอีกครั้ง'}
                </Link>
              )}
              {assignment.classroom_id && (
                <Link
                  href={`/classrooms/${assignment.classroom_id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-muted hover:bg-muted/70 text-foreground text-sm font-semibold px-4 py-2 transition-colors border"
                >
                  <School size={15} />
                  กลับไปห้องเรียน
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Answer review */}
      {!canShowAnswers && (
        <div className="bg-card border border-dashed rounded-2xl p-6 text-center text-sm text-muted-foreground">
          {assignment.show_results === 'never' ? (
            <>🔒 ครูกำหนดไม่แสดงคะแนนและเฉลยสำหรับงานนี้</>
          ) : assignment.show_results === 'score_only' ? (
            <>🔒 งานนี้แสดงเฉพาะคะแนนรวม โดยไม่แสดงคำตอบรายข้อและเฉลย</>
          ) : (
            <>
              🔒 เฉลยและคะแนนรายข้อจะแสดงหลังพ้นกำหนดส่งงาน
              {assignment.end_at && (
                <> ({new Date(assignment.end_at).toLocaleString('th-TH')})</>
              )}
            </>
          )}
        </div>
      )}
      {canShowAnswers && (
        <Suspense fallback={(
          <div className="bg-card border rounded-2xl p-6 text-center text-sm text-muted-foreground">
            กำลังโหลดรายละเอียดคำตอบ...
          </div>
        )}>
          <SubmissionAnswerDetails submissionId={id} isTeacherViewer={isTeacherViewer} />
        </Suspense>
      )}
    </div>
  )
}

async function SubmissionAnswerDetails({
  submissionId,
  isTeacherViewer,
}: {
  submissionId: string
  isTeacherViewer: boolean
}) {
  const supabase = await createClient()
  const { data: answers } = await supabase
    .from('submission_answers')
    .select(`
      id, correct_answer, is_correct, max_score, option_order, order_index,
      random_values, score, student_answer, work_images,
      questions(title, question_text, answer_parts, answer_unit, question_type, extra_data, mcq_options)
    `)
    .eq('submission_id', submissionId)
    .order('order_index')

  const sortedAnswers = (answers ?? []) as any[]
  const wrongAnswers = sortedAnswers
    .filter(a => a.is_correct === false && !isManualFillBlank(a))
    .map(a => ({
      title: a.questions?.title ?? '',
      questionText: substituteVars(a.questions?.question_text ?? '', a.random_values ?? {}),
    }))

  return (
    <>
      <div className="space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <span>📋</span> ตรวจเฉลยทีละข้อ
        </h2>
        {sortedAnswers.map((a: any, i: number) => {
          const q = a.questions
          const isCorrect = a.is_correct
          const isPendingManual = isManualFillBlank(a)

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
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                      : isCorrect === true
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : isCorrect === false
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
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
                      <div className="ml-auto shrink-0">
                        {isTeacherViewer ? (
                          <ScoreEditor submissionAnswerId={a.id} score={a.score} maxScore={a.max_score} />
                        ) : (
                          <Badge variant="outline" className={`text-xs ${
                            isPendingManual ? 'border-amber-300 text-amber-600 dark:text-amber-400' : ''
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
                  <AnswerReview
                    studentAnswer={a.student_answer}
                    correctAnswer={a.correct_answer}
                    isCorrect={isCorrect}
                    answerParts={q.answer_parts ?? null}
                    answerUnit={q.answer_unit}
                    questionType={q.question_type}
                    extraData={q.extra_data}
                    mcqOptions={reorderOptions(q.mcq_options, a.option_order)}
                    workImages={a.work_images ?? null}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold flex items-center gap-2">
          <span>🗺️</span> เส้นทางการซ่อมเสริม
        </h2>
        <StudyPathPanel
          wrongQuestions={wrongAnswers}
          totalQuestions={sortedAnswers.filter(a => !isManualFillBlank(a)).length}
        />
      </div>
    </>
  )
}

// ─── Answer review component ──────────────────────────────────────────────────

function AnswerReview({
  studentAnswer,
  correctAnswer,
  isCorrect,
  answerParts,
  answerUnit,
  questionType,
  extraData,
  mcqOptions,
  workImages,
}: {
  studentAnswer: string | null
  correctAnswer: string
  isCorrect: boolean | null
  answerParts: AnswerPart[] | null
  answerUnit: string | null
  questionType?: string
  extraData?: Record<string, unknown>
  mcqOptions: Array<{ text: string; is_correct: boolean }> | null
  workImages?: (string | null)[] | null
}) {
  // ─── MCQ: show all options with color highlighting ───────────────────────
  if (questionType === 'mcq' && mcqOptions && mcqOptions.length > 0) {
    return (
      <div className="space-y-2 mt-2">
        {mcqOptions.map((opt, i) => {
          const isStudentChoice = studentAnswer === opt.text
          const isCorrectOpt = opt.is_correct

          let wrapClass = 'border-border bg-background'
          let labelClass = 'text-muted-foreground'
          let indicator = null

          if (isCorrectOpt) {
            wrapClass = 'border-green-400 bg-green-50 dark:bg-green-950/30'
            labelClass = 'text-green-700 dark:text-green-400'
            indicator = (
              <span className="text-xs font-semibold text-green-600 dark:text-green-400 shrink-0 flex items-center gap-1">
                <CheckCircle2 size={13} /> เฉลย
              </span>
            )
          } else if (isStudentChoice && !isCorrectOpt) {
            wrapClass = 'border-red-400 bg-red-50 dark:bg-red-950/30'
            labelClass = 'text-red-700 dark:text-red-400'
            indicator = (
              <span className="text-xs font-semibold text-red-500 shrink-0 flex items-center gap-1">
                <XCircle size={13} /> คำตอบคุณ
              </span>
            )
          }

          return (
            <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all ${wrapClass}`}>
              <span className={`text-sm font-bold shrink-0 w-5 ${labelClass}`}>{CHOICE_LABELS[i]}</span>
              <span className={`text-sm flex-1 ${isCorrectOpt || (isStudentChoice && !isCorrectOpt) ? 'font-medium ' + labelClass : 'text-foreground'}`}>
                {opt.text}
              </span>
              {indicator}
            </div>
          )
        })}
      </div>
    )
  }

  // ─── File upload: submitted files + submit status ────────────────────────
  if (questionType === 'file_upload') {
    let files: SubmittedFile[] = []
    try { files = studentAnswer ? JSON.parse(studentAnswer) : [] } catch { files = [] }
    const submitted = files.length > 0
    return (
      <div className="mt-2 space-y-2 text-sm">
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
          submitted
            ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
            : 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
        }`}>
          {submitted ? '✓ ส่งแล้ว' : '✗ ไม่ได้ส่งไฟล์'}
        </span>
        {files.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {files.map((f, i) => (
              f.type.startsWith('image/') ? (
                <a key={i} href={f.url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.name} className="w-20 h-20 rounded-lg object-cover border hover:opacity-90 transition-opacity" />
                </a>
              ) : (
                <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg border bg-muted/40 hover:bg-muted transition-colors max-w-[160px]">
                  <FileText size={14} className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{f.name}</span>
                </a>
              )
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── Fill-blank manual (legacy, pre-dates per-blank types) ───────────────
  if (correctAnswer.startsWith('FILL_MANUAL:')) {
    let studentAnswers: string[] = []
    try { studentAnswers = JSON.parse(studentAnswer ?? '[]') } catch { /* */ }
    return (
      <div className="mt-2 space-y-2 text-sm">
        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">รอครูผู้สอนตรวจสอบและให้คะแนน</p>
        <div className="space-y-1">
          {studentAnswers.map((ans, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground shrink-0 w-16">ช่อง {i + 1}:</span>
              <span className="font-medium">{ans || '—'}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ─── Fill-blank — per-blank type (text / fixed / dropdown) ───────────────
  if (correctAnswer.startsWith('FILL:')) {
    let studentAnswers: string[] = []
    let correctAnswers: string[][] = []
    try { studentAnswers = JSON.parse(studentAnswer ?? '[]') } catch { /* */ }
    try { correctAnswers = JSON.parse(correctAnswer.slice(5)) } catch { /* */ }

    const blanks: FillBlankItem[] = (extraData as any)?.blanks ?? []
    return (
      <div className="mt-2 space-y-2 text-sm">
        {correctAnswers.map((correct, i) => {
          const student = studentAnswers[i] ?? ''
          const type = getBlankType(extraData as any, blanks[i])

          if (type === 'text') {
            return (
              <div key={i} className="pl-3 border-l-2 border-amber-300 space-y-0.5">
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">ช่อง {i + 1} — รอครูตรวจ</p>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-24 shrink-0">คำตอบคุณ:</span>
                  <span className="font-medium">{student || '—'}</span>
                </div>
              </div>
            )
          }

          const cs = blanks[i]?.case_sensitive ?? false
          const partCorrect = isBlankCorrect(student, correct, type, cs)
          return (
            <div key={i} className="pl-3 border-l-2 border-border space-y-0.5">
              <p className="text-xs font-semibold text-muted-foreground">ช่อง {i + 1}</p>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0">คำตอบคุณ:</span>
                <span className={`font-medium ${partCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{student || '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0">เฉลย:</span>
                <span className="font-medium">{correct.join(' หรือ ')}</span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Composite — each part re-dispatches to its own type's display ───────
  if (correctAnswer.startsWith('COMP:')) {
    type CompCorrectPart = { type: string; correct: unknown; caseSensitive?: boolean }
    let correctParts: CompCorrectPart[] = []
    let studentAnswers: string[] = []
    try { correctParts = JSON.parse(correctAnswer.slice(5)) } catch { correctParts = [] }
    try { studentAnswers = JSON.parse(studentAnswer ?? '[]') } catch { studentAnswers = [] }

    return (
      <div className="mt-2 space-y-2 text-sm">
        {correctParts.map((cp, i) => {
          const student = studentAnswers[i] ?? ''
          const label = PART_LABELS[i] ?? String(i + 1)

          if (cp.type === 'fill_blank' && Array.isArray(cp.correct) && cp.correct.length === 0) {
            return (
              <div key={i} className="pl-3 border-l-2 border-amber-300 space-y-0.5">
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">ข้อ {label} — รอครูตรวจ</p>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-24 shrink-0">คำตอบคุณ:</span>
                  <span className="font-medium">{student || '—'}</span>
                </div>
              </div>
            )
          }

          let partCorrect = false
          let correctDisplay = ''
          let studentDisplay = student || '—'
          let showCorrectRow = true

          if (cp.type === 'true_false') {
            partCorrect = student === cp.correct
            correctDisplay = cp.correct === 'true' ? 'ถูก' : 'ผิด'
            studentDisplay = student === 'true' ? 'ถูก' : student === 'false' ? 'ผิด' : '—'
          } else if (cp.type === 'mcq') {
            partCorrect = student === cp.correct
            correctDisplay = String(cp.correct ?? '—')
          } else if (cp.type === 'fill_blank') {
            const accepted = (cp.correct as string[]) ?? []
            const cs = !!cp.caseSensitive
            partCorrect = accepted.some(a => cs ? student.trim() === a.trim() : student.trim().toLowerCase() === a.trim().toLowerCase())
            correctDisplay = accepted.join(' หรือ ')
          } else if (cp.type === 'ordering') {
            const correctOrder = (cp.correct as string[]) ?? []
            let studentOrder: string[] = []
            try { studentOrder = JSON.parse(student || '[]') } catch { studentOrder = [] }
            partCorrect = correctOrder.length > 0 && studentOrder.length === correctOrder.length && correctOrder.every((id, idx) => studentOrder[idx] === id)
            studentDisplay = studentOrder.length > 0 ? (partCorrect ? 'เรียงถูกต้อง' : 'เรียงไม่ถูกต้อง') : '—'
            showCorrectRow = false
          }

          return (
            <div key={i} className="pl-3 border-l-2 border-border space-y-0.5">
              <p className="text-xs font-semibold text-muted-foreground">ข้อ {label}</p>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0">คำตอบคุณ:</span>
                <span className={`font-medium ${partCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{studentDisplay}</span>
              </div>
              {showCorrectRow && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-24 shrink-0">เฉลย:</span>
                  <span className="font-medium">{correctDisplay}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Multi-part numeric ───────────────────────────────────────────────────
  const isMultiPart = correctAnswer.startsWith('[')
  if (isMultiPart) {
    let correctArr: string[] = []
    let studentArr: string[] = []
    try { correctArr = JSON.parse(correctAnswer) } catch { correctArr = [] }
    try { studentArr = JSON.parse(studentAnswer ?? '[]') } catch { studentArr = [] }

    return (
      <div className="mt-2 space-y-2 text-sm">
        {correctArr.map((correct, i) => {
          const student = studentArr[i] ?? '—'
          const part = answerParts?.[i]
          const unit = part?.unit ?? answerUnit ?? ''
          const sv = evaluateStudentAnswer(student) ?? NaN
          const cv = parseFloat(correct)
          const tol = part?.tolerance ?? 0.1
          const absTol = tol < 0 ? Math.abs(cv) * (Math.abs(tol) / 100) : tol
          const partCorrect = !isNaN(sv) && !isNaN(cv) && Math.abs(sv - cv) <= absTol

          return (
            <div key={i} className="pl-3 border-l-2 border-border space-y-0.5">
              <p className="text-xs font-semibold text-muted-foreground">{PART_LABELS[i] ?? i + 1})</p>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0">คำตอบคุณ:</span>
                <span className={`font-medium ${partCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {student} {unit && <UnitText html={unit} />}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0">เฉลย:</span>
                <span className="font-medium">
                  {formatAnswerDisplay(correct)} {unit && <UnitText html={unit} />}
                </span>
              </div>
              <WorkImageThumbnail url={workImages?.[i]} />
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Single answer (numeric / text) ──────────────────────────────────────
  return (
    <div className="mt-2 space-y-1 text-sm">
      <div className="flex gap-2">
        <span className="text-muted-foreground w-24 shrink-0">คำตอบคุณ:</span>
        <span className={`font-medium ${isCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {studentAnswer ?? '—'} {answerUnit}
        </span>
      </div>
      <div className="flex gap-2">
        <span className="text-muted-foreground w-24 shrink-0">เฉลย:</span>
        <span className="font-medium">
          {formatAnswerDisplay(correctAnswer)} {answerUnit}
        </span>
      </div>
      <WorkImageThumbnail url={workImages?.[0]} />
    </div>
  )
}

function WorkImageThumbnail({ url }: { url?: string | null }) {
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block mt-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="รูปวิธีทำ" className="w-24 h-24 rounded-lg object-cover border hover:opacity-90 transition-opacity" />
    </a>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAnswerDisplay(val: string): string {
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return formatAnswer(n)
}

function UnitText({ html }: { html: string }) {
  const isHtml = /<[a-z][\s\S]*>/i.test(html)
  if (isHtml) {
    return <span className="[&_p]:inline" dangerouslySetInnerHTML={{ __html: html }} />
  }
  return <>{html}</>
}

function substituteVars(text: string, values: Record<string, number>) {
  return text.replace(/\{(\w+)\}/g, (_, name) => {
    if (!(name in values)) return `{${name}}`
    return `${values[name]}`
  })
}

function QuestionText({ text, className }: { text: string; className?: string }) {
  const isHtml = /<[a-z][\s\S]*>/i.test(text)
  if (isHtml) {
    return <div className={`rich-text-content ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: text }} />
  }
  return <p className={`whitespace-pre-line ${className ?? ''}`}>{text}</p>
}
