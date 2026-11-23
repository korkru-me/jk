'use client'

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { exerciseGroupRangeError } from '@/lib/exercise-group'

export function SubmissionModeFields({ mode, min, max, onModeChange, onMinChange, onMaxChange, disabled = false }: {
  mode: 'solo' | 'group'; min: string; max: string; disabled?: boolean
  onModeChange: (value: 'solo' | 'group') => void
  onMinChange: (value: string) => void; onMaxChange: (value: string) => void
}) {
  const error = exerciseGroupRangeError(Number(min), Number(max))
  return <FieldGroup className="gap-2">
    <Field className="gap-1.5">
      <FieldLabel>รูปแบบการส่งงาน</FieldLabel>
      <ToggleGroup aria-label="รูปแบบการส่งงาน" variant="soft" size="sm" disabled={disabled} value={[mode]} onValueChange={values => {
        if (values[0] === 'solo' || values[0] === 'group') onModeChange(values[0])
      }}>
        <ToggleGroupItem value="solo" className="relative after:absolute after:inset-x-0 after:-inset-y-2">งานเดี่ยว</ToggleGroupItem>
        <ToggleGroupItem value="group" className="relative after:absolute after:inset-x-0 after:-inset-y-2">งานกลุ่ม</ToggleGroupItem>
      </ToggleGroup>
    </Field>
    {mode === 'group' && <>
      <div className="grid max-w-sm grid-cols-2 gap-2">
        <Field data-invalid={!!error} className="gap-1.5">
          <FieldLabel htmlFor="assignment-group-min">สมาชิกอย่างน้อย</FieldLabel>
          <Input id="assignment-group-min" type="number" min={2} max={300} step={1} disabled={disabled} value={min} onChange={event => onMinChange(event.target.value)} aria-invalid={!!error} />
        </Field>
        <Field data-invalid={!!error} className="gap-1.5">
          <FieldLabel htmlFor="assignment-group-max">สมาชิกไม่เกิน</FieldLabel>
          <Input id="assignment-group-max" type="number" min={Number(min) || 2} max={300} step={1} disabled={disabled} value={max} onChange={event => onMaxChange(event.target.value)} aria-invalid={!!error} />
        </Field>
      </div>
      <FieldDescription>นับรวมผู้ส่ง ตัวแทนเลือกเพื่อนในห้องตอนส่งงาน สมาชิกทุกคนได้คะแนนเท่ากัน</FieldDescription>
      {error && <FieldError>{error}</FieldError>}
    </>}
  </FieldGroup>
}
