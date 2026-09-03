import type { MathInputMode } from '@/lib/types'
import { evaluateStudentExpression } from './student-expression'

export type CalculatorEvaluation =
  | { ok: true; value: number; display: string }
  | { ok: false; error: string }

export function formatCalculatorResult(value: number): string {
  if (Object.is(value, -0)) return '0'
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value)
  const absolute = Math.abs(value)
  if ((absolute >= 1e12 || (absolute > 0 && absolute < 1e-9))) {
    return value.toExponential(10).replace(/(?:\.0+|(?:(\.\d*?)0+))e/, '$1e')
  }
  return Number(value.toPrecision(12)).toString()
}

export function evaluateCalculatorExpression(
  expression: string,
  mode: MathInputMode,
): CalculatorEvaluation {
  const value = evaluateStudentExpression(expression, mode)
  if (value == null) return { ok: false, error: 'ตรวจสมการอีกครั้ง' }
  return { ok: true, value, display: formatCalculatorResult(value) }
}
