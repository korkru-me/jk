'use client'

import { useEffect, useState } from 'react'
import { Check, Eraser, Loader2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { partLabels } from '@/lib/part-labels'
import type { AnswerFeedback } from '@/lib/answer-feedback'
import type { TeachingQuestionView } from './teaching-mode-client'

/** One thing the teacher fills in — a value, a ถูก/ผิด, or one ตัวเลือก. */
export interface TryField {
  label: string
  kind: 'text' | 'truefalse' | 'choice'
}

/**
 * What the teacher fills in for this ข้อ, or null for one this cannot take.
 *
 * A `choice` or `truefalse` field is answered by pressing the ตัวเลือก in the
 * question itself, exactly as a student would; only `text` fields need a box.
 * จับคู่ / เรียงลำดับ / ผสม need the student's drag-and-drop layout to answer
 * at all, and บรรยาย / ส่งไฟล์ have no auto-verdict to give — those keep the
 * เฉลย button alone.
 */
export function tryFields(question: TeachingQuestionView): TryField[] | null {
  const extra = question.extra_data as any
  const correct = question.correctAnswer ?? ''

  switch (question.question_type) {
    case 'essay':
    case 'file_upload':
    case 'matching':
    case 'ordering':
    case 'composite':
      return null
    case 'mcq':
      return (question.mcq_options ?? []).length > 0 ? [{ label: '', kind: 'choice' }] : null
    case 'true_false': {
      // The ข้อ's own text is statement 0 and `extra.statements` follow it —
      // the order buildAssignmentAttempt freezes into the TF: answer.
      const statements = (extra?.statements ?? []) as unknown[]
      return [{ label: '', kind: 'truefalse' as const }].concat(
        statements.map(() => ({ label: '', kind: 'truefalse' as const })),
      )
    }
    case 'fill_blank': {
      const blanks = (extra?.blanks ?? []) as unknown[]
      return blanks.length > 0
        ? blanks.map((_, index) => ({ label: `ช่อง ${index + 1}`, kind: 'text' as const }))
        : null
    }
    default: {
      if (!correct.startsWith('[')) return [{ label: '', kind: 'text' }]
      const parts = question.answer_parts ?? []
      const labels = partLabels(extra?.part_label_style)
      return parts.map((_, index) => ({ label: labels[index] ?? `${index + 1}`, kind: 'text' as const }))
    }
  }
}

/**
 * Packs the boxes into the one string `gradeAnswer` reads, in exactly the
 * shape a student's attempt would have stored — that is what makes the
 * verdict here the same verdict the class would get.
 */
function encodeAnswer(question: TeachingQuestionView, values: string[]): string {
  const extra = question.extra_data as any
  if (question.question_type === 'mcq') return values[0] ?? ''
  if (question.question_type === 'true_false') {
    const statements = (extra?.statements ?? []) as unknown[]
    return statements.length > 0 ? JSON.stringify({ answers: values }) : values[0] ?? ''
  }
  if (question.question_type === 'fill_blank') return JSON.stringify(values)
  if ((question.correctAnswer ?? '').startsWith('[')) return JSON.stringify(values)
  return values[0] ?? ''
}

const VERDICT_LABEL: Record<AnswerFeedback['verdict'], string> = {
  correct: 'ถูกต้อง',
  partial: 'ถูกบางส่วน',
  wrong: 'ยังไม่ถูก',
  pending: 'ข้อนี้ครูตรวจเอง',
}

/**
 * The teacher's answer box and its verdict, laid out the way the student's
 * own ข้อ is: no panel heading, because a field under a question already
 * says "answer here", and no second copy of the ตัวเลือก — a ปรนัย or a
 * ถูก/ผิด is answered by pressing the choice in the question itself, which
 * is what the class is looking at.
 *
 * It grades in the browser with the same `gradeAnswer` + `buildAnswerFeedback`
 * a real attempt goes through — teacher preview already does this — so the
 * ถูก/ผิด shown here is the one the students would get. Both modules reach the
 * evaluator (~640 KB), so they load only when the button is pressed.
 */
export function TeachingAnswerCheck({ question, fields, values, onChange, onClear, revealAnswerKey }: {
  question: TeachingQuestionView
  fields: TryField[]
  values: string[]
  onChange: (index: number, value: string) => void
  onClear: () => void
  revealAnswerKey: boolean
}) {
  const [result, setResult] = useState<AnswerFeedback | null>(null)
  const [checking, setChecking] = useState(false)

  // Any edit — here or on a choice in the question — retires the verdict.
  useEffect(() => { setResult(null) }, [values])

  const answered = values.some(value => value.trim() !== '')
  const typed = fields
    .map((field, index) => ({ field, index }))
    .filter(entry => entry.field.kind === 'text')

  const check = async () => {
    if (checking || !answered) return
    setChecking(true)
    try {
      const [{ gradeAnswer, naturalMaxScore }, { buildAnswerFeedback }] = await Promise.all([
        import('@/lib/assignment-attempt'),
        import('@/lib/answer-feedback'),
      ])
      const maxScore = naturalMaxScore(
        question.question_type,
        question.extra_data,
        question.answer_parts ?? null,
      )
      const gradable = {
        id: question.id,
        correct_answer: question.correctAnswer ?? '',
        student_answer: encodeAnswer(question, values),
        math_input_modes: {},
        max_score: maxScore,
        questions: {
          question_type: question.question_type,
          answer_tolerance: question.answer_tolerance ?? 0.1,
          answer_parts: question.answer_parts ?? null,
          extra_data: question.extra_data,
        },
      }
      const graded = gradeAnswer(gradable)
      setResult(buildAnswerFeedback({
        correct_answer: gradable.correct_answer,
        student_answer: gradable.student_answer,
        math_input_modes: gradable.math_input_modes,
        question: {
          question_type: question.question_type,
          answer_unit: question.answer_unit,
          answer_parts: question.answer_parts ?? null,
          answer_tolerance: question.answer_tolerance ?? 0.1,
          extra_data: question.extra_data,
          mcq_options: question.mcq_options ?? null,
          solution_text: question.solution_text ?? null,
          solution_image_urls: question.solution_image_urls ?? null,
        },
        isCorrect: graded.is_correct,
        score: graded.score,
        maxScore,
        revealAnswerKey,
      }))
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="space-y-2">
      {typed.map(({ field, index }) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          {field.label && <span className="min-w-8 text-sm font-semibold text-muted-foreground">{field.label}</span>}
          <Input
            value={values[index] ?? ''}
            onChange={event => onChange(index, event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void check() } }}
            placeholder="พิมพ์คำตอบ เช่น 10, 9+1 หรือ sin(30)"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            aria-label={field.label ? `คำตอบ ${field.label}` : 'คำตอบ'}
            className="h-9 min-w-40 flex-1 font-mono"
          />
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="xs" onClick={() => void check()} disabled={!answered || checking}>
          {checking ? <Loader2 className="animate-spin" /> : <Check />}
          {checking ? 'กำลังตรวจ...' : 'ตรวจคำตอบ'}
        </Button>
        {(answered || result) && (
          <Button type="button" size="xs" variant="ghost" onClick={onClear}>
            <Eraser /> ล้าง
          </Button>
        )}
        {!revealAnswerKey && (
          <span className="ml-auto text-[11px] text-muted-foreground">กด “แสดงเฉลย” เพื่อให้บอกคำตอบที่ถูกด้วย</span>
        )}
      </div>

      {result && (
        <div className="space-y-2 rounded-xl bg-muted/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={result.verdict === 'wrong' ? 'destructive' : result.verdict === 'correct' ? 'outline' : 'secondary'}
              className={result.verdict === 'correct' ? 'border-success/40 bg-success/10 text-success' : undefined}
            >
              {result.verdict === 'correct' ? <Check /> : result.verdict === 'wrong' ? <X /> : null}
              {VERDICT_LABEL[result.verdict]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              ได้ {Number(result.score.toFixed(2))} / {Number(result.maxScore.toFixed(2))} คะแนน
            </span>
          </div>
          {result.note && <p className="text-xs text-muted-foreground">{result.note}</p>}
          <div className="space-y-1">
            {result.rows.map((row, index) => (
              <div key={index} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                {row.label && <span className="font-semibold text-muted-foreground">{row.label}</span>}
                <span className={
                  row.status === 'correct' ? 'font-mono text-success'
                    : row.status === 'wrong' ? 'font-mono text-destructive'
                      : 'font-mono text-muted-foreground'
                }>
                  {row.student}{row.unit ? ` ${row.unit}` : ''}
                </span>
                {row.correct !== undefined && row.status !== 'correct' && (
                  <span className="text-xs text-muted-foreground">
                    เฉลย: <span className="font-mono">{row.correct}{row.unit ? ` ${row.unit}` : ''}</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
