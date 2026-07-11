import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { StudyPathPanel } from '@/components/student/study-path-panel'
import { CheckCircle2, XCircle, Clock, ChevronLeft, Trophy } from 'lucide-react'
import type { AnswerPart } from '@/lib/types'

const PART_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ']
const CHOICE_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ']

export const metadata = { title: 'ผลการสอบ — KorKru' }

function formatAnswer(n: number): string {
  if (Math.abs(n) >= 1e6 || (Math.abs(n) < 0.001 && n !== 0)) return n.toExponential(3)
  return parseFloat(n.toPrecision(4)).toString()
}

export default async function SubmissionResultPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: submission } = await supabase
    .from('submissions')
    .select(`
      *,
      assignments(title, classrooms(name)),
      submission_answers(*, questions(*))
    `)
    .eq('id', id)
    .eq('student_id', user.id)
    .maybeSingle()

  if (!submission) notFound()

  if (submission.status === 'in_progress') {
    redirect(`/assignments/${submission.assignment_id}/take`)
  }

  const answers = (submission as any).submission_answers as any[]
  const sortedAnswers = [...answers].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  function isManualFillBlank(a: any): boolean {
    const ca = String(a.correct_answer ?? '')
    if (ca.startsWith('FILL_MANUAL:')) return true
    if (ca.startsWith('FILL:') && (a.questions?.extra_data as any)?.grading_mode === 'manual') return true
    return false
  }

  const pendingManualCount = answers.filter(isManualFillBlank).length
  const pct = submission.max_score > 0
    ? Math.round((submission.total_score / submission.max_score) * 100)
    : 0

  const assignment = (submission as any).assignments
  const canShowAnswers = true

  // Extract wrong answers for study path
  const wrongAnswers = sortedAnswers
    .filter(a => a.is_correct === false && !isManualFillBlank(a))
    .map(a => ({
      title: a.questions?.title ?? '',
      questionText: substituteVars(a.questions?.question_text ?? '', a.random_values ?? {}),
    }))

  return (
    <div className="max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/my-submissions" className="text-sm text-muted-foreground hover:text-blue-600 flex items-center gap-1">
          <ChevronLeft size={15} />
          ผลงานทั้งหมด
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium truncate">{assignment.title}</span>
      </div>

      {/* Score summary */}
      <div className="bg-card border rounded-2xl p-8 text-center relative overflow-hidden">
        {/* Background decoration */}
        <div className={`absolute inset-0 opacity-5 ${
          pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
        }`} />

        <div className="relative">
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

          <p className="text-4xl font-black">{submission.total_score}/{submission.max_score}</p>
          <p className="text-muted-foreground mt-1 text-sm">คะแนนที่ได้</p>

          <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <CheckCircle2 size={13} />
              ถูก {sortedAnswers.filter(a => a.is_correct === true).length} ข้อ
            </span>
            <span className="flex items-center gap-1 text-red-500">
              <XCircle size={13} />
              ผิด {sortedAnswers.filter(a => a.is_correct === false).length} ข้อ
            </span>
            {pendingManualCount > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <Clock size={13} />
                รอตรวจ {pendingManualCount} ข้อ
              </span>
            )}
          </div>

          {submission.submitted_at && (
            <p className="text-xs text-muted-foreground mt-3">
              ส่งเมื่อ {new Date(submission.submitted_at).toLocaleString('th-TH')}
            </p>
          )}

          {pendingManualCount > 0 && (
            <div className="mt-3 inline-flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs font-medium px-3 py-1.5 rounded-full">
              ⏳ มี {pendingManualCount} ข้อรอครูตรวจ — คะแนนจะอัปเดตภายหลัง
            </div>
          )}
        </div>
      </div>

      {/* Answer review */}
      {canShowAnswers && (
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
                  {/* Question header */}
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
                        <Badge variant="outline" className={`text-xs ml-auto shrink-0 ${
                          isPendingManual ? 'border-amber-300 text-amber-600 dark:text-amber-400' : ''
                        }`}>
                          {isPendingManual ? `รอผล/${a.max_score}` : `${a.score}/${a.max_score}`}
                        </Badge>
                      </div>
                      <QuestionText
                        text={substituteVars(q.question_text, a.random_values)}
                        className="text-sm text-muted-foreground mt-1"
                      />
                    </div>
                  </div>

                  {/* Variable values */}
                  {Object.keys(a.random_values as Record<string, number>).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3 pl-11">
                      {Object.entries(a.random_values as Record<string, number>).map(([k, v]) => (
                        <span key={k} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded font-mono">
                          {k} = {v}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Answer review */}
                  <div className="pl-11">
                    <AnswerReview
                      studentAnswer={a.student_answer}
                      correctAnswer={a.correct_answer}
                      isCorrect={isCorrect}
                      answerParts={q.answer_parts ?? null}
                      answerUnit={q.answer_unit}
                      questionType={q.question_type}
                      extraData={q.extra_data}
                      mcqOptions={q.mcq_options ?? null}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Study path panel */}
      {wrongAnswers.length >= 0 && canShowAnswers && (
        <div className="space-y-2">
          <h2 className="font-semibold flex items-center gap-2">
            <span>🗺️</span> เส้นทางการซ่อมเสริม
          </h2>
          <StudyPathPanel
            wrongQuestions={wrongAnswers}
            totalQuestions={sortedAnswers.filter(a => !isManualFillBlank(a)).length}
          />
        </div>
      )}
    </div>
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
}: {
  studentAnswer: string | null
  correctAnswer: string
  isCorrect: boolean | null
  answerParts: AnswerPart[] | null
  answerUnit: string | null
  questionType?: string
  extraData?: Record<string, unknown>
  mcqOptions: Array<{ text: string; is_correct: boolean }> | null
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

  // ─── Fill-blank manual ────────────────────────────────────────────────────
  const isFillManual =
    correctAnswer.startsWith('FILL_MANUAL:') ||
    (correctAnswer.startsWith('FILL:') && (extraData as any)?.grading_mode === 'manual')

  if (isFillManual) {
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

  // ─── Fill-blank auto ──────────────────────────────────────────────────────
  if (correctAnswer.startsWith('FILL:')) {
    let studentAnswers: string[] = []
    let correctAnswers: string[] = []
    try { studentAnswers = JSON.parse(studentAnswer ?? '[]') } catch { /* */ }
    try { correctAnswers = JSON.parse(correctAnswer.slice(5)) } catch { /* */ }

    if (correctAnswers.every(c => c.trim() === '')) {
      return (
        <div className="mt-2 space-y-2 text-sm">
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">รอครูผู้สอนตรวจสอบและให้คะแนน</p>
          {studentAnswers.map((ans, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground shrink-0 w-16">ช่อง {i + 1}:</span>
              <span className="font-medium">{ans || '—'}</span>
            </div>
          ))}
        </div>
      )
    }

    const blanks: Array<{ case_sensitive?: boolean }> = (extraData as any)?.blanks ?? []
    return (
      <div className="mt-2 space-y-2 text-sm">
        {correctAnswers.map((correct, i) => {
          const student = studentAnswers[i] ?? ''
          const cs = blanks[i]?.case_sensitive ?? false
          const partCorrect = cs
            ? student.trim() === correct.trim()
            : student.trim().toLowerCase() === correct.trim().toLowerCase()
          return (
            <div key={i} className="pl-3 border-l-2 border-border space-y-0.5">
              <p className="text-xs font-semibold text-muted-foreground">ช่อง {i + 1}</p>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0">คำตอบคุณ:</span>
                <span className={`font-medium ${partCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{student || '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0">เฉลย:</span>
                <span className="font-medium">{correct}</span>
              </div>
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
          const sv = parseFloat(student)
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
    </div>
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
