'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CLASSROOM_ICON_OPTIONS, classroomIconKey, type ClassroomIconKey } from '@/lib/classroom-icons'
import { ClassroomIcon } from './classroom-icon'

export function ClassroomIconPicker({ value, onValueChange, disabled = false }: {
  value?: ClassroomIconKey
  onValueChange: (key: ClassroomIconKey) => void
  disabled?: boolean
}) {
  const labelId = useId()
  const descriptionId = useId()
  const [open, setOpen] = useState(false)
  const selected = CLASSROOM_ICON_OPTIONS.find(option => option.key === classroomIconKey(value)) ?? CLASSROOM_ICON_OPTIONS[0]
  return (
    <FieldSet disabled={disabled}>
      <FieldLegend id={labelId} variant="label">ไอคอนห้องเรียน (ไม่บังคับ)</FieldLegend>
      <FieldDescription id={descriptionId}>
        เลือกแบบที่ชอบ ถ้าไม่เปลี่ยนจะใช้อาคารเรียนเดิม
      </FieldDescription>
      <Collapsible open={open} onOpenChange={setOpen} disabled={disabled}>
        <CollapsibleTrigger render={<Button type="button" variant="outline" disabled={disabled} className="h-auto w-full justify-start gap-3 py-3 whitespace-normal" />} aria-describedby={descriptionId}>
          <ClassroomIcon iconKey={selected.key} data-icon="inline-start" />
          <span className="min-w-0 flex-1 text-left">เลือกไอคอน</span>
          <ChevronDown data-icon="inline-end" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ToggleGroup
            value={[selected.key]}
            onValueChange={keys => {
              if (keys.length) onValueChange(classroomIconKey(keys[0]))
            }}
            disabled={disabled}
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
            variant="primary"
            className="mt-3 grid w-full grid-cols-5 items-stretch gap-x-0 gap-y-1 sm:grid-cols-7"
          >
            {CLASSROOM_ICON_OPTIONS.map(option => (
              <ToggleGroupItem key={option.key} value={option.key} title={option.label} aria-label={option.label} className="h-auto min-h-[44px] min-w-[44px] p-2">
                <ClassroomIcon iconKey={option.key} />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CollapsibleContent>
      </Collapsible>
    </FieldSet>
  )
}
