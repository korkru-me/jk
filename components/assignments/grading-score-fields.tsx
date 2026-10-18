'use client'

import { useEffect, useId } from 'react'
import type { GradingAnswer } from '@/lib/grading-workspace'
import { scoreParts } from '@/lib/grading-workspace'
import type { Question } from '@/lib/types'
import type { GradingScoreDraftSource } from '@/lib/grading-score-drafts'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { useGradingBatch } from './grading-batch-provider'

export interface GradingScoreFieldsProps {
  answer: GradingAnswer
  question: Question
  disabled?: boolean
  studentName?: string
  occurrence?: number
}

export function GradingScoreFields({ answer, question, disabled = false, studentName, occurrence }: GradingScoreFieldsProps) {
  const id = useId()
  const batch = useGradingBatch()
  const parts = scoreParts(answer, question)
  const source: GradingScoreDraftSource = { answerId: answer.id, scoreEditedAt: answer.scoreEditedAt, parts, disabled }
  const revision = JSON.stringify(source)
  const { registerSource } = batch
  useEffect(() => {
    registerSource(source)
    // Server updates refresh clean rows only; the provider owns dirty snapshots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, registerSource])
  const draft = batch.drafts[answer.id]
  const saved = batch.awaiting[answer.id]?.input
  const error = batch.rowErrors[answer.id]

  if (answer.isVoid || answer.maxScore <= 0) return <Badge variant="secondary">โมฆะ · ไม่นับคะแนน</Badge>

  function scoreField(part: typeof parts.answer, kind: 'answer' | 'work') {
    const label = kind === 'work' ? 'คะแนนวิธีทำ' : parts.hasWork || parts.needsAllocation ? 'คะแนนคำตอบ' : 'คะแนน'
    const savedValue = kind === 'answer' ? saved?.answerScore : saved?.workScore
    const value = draft?.fields[kind] ?? String(savedValue ?? part.score)
    return <Field key={kind} className="w-auto min-w-24 gap-1" data-invalid={!!error}>
      <FieldLabel htmlFor={`${id}-${kind}`} className="flex flex-wrap items-center gap-x-2 gap-y-0 text-xs text-muted-foreground">
        {label}{part.pending && savedValue === undefined && <span className="font-normal text-foreground/75">ยังไม่ตรวจ</span>}
      </FieldLabel>
      <div className="flex items-center gap-1 text-sm">
        <Input id={`${id}-${kind}`} type="number" min={0} max={part.maxScore} step="any" inputMode="decimal" aria-label={`${label}${studentName ? `ของ ${studentName}` : ''} ข้อ ${question.title}${occurrence ? ` ครั้งที่ตอบ ${occurrence}` : ''}`} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} value={value}
          onInput={event => {
            // React's change event can omit replacing a displayed 0 with 0.
            // The native input event records that explicit pending review.
            if (part.pending && event.currentTarget.value === value) batch.edit(source, kind, event.currentTarget.value)
          }}
          onChange={event => batch.edit(source, kind, event.target.value)} disabled={disabled || batch.busy || !part.enabled} className="h-8 w-16 px-2 text-center tabular-nums pointer-coarse:min-h-11" />
        <span className="text-xs tabular-nums text-muted-foreground">/ {part.maxScore.toLocaleString('th-TH', { maximumFractionDigits: 6 })}</span>
      </div>
    </Field>
  }

  return <div className="flex min-w-0 flex-col gap-2" role="group" aria-label={`ให้คะแนน${studentName ? ` ${studentName}` : ''} · ${question.title}${occurrence ? ` ครั้งที่ตอบ ${occurrence}` : ''}`}>
    <FieldGroup className="flex-row flex-wrap items-end gap-x-3 gap-y-2">
      {scoreField(parts.answer, 'answer')}
      {parts.hasWork && scoreField(parts.work, 'work')}
    </FieldGroup>
    {error && <Alert id={`${id}-error`} variant="destructive" className="py-1.5"><AlertDescription>{error}</AlertDescription></Alert>}
  </div>
}
