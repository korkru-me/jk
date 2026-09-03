import { describe, expect, it } from 'vitest'
import { resolveNewAssignmentMathTools } from '@/lib/assignment-math-tools'

describe('new assignment math-tool defaults', () => {
  it('starts an online exercise with both tools enabled', () => {
    expect(resolveNewAssignmentMathTools({ mode: 'online', type: 'exercise' })).toEqual({
      calculatorEnabled: true,
      scratchpadEnabled: true,
    })
  })

  it('starts an online exam with both tools disabled', () => {
    expect(resolveNewAssignmentMathTools({ mode: 'online', type: 'exam' })).toEqual({
      calculatorEnabled: false,
      scratchpadEnabled: false,
    })
  })

  it('honors an explicit teacher choice for either online type', () => {
    expect(resolveNewAssignmentMathTools({
      mode: 'online',
      type: 'exam',
      calculatorEnabled: true,
      scratchpadEnabled: true,
    })).toEqual({ calculatorEnabled: true, scratchpadEnabled: true })
    expect(resolveNewAssignmentMathTools({
      mode: 'online',
      type: 'exercise',
      calculatorEnabled: false,
      scratchpadEnabled: false,
    })).toEqual({ calculatorEnabled: false, scratchpadEnabled: false })
  })

  it('forces browser-only tools off for printed work', () => {
    expect(resolveNewAssignmentMathTools({
      mode: 'print',
      type: 'exercise',
      calculatorEnabled: true,
      scratchpadEnabled: true,
    })).toEqual({ calculatorEnabled: false, scratchpadEnabled: false })
  })
})
