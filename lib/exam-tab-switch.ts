import type { AssignmentType } from '@/lib/types'

/**
 * Tab-switch detection is a product rule, not a teacher setting: every real
 * exam enables it, while exercises and teacher previews never do.
 */
export function shouldDetectTabSwitch(
  assignmentType: AssignmentType,
  previewMode: boolean,
): boolean {
  return assignmentType === 'exam' && !previewMode
}
