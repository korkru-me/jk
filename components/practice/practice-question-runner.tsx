'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  CircleDotDashed,
  LoaderCircle,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import { PracticeAnswerInput, QuestionImages } from '@/components/practice/practice-answer-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RichText } from '@/components/ui/rich-text'
import { Separator } from '@/components/ui/separator'
import { checkPracticeAnswer } from '@/lib/actions/practice-answers'
import type { SafeExamAnswer } from '@/lib/exam-safe'
import type { PracticeFeedback } from '@/lib/practice-question'
import { splitNumberedAnswerBlanks } from '@/lib/answer-blank'
import type { MathInputModes } from '@/lib/math/input-mode'
import type { MathInputMode } from '@/lib/types'
import { cn } from '@/lib/utils'

interface PracticeQuestionRunnerProps {
  libraryId: string
  libraryTitle: string
  question: SafeExamAnswer
  variantReceipt: string
  returnHref: string
  changesOnRefresh: boolean
}

type RetryEnvelope = {
  answer: string
  idempotencyKey: string
  mathInputModes: MathInputModes
  mathInputModesKey: string
}

function interpolateValues(
  text: string,
  values: Record<string, number>,
  variables: Array<{ name: string }>,
): string {
  let result = text
  for (const variable of variables) {
    if (values[variable.name] === undefined) continue
    const escaped = variable.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`\\{${escaped}\\}`, 'g'), String(values[variable.name]))
  }
  return result
}

function renderedQuestion(question: SafeExamAnswer): SafeExamAnswer {
  const variables = question.questions.variables
  const values = question.random_values
  return {
    ...question,
    questions: {
      ...question.questions,
      question_text: interpolateValues(question.questions.question_text, values, variables),
      answer_parts: question.questions.answer_parts?.map(part => ({
        ...part,
        sub_text: interpolateValues(part.sub_text, values, variables),
      })) ?? null,
    },
  }
}

const verdictText: Record<PracticeFeedback['verdict'], string> = {
  correct: 'ถูกต้อง',
  partial: 'ถูกบางส่วน',
  wrong: 'ยังไม่ตรง',
  pending: 'กำลังตรวจสอบ',
}

function FeedbackPanel({ feedback }: { feedback: PracticeFeedback }) {
  const successful = feedback.verdict === 'correct'
  const partial = feedback.verdict === 'partial' || feedback.verdict === 'pending'
  return (
    <section
      aria-live="polite"
      className={cn('flex flex-col gap-3 rounded-xl border p-3',
        successful
          ? 'border-success/40 bg-success/10'
          : partial
            ? 'border-warning/40 bg-warning/10'
            : 'border-destructive/40 bg-destructive/10',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {successful
          ? <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
          : partial
            ? <CircleDotDashed className="size-5 text-warning" aria-hidden="true" />
            : <XCircle className="size-5 text-destructive" aria-hidden="true" />}
        <h2 className="font-semibold">{verdictText[feedback.verdict]}</h2>
        <Badge variant="secondary">ตรวจแล้ว · ไม่คิดคะแนน</Badge>
        {feedback.revealed && <Badge variant="outline">แสดงเฉลย</Badge>}
      </div>
      {feedback.note && <p className="text-sm text-muted-foreground">{feedback.note}</p>}

      {feedback.choices && feedback.choices.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {feedback.choices.map(choice => {
            const pickedAndCorrect = choice.picked && feedback.verdict === 'correct'
            return (
              <div
                key={`${choice.label}-${choice.text}`}
                className={cn('flex min-h-10 flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                  choice.correct || pickedAndCorrect
                    ? 'border-success/40 bg-success/10'
                    : choice.picked
                      ? 'border-destructive/40 bg-destructive/10'
                      : 'border-border bg-background/50',
                )}
              >
                <span className="font-medium">{choice.label}</span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {choice.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={choice.imageUrl}
                      alt="รูปตัวเลือก"
                      className="max-h-16 max-w-24 shrink-0 rounded-md border border-border object-contain"
                    />
                  )}
                  <span>{choice.text || 'ตัวเลือกรูปภาพ'}</span>
                </span>
                {choice.picked && <Badge variant="outline">คำตอบของฉัน</Badge>}
                {choice.correct && <Badge variant="statusSuccess">คำตอบที่ถูก</Badge>}
              </div>
            )
          })}
        </div>
      )}

      {feedback.rows.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background/60">
          {feedback.rows.map((row, index) => (
            <div key={`${row.label ?? ''}-${index}`} className="grid min-h-10 gap-1 px-3 py-2 text-sm sm:grid-cols-[minmax(5rem,0.35fr)_minmax(0,1fr)]">
              <span className="text-muted-foreground">{row.label ?? 'คำตอบของฉัน'}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 break-words">{row.student}{row.unit ? ` ${row.unit}` : ''}</span>
                <Badge variant={row.status === 'correct' ? 'statusSuccess' : row.status === 'pending' ? 'statusWarning' : 'statusDestructive'}>
                  {row.status === 'correct' ? 'ถูก' : row.status === 'pending' ? 'รอตรวจ' : 'ยังไม่ตรง'}
                </Badge>
                {row.correct !== undefined && (
                  <span className="text-muted-foreground">เฉลย: {row.correct}{row.unit ? ` ${row.unit}` : ''}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function PracticeQuestionRunner({
  libraryId,
  libraryTitle,
  question: originalQuestion,
  variantReceipt,
  returnHref,
  changesOnRefresh,
}: PracticeQuestionRunnerProps) {
  const router = useRouter()
  const [answer, setAnswer] = useState('')
  const [mathInputModes, setMathInputModes] = useState<MathInputModes>({})
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState<RetryEnvelope | null>(null)
  const [refreshRequired, setRefreshRequired] = useState(false)
  const [pending, startTransition] = useTransition()
  const question = renderedQuestion(originalQuestion)
  const embedsQuestionText = question.questions.question_type === 'true_false'
    || question.questions.question_type === 'fill_blank'
    || (question.questions.question_type === 'written'
      && splitNumberedAnswerBlanks(question.questions.question_text).numbers.length > 0)

  function changeAnswer(next: string) {
    setAnswer(next)
    setFeedback(null)
    setError(null)
    setRetry(null)
  }

  function changeMathInputMode(partKey: string, mode: MathInputMode) {
    setMathInputModes(current => ({ ...current, [partKey]: mode }))
    setFeedback(null)
    setError(null)
    setRetry(null)
  }

  function check() {
    const mathInputModesKey = JSON.stringify(mathInputModes)
    const envelope = retry?.answer === answer && retry.mathInputModesKey === mathInputModesKey
      ? retry
      : {
          answer,
          idempotencyKey: crypto.randomUUID(),
          mathInputModes: { ...mathInputModes },
          mathInputModesKey,
        }
    setRetry(envelope)
    setError(null)
    startTransition(async () => {
      try {
        const result = await checkPracticeAnswer({
          libraryId,
          questionId: question.question_id,
          idempotencyKey: envelope.idempotencyKey,
          variantReceipt,
          answer: envelope.answer,
          mathInputModes: envelope.mathInputModes,
        })
        if (!result.ok) {
          setError(result.error)
          if (result.refreshRequired) setRefreshRequired(true)
          if (result.retryable === false) setRetry(null)
          return
        }
        setFeedback(result.feedback)
        setRetry(null)
      } catch {
        // Keep the same UUID for a retry: the server may have completed the
        // metadata insert even when the response was interrupted.
        setError('การเชื่อมต่อสะดุด กรุณากดตรวจคำตอบอีกครั้ง')
      }
    })
  }

  function tryAgain() {
    setAnswer('')
    setMathInputModes({})
    setFeedback(null)
    setError(null)
    setRetry(null)
    if (changesOnRefresh || refreshRequired) {
      startTransition(() => router.refresh())
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <header className="flex min-h-[64px] items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-[44px]"
          render={<Link href={returnHref} />}
          aria-label="กลับไปคลังโจทย์"
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">{libraryTitle}</p>
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-foreground">{question.questions.title}</h1>
            <Badge role="status" variant="secondary" aria-label="แบบฝึกเอง ไม่มีคะแนน">
              <span className="sm:hidden">ไม่มีคะแนน</span>
              <span className="hidden sm:inline">ฝึกเอง · ไม่มีคะแนน</span>
            </Badge>
          </div>
        </div>
      </header>

      <Card className="overflow-hidden">
        <section className="flex flex-col gap-4 p-4 sm:p-5">
          {!embedsQuestionText && (
            <RichText text={question.questions.question_text} className="text-base leading-relaxed" blocks />
          )}
          <QuestionImages urls={question.questions.image_urls} />
        </section>
        <Separator />
        <section className="flex flex-col gap-4 p-4 sm:p-5">
          <PracticeAnswerInput
            question={question}
            value={answer}
            onChange={changeAnswer}
            mathInputModes={mathInputModes}
            onMathInputModeChange={changeMathInputMode}
            disabled={pending}
          />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={check} disabled={pending || refreshRequired} className="min-h-[44px]">
              {pending ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" aria-hidden="true" />
              ) : (
                <CheckCircle2 data-icon="inline-start" aria-hidden="true" />
              )}
              {pending ? 'กำลังตรวจ…' : 'ตรวจคำตอบ'}
            </Button>
            {(feedback || error) && (
              <Button type="button" variant="outline" onClick={tryAgain} disabled={pending} className="min-h-[44px]">
                <RotateCcw data-icon="inline-start" aria-hidden="true" />
                {refreshRequired ? 'โหลดโจทย์ใหม่' : changesOnRefresh ? 'สุ่มโจทย์ใหม่' : 'ลองอีกครั้ง'}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">ระบบบันทึกเฉพาะว่าตรวจข้อนี้แล้ว ไม่เก็บคำตอบ ผลถูกผิด หรือคะแนน</p>
          </div>
        </section>
        {feedback && (
          <>
            <Separator />
            <div className="p-4 sm:p-5"><FeedbackPanel feedback={feedback} /></div>
          </>
        )}
      </Card>
    </div>
  )
}
