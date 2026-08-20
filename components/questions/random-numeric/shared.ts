'use client'

import type { AnswerPart, FormulaPreset, LogicOperator, Question } from '@/lib/types'

export function equationTextFromQuestion(q?: Question | null): string | undefined {
  if (!q || !q.is_random) return undefined
  const stored = q.answer_parts?.[0]?.equation_text
  if (stored) return stored
  const answerVarName = (q.variables ?? []).find(v => v.is_answer)?.name
  const formula = q.answer_parts?.[0]?.formula
  if (!answerVarName || !formula) return undefined
  return `${answerVarName} = ${formula}`
}

export type CreationMode = 'from-equation' | 'fixed'
export type PresetWithCat = FormulaPreset & { question_categories: { name: string } | null }

// answerParts[0] (the main question's own answer) is the first item in the answer
// set (ก / 1 / a), matching how students see it during the exam. answerParts[1] is
// the second (ข / 2 / b), and so on.

export const MATH_KW = new Set(['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','sqrt','cbrt','log','log2','log10','exp','abs','ceil','floor','round','sign','pi','e'])

export const OPERATORS: { value: LogicOperator; label: string }[] = [
  { value: '<',  label: '<'  },
  { value: '>',  label: '>'  },
  { value: '<=', label: '≤'  },
  { value: '>=', label: '≥'  },
  { value: '!=', label: '≠'  },
]

export function parseVarsFromEquation(eq: string): string[] {
  const tokens = eq.match(/[a-zA-Z][a-zA-Z0-9_]*/g) ?? []
  return [...new Set(tokens.filter(t => !MATH_KW.has(t.toLowerCase())))]
}

export function detectAnswerVar(eq: string): string | null {
  const idx = eq.indexOf('=')
  if (idx === -1) return null
  const lhs = eq.slice(0, idx).trim()
  return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(lhs) ? lhs : null
}

export function extractRHS(eq: string): string {
  const idx = eq.indexOf('=')
  return idx !== -1 ? eq.slice(idx + 1).trim() : eq.trim()
}

export function newPart(): AnswerPart {
  return { id: Math.random().toString(36).slice(2), sub_text: '', formula: '', unit: '', tolerance: 0 }
}

// Older questions (saved before answer_parts existed) keep their formula/unit/tolerance
// in the legacy top-level columns instead. Fall back to those so edit/duplicate don't
// silently show a blank answer set for them.
export function answerPartsFromQuestion(q?: Question | null): AnswerPart[] {
  if (q?.answer_parts && q.answer_parts.length > 0) return q.answer_parts
  if (q?.answer_formula) {
    return [{ ...newPart(), formula: q.answer_formula, unit: q.answer_unit ?? '', tolerance: q.answer_tolerance ?? 0.1 }]
  }
  return [newPart()]
}
