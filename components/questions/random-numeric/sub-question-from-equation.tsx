'use client'

import { AnswerPartCard } from '../answer-set-controls'
import { SubEquationPicker } from './sub-equation-picker'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { UnitField } from './unit-field'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { useRef } from 'react'
import type { PresetWithCat } from './shared'
import type { RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import type { AnswerPart, Variable } from '@/lib/types'

// ─── SubQuestionFromEquation ──────────────────────────────────────────────────
// Sub question for "from-equation" mode — no variable management, shares main vars.

export function SubQuestionFromEquation({
  part, index, presets, mainVariables, labels, onChange, onRemove,
}: {
  part: AnswerPart; index: number; presets: PresetWithCat[]
  mainVariables: Variable[]; labels: string[]
  onChange: (patch: Partial<AnswerPart>) => void; onRemove: () => void
}) {
  const label = labels[index + 1] ?? String(index + 2)
  const partIndex = index + 1  // position in answerParts array
  const mainVarNames = mainVariables.filter(v => !v.is_answer).map(v => v.name)
  const subTextEditorRef = useRef<RichTextEditorHandle>(null)

  return (
    <AnswerPartCard label={label} onRemove={onRemove}>
      <div>
        <p className="text-sm font-semibold text-muted-foreground mb-2">เลือกสมการ *</p>
        <SubEquationPicker
          presets={presets}
          mainVarNames={mainVarNames}
          partIndex={partIndex}
          labels={labels}
          onFormulaChange={formula => onChange({ formula })}
          initialEquationText={part.equation_text}
          onEquationTextChange={text => onChange({ equation_text: text })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>คำถามย่อย / รูปแบบช่องคำตอบ *</Label>
        <RichTextEditor
          ref={subTextEditorRef}
          value={part.sub_text}
          onChange={v => onChange({ sub_text: v })}
          placeholder="เช่น จงหาความเร่ง [คำตอบ] m/s²"
          rows={1}
        />
        <Button type="button" variant="outline" size="sm" className="text-xs h-8"
          onClick={() => subTextEditorRef.current?.insertText('[คำตอบ]')}>
          + [คำตอบ]
        </Button>
      </div>
      <UnitField value={part.unit ?? ''} onChange={unit => onChange({ unit })} />
    </AnswerPartCard>
  )
}
