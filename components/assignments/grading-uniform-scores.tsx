'use client'

import { useId, useMemo, useState } from 'react'
import { ChevronDown, Users } from 'lucide-react'
import { scoreParts, type GradingWorkspaceData } from '@/lib/grading-workspace'
import type { GradingScoreDraftSource, GradingScoreKind } from '@/lib/grading-score-drafts'
import { prepareUniformGradingScore, uniformGradingScope } from '@/lib/grading-uniform-scores'
import type { Question } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useGradingDisclosure } from './use-grading-disclosure'
import { useGradingBatch } from './grading-batch-provider'

export function GradingUniformScores({ data, question }: { data: GradingWorkspaceData; question: Question }) {
  const batch = useGradingBatch()
  const { open, setOpen, root } = useGradingDisclosure()
  const [kind, setKind] = useState<GradingScoreKind>('answer')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const id = useId()
  const answers = useMemo(() => data.answers.filter(answer => answer.questionId === question.id), [data.answers, question.id])
  const sources = useMemo(() => answers.map((answer): GradingScoreDraftSource => {
    const parts = scoreParts(answer, question)
    return { answerId: answer.id, scoreEditedAt: answer.scoreEditedAt, parts,
      disabled: data.reviewAvailable === false || data.draftsAvailable === false || answer.isVoid
        || parts.maxScore <= 0 || parts.needsAllocation || data.voidedQuestionIds.includes(question.id) }
  }), [answers, question, data.reviewAvailable, data.draftsAvailable, data.voidedQuestionIds])
  const scope = uniformGradingScope(sources, kind)
  const selectedIds = new Set(scope.targets.map(source => source.answerId))
  const people = new Set(answers.filter(answer => selectedIds.has(answer.id)).map(answer => answer.studentId)).size
  const blocked = batch.busy || batch.workflowDisabled

  function fill() {
    if (blocked) return
    const plan = prepareUniformGradingScore(sources, kind, value)
    if (!plan.ok) { setError(plan.error); setNotice(''); return }
    for (const source of plan.targets) batch.edit(source, kind, String(plan.score))
    setError(''); setNotice(`ใส่ร่าง ${plan.targets.length} คำตอบแล้ว กดบันทึกร่าง หรือบันทึกและแจ้งนักเรียน`)
  }

  return <Collapsible ref={root} open={open} onOpenChange={setOpen} className="contents">
    <CollapsibleTrigger render={<Button type="button" size="sm" variant="outline" className="pointer-coarse:min-h-11" />}>
      <Users data-icon="inline-start" aria-hidden="true" />ให้คะแนนเท่ากันทุกคน<ChevronDown data-icon="inline-end" aria-hidden="true" />
    </CollapsibleTrigger>
    <CollapsibleContent className="order-last w-full min-w-0 basis-full">
      <div className="flex min-w-0 flex-col gap-2 pt-2">
        <p className="text-xs text-muted-foreground">ทุกห้องและทุกหน้า · {people} คน · {scope.targets.length} คำตอบของข้อนี้</p>
        {scope.excludedCount > 0 && <p className="text-xs text-muted-foreground">ไม่รวม {scope.excludedCount} คำตอบที่ไม่มีส่วนคะแนนนี้หรือแก้คะแนนไม่ได้</p>}
        <FieldGroup className="flex-row flex-wrap items-end gap-2">
          <Field className="w-auto gap-1" data-disabled={blocked}>
            <FieldLabel htmlFor={`${id}-kind`} className="text-xs text-muted-foreground">ส่วนคะแนน</FieldLabel>
            <NativeSelect id={`${id}-kind`} value={kind} disabled={blocked} className="w-auto pointer-coarse:min-h-11" onChange={event => { setKind(event.target.value === 'work' ? 'work' : 'answer'); setError(''); setNotice('') }}>
              <option value="answer">คำตอบ</option><option value="work">วิธีทำ</option>
            </NativeSelect>
          </Field>
          <Field className="w-auto gap-1" data-invalid={!!error} data-disabled={blocked || !scope.targets.length}>
            <FieldLabel htmlFor={`${id}-score`} className="text-xs text-muted-foreground">คะแนนเดียวกัน · 0–{scope.maxScore}</FieldLabel>
            <Input id={`${id}-score`} type="number" inputMode="decimal" min={0} max={scope.maxScore} step="any" value={value}
              onChange={event => { setValue(event.target.value); setError(''); setNotice('') }} disabled={blocked || !scope.targets.length}
              aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className="w-28 tabular-nums pointer-coarse:min-h-11" />
          </Field>
          <Button type="button" size="sm" variant="outline" className="pointer-coarse:min-h-11" disabled={blocked || !scope.targets.length} onClick={fill}>ใส่ร่างให้ทุกคน</Button>
        </FieldGroup>
        {error && <Alert id={`${id}-error`} variant="destructive" className="py-1.5"><AlertDescription>{error}</AlertDescription></Alert>}
        {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
      </div>
    </CollapsibleContent>
  </Collapsible>
}
