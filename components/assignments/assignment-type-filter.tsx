'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export type AssignmentTypeFilterValue = 'all' | 'exercise' | 'exam'

const OPTIONS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'exercise', label: 'แบบฝึกหัด' },
  { value: 'exam', label: 'ข้อสอบ' },
] as const

/** One visual and keyboard pattern for assignment-type filters across views. */
export function AssignmentTypeFilter({ value, onValueChange, counts }: {
  value: AssignmentTypeFilterValue
  onValueChange: (value: AssignmentTypeFilterValue) => void
  counts?: Record<AssignmentTypeFilterValue, number>
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={values => {
        const next = values.at(-1)
        // Clicking the selected option must not leave an unfiltered/blank state.
        if (next === 'all' || next === 'exercise' || next === 'exam') onValueChange(next)
      }}
      aria-label="กรองประเภทงาน"
      variant="primary"
      size="sm"
      spacing={1}
      className="max-w-full flex-wrap rounded-xl bg-muted p-1"
    >
      {OPTIONS.map(option => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
          {counts && <span>({counts[option.value]})</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
