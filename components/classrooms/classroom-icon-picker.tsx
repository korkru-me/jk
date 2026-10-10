'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CLASSROOM_ICON_OPTIONS, classroomIconKey, type ClassroomIconKey } from '@/lib/classroom-icons'
import { ClassroomIcon } from './classroom-icon'

export function ClassroomIconPicker({
  value,
  onValueChange,
  disabled = false,
  compact = false,
  open: controlledOpen,
  onOpenChange,
}: {
  value?: ClassroomIconKey
  onValueChange: (key: ClassroomIconKey) => void
  disabled?: boolean
  compact?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const labelId = useId()
  const descriptionId = useId()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const selected = CLASSROOM_ICON_OPTIONS.find(option => option.key === classroomIconKey(value)) ?? CLASSROOM_ICON_OPTIONS[0]

  function handleOpenChange(nextOpen: boolean) {
    if (controlledOpen === undefined) setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  return (
    <FieldSet disabled={disabled} className={compact ? 'gap-2' : undefined}>
      <FieldLegend id={labelId} variant="label">ไอคอนห้องเรียน (ไม่บังคับ)</FieldLegend>
      <FieldDescription id={descriptionId} className={compact ? 'sr-only' : undefined}>
        เลือกแบบที่ชอบ ถ้าไม่เปลี่ยนจะใช้อาคารเรียนเดิม
      </FieldDescription>
      <Collapsible open={open} onOpenChange={handleOpenChange} disabled={disabled}>
        <CollapsibleTrigger render={<Button type="button" variant="outline" disabled={disabled} className={compact ? 'h-10 w-full justify-start gap-3 whitespace-normal' : 'h-auto w-full justify-start gap-3 py-3 whitespace-normal'} />} aria-describedby={descriptionId}>
          <ClassroomIcon iconKey={selected.key} data-icon="inline-start" />
          <span className="min-w-0 flex-1 text-left">เลือกไอคอน</span>
          <ChevronDown data-icon="inline-end" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card padding="sm" radius="sm" className={compact ? 'mt-2' : 'mt-3'}>
            <ToggleGroup
              value={[selected.key]}
              onValueChange={keys => {
                if (keys.length) onValueChange(classroomIconKey(keys[0]))
              }}
              disabled={disabled}
              aria-labelledby={labelId}
              aria-describedby={descriptionId}
              variant="primary"
              className={compact
                ? 'grid w-full grid-cols-5 items-stretch gap-x-0 gap-y-1 sm:grid-cols-7 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7'
                : 'grid w-full grid-cols-5 items-stretch gap-x-0 gap-y-1 sm:grid-cols-7'}
            >
              {CLASSROOM_ICON_OPTIONS.map(option => (
                <ToggleGroupItem key={option.key} value={option.key} title={option.label} aria-label={option.label} className="h-auto min-h-[44px] min-w-[44px] p-2">
                  <ClassroomIcon iconKey={option.key} />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </FieldSet>
  )
}
