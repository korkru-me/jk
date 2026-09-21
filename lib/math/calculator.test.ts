import { describe, expect, it } from 'vitest'
import {
  calculatorDisplayIndexFromExpression,
  calculatorExpressionIndexFromDisplay,
  editCalculatorExpressionFromDisplay,
  evaluateCalculatorExpression,
  formatCalculatorExpression,
  formatCalculatorResult,
} from './calculator'

describe('scientific calculator', () => {
  it('uses the selected angle mode', () => {
    expect(evaluateCalculatorExpression('sin(30)', 'deg')).toMatchObject({ ok: true, display: '0.5' })
    expect(evaluateCalculatorExpression('sin(pi/6)', 'rad')).toMatchObject({ ok: true, display: '0.5' })
  })

  it('returns an explicit error for invalid expressions', () => {
    expect(evaluateCalculatorExpression('1/0', 'deg')).toEqual({ ok: false, error: 'ตรวจสมการอีกครั้ง' })
    expect(evaluateCalculatorExpression('constructor(1)', 'deg')).toEqual({ ok: false, error: 'ตรวจสมการอีกครั้ง' })
  })

  it('formats results compactly without losing useful precision', () => {
    expect(formatCalculatorResult(-0)).toBe('0')
    expect(formatCalculatorResult(1 / 3)).toBe('0.333333333333')
    expect(formatCalculatorResult(1.2e-12)).toBe('1.2e-12')
  })

  it('groups thousands in numeric literals without changing the expression', () => {
    expect(formatCalculatorExpression('1900052')).toBe('1,900,052')
    expect(formatCalculatorExpression('1500+23000.75')).toBe('1,500+23,000.75')
    expect(formatCalculatorExpression('log(1000,10)')).toBe('log(1,000,10)')
    expect(formatCalculatorExpression('1.2e12')).toBe('1.2e12')
  })

  it('maps carets across inserted thousands separators', () => {
    expect(calculatorDisplayIndexFromExpression('1900052', 7)).toBe(9)
    expect(calculatorExpressionIndexFromDisplay('1900052', 9)).toBe(7)
    expect(calculatorExpressionIndexFromDisplay('1900052', 2)).toBe(1)
  })

  it('translates edits and pasted grouped numbers back to raw expressions', () => {
    expect(editCalculatorExpressionFromDisplay('1234', '1,2345')).toEqual({ value: '12345', cursor: 5 })
    expect(editCalculatorExpressionFromDisplay('1234', '1,24')).toEqual({ value: '124', cursor: 2 })
    expect(editCalculatorExpressionFromDisplay('', '1,500+23,000')).toEqual({
      value: '1500+23000',
      cursor: 10,
    })
  })
})
