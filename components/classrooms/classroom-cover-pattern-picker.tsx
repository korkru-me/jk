'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import {
  CLASSROOM_COVER_PATTERN_OPTIONS,
  classroomCoverPatternKey,
  type ClassroomCoverPatternKey,
} from '@/lib/classroom-cover-patterns'
import { ClassroomCoverPattern } from './classroom-cover-pattern'

export function ClassroomCoverPatternPicker({
  value,
  onValueChange,
  disabled = false,
  compact = false,
  previewClassName,
}: {
  value?: ClassroomCoverPatternKey
  onValueChange: (key: ClassroomCoverPatternKey) => void
  disabled?: boolean
  compact?: boolean
  previewClassName?: string
}) {
  const labelId = useId()
  const descriptionId = useId()
  const [open, setOpen] = useState(false)
  const selectedKey = classroomCoverPatternKey(value)
  const selected = CLASSROOM_COVER_PATTERN_OPTIONS.find(option => option.key === selectedKey)
    ?? CLASSROOM_COVER_PATTERN_OPTIONS[0]

  return (
    <FieldSet disabled={disabled} className={compact ? 'gap-2' : undefined}>
      <FieldLegend id={labelId} variant="label">ภาพปกห้องเรียน</FieldLegend>
      <FieldDescription id={descriptionId} className={compact ? 'sr-only' : undefined}>
        ภาพปกออกแบบเฉพาะสำหรับ KorKru สีของภาพจะเปลี่ยนตามธีมสีห้อง
      </FieldDescription>
      <Collapsible open={open} onOpenChange={setOpen} disabled={disabled}>
        <CollapsibleTrigger
          render={(
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className={compact
                ? 'h-14 w-full justify-start gap-3 overflow-hidden p-2 whitespace-normal'
                : 'h-20 w-full justify-start gap-3 overflow-hidden p-2 whitespace-normal'}
            />
          )}
          aria-describedby={descriptionId}
        >
          <span className={cn(
            'relative h-full w-24 shrink-0 overflow-hidden rounded-lg border',
            previewClassName ?? 'border-primary/20 bg-primary/10 text-primary',
          )}>
            <ClassroomCoverPattern patternKey={selected.key} placement="end" className="size-full opacity-80" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate font-medium">{selected.label}</span>
            {!compact && <span className="block truncate text-xs text-foreground/70">{selected.description}</span>}
          </span>
          <ChevronDown data-icon="inline-end" className={cn('transition-transform', open && 'rotate-180')} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card padding="sm" radius="sm" className="mt-2">
            <ToggleGroup
              value={[selected.key]}
              onValueChange={keys => {
                if (!keys.length) return
                onValueChange(classroomCoverPatternKey(keys[0]))
                setOpen(false)
              }}
              disabled={disabled}
              aria-labelledby={labelId}
              aria-describedby={descriptionId}
              variant="primary"
              className="grid w-full grid-cols-2 items-stretch gap-2 sm:grid-cols-3"
            >
              {CLASSROOM_COVER_PATTERN_OPTIONS.map(option => (
                <ToggleGroupItem
                  key={option.key}
                  value={option.key}
                  aria-label={`${option.label}: ${option.description}`}
                  title={option.description}
                  className="h-auto min-h-[78px] min-w-0 flex-col items-stretch gap-1.5 overflow-hidden p-1.5"
                >
                  <span className="h-12 w-full overflow-hidden rounded-md bg-current/5">
                    <ClassroomCoverPattern patternKey={option.key} placement="end" className="size-full opacity-80" />
                  </span>
                  <span className="truncate px-1 text-xs font-medium">{option.label}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </FieldSet>
  )
}
