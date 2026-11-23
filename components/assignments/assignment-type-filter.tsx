'use client'

import { workTypeConfig } from '@/lib/assignment-display'
import { WorkTypeIcon } from '@/components/assignments/work-type'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type AssignmentTypeFilterValue = 'all' | 'exercise' | 'exam' | 'practice' | 'file'

const OPTIONS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'exercise', label: 'แบบฝึกหัด' },
  { value: 'exam', label: 'ข้อสอบ' },
  { value: 'practice', label: 'คลังฝึก' },
  { value: 'file', label: 'งานอัปโหลดไฟล์' },
] as const

/** One visual and keyboard pattern for assignment-type filters across views. */
export function AssignmentTypeFilter({ value, onValueChange, counts, includePractice = false, presentation = 'tabs' }: {
  value: AssignmentTypeFilterValue
  onValueChange: (value: AssignmentTypeFilterValue) => void
  counts?: Partial<Record<AssignmentTypeFilterValue, number>>
  includePractice?: boolean
  presentation?: 'tabs' | 'dropdown'
}) {
  const options = OPTIONS.filter(option => includePractice || option.value !== 'practice')
  const selected = options.find(option => option.value === value)

  if (presentation === 'dropdown') {
    return (
      <Select
        value={value}
        items={options}
        modal={false}
        onValueChange={next => {
          const option = options.find(option => option.value === next)
          if (option) onValueChange(option.value)
        }}
      >
        <SelectTrigger aria-label="กรองประเภทงาน" className="min-h-[44px] w-full max-w-64">
          <span className="text-muted-foreground">ประเภทงาน:</span>
          <SelectValue>
            {selected && (
              <>
                {selected.value !== 'all' && <WorkTypeIcon type={selected.value} />}
                {selected.label}
                {counts && <span>({counts[selected.value] ?? 0})</span>}
              </>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          <SelectGroup>
            {options.map(option => (
              <SelectItem key={option.value} value={option.value} className="min-h-[44px]">
                {option.value !== 'all' && <WorkTypeIcon type={option.value} />}
                {option.label}
                {counts && <span>({counts[option.value] ?? 0})</span>}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    )
  }

  return (
    <ToggleGroup
      value={[value]}
      onValueChange={values => {
        const next = values.at(-1)
        // Clicking the selected option must not leave an unfiltered/blank state.
        if (next === 'all' || next === 'exercise' || next === 'exam' || next === 'file' || (includePractice && next === 'practice')) onValueChange(next)
      }}
      aria-label="กรองประเภทงาน"
      variant="primary"
      size="sm"
      spacing={1}
      className="max-w-full flex-wrap rounded-xl bg-muted p-1"
    >
      {options.map(option => (
        <ToggleGroupItem key={option.value} value={option.value} className={option.value === 'all' ? undefined : workTypeConfig(option.value).toggle}>
          {option.value !== 'all' && <WorkTypeIcon type={option.value} className="text-current" />}
          {option.label}
          {counts && <span>({counts[option.value] ?? 0})</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
