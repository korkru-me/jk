'use client'

import { useEffect, useRef, useState } from 'react'
import { Ban, ChevronDown } from 'lucide-react'
import { COVER_PRESETS } from '@/app/(app)/classrooms/_components/classroom-meta'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export function ClassroomCoverThemePicker({
  value,
  onValueChange,
  disabled = false,
  allowAuto = false,
}: {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  allowAuto?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const selectedPreset = COVER_PRESETS.find(preset => preset.id === value)
  const activePreset = selectedPreset ?? COVER_PRESETS[0]
  const usesAutoColor = allowAuto && !selectedPreset
  const selectedLabel = usesAutoColor ? 'สีอัตโนมัติ' : activePreset.label

  useEffect(() => {
    if (!open) return

    function closeOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node) || containerRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointerDown, true)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true)
  }, [open])

  function choose(value: string) {
    onValueChange(value)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-1.5">
      <Label className="text-sm font-medium">ธีมสี</Label>
      <Collapsible open={open} onOpenChange={setOpen} disabled={disabled}>
        <CollapsibleTrigger
          render={<Button type="button" variant="outline" disabled={disabled} className="h-10 w-full justify-start gap-3" />}
          aria-label={`ธีมสี: ${selectedLabel}`}
        >
          {usesAutoColor ? (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border" aria-hidden="true">
              <Ban />
            </span>
          ) : (
            <span className={cn('size-5 shrink-0 rounded-full ring-1 ring-border', activePreset.solid)} aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1 truncate text-left">{selectedLabel}</span>
          <ChevronDown data-icon="inline-end" className={cn('transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card padding="sm" radius="sm" className="mt-2">
            <ToggleGroup
              value={[usesAutoColor ? 'auto' : activePreset.id]}
              onValueChange={values => {
                if (!values.length) return
                choose(values[0] === 'auto' ? '' : values[0])
              }}
              disabled={disabled}
              aria-label="ธีมสี"
              className="flex w-full flex-wrap justify-start gap-2"
            >
              {allowAuto && (
                <ToggleGroupItem
                  value="auto"
                  title="สีอัตโนมัติ"
                  aria-label="สีอัตโนมัติ"
                  className="size-8 rounded-full p-0 hover:bg-transparent aria-pressed:bg-transparent data-[state=on]:bg-transparent"
                >
                  <span className={cn(
                    'flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform group-hover/toggle:scale-105',
                    usesAutoColor ? 'shadow-sm ring-2 ring-ring ring-offset-2' : 'opacity-70 group-hover/toggle:opacity-100',
                  )}>
                    <Ban aria-hidden="true" />
                  </span>
                </ToggleGroupItem>
              )}
              {COVER_PRESETS.map(preset => (
                <ToggleGroupItem
                  key={preset.id}
                  value={preset.id}
                  title={preset.label}
                  aria-label={preset.label}
                  className="size-8 rounded-full p-0 hover:bg-transparent aria-pressed:bg-transparent data-[state=on]:bg-transparent"
                >
                  <span className={cn(
                    'size-8 rounded-full transition-transform group-hover/toggle:scale-105',
                    preset.solid,
                    value === preset.id
                      ? 'shadow-sm ring-2 ring-ring ring-offset-2'
                      : 'opacity-70 group-hover/toggle:opacity-100',
                  )} />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
