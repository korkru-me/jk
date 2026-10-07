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
        'relative rounded-lg border p-2.5 text-left transition-colors',
        selected ? 'border-border bg-primary/10 shadow-sm' : 'border-border bg-card',
        disabled ? 'opacity-60' : 'hover:bg-muted/50',
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
      <div className="pointer-events-none relative z-10 space-y-0.5">
        {children}
      </div>
    </div>
  )
}

export const completionRuleInputClassName =
  'pointer-events-auto h-8 w-14 bg-card px-1.5 text-center text-sm font-medium'
