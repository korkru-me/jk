import type { AssignmentMode, AssignmentType } from '@/lib/types'

export interface AssignmentMathToolSettings {
  calculatorEnabled: boolean
  scratchpadEnabled: boolean
}

/**
 * Approved defaults for a newly-created assignment.
 *
 * Online exercises start with both practice tools on; online exams start off
 * but honor an explicit teacher choice. Printed work can never retain browser
 * tools, even if a tampered client sends true.
 */
export function resolveNewAssignmentMathTools(input: {
  mode: AssignmentMode
  type: AssignmentType
  calculatorEnabled?: boolean
  scratchpadEnabled?: boolean
}): AssignmentMathToolSettings {
  if (input.mode !== 'online') {
    return { calculatorEnabled: false, scratchpadEnabled: false }
  }

  const defaultEnabled = input.type === 'exercise'
  return {
    calculatorEnabled: input.calculatorEnabled ?? defaultEnabled,
    scratchpadEnabled: input.scratchpadEnabled ?? defaultEnabled,
  }
}
