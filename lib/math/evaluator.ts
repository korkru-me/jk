import { evaluate, parse } from 'mathjs'
import type { Variable, LogicRule, PythagoreanGroup } from '@/lib/types'

// ─── Pythagorean triple data ──────────────────────────────────────────────────

export interface PythagoreanFamily {
  name: string
  triples: [number, number, number][]
}

export const PYTHAGOREAN_FAMILIES: PythagoreanFamily[] = [
  {
    name: 'ครอบครัว 3-4-5',
    triples: [[3,4,5],[6,8,10],[9,12,15],[12,16,20],[15,20,25],[30,40,50]],
  },
  {
    name: 'ครอบครัว 5-12-13',
    triples: [[5,12,13],[10,24,26],[15,36,39],[25,60,65],[50,120,130]],
  },
  {
    name: 'ครอบครัว 8-15-17',
    triples: [[8,15,17],[16,30,34],[24,45,51],[40,75,85]],
  },
  {
    name: 'ครอบครัว 7-24-25',
    triples: [[7,24,25],[14,48,50],[21,72,75]],
  },
  {
    name: 'ครอบครัว 20-21-29',
    triples: [[20,21,29],[40,42,58]],
  },
  {
    name: 'ทศนิยม (×0.1)',
    triples: [[0.3,0.4,0.5],[0.5,1.2,1.3],[0.6,0.8,1.0],[0.8,1.5,1.7]],
  },
  {
    name: 'ทศนิยม (×0.5)',
    triples: [[1.5,2.0,2.5],[2.5,6.0,6.5],[4.0,7.5,8.5]],
  },
]

export const ALL_PYTHAGOREAN_TRIPLES: [number, number, number][] =
  PYTHAGOREAN_FAMILIES.flatMap(f => f.triples)

// ─── Precision helpers ────────────────────────────────────────────────────────

function getPrecision(step: number): number {
  const str = step.toString()
  const dot = str.indexOf('.')
  return dot === -1 ? 0 : str.length - dot - 1
}

function randomFromStep(min: number, max: number, step: number): number {
  if (step <= 0) step = 1
  const count = Math.round((max - min) / step)
  const idx = Math.floor(Math.random() * (count + 1))
  const value = min + idx * step
  return parseFloat(value.toFixed(getPrecision(step)))
}

function getStep(v: Variable): number {
  if (v.step !== undefined) return v.step
  const legacy = (v as any).decimals
  return legacy !== undefined ? Math.pow(10, -legacy) : 1
}

// ─── isNiceNumber ─────────────────────────────────────────────────────────────
// Returns true when |value| is a multiple of step within floating-point tolerance.

export function isNiceNumber(value: number, step: number): boolean {
  if (!step || step <= 0) return true
  const ratio = Math.abs(value) / step
  return Math.abs(ratio - Math.round(ratio)) < 1e-9
}

// ─── hasMessyIntermediate ─────────────────────────────────────────────────────
// Walks the mathjs AST and checks whether any sub-expression produces a value
// with more than 2 decimal places (heuristic for "hard arithmetic").

export function hasMessyIntermediate(formula: string, values: Record<string, number>): boolean {
  try {
    const tree = parse(formula)
    let messy = false
    tree.traverse((node: any) => {
      if (messy) return
      if (node.type === 'OperatorNode' || node.type === 'FunctionNode') {
        try {
          const val = node.evaluate(values)
          if (typeof val === 'number' && isFinite(val)) {
            // more than 2 dp → ugly intermediate
            if (Math.abs(val - Math.round(val * 100) / 100) > 1e-6) messy = true
          }
        } catch { /* ignore unevaluable nodes */ }
      }
    })
    return messy
  } catch {
    return false
  }
}

// ─── Constraint check ─────────────────────────────────────────────────────────

function checkConstraints(values: Record<string, number>, rules: LogicRule[]): boolean {
  for (const rule of rules) {
    const lhsVal = values[rule.lhs]
    const rhsVal = rule.rhs_type === 'variable' ? values[rule.rhs_variable] : rule.rhs_constant
    if (lhsVal === undefined || rhsVal === undefined) continue
    switch (rule.operator) {
      case '<':  if (!(lhsVal <  rhsVal)) return false; break
      case '>':  if (!(lhsVal >  rhsVal)) return false; break
      case '<=': if (!(lhsVal <= rhsVal)) return false; break
      case '>=': if (!(lhsVal >= rhsVal)) return false; break
      case '!=': if (!(lhsVal !== rhsVal)) return false; break
    }
  }
  return true
}

// ─── Sampling ─────────────────────────────────────────────────────────────────

function sampleValues(variables: Variable[], exclude: Set<string> = new Set()): Record<string, number> {
  const values: Record<string, number> = {}
  for (const v of variables) {
    if (v.type === 'reference' || v.is_answer || exclude.has(v.name)) continue
    values[v.name] = v.is_constant
      ? (v.constant_value ?? v.min)
      : randomFromStep(v.min, v.max, getStep(v))
  }
  return values
}

function samplePythagoreanValues(groups: PythagoreanGroup[]): Record<string, number> {
  const values: Record<string, number> = {}
  for (const g of groups) {
    const triple = ALL_PYTHAGOREAN_TRIPLES[Math.floor(Math.random() * ALL_PYTHAGOREAN_TRIPLES.length)]
    values[g.a_var] = triple[0]
    values[g.b_var] = triple[1]
    values[g.c_var] = triple[2]
  }
  return values
}

export interface RandomizeOptions {
  formula?: string
  answerStep?: number
  pythagoreanGroups?: PythagoreanGroup[]
  maxAttempts?: number
}

// ─── randomizeVariables ───────────────────────────────────────────────────────
// Backward-compatible: original callers pass only variables + logicRules.
// New callers can also pass options for answer-step filtering and Pythagorean groups.
// Returns fallback=true when it gave up trying to satisfy answerStep.

export function randomizeVariables(
  variables: Variable[],
  logicRules: LogicRule[] = [],
  options: RandomizeOptions = {}
): Record<string, number> {
  const { formula, answerStep, pythagoreanGroups = [], maxAttempts = 500 } = options

  const pythagoreanVarNames = new Set(pythagoreanGroups.flatMap(g => [g.a_var, g.b_var, g.c_var]))
  const hasStep = !!answerStep && answerStep > 0
  const hasConstraints = logicRules.length > 0
  const hasPythagorean = pythagoreanGroups.length > 0

  // Fast path: no filtering needed
  if (!hasStep && !hasConstraints && !hasPythagorean) {
    return sampleValues(variables)
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pyValues = hasPythagorean ? samplePythagoreanValues(pythagoreanGroups) : {}
    const normalValues = sampleValues(variables, pythagoreanVarNames)
    const values = { ...pyValues, ...normalValues }

    if (!checkConstraints(values, logicRules)) continue

    if (hasStep && formula) {
      try {
        const answer = evaluate(formula, values)
        if (typeof answer !== 'number' || !isNiceNumber(answer, answerStep)) continue
      } catch { continue }
    }

    return values
  }

  // Fallback after exhausting attempts
  const pyValues = hasPythagorean ? samplePythagoreanValues(pythagoreanGroups) : {}
  return { ...pyValues, ...sampleValues(variables, pythagoreanVarNames) }
}

// ─── Trial runner (for preview UI) ───────────────────────────────────────────

export interface TrialSample {
  values: Record<string, number>
  answer: number
  isNice: boolean
  hasMessy: boolean
}

export interface TrialSummary {
  total: number
  niceCount: number
  messyCount: number          // nice answer but messy intermediate
  niceSamples: TrialSample[]  // up to 5 nice + clean
  warningSamples: TrialSample[]  // up to 3 nice but messy
  badSamples: TrialSample[]      // up to 3 not nice
}

export function runTrials(
  variables: Variable[],
  logicRules: LogicRule[],
  formula: string,
  options: {
    answerStep?: number
    pythagoreanGroups?: PythagoreanGroup[]
    trialCount?: number
  } = {}
): TrialSummary {
  const { answerStep = 0, pythagoreanGroups = [], trialCount = 200 } = options
  const pythagoreanVarNames = new Set(pythagoreanGroups.flatMap(g => [g.a_var, g.b_var, g.c_var]))
  const hasStep = answerStep > 0

  let niceCount = 0
  let messyCount = 0
  const niceSamples: TrialSample[] = []
  const warningSamples: TrialSample[] = []
  const badSamples: TrialSample[] = []

  for (let i = 0; i < trialCount; i++) {
    const pyValues = pythagoreanGroups.length > 0 ? samplePythagoreanValues(pythagoreanGroups) : {}
    const normalValues = sampleValues(variables, pythagoreanVarNames)
    const values = { ...pyValues, ...normalValues }

    if (!checkConstraints(values, logicRules)) continue

    let answer: number
    try {
      const raw = evaluate(formula, values)
      if (typeof raw !== 'number' || !isFinite(raw)) continue
      answer = raw
    } catch { continue }

    const isNice = !hasStep || isNiceNumber(answer, answerStep)
    const hasMessy = hasMessyIntermediate(formula, values)

    if (isNice) {
      niceCount++
      if (hasMessy) {
        messyCount++
        if (warningSamples.length < 3) warningSamples.push({ values, answer, isNice, hasMessy })
      } else {
        if (niceSamples.length < 5) niceSamples.push({ values, answer, isNice, hasMessy })
      }
    } else {
      if (badSamples.length < 3) badSamples.push({ values, answer, isNice, hasMessy })
    }
  }

  return { total: trialCount, niceCount, messyCount, niceSamples, warningSamples, badSamples }
}

// ─── evaluateFormula ──────────────────────────────────────────────────────────

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

// ─── evaluatePartsChained ─────────────────────────────────────────────────────

export function evaluatePartsChained(
  parts: Array<{ formula: string }>,
  baseValues: Record<string, number>
): number[] {
  const scope: Record<string, number> = { ...baseValues }
  const answers: number[] = []
  for (let i = 0; i < parts.length; i++) {
    const result = evaluateFormula(parts[i].formula, scope)
    const num = typeof result === 'number' ? result : 0
    answers.push(num)
    scope[`ans${i}`] = num
  }
  return answers
}

// ─── evaluateMultiStep ────────────────────────────────────────────────────────

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
        values[v.name] = v.is_constant
          ? (v.constant_value ?? v.min)
          : randomFromStep(v.min, v.max, getStep(v))
      }
    }
    const answer = evaluateFormula(sq.answer_formula, values)
    prevAnswers.push(typeof answer === 'number' ? answer : 0)
    return { values, answer }
  })
}

// ─── liveCalculate ────────────────────────────────────────────────────────────

export function liveCalculate(
  formula: string,
  variables: Variable[]
): number | string {
  const mockValues: Record<string, number> = {}
  for (const v of variables) {
    mockValues[v.name] = v.type === 'reference' ? 1 : (v.min + v.max) / 2
  }
  return evaluateFormula(formula, mockValues)
}
