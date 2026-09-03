import { describe, expect, it } from 'vitest'
import { evaluateCalculatorExpression, formatCalculatorResult } from './calculator'

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
})
