import { describe, expect, it } from 'vitest'
import { evaluateStudentExpression } from './student-expression'

describe('evaluateStudentExpression', () => {
  it('handles calculator arithmetic and scientific notation', () => {
    expect(evaluateStudentExpression('2 + 3 × 4')).toBe(14)
    expect(evaluateStudentExpression('(2+3)^2')).toBe(25)
    expect(evaluateStudentExpression('1.2e-3')).toBeCloseTo(0.0012)
    expect(evaluateStudentExpression('-2^2')).toBe(-4)
    expect(evaluateStudentExpression('2^-2')).toBe(0.25)
  })

  it('supports readable symbols and implicit multiplication', () => {
    expect(evaluateStudentExpression('√(9+16)')).toBe(5)
    expect(evaluateStudentExpression('2π')).toBeCloseTo(2 * Math.PI)
    expect(evaluateStudentExpression('3(2+1)')).toBe(9)
    expect(evaluateStudentExpression('5!')).toBe(120)
  })

  it('keeps DEG and RAD meaning separate', () => {
    expect(evaluateStudentExpression('sin(30)', 'deg')).toBeCloseTo(0.5, 12)
    expect(evaluateStudentExpression('sin(pi/6)', 'rad')).toBeCloseTo(0.5, 12)
    expect(evaluateStudentExpression('asin(0.5)', 'deg')).toBeCloseTo(30, 12)
    expect(evaluateStudentExpression('asin(0.5)', 'rad')).toBeCloseTo(Math.PI / 6, 12)
  })

  it('supports scientific functions with calculator conventions', () => {
    expect(evaluateStudentExpression('log(1000)')).toBe(3)
    expect(evaluateStudentExpression('ln(e)')).toBeCloseTo(1, 12)
    expect(evaluateStudentExpression('log(8,2)')).toBe(3)
    expect(evaluateStudentExpression('root(32,5)')).toBeCloseTo(2, 12)
    expect(evaluateStudentExpression('root(-8,3)')).toBeCloseTo(-2, 12)
    expect(evaluateStudentExpression('round(1.2345,2)')).toBe(1.23)
  })

  it('rejects syntax outside the allowlist and invalid math', () => {
    for (const expression of [
      '', 'x', 'x=5', 'config', '[1,2]', '{}', 'import(1)', 'constructor(1)',
      '1/0', 'sqrt(-1)', 'tan(90)', '171!', 'root(4,0)',
    ]) {
      expect(evaluateStudentExpression(expression)).toBeNull()
    }
  })

  it('bounds deeply nested or oversized input', () => {
    expect(evaluateStudentExpression('('.repeat(70) + '1' + ')'.repeat(70))).toBeNull()
    expect(evaluateStudentExpression('1+'.repeat(600) + '1')).toBeNull()
  })
})
