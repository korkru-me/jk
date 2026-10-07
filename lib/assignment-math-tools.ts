import type { AssignmentType } from '@/lib/types'

export interface AssignmentMathToolSettings {
  calculatorEnabled: boolean
  scratchpadEnabled: boolean
}

/**
 * Approved defaults for a newly-created assignment.
 *
 * The calculator is opt-in for both types. แบบฝึกหัด keep the scratchpad on;
 * ข้อสอบ start with it off. Explicit teacher choices always take precedence.
 */
export function resolveNewAssignmentMathTools(input: {
  type: AssignmentType
  calculatorEnabled?: boolean
  scratchpadEnabled?: boolean
}): AssignmentMathToolSettings {
  const defaultEnabled = input.type === 'exercise'
  return {
    calculatorEnabled: input.calculatorEnabled ?? false,
    scratchpadEnabled: input.scratchpadEnabled ?? defaultEnabled,
  }
}
