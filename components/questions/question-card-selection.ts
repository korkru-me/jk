import type { MouseEvent } from 'react'

/** Shared staged-selection appearance for bank pickers and student practice cards. */
export const QUESTION_CARD_SELECTION_CLASSES = {
  add: 'ring-success/30 bg-success/10',
  remove: 'ring-destructive/30 bg-destructive/10',
  selected: 'ring-primary/50 bg-primary/10',
} as const

export function isQuestionCardSelectionClick(event: MouseEvent<HTMLDivElement>) {
  const target = event.target
  // Nested controls and portalled viewers handle their own clicks.
  return target instanceof Element && event.currentTarget.contains(target)
    && !target.closest('button, a, input, label, select, textarea, [role="button"], [data-picker-interactive]')
}
