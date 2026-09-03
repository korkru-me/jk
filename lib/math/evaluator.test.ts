import { describe, it, expect } from 'vitest'
import {
  randomizeVariables,
  evaluateFormula,
  evaluateStudentAnswer,
  evaluatePartsChained,
  evaluateMultiStep,
  liveCalculate,
  isNiceNumber,
  runTrials,
} from './evaluator'
import type { Variable } from '@/lib/types'

const v = (over: Partial<Variable> & { name: string }): Variable => ({
  min: 1, max: 10, step: 1, type: 'value', ...over,
})

// How many draws to take when asserting something about the *distribution*
// rather than a single sample. Every variable here has a small domain, so this
// is enough to see every value without making the suite slow.
const DRAWS = 300

describe('randomizeVariables — range variables', () => {
  it('stays inside min/max and lands on the step ladder', () => {
    const vars = [v({ name: 'a', min: 2, max: 10, step: 2 })]
    for (let i = 0; i < DRAWS; i++) {
      const { a } = randomizeVariables(vars)
      expect(a).toBeGreaterThanOrEqual(2)
      expect(a).toBeLessThanOrEqual(10)
      expect(a % 2).toBe(0)
    }
  })

  it('reaches both ends of the range', () => {
    const seen = new Set<number>()
    for (let i = 0; i < DRAWS; i++) seen.add(randomizeVariables([v({ name: 'a', min: 1, max: 3, step: 1 })]).a)
    expect([...seen].sort()).toEqual([1, 2, 3])
  })

  it('keeps decimal steps clean instead of drifting into float noise', () => {
    for (let i = 0; i < DRAWS; i++) {
      const { a } = randomizeVariables([v({ name: 'a', min: 0.1, max: 0.5, step: 0.1 })])
      expect(a).toBe(Number(a.toFixed(1)))
    }
  })

  it('treats a constant as its constant value', () => {
    for (let i = 0; i < 20; i++) {
      expect(randomizeVariables([v({ name: 'g', is_constant: true, constant_value: 9.8 })]).g).toBe(9.8)
    }
  })
})

describe('randomizeVariables — value lists', () => {
  const mu = v({ name: 'mu', min: 0.1, max: 0.5, values: [0.1, 0.2, 0.5] })

  it('only ever draws a listed value', () => {
    for (let i = 0; i < DRAWS; i++) {
      expect([0.1, 0.2, 0.5]).toContain(randomizeVariables([mu]).mu)
    }
  })

  it('draws every listed value, including ones off the step ladder', () => {
    const seen = new Set<number>()
    for (let i = 0; i < DRAWS; i++) seen.add(randomizeVariables([mu]).mu)
    expect([...seen].sort((a, b) => a - b)).toEqual([0.1, 0.2, 0.5])
  })

  it('ignores the list when it is empty, falling back to the range', () => {
    const { a } = randomizeVariables([v({ name: 'a', min: 4, max: 4, values: [] })])
    expect(a).toBe(4)
  })
})

describe('randomizeVariables — derived variables', () => {
  it('computes from an already sampled variable', () => {
    const vars = [v({ name: 'l', min: 2, max: 10, step: 2 }), v({ name: 'lm', formula: 'l*0.4' })]
    for (let i = 0; i < 50; i++) {
      const values = randomizeVariables(vars)
      expect(values.lm).toBeCloseTo(values.l * 0.4, 10)
    }
  })

  it('resolves a chain regardless of the order it is declared in', () => {
    const vars = [
      v({ name: 'half', formula: 'lm/2' }),   // depends on a variable declared later
      v({ name: 'lm', formula: 'l*0.4' }),
      v({ name: 'l', min: 10, max: 10, step: 1 }),
    ]
    const values = randomizeVariables(vars)
    expect(values.lm).toBeCloseTo(4, 10)
    expect(values.half).toBeCloseTo(2, 10)
  })

  it('leaves a reference cycle unset rather than looping forever', () => {
    const values = randomizeVariables([
      v({ name: 'a', formula: 'b+1' }),
      v({ name: 'b', formula: 'a+1' }),
    ])
    expect(values.a).toBeUndefined()
    expect(values.b).toBeUndefined()
  })

  it('is visible to logic rules, which run after derivation', () => {
    // lm = l*0.4 and the rule demands lm > 3, so l has to clear 7.5 — of
    // {2,4,6,8,10} only 8 and 10 qualify. The rule can only do that if it is
    // checked *after* lm exists.
    for (let i = 0; i < 50; i++) {
      const values = randomizeVariables(
        [v({ name: 'l', min: 2, max: 10, step: 2 }), v({ name: 'lm', formula: 'l*0.4' })],
        [{ id: 'r1', lhs: 'lm', operator: '>', rhs_type: 'constant', rhs_variable: '', rhs_constant: 3 }],
      )
      expect(values.lm).toBeGreaterThan(3)
      expect([8, 10]).toContain(values.l)
    }
  })

  it('can be computed from a Pythagorean triple', () => {
    const values = randomizeVariables(
      [v({ name: 'a' }), v({ name: 'b' }), v({ name: 'c' }), v({ name: 'perimeter', formula: 'a+b+c' })],
      [],
      { pythagoreanGroups: [{ id: 'g1', a_var: 'a', b_var: 'b', c_var: 'c' }] },
    )
    expect(values.a ** 2 + values.b ** 2).toBeCloseTo(values.c ** 2, 6)
    expect(values.perimeter).toBeCloseTo(values.a + values.b + values.c, 10)
  })
})

describe('randomizeVariables — logic rules', () => {
  it('honours a rule comparing two variables', () => {
    for (let i = 0; i < 50; i++) {
      const values = randomizeVariables(
        [v({ name: 'a', min: 1, max: 10 }), v({ name: 'b', min: 1, max: 10 })],
        [{ id: 'r', lhs: 'a', operator: '<', rhs_type: 'variable', rhs_variable: 'b', rhs_constant: 0 }],
      )
      expect(values.a).toBeLessThan(values.b)
    }
  })
})

describe('evaluateFormula', () => {
  it('substitutes variables', () => {
    expect(evaluateFormula('b*cos(pi*a/180)', { a: 60, b: 10 })).toBeCloseTo(5, 6)
  })

  it('reports a broken formula instead of throwing', () => {
    expect(evaluateFormula('2 +', { })).toBe('สูตรไม่ถูกต้อง')
  })
})

describe('evaluateStudentAnswer', () => {
  it('accepts a plain number and simple arithmetic', () => {
    expect(evaluateStudentAnswer('12')).toBe(12)
    expect(evaluateStudentAnswer('9+1')).toBe(10)
  })

  it('reads trig in degrees, the way a school calculator does', () => {
    expect(evaluateStudentAnswer('sin(30)')).toBeCloseTo(0.5, 10)
    expect(evaluateStudentAnswer('sin(pi/6)', 'rad')).toBeCloseTo(0.5, 10)
  })

  it('accepts the √ symbol the question text offers', () => {
    expect(evaluateStudentAnswer('√100')).toBe(10)
    expect(evaluateStudentAnswer('√(9+16)')).toBe(5)
  })

  it('rejects anything outside the calculator allowlist', () => {
    // Student input is untrusted, so bare symbols, assignments and unknown
    // functions must not evaluate.
    expect(evaluateStudentAnswer('a')).toBeNull()
    expect(evaluateStudentAnswer('x = 5')).toBeNull()
    expect(evaluateStudentAnswer('config')).toBeNull()
    expect(evaluateStudentAnswer('[1,2,3]')).toBeNull()
    expect(evaluateStudentAnswer('')).toBeNull()
  })
})

describe('multi-part evaluation', () => {
  it('lets a later part use an earlier part answer as ans0', () => {
    const answers = evaluatePartsChained([{ formula: 'a*2' }, { formula: 'ans0+1' }], { a: 5 })
    expect(answers).toEqual([10, 11])
  })

  it('feeds a reference variable from the previous sub-question answer', () => {
    const steps = evaluateMultiStep([
      { variables: [{ name: 'a', min: 4, max: 4, step: 1 }], answer_formula: 'a*2' },
      {
        variables: [{ name: 'prev', min: 0, max: 0, step: 1, type: 'reference', reference_question_order: 1 }],
        answer_formula: 'prev+1',
      },
    ])
    expect(steps[0].answer).toBe(8)
    expect(steps[1].answer).toBe(9)
  })
})

describe('liveCalculate', () => {
  it('previews with the midpoint of a range', () => {
    expect(liveCalculate('a', [v({ name: 'a', min: 0, max: 10 })])).toBe(5)
  })

  it('previews a derived variable rather than leaving it undefined', () => {
    expect(liveCalculate('lm', [v({ name: 'l', min: 10, max: 10 }), v({ name: 'lm', formula: 'l*0.4' })]))
      .toBeCloseTo(4, 10)
  })
})

describe('isNiceNumber', () => {
  it('accepts multiples of the step and rejects the rest', () => {
    expect(isNiceNumber(0.75, 0.25)).toBe(true)
    expect(isNiceNumber(0.8, 0.25)).toBe(false)
    expect(isNiceNumber(123.4, 0)).toBe(true)  // no step means no constraint
  })
})

describe('runTrials', () => {
  it('counts how often an answer lands on the requested step', () => {
    const summary = runTrials(
      [v({ name: 'a', min: 1, max: 4, step: 1 })],
      [],
      'a*2',
      { answerStep: 2, trialCount: 60 },
    )
    // a*2 is always even, so every trial should be "nice".
    expect(summary.niceCount).toBe(60)
    expect(summary.badSamples).toHaveLength(0)
  })
})
