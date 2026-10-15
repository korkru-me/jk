import { CheckCircle2, XCircle, FileText } from 'lucide-react'
import type { AnswerPart, FillBlankItem, SubmittedFile } from '@/lib/types'
import { getBlankType, isBlankCorrect } from '@/lib/fill-blank'
import { CLASSIFY_UNSET, parseClassifyGrid } from '@/lib/classify'
import { IMAGE_LABEL_PREFIX, isImageLabelMarkerCorrect, parseImageLabelAnswer, parseImageLabelKey } from '@/lib/image-label'
import { evaluateStudentAnswer } from '@/lib/math/evaluator'
import { containsMath } from '@/lib/math/latex'
import { renderRichTextHtml } from '@/lib/rich-text-html'
import { choiceLabel, studentChoicePosition } from '@/lib/submission-choice-review'
import { buildAnswerFeedback } from '@/lib/answer-feedback'

const PART_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ']
const CHOICE_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ']

function formatAnswer(n: number): string {
  if (Math.abs(n) >= 1e6 || (Math.abs(n) < 0.001 && n !== 0)) return n.toExponential(3)
  return parseFloat(n.toPrecision(4)).toString()
}

export function SubmissionAnswerReview({
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
  correctAnswer: string | null
  isCorrect: boolean | null
  answerParts: AnswerPart[] | null
  answerUnit: string | null
  questionType?: string
  extraData?: Record<string, unknown>
  mcqOptions: Array<{ text: string; is_correct: boolean; index?: number; image_url?: string; left_text?: string; right_text?: string; left_image?: string }> | null
  workImages?: (string | null)[] | null
}) {
  correctAnswer = correctAnswer ?? ''
  // Translate stored structured answers using the existing feedback formatter;
  // never show TF/ordering JSON in place of the student's actual choices.
  if (correctAnswer === 'true' || correctAnswer === 'false' || correctAnswer.startsWith('TF:') || correctAnswer.startsWith('ORDER:')) {
    const feedback = buildAnswerFeedback({ correct_answer: correctAnswer, student_answer: studentAnswer, isCorrect, score: 0, maxScore: 1, revealAnswerKey: true,
      question: { question_type: questionType ?? 'written', answer_unit: answerUnit, answer_parts: answerParts, answer_tolerance: null, extra_data: extraData, mcq_options: mcqOptions } })
    return <div className="space-y-2 text-sm">{feedback.rows.map((row,i)=><div key={i} className="space-y-1 rounded-lg border border-border bg-muted/20 p-2.5">
      {row.label&&<p className="text-xs font-semibold text-muted-foreground">{row.label}</p>}
      <p><span className="text-muted-foreground">คำตอบของคุณ: </span><span className="font-medium">{row.student==='—'?'ไม่ได้ตอบ':row.student}</span></p>
      {row.correct!==undefined&&<p><span className="text-muted-foreground">เฉลย: </span><span className="font-medium">{row.correct}</span></p>}
    </div>)}</div>
  }
  // ─── Matching: the pairs in their authored order, each showing what the
  // student picked next to the right answer. mcqOptions holds MatchingPair
  // rows here (see MatchingPair in lib/types.ts); option_order shuffled only
  // the choices the student saw, not the prompts, so pair i still lines up
  // with the i-th entry of the stored answer.
  if (questionType === 'matching' && correctAnswer.startsWith('MATCH:')) {
    let correctRights: string[] = []
    let studentRights: string[] = []
    try { correctRights = JSON.parse(correctAnswer.slice(6)) } catch { /* keep empty */ }
    try { studentRights = JSON.parse(studentAnswer || '[]') } catch { /* keep empty */ }

    return (
      <div className="space-y-2 mt-2">
        {correctRights.map((right, i) => {
          const picked = studentRights[i] ?? ''
          const ok = picked.trim() === right.trim()
          const pair = mcqOptions?.[i]
          return (
            <div
              key={i}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 ${
                ok ? 'border-success bg-success/10' : 'border-destructive bg-destructive/10'
              }`}
            >
              {pair?.left_image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pair.left_image} alt="" loading="lazy" decoding="async" className="w-10 h-10 object-contain rounded border shrink-0" />
              )}
              <span className="text-sm flex-1 min-w-0">{pair?.left_text ?? `ข้อ ${i + 1}`}</span>
              <span className={`text-sm font-medium shrink-0 ${ok ? 'text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))]' : 'text-[color-mix(in_oklab,var(--destructive)_75%,var(--foreground))]'}`}>
                {picked || '—'}
              </span>
              {!ok && (
                <span className="text-xs font-semibold text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))] shrink-0 flex items-center gap-1">
                  <CheckCircle2 size={13} /> {right}
                </span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ─── MCQ: show all options with color highlighting ───────────────────────
  if (questionType === 'mcq' && mcqOptions && mcqOptions.length > 0) {
    const pickedPosition = studentChoicePosition(studentAnswer, mcqOptions)
    const correctPosition = studentChoicePosition(correctAnswer, mcqOptions)
    return (
      <div className="space-y-2 mt-2">
        <p className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-muted-foreground">คำตอบของคุณ:</span>
          <span className="font-semibold text-foreground">
            {!studentAnswer?.trim() ? 'ไม่ได้ตอบข้อนี้' : pickedPosition !== null
              ? `${choiceLabel(pickedPosition)}${mcqOptions[pickedPosition].text ? ` · ${mcqOptions[pickedPosition].text}` : ' · ตัวเลือกรูปภาพ'}`
              : studentAnswer.startsWith('MCQ:') ? 'คำตอบที่บันทึกไว้ไม่ตรงกับตัวเลือกชุดนี้' : studentAnswer}
          </span>
        </p>
        {mcqOptions.map((opt, i) => {
          // Answers are recorded as MCQ:<position>; anything older stored the
          // option's text, so both are accepted here.
          const isStudentChoice = pickedPosition === i
          // Prefer this attempt's banked key if the teacher edited the source.
          const isCorrectOpt = correctPosition !== null ? correctPosition === i : opt.is_correct

          let wrapClass = 'border-border bg-background'
          let labelClass = 'text-muted-foreground'
          let indicator = null

          if (isCorrectOpt) {
            wrapClass = 'border-success bg-success/10'
            labelClass = 'text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))]'
            indicator = (
              <span className="text-xs font-semibold text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))] shrink-0 flex items-center gap-1">
                <CheckCircle2 size={13} /> เฉลย
              </span>
            )
          } else if (isStudentChoice && !isCorrectOpt) {
            wrapClass = 'border-destructive bg-destructive/10'
            labelClass = 'text-[color-mix(in_oklab,var(--destructive)_75%,var(--foreground))]'
            indicator = (
              <span className="text-xs font-semibold text-[color-mix(in_oklab,var(--destructive)_75%,var(--foreground))] shrink-0 flex items-center gap-1">
                <XCircle size={13} /> คำตอบของคุณ
              </span>
            )
          }

          return (
            <div key={i} className={`flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border ${wrapClass}`}>
              <span className={`text-sm font-bold shrink-0 w-5 ${labelClass}`}>{choiceLabel(i)}</span>
              {opt.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={opt.image_url} alt="" loading="lazy" decoding="async" className="max-h-24 w-auto object-contain rounded border shrink-0" />
              )}
              {opt.text !== CHOICE_LABELS[i] && (
                <span className={`text-sm flex-1 ${isCorrectOpt || (isStudentChoice && !isCorrectOpt) ? 'font-medium ' + labelClass : 'text-foreground'}`}>
                  {opt.text}
                </span>
              )}
              {isStudentChoice && isCorrectOpt && <span className="text-xs font-semibold text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))]">คำตอบของคุณ</span>}
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
            ? 'bg-success/10 text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))] dark:bg-success/15'
            : 'bg-destructive/10 text-[color-mix(in_oklab,var(--destructive)_75%,var(--foreground))]'
        }`}>
          {submitted ? '✓ ส่งแล้ว' : '✗ ไม่ได้ส่งไฟล์'}
        </span>
        {files.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {files.map((f, i) => (
              f.type.startsWith('image/') ? (
                <a key={i} href={f.url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.name} loading="lazy" decoding="async" className="w-20 h-20 rounded-lg object-cover border hover:opacity-90 transition-opacity" />
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

  // ─── Essay: writing a teacher reads ──────────────────────────────────────
  // There is no answer key to compare against, so no เฉลย row is shown here.
  // Showing one is exactly what put "undefined" — the value an essay's empty
  // answer_formula evaluated to — in front of students, back when an essay had
  // no branch of its own and fell through to the single-answer display at the
  // bottom. Keyed on question_type, so rows still carrying that frozen string
  // stop displaying it too.
  if (questionType === 'essay') {
    return (
      <div className="mt-2 space-y-2 text-sm">
        {isCorrect === null && (
          <p className="text-xs text-warning font-medium">รอครูผู้สอนตรวจสอบและให้คะแนน</p>
        )}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">คำตอบคุณ:</p>
          <p className="whitespace-pre-wrap break-words font-medium">{studentAnswer?.trim() || '—'}</p>
        </div>
      </div>
    )
  }

  // ─── Fill-blank manual (legacy, pre-dates per-blank types) ───────────────
  if (correctAnswer.startsWith('FILL_MANUAL:')) {
    let studentAnswers: string[] = []
    try { studentAnswers = JSON.parse(studentAnswer ?? '[]') } catch { /* */ }
    return (
      <div className="mt-2 space-y-2 text-sm">
        <p className="text-xs text-warning font-medium">รอครูผู้สอนตรวจสอบและให้คะแนน</p>
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
              <div key={i} className="pl-3 border-l-2 border-warning/20 space-y-0.5">
                <p className="text-xs font-semibold text-warning">ช่อง {i + 1} — รอครูตรวจ</p>
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
                <span className={`font-medium ${partCorrect ? 'text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))]' : 'text-[color-mix(in_oklab,var(--destructive)_75%,var(--foreground))]'}`}>{student || '—'}</span>
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

  // ─── ตารางจำแนก — one line per keyed cell, named by where it sits ────────
  // Unlike the COMP: branch below, this reads the question's own config rather
  // than the frozen key alone: a grid of option positions is unreadable as
  // digits, and "ช่อง 3" tells a teacher nothing about which row a student
  // misread. Cells the teacher never keyed are skipped — they were left out of
  // the score, so there is nothing to report about them.
  if (correctAnswer.startsWith('CLS:')) {
    const correctGrid = parseClassifyGrid(correctAnswer.slice(4))
    const studentGrid = parseClassifyGrid(studentAnswer ?? '')
    const config = (extraData ?? {}) as {
      columns?: Array<{ title?: string; options?: string[] }>
      rows?: Array<{ text?: string }>
    }
    const columns = Array.isArray(config.columns) ? config.columns : []
    const configRows = Array.isArray(config.rows) ? config.rows : []
    const optionText = (c: number, index: number) => {
      const option = columns[c]?.options?.[index]
      return typeof option === 'string' && option.trim() !== '' ? option : `ตัวเลือกที่ ${index + 1}`
    }
    const plain = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()

    const cells: Array<{ key: string; row: string; column: string; student: string; correct: string; ok: boolean }> = []
    correctGrid.forEach((keyRow, r) => keyRow.forEach((key, c) => {
      if (key === CLASSIFY_UNSET) return
      const picked = studentGrid[r]?.[c] ?? CLASSIFY_UNSET
      cells.push({
        key: `${r}-${c}`,
        row: plain(configRows[r]?.text ?? '') || `แถวที่ ${r + 1}`,
        column: columns[c]?.title?.trim() || `มิติที่ ${c + 1}`,
        student: picked === CLASSIFY_UNSET ? '—' : optionText(c, picked),
        correct: optionText(c, key),
        ok: picked === key,
      })
    }))

    return (
      <div className="mt-2 space-y-2 text-sm">
        {cells.map(cell => (
          <div key={cell.key} className={`pl-3 border-l-2 space-y-0.5 ${cell.ok ? 'border-success/30' : 'border-destructive/30'}`}>
            <p className={`text-xs font-semibold ${cell.ok ? 'text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))]' : 'text-[color-mix(in_oklab,var(--destructive)_75%,var(--foreground))]'}`}>
              {cell.ok ? '✓' : '✗'} {cell.row} · {cell.column}
            </p>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-24 shrink-0">คำตอบคุณ:</span>
              <span className="font-medium">{cell.student}</span>
            </div>
            {!cell.ok && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0">เฉลย:</span>
                <span className="font-medium">{cell.correct}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  // ─── เติมคำในรูป — one line per keyed point, named after the point ──────
  // Like the classify branch above, this reads the question's own config as
  // well as the frozen key: the key knows what each point should say but not
  // which place on the picture it is, and "จุดที่ 3" sends a teacher back to
  // count dots. Points the teacher never keyed are skipped — they were left
  // out of the score, so there is nothing to report about them.
  if (correctAnswer.startsWith(IMAGE_LABEL_PREFIX)) {
    const key = parseImageLabelKey(correctAnswer.slice(IMAGE_LABEL_PREFIX.length))
    const answers = parseImageLabelAnswer(studentAnswer ?? '')
    const config = (extraData ?? {}) as { markers?: Array<{ label?: string }> }
    const markers = Array.isArray(config.markers) ? config.markers : []
    const plain = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()

    const points = key.flatMap((marker, index) => {
      if (marker.answers.length === 0) return []
      const student = (answers[index] ?? '').trim()
      return [{
        key: String(index),
        name: plain(markers[index]?.label ?? '') || `จุดที่ ${index + 1}`,
        student: student || '—',
        correct: marker.answers.join(' หรือ '),
        ok: isImageLabelMarkerCorrect(answers[index] ?? '', marker),
      }]
    })

    return (
      <div className="mt-2 space-y-2 text-sm">
        {points.map(point => (
          <div key={point.key} className={`pl-3 border-l-2 space-y-0.5 ${point.ok ? 'border-success/30' : 'border-destructive/30'}`}>
            <p className={`text-xs font-semibold ${point.ok ? 'text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))]' : 'text-[color-mix(in_oklab,var(--destructive)_75%,var(--foreground))]'}`}>
              {point.ok ? '✓' : '✗'} {point.name}
            </p>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-24 shrink-0">คำตอบคุณ:</span>
              <span className="font-medium">{point.student}</span>
            </div>
            {!point.ok && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0">เฉลย:</span>
                <span className="font-medium">{point.correct}</span>
              </div>
            )}
          </div>
        ))}
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
              <div key={i} className="pl-3 border-l-2 border-warning/20 space-y-0.5">
                <p className="text-xs font-semibold text-warning">ข้อ {label} — รอครูตรวจ</p>
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
                <span className={`font-medium ${partCorrect ? 'text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))]' : 'text-[color-mix(in_oklab,var(--destructive)_75%,var(--foreground))]'}`}>{studentDisplay}</span>
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
                <span className={`font-medium ${partCorrect ? 'text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))]' : 'text-[color-mix(in_oklab,var(--destructive)_75%,var(--foreground))]'}`}>
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
        <span className={`font-medium ${isCorrect ? 'text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))]' : 'text-[color-mix(in_oklab,var(--destructive)_75%,var(--foreground))]'}`}>
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
      <img src={url} alt="รูปวิธีทำ" loading="lazy" decoding="async" className="w-24 h-24 rounded-lg object-cover border hover:opacity-90 transition-opacity" />
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
  const isHtml = /<[a-z][\s\S]*>/i.test(html) || containsMath(html)
  if (isHtml) {
    return <span className="[&_p]:inline" dangerouslySetInnerHTML={{ __html: renderRichTextHtml(html) }} />
  }
  return <>{html}</>
}

export function QuestionText({ text, className }: { text: string; className?: string }) {
  const isHtml = /<[a-z][\s\S]*>/i.test(text) || containsMath(text)
  if (isHtml) {
    return <div className={`rich-text-content ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: renderRichTextHtml(text) }} />
  }
  return <p className={`whitespace-pre-line ${className ?? ''}`}>{text}</p>
}
