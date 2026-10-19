'use client'

import { useEffect, useId } from 'react'
import type { GradingAnswer } from '@/lib/grading-workspace'
import { scoreParts } from '@/lib/grading-workspace'
import type { Question } from '@/lib/types'
import type { GradingScoreDraftSource } from '@/lib/grading-score-drafts'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { useGradingBatch } from './grading-batch-provider'
import { GradingQuickScoreButtons } from './grading-quick-scores'

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
  const source: GradingScoreDraftSource = { answerId: answer.id, scoreEditedAt: answer.scoreEditedAt, parts, disabled: disabled || parts.needsAllocation }
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
    const unsaved = batch.unsavedDrafts[answer.id]?.fields[kind] !== undefined
    const unpublished = draft?.fields[kind] !== undefined
    const description = [error ? `${id}-error` : undefined, unpublished ? `${id}-${kind}-draft` : undefined].filter(Boolean).join(' ') || undefined
    return <Field key={kind} className="@container/score-part min-w-0 gap-1" data-invalid={!!error}>
      <FieldLabel htmlFor={`${id}-${kind}`} className="flex flex-wrap items-center gap-x-2 gap-y-0 text-xs text-muted-foreground">
        {label}{part.pending && savedValue === undefined && <span className="font-normal text-foreground/75">ยังไม่ตรวจ</span>}
      </FieldLabel>
      <div className="flex min-w-0 items-center gap-1 text-sm">
        <Input id={`${id}-${kind}`} type="number" min={0} max={part.maxScore} step="any" inputMode="decimal" aria-label={`${label}${studentName ? `ของ ${studentName}` : ''} ข้อ ${question.title}${occurrence ? ` ครั้งที่ตอบ ${occurrence}` : ''}`} aria-invalid={!!error} aria-describedby={description} value={value}
          onInput={event => {
            // React's change event can omit replacing a displayed 0 with 0.
            // The native input event records that explicit pending review.
            if (part.pending && event.currentTarget.value === value) batch.edit(source, kind, event.currentTarget.value)
          }}
          onChange={event => batch.edit(source, kind, event.target.value)} disabled={disabled || batch.workflowDisabled || batch.busy || parts.needsAllocation || !part.enabled} className={cn('h-8 w-16 shrink-0 px-2 text-center tabular-nums pointer-coarse:min-h-11', unpublished ? 'text-[color-mix(in_oklab,var(--warning)_60%,var(--foreground))]' : 'text-foreground')} />
        <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">/ {part.maxScore.toLocaleString('th-TH', { maximumFractionDigits: 6 })}</span>
        {unpublished && <Badge id={`${id}-${kind}-draft`} variant="statusWarning" className="h-auto min-h-5 min-w-0 max-w-full shrink whitespace-normal">{unsaved ? 'ยังไม่บันทึกคะแนน' : 'ร่างคะแนน · ยังไม่ส่ง'}</Badge>}
      </div>
      <GradingQuickScoreButtons maxScore={part.maxScore} disabled={disabled || batch.workflowDisabled || batch.busy || parts.needsAllocation || !part.enabled} label={label}
        onPick={score => batch.edit(source, kind, String(score))} />
    </Field>
  }

  return <div className="@container/score-fields flex min-w-0 flex-col gap-2" role="group" aria-label={`ให้คะแนน${studentName ? ` ${studentName}` : ''} · ${question.title}${occurrence ? ` ครั้งที่ตอบ ${occurrence}` : ''}`}>
    <FieldGroup className={parts.hasWork ? "grid gap-2 @min-[23rem]/score-fields:grid-cols-2" : "grid gap-2"}>
      {scoreField(parts.answer, 'answer')}
      {parts.hasWork && scoreField(parts.work, 'work')}
    </FieldGroup>
    {error && <Alert id={`${id}-error`} variant="destructive" className="py-1.5"><AlertDescription>{error}</AlertDescription></Alert>}
  </div>
}
