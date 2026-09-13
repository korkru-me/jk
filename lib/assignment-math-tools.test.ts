import { describe, expect, it } from 'vitest'
import { resolveNewAssignmentMathTools } from '@/lib/assignment-math-tools'

describe('new assignment math-tool defaults', () => {
  it('starts a แบบฝึกหัด with both tools enabled', () => {
    expect(resolveNewAssignmentMathTools({ type: 'exercise' })).toEqual({
      calculatorEnabled: true,
      scratchpadEnabled: true,
    })
  })

  it('starts a ข้อสอบ with both tools disabled', () => {
    expect(resolveNewAssignmentMathTools({ type: 'exam' })).toEqual({
      calculatorEnabled: false,
      scratchpadEnabled: false,
    })
  })

  it('honors an explicit teacher choice for either type', () => {
    expect(resolveNewAssignmentMathTools({
      type: 'exam',
      calculatorEnabled: true,
      scratchpadEnabled: true,
    })).toEqual({ calculatorEnabled: true, scratchpadEnabled: true })
    expect(resolveNewAssignmentMathTools({
      type: 'exercise',
      calculatorEnabled: false,
      scratchpadEnabled: false,
    })).toEqual({ calculatorEnabled: false, scratchpadEnabled: false })
  })

})
