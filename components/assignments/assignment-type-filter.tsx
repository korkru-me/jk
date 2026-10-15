'use client'

import { workTypeConfig } from '@/lib/assignment-display'
import { WorkTypeIcon } from '@/components/assignments/work-type'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export type AssignmentTypeFilterValue = 'all' | 'exercise' | 'exam' | 'practice'

const OPTIONS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'exercise', label: 'แบบฝึกหัด' },
  { value: 'exam', label: 'ข้อสอบ' },
  { value: 'practice', label: 'คลังฝึก' },
] as const

/** One visual and keyboard pattern for assignment-type filters across views. */
export function AssignmentTypeFilter({ value, onValueChange, counts, includePractice = false }: {
  value: AssignmentTypeFilterValue
  onValueChange: (value: AssignmentTypeFilterValue) => void
  counts?: Partial<Record<AssignmentTypeFilterValue, number>>
  includePractice?: boolean
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={values => {
        const next = values.at(-1)
        // Clicking the selected option must not leave an unfiltered/blank state.
        if (next === 'all' || next === 'exercise' || next === 'exam' || (includePractice && next === 'practice')) onValueChange(next)
      }}
      aria-label="กรองประเภทงาน"
      variant="primary"
      size="sm"
      spacing={1}
      className="max-w-full flex-wrap rounded-xl bg-muted p-1"
    >
      {OPTIONS.filter(option => includePractice || option.value !== 'practice').map(option => (
        <ToggleGroupItem key={option.value} value={option.value} className={option.value === 'all' ? undefined : workTypeConfig(option.value).toggle}>
          {option.value !== 'all' && <WorkTypeIcon type={option.value} className="text-current" />}
          {option.label}
          {counts && <span>({counts[option.value] ?? 0})</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
