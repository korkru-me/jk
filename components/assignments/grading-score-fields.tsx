'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { GradingAnswer } from '@/lib/grading-workspace'
import { scoreParts } from '@/lib/grading-workspace'
import { saveGradingReview } from '@/lib/actions/grading-review'
import type { Question } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

export interface GradingScoreFieldsProps {
  assignmentId: string
  answer: GradingAnswer
  question: Question
  save?: typeof saveGradingReview
  disabled?: boolean
  studentName?: string
  occurrence?: number
}

/** Each answer owns its draft, so another answer's save/refresh cannot erase it. */
export function GradingScoreFields({ assignmentId, answer, question, save = saveGradingReview, disabled = false, studentName, occurrence }: GradingScoreFieldsProps) {
  const router = useRouter()
  const id = useId()
  const parts = scoreParts(answer, question)
  const [answerDraft, setAnswerDraft] = useState(String(parts.answer.score))
  const [workDraft, setWorkDraft] = useState(String(parts.work.score))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dirty = useRef(false)
  const expectedRevision = useRef(answer.scoreEditedAt)
  const revision = JSON.stringify([answer.id, answer.scoreEditedAt, parts.answer.score, parts.work.score, parts.answer.maxScore, parts.work.maxScore, parts.answer.pending, parts.work.pending])
  useEffect(() => {
    if (!dirty.current) { setAnswerDraft(String(parts.answer.score)); setWorkDraft(String(parts.work.score)); expectedRevision.current = answer.scoreEditedAt }
    // A refreshed server row updates clean inputs only; drafts survive failed/concurrent saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision])

  if (answer.isVoid || answer.maxScore <= 0) return <Badge variant="secondary">โมฆะ · ไม่นับคะแนน</Badge>

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || disabled) return
    const values: { answerScore?: number; workScore?: number } = {}
    for (const [key, draft, part] of [['answerScore', answerDraft, parts.answer], ['workScore', workDraft, parts.work]] as const) {
      if (!part.enabled || (key === 'workScore' && !parts.hasWork)) continue
      const value = draft.trim() === '' ? NaN : Number(draft)
      if (!Number.isFinite(value) || value < 0 || value > part.maxScore) {
        setError(`${key === 'workScore' ? 'คะแนนวิธีทำ' : 'คะแนนคำตอบ'}ต้องอยู่ระหว่าง 0–${part.maxScore}`)
        return
      }
      if (part.pending || value !== part.score) values[key] = value
    }
    if (values.answerScore === undefined && values.workScore === undefined) {
      setError(parts.answer.enabled || parts.work.enabled ? 'คะแนนนี้บันทึกแล้ว' : 'ยังไม่สามารถแก้คะแนนข้อนี้ได้')
      return
    }
    setError(''); setBusy(true)
    try {
      const result = await save({ assignmentId, answerId: answer.id, expectedScoreEditedAt: expectedRevision.current, ...values })
      if ('error' in result) { setError(result.error); return }
      dirty.current = false
      toast.success('บันทึกคะแนนแล้ว')
      router.refresh()
    } catch {
      setError('บันทึกคะแนนไม่สำเร็จ ร่างคะแนนยังอยู่ กรุณาลองใหม่')
    } finally { setBusy(false) }
  }

  function scoreField(part: typeof parts.answer, kind: 'answer' | 'work') {
    const label = kind === 'work' ? 'คะแนนวิธีทำ' : parts.hasWork || parts.needsAllocation ? 'คะแนนคำตอบ' : 'คะแนน'
    return <Field key={kind} className="w-auto min-w-24 gap-1" data-invalid={!!error}>
      <FieldLabel htmlFor={`${id}-${kind}`} className="flex flex-wrap items-center gap-x-2 gap-y-0 text-xs text-muted-foreground">
        {label}{part.pending && <span className="font-normal text-foreground/75">ยังไม่ตรวจ</span>}
      </FieldLabel>
      <div className="flex items-center gap-1 text-sm">
        <Input id={`${id}-${kind}`} type="number" required min={0} max={part.maxScore} step="any" inputMode="decimal" aria-label={`${label}${studentName ? `ของ ${studentName}` : ''} ข้อ ${question.title}${occurrence ? ` ครั้งที่ตอบ ${occurrence}` : ''}`} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} value={kind === 'answer' ? answerDraft : workDraft} onChange={event => { if (!dirty.current) expectedRevision.current = answer.scoreEditedAt; dirty.current = true; setError(''); (kind === 'answer' ? setAnswerDraft : setWorkDraft)(event.target.value) }} disabled={disabled || busy || !part.enabled} className="h-8 w-16 px-2 text-center tabular-nums pointer-coarse:min-h-11" />
        <span className="text-xs tabular-nums text-muted-foreground">/ {part.maxScore.toLocaleString('th-TH', { maximumFractionDigits: 6 })}</span>
      </div>
    </Field>
  }

  return <form onSubmit={submit} className="flex min-w-0 flex-col gap-2" aria-label={`ให้คะแนน${studentName ? ` ${studentName}` : ''} · ${question.title}${occurrence ? ` ครั้งที่ตอบ ${occurrence}` : ''}`}>
    <FieldGroup className="flex-row flex-wrap items-end gap-x-3 gap-y-2">
      {scoreField(parts.answer, 'answer')}
      {parts.hasWork && scoreField(parts.work, 'work')}
      <Button type="submit" variant="outline" className="pointer-coarse:min-h-11" disabled={disabled || busy || (!parts.answer.enabled && !parts.work.enabled)}>
        {busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}{busy ? 'กำลังบันทึก' : 'บันทึก'}
      </Button>
    </FieldGroup>
    {error && <Alert id={`${id}-error`} variant="destructive" className="py-1.5"><AlertDescription>{error}</AlertDescription></Alert>}
  </form>
}
