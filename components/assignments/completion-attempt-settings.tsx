'use client'

import { Field, FieldTitle } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { ScoreStrategy } from '@/lib/types'

const SCORE_STRATEGY_CONTROL_LABELS: Record<ScoreStrategy, string> = {
  best: 'ครั้งที่ดีที่สุด',
  average: 'เฉลี่ย',
  latest: 'ครั้งล่าสุด',
}

export function CompletionAttemptSettings({ id, maxAttempts, scoreStrategy, onScoreStrategyChange }: {
  id: string
  maxAttempts: string
  scoreStrategy: ScoreStrategy
  onScoreStrategyChange: (value: ScoreStrategy) => void
}) {
  return (
    <Field>
      <FieldTitle id={`${id}-score-label`}>เลือกคะแนน</FieldTitle>
      <ToggleGroup variant="outline" size="sm" value={[scoreStrategy]} disabled={maxAttempts === '1'}
        aria-labelledby={`${id}-score-label`} className="grid w-full max-w-md grid-cols-[1.35fr_0.8fr_1fr]"
        onValueChange={values => {
          if (values[0]) onScoreStrategyChange(values[0] as ScoreStrategy)
        }}>
        {(Object.keys(SCORE_STRATEGY_CONTROL_LABELS) as ScoreStrategy[]).map(value => (
          <ToggleGroupItem
            key={value}
            value={value}
            className="w-full min-w-0 border-border px-2 aria-pressed:bg-primary/10 aria-pressed:text-foreground data-[state=on]:bg-primary/10 data-[state=on]:text-foreground"
          >
            {SCORE_STRATEGY_CONTROL_LABELS[value]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  )
}
