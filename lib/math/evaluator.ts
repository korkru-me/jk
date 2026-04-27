import { evaluate } from 'mathjs'
import type { Variable } from '@/lib/types'

export function evaluateMultiStep(
  subQuestions: Array<{ variables: Variable[]; answer_formula: string }>
): Array<{ values: Record<string, number>; answer: number | string }> {
  const prevAnswers: number[] = []
  return subQuestions.map((sq) => {
    const values: Record<string, number> = {}
    for (const v of sq.variables) {
      if (v.type === 'reference') {
        const idx = (v.reference_question_order ?? 1) - 1
        values[v.name] = prevAnswers[idx] ?? 0
      } else {
        const range = v.max - v.min
        const raw = v.min + Math.random() * range
        values[v.name] = parseFloat(raw.toFixed(v.decimals))
      }
    }
    const answer = evaluateFormula(sq.answer_formula, values)
    prevAnswers.push(typeof answer === 'number' ? answer : 0)
    return { values, answer }
  })
}

export function randomizeVariables(variables: Variable[]): Record<string, number> {
  const values: Record<string, number> = {}
  for (const v of variables) {
    if (v.type === 'reference') continue
    const range = v.max - v.min
    const raw = v.min + Math.random() * range
    values[v.name] = parseFloat(raw.toFixed(v.decimals))
  }
  return values
}

export function evaluateFormula(
  formula: string,
  values: Record<string, number>
): number | string {
  try {
    const result = evaluate(formula, values)
    return typeof result === 'number' ? result : String(result)
  } catch {
    return 'สูตรไม่ถูกต้อง'
  }
}

export function liveCalculate(
  formula: string,
  variables: Variable[]
): number | string {
  const mockValues: Record<string, number> = {}
  for (const v of variables) {
    if (v.type === 'reference') continue
    mockValues[v.name] = (v.min + v.max) / 2
  }
  return evaluateFormula(formula, mockValues)
}
