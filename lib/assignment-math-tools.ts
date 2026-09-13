import type { AssignmentType } from '@/lib/types'

export interface AssignmentMathToolSettings {
  calculatorEnabled: boolean
  scratchpadEnabled: boolean
}

/**
 * Approved defaults for a newly-created assignment.
 *
 * แบบฝึกหัด start with both practice tools on; ข้อสอบ start off but honor an
 * explicit teacher choice.
 */
export function resolveNewAssignmentMathTools(input: {
  type: AssignmentType
  calculatorEnabled?: boolean
  scratchpadEnabled?: boolean
}): AssignmentMathToolSettings {
  const defaultEnabled = input.type === 'exercise'
  return {
    calculatorEnabled: input.calculatorEnabled ?? defaultEnabled,
    scratchpadEnabled: input.scratchpadEnabled ?? defaultEnabled,
  }
}
