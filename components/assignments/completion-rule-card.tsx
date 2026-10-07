'use client'

import { useId, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function CompletionRuleCard({
  selected,
  disabled = false,
  label,
  description,
  onSelect,
  children,
}: {
  selected: boolean
  disabled?: boolean
  label: string
  description: string
  onSelect: () => void
  children: ReactNode
}) {
  const descriptionId = useId()

  return (
    <div
      data-completion-option
      className={cn(
        'group relative rounded-lg border p-2.5 text-left transition-colors',
        selected ? 'border-border bg-primary/10 shadow-sm' : 'border-border bg-card',
        disabled ? 'bg-muted/20' : 'hover:bg-muted/50',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={onSelect}
        disabled={disabled}
        aria-label={label}
        aria-describedby={descriptionId}
        aria-pressed={selected}
        className="absolute inset-0 h-auto w-auto rounded-[inherit] p-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
      />
      <div className={cn('pointer-events-none relative z-10 space-y-0.5', disabled && 'opacity-60')}>
        {children}
      </div>
      <div
        id={descriptionId}
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-[calc(100%+0.5rem)] left-1/2 z-50 w-max max-w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground opacity-0 shadow-md ring-1 ring-foreground/10 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {description}
      </div>
    </div>
  )
}

export const completionRuleInputClassName =
  'pointer-events-auto h-8 w-14 bg-card px-1.5 text-center text-sm font-medium'
