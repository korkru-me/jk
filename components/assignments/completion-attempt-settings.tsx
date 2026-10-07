'use client'

import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { ScoreStrategy } from '@/lib/types'

const SCORE_STRATEGY_CONTROL_LABELS: Record<ScoreStrategy, string> = {
  best: 'ครั้งที่ดีที่สุด',
  average: 'เฉลี่ย',
  latest: 'ครั้งล่าสุด',
}

export function CompletionAttemptSettings({ id, maxAttempts, onMaxAttemptsChange, scoreStrategy, onScoreStrategyChange, compact = false }: {
  id: string
  maxAttempts: string
  onMaxAttemptsChange: (value: string) => void
  scoreStrategy: ScoreStrategy
  onScoreStrategyChange: (value: ScoreStrategy) => void
  compact?: boolean
}) {
  return (
    <FieldGroup className={compact ? 'gap-3 sm:flex-row sm:items-start' : undefined}>
      <Field>
        <FieldLabel htmlFor={id}>ให้ทำได้</FieldLabel>
        <div className="flex items-center gap-2">
          <Input id={id} type="number" min={1} step={1} value={maxAttempts}
            onChange={event => onMaxAttemptsChange(event.target.value)}
            placeholder="ไม่จำกัด" className="max-w-40" />
          <span>ครั้ง</span>
        </div>
        <FieldDescription>เว้นว่างถ้าต้องการให้ทำได้ไม่จำกัดครั้ง</FieldDescription>
      </Field>
      <Field>
        <FieldTitle id={`${id}-score-label`}>เลือกคะแนน</FieldTitle>
        <ToggleGroup variant="primary" size="sm" value={[scoreStrategy]} disabled={maxAttempts === '1'}
          aria-labelledby={`${id}-score-label`} className="grid w-full max-w-md grid-cols-[1.35fr_0.8fr_1fr]"
          onValueChange={values => {
            if (values[0]) onScoreStrategyChange(values[0] as ScoreStrategy)
          }}>
          {(Object.keys(SCORE_STRATEGY_CONTROL_LABELS) as ScoreStrategy[]).map(value => (
            <ToggleGroupItem key={value} value={value} className="w-full min-w-0 px-2">
              {SCORE_STRATEGY_CONTROL_LABELS[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {maxAttempts === '1' && <FieldDescription>ทำได้ครั้งเดียว จึงใช้คะแนนของครั้งนั้น</FieldDescription>}
      </Field>
    </FieldGroup>
  )
}
