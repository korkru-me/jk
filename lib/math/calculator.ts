import type { MathInputMode } from '@/lib/types'
import { evaluateStudentExpression } from './student-expression'

export type CalculatorEvaluation =
  | { ok: true; value: number; display: string }
  | { ok: false; error: string }

interface CalculatorExpressionDisplay {
  value: string
  rawToDisplay: number[]
  displayToRaw: number[]
}

function buildCalculatorExpressionDisplay(expression: string): CalculatorExpressionDisplay {
  const rawToDisplay = new Array<number>(expression.length + 1)
  const displayToRaw: number[] = [0]
  let value = ''
  let index = 0

  const appendRaw = (char: string, rawIndex: number) => {
    if (rawToDisplay[rawIndex] == null) rawToDisplay[rawIndex] = value.length
    value += char
    displayToRaw[value.length] = rawIndex + 1
    rawToDisplay[rawIndex + 1] = value.length
  }

  const appendGroupingComma = (rawIndex: number) => {
    value += ','
    displayToRaw[value.length] = rawIndex
    // Put a restored caret after the separator instead of before it.
    rawToDisplay[rawIndex] = value.length
  }

  while (index < expression.length) {
    const rest = expression.slice(index)
    const identifier = rest.match(/^[A-Za-z][A-Za-z0-9]*/)?.[0]
    if (identifier) {
      for (let offset = 0; offset < identifier.length; offset++) {
        appendRaw(identifier[offset], index + offset)
      }
      index += identifier.length
      continue
    }

    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)?.[0]
    if (number) {
      const exponentAt = number.search(/[eE]/)
      const mantissa = exponentAt >= 0 ? number.slice(0, exponentAt) : number
      const decimalAt = mantissa.indexOf('.')
      const integerLength = decimalAt >= 0 ? decimalAt : mantissa.length
      const firstComma = integerLength > 3 ? integerLength % 3 || 3 : -1

      for (let offset = 0; offset < number.length; offset++) {
        if (
          firstComma > 0
          && offset < integerLength
          && offset >= firstComma
          && (offset - firstComma) % 3 === 0
        ) {
          appendGroupingComma(index + offset)
        }
        appendRaw(number[offset], index + offset)
      }
      index += number.length
      continue
    }

    appendRaw(expression[index], index)
    index++
  }

  rawToDisplay[0] ??= 0
  rawToDisplay[expression.length] ??= value.length
  return { value, rawToDisplay, displayToRaw }
}

/** Add thousands separators to numeric literals without changing the formula. */
export function formatCalculatorExpression(expression: string): string {
  return buildCalculatorExpressionDisplay(expression).value
}

/** Map a caret in the formatted field back to the unformatted expression. */
export function calculatorExpressionIndexFromDisplay(expression: string, displayIndex: number): number {
  const display = buildCalculatorExpressionDisplay(expression)
  const safe = Math.max(0, Math.min(display.value.length, displayIndex))
  return display.displayToRaw[safe] ?? expression.length
}

/** Map an expression caret to its visible position after grouping separators. */
export function calculatorDisplayIndexFromExpression(expression: string, expressionIndex: number): number {
  const display = buildCalculatorExpressionDisplay(expression)
  const safe = Math.max(0, Math.min(expression.length, expressionIndex))
  return display.rawToDisplay[safe] ?? display.value.length
}

function removePastedNumberGrouping(text: string): string {
  return text.replace(/\d{1,3}(?:,\d{3})+(?=\D|$)/g, match => match.replaceAll(',', ''))
}

/**
 * Translate a browser edit made against the formatted field into the raw
 * expression. This keeps hardware-keyboard edits and pasted grouped numbers
 * working without ever feeding display commas to the evaluator.
 */
export function editCalculatorExpressionFromDisplay(
  expression: string,
  nextDisplay: string,
): { value: string; cursor: number } {
  const previousDisplay = formatCalculatorExpression(expression)
  let prefix = 0
  while (
    prefix < previousDisplay.length
    && prefix < nextDisplay.length
    && previousDisplay[prefix] === nextDisplay[prefix]
  ) prefix++

  let suffix = 0
  while (
    suffix < previousDisplay.length - prefix
    && suffix < nextDisplay.length - prefix
    && previousDisplay[previousDisplay.length - 1 - suffix] === nextDisplay[nextDisplay.length - 1 - suffix]
  ) suffix++

  const rawStart = calculatorExpressionIndexFromDisplay(expression, prefix)
  const rawEnd = calculatorExpressionIndexFromDisplay(expression, previousDisplay.length - suffix)
  const inserted = removePastedNumberGrouping(
    nextDisplay.slice(prefix, nextDisplay.length - suffix),
  )
  return {
    value: expression.slice(0, rawStart) + inserted + expression.slice(rawEnd),
    cursor: rawStart + inserted.length,
  }
}

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
