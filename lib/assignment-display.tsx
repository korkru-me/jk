import { FileText, Repeat } from 'lucide-react'

/**
 * How the two assignment types are labelled, coloured and iconed.
 *
 * Shared by the classroom assignment list and the classroom assignments tab,
 * which render the same badge and previously each carried their own copy.
 *
 * This is a .tsx file because the icons are React components.
 */
export interface AssignmentTypeMeta {
  label: string
  /** Badge background. */
  bg: string
  /** Badge text colour. */
  text: string
  icon: typeof FileText
}

export const TYPE_CFG: Record<string, AssignmentTypeMeta> = {
  exam: {
    label: 'ข้อสอบ',
    bg: 'bg-primary/10',
    text: 'text-primary',
    icon: FileText,
  },
  exercise: {
    label: 'แบบฝึกหัด',
    bg: 'bg-violet-50 dark:bg-violet-950/30',
    text: 'text-violet-700 dark:text-violet-400',
    icon: Repeat,
  },
}
