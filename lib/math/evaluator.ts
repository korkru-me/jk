import { evaluate, parse } from 'mathjs'
import type { MathInputMode, Variable, LogicRule, PythagoreanGroup } from '@/lib/types'
import { evaluateStudentExpression } from './student-expression'

// ─── Pythagorean triple data ──────────────────────────────────────────────────
// Moved to ./pythagorean-families so a caller that only wants the tables does
// not have to load mathjs. Re-exported here for the existing import sites.
export {
  PYTHAGOREAN_FAMILIES,
  ALL_PYTHAGOREAN_TRIPLES,
  type PythagoreanFamily,
} from './pythagorean-families'

import { ALL_PYTHAGOREAN_TRIPLES } from './pythagorean-families'

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

// Some quantities only make sense at a handful of unevenly spaced values
// (mu = 0.1, 0.2, 0.5), which the min/max/step ladder can't express. When a
// variable carries an explicit `values` list, every sampler draws from it
// instead — see Variable.values in lib/types.ts.
function hasValueList(v: Variable): boolean {
  return Array.isArray(v.values) && v.values.length > 0
}

function pickFromList(values: number[]): number {
  return values[Math.floor(Math.random() * values.length)]
}

/** One sample of `v`, honouring constant → value-list → min/max/step in that order. */
function sampleVariable(v: Variable): number {
  if (v.is_constant) return v.constant_value ?? v.min
  if (hasValueList(v)) return pickFromList(v.values!)
  return randomFromStep(v.min, v.max, getStep(v))
}

function isDerived(v: Variable): boolean {
  return typeof v.formula === 'string' && v.formula.trim().length > 0
}

/**
 * Fills in the variables that are computed rather than drawn — see
 * Variable.formula. Written into `values` in place, so callers get derived
 * values in the same record as the sampled ones and nothing downstream has to
 * know the difference.
 *
 * A derived variable may depend on another, so this repeats until nothing new
 * resolves. Each pass resolves at least one variable or stops, which bounds a
 * chain of N variables at N passes and leaves a reference cycle simply unset
 * rather than looping.
 */
function resolveDerived(derived: Variable[], values: Record<string, number>): void {
  let pending = derived
  for (let pass = 0; pass < derived.length && pending.length > 0; pass++) {
    const unresolved: Variable[] = []
    for (const v of pending) {
      const result = evaluateFormula(v.formula as string, values)
      if (typeof result === 'number' && isFinite(result)) values[v.name] = result
      else unresolved.push(v)
    }
    if (unresolved.length === pending.length) break
    pending = unresolved
  }
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

// `seed` holds values decided elsewhere (currently the Pythagorean triples),
// passed in rather than merged afterwards so that derived variables can be
// computed from them.
function sampleValues(
  variables: Variable[],
  exclude: Set<string> = new Set(),
  seed: Record<string, number> = {},
): Record<string, number> {
  const values: Record<string, number> = { ...seed }
  const derived: Variable[] = []
  for (const v of variables) {
    if (v.type === 'reference' || v.is_answer || exclude.has(v.name)) continue
    if (isDerived(v)) { derived.push(v); continue }
    values[v.name] = sampleVariable(v)
  }
  resolveDerived(derived, values)
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
    const values = sampleValues(variables, pythagoreanVarNames, pyValues)

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
  return sampleValues(variables, pythagoreanVarNames, pyValues)
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
    const values = sampleValues(variables, pythagoreanVarNames, pyValues)

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

// ─── evaluateStudentAnswer ──────────────────────────────────────────────────────
// Student input has a different trust boundary from teacher-authored formulas.
// Keep it on the small, purpose-built parser so neither a general expression
// runtime nor mathjs's large client bundle is needed by the answer keypad.
export function evaluateStudentAnswer(text: string, mode: MathInputMode = 'deg'): number | null {
  return evaluateStudentExpression(text, mode)
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
    const derived: Variable[] = []
    for (const v of sq.variables) {
      if (v.type === 'reference') {
        const idx = (v.reference_question_order ?? 1) - 1
        values[v.name] = prevAnswers[idx] ?? 0
      } else if (isDerived(v)) {
        derived.push(v)
      } else {
        values[v.name] = sampleVariable(v)
      }
    }
    resolveDerived(derived, values)
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
  const derived: Variable[] = []
  for (const v of variables) {
    if (isDerived(v)) { derived.push(v); continue }
    mockValues[v.name] = v.type === 'reference'
      ? 1
      : hasValueList(v)
        ? v.values![Math.floor(v.values!.length / 2)]
        : (v.min + v.max) / 2
  }
  resolveDerived(derived, mockValues)
  return evaluateFormula(formula, mockValues)
}
