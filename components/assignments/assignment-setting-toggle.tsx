'use client'

import type { ReactNode } from 'react'
import { AssignmentSettingHoverLabel } from '@/components/assignments/assignment-setting-hover-label'
import { cn } from '@/lib/utils'

interface AssignmentSettingToggleProps {
  label: string
  description?: string
  descriptionOnHover?: boolean
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  disabledMessage?: string
  footer?: ReactNode
  nested?: boolean
}

/**
 * The shared on/off row used by both assignment creation and assignment
 * settings. Keeping the density and label treatment here prevents the two
 * forms from drifting apart again while still allowing context-specific
 * warnings below a row.
 */
export function AssignmentSettingToggle({
  label,
  description,
  descriptionOnHover = false,
  checked,
  onCheckedChange,
  disabled = false,
  disabledMessage,
  footer,
  nested = false,
}: AssignmentSettingToggleProps) {
  return (
    <div className={cn('space-y-1.5', nested && 'pl-3')}>
      <label
        className={cn(
          'flex min-h-10 items-center justify-between gap-4 rounded-xl border border-border px-3 py-2 transition-colors',
          disabled ? 'opacity-70' : 'cursor-pointer hover:border-ring',
        )}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {description && descriptionOnHover
              ? <AssignmentSettingHoverLabel label={label} description={description} />
              : label}
          </p>
          {description && !descriptionOnHover && (
            <p data-assignment-description className="text-xs text-muted-foreground">
              {description}
            </p>
          )}
          {disabledMessage && (
            <p className="text-xs text-muted-foreground">{disabledMessage}</p>
          )}
        </div>
        <input
          type="checkbox"
          checked={checked}
          onChange={event => onCheckedChange(event.target.checked)}
          disabled={disabled}
          className="size-4 shrink-0 accent-primary"
        />
      </label>
      {footer}
    </div>
  )
}
