'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function CompletionRuleCard({
  selected,
  disabled = false,
  label,
  onSelect,
  children,
}: {
  selected: boolean
  disabled?: boolean
  label: string
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <div
      data-completion-option
      className={cn(
        'relative rounded-xl border-2 p-3 text-left transition-all',
        selected ? 'border-primary bg-primary/10' : 'border-border',
        disabled ? 'opacity-60' : 'hover:border-ring',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={onSelect}
        disabled={disabled}
        aria-label={label}
        aria-pressed={selected}
        className="absolute inset-0 h-auto w-auto rounded-[inherit] p-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
      />
      <div className="pointer-events-none relative z-10 space-y-1">
        {children}
      </div>
    </div>
  )
}

export const completionRuleInputClassName =
  'pointer-events-auto h-9 w-16 bg-card px-2 text-center text-sm font-medium sm:w-24'
