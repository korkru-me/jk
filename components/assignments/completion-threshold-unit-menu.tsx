'use client'

import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type PassingType = 'percent' | 'score'

export function CompletionThresholdUnitMenu({
  value,
  disabled = false,
  onValueChange,
}: {
  value: PassingType
  disabled?: boolean
  onValueChange: (value: PassingType) => void
}) {
  const visibleValue = value === 'percent' ? '%' : 'คะแนน'
  const accessibleValue = value === 'percent' ? 'เปอร์เซ็นต์' : 'คะแนน'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(
          <Button
            type="button"
            variant="outline"
            size="default"
            disabled={disabled}
            aria-label={`เลือกหน่วยเกณฑ์ผ่าน ปัจจุบันเป็น${accessibleValue}`}
            className="pointer-events-auto min-w-14 px-2"
          />
        )}
      >
        <span>{visibleValue}</span>
        <ChevronDown data-icon="inline-end" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-32">
        <DropdownMenuGroup>
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={nextValue => {
              if ((nextValue === 'percent' || nextValue === 'score') && nextValue !== value) {
                onValueChange(nextValue)
              }
            }}
          >
            <DropdownMenuRadioItem value="percent" closeOnClick>%</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="score" closeOnClick>คะแนน</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
