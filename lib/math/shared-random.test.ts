import { describe, it, expect } from 'vitest'
import {
  SHARED_RANDOM_SEED_MAX, createSharedRandomSeed, drawsRandomValues, isSharedRandomSeed, questionRandom,
} from './shared-random'
import { randomizeVariables } from './evaluator'
import type { LogicRule, Variable } from '@/lib/types'

const v = (over: Partial<Variable> & { name: string }): Variable => ({
  min: 1, max: 10, step: 1, type: 'value', ...over,
})

const take = (rng: () => number, n: number) => Array.from({ length: n }, () => rng())

describe('questionRandom', () => {
  it('replays the same sequence for the same seed and question', () => {
    expect(take(questionRandom(123, 'q1'), 20)).toEqual(take(questionRandom(123, 'q1'), 20))
  })

  it('starts a different sequence for another question or another seed', () => {
    const base = take(questionRandom(123, 'q1'), 5)
    expect(take(questionRandom(123, 'q2'), 5)).not.toEqual(base)
    expect(take(questionRandom(124, 'q1'), 5)).not.toEqual(base)
  })

  it('keeps Math.random\'s contract: floats in [0, 1)', () => {
    const draws = take(questionRandom(SHARED_RANDOM_SEED_MAX, 'q1'), 5000)
    expect(draws.every(x => x >= 0 && x < 1)).toBe(true)
    // Spread over the whole range rather than stuck in one corner.
    expect(Math.min(...draws)).toBeLessThan(0.01)
    expect(Math.max(...draws)).toBeGreaterThan(0.99)
  })
})

describe('createSharedRandomSeed', () => {
  it('hands out seeds the column accepts', () => {
    for (let i = 0; i < 200; i++) expect(isSharedRandomSeed(createSharedRandomSeed())).toBe(true)
  })

  it('refuses what is not a seed', () => {
    for (const bad of [0, -1, 1.5, SHARED_RANDOM_SEED_MAX + 1, null, undefined, '12', Number.NaN]) {
      expect(isSharedRandomSeed(bad)).toBe(false)
    }
  })
})

describe('randomizeVariables with a shared generator', () => {
  const rule: LogicRule = { id: 'r', lhs: 'a', operator: '<', rhs_type: 'variable', rhs_variable: 'b', rhs_constant: 0 }

  it('lands on the same values every time', () => {
    const variables = [v({ name: 'a', min: 1, max: 1_000_000 }), v({ name: 'b', min: 1, max: 1_000_000 })]
    const first = randomizeVariables(variables, [], { rng: questionRandom(7, 'q1') })
    for (let i = 0; i < 20; i++) {
      expect(randomizeVariables(variables, [], { rng: questionRandom(7, 'q1') })).toEqual(first)
    }
  })

  // Rejection sampling calls the generator an unknown number of times. The
  // replay still matches because every one of those calls is replayed too.
  it('still matches when logic rules and a nice-answer step reject draws', () => {
    const variables = [v({ name: 'a', min: 1, max: 50 }), v({ name: 'b', min: 1, max: 50 })]
    const options = { formula: 'a / b', answerStep: 0.5 }
    const first = randomizeVariables(variables, [rule], { ...options, rng: questionRandom(99, 'q9') })
    expect(first.a).toBeLessThan(first.b)
    expect((first.a / first.b) % 0.5).toBeCloseTo(0)
    expect(randomizeVariables(variables, [rule], { ...options, rng: questionRandom(99, 'q9') })).toEqual(first)
  })

  it('shares value lists, Pythagorean triples and computed variables too', () => {
    const variables = [
      v({ name: 'mu', values: [0.1, 0.2, 0.3, 0.5, 0.7, 0.9] }),
      v({ name: 'x' }), v({ name: 'y' }), v({ name: 'z' }),
      v({ name: 'half', formula: 'z / 2' }),
    ]
    const options = { pythagoreanGroups: [{ id: 'p', a_var: 'x', b_var: 'y', c_var: 'z' }] }
    const first = randomizeVariables(variables, [], { ...options, rng: questionRandom(5, 'q5') })
    expect(first.x ** 2 + first.y ** 2).toBe(first.z ** 2)
    expect(first.half).toBe(first.z / 2)
    expect(randomizeVariables(variables, [], { ...options, rng: questionRandom(5, 'q5') })).toEqual(first)
  })
})

describe('drawsRandomValues', () => {
  const written = (variables: Partial<Variable>[], extra_data: unknown = {}) => ({
    question_type: 'written',
    variables: variables.map((over, i) => v({ name: `v${i}`, ...over })),
    extra_data,
  })

  it('is true for a เติมคำตอบตัวเลข with a range to draw from', () => {
    expect(drawsRandomValues(written([{ min: 1, max: 10 }]))).toBe(true)
    expect(drawsRandomValues(written([{ values: [1, 4, 9] }]))).toBe(true)
    expect(drawsRandomValues(written([], { pythagorean_groups: [{ id: 'p', a_var: 'a', b_var: 'b', c_var: 'c' }] }))).toBe(true)
  })

  it('is false when nothing could differ between two students', () => {
    expect(drawsRandomValues(written([]))).toBe(false)
    expect(drawsRandomValues(written([{ is_constant: true, constant_value: 9.8 }]))).toBe(false)
    expect(drawsRandomValues(written([{ min: 5, max: 5 }]))).toBe(false)
    expect(drawsRandomValues(written([{ values: [3, 3] }]))).toBe(false)
    expect(drawsRandomValues(written([{ type: 'reference' }, { is_answer: true }, { formula: '2*3' }]))).toBe(false)
  })

  it('is false for every other type, which freezes no random values', () => {
    expect(drawsRandomValues({ question_type: 'mcq', variables: [v({ name: 'a' })] })).toBe(false)
    expect(drawsRandomValues({ question_type: 'composite', variables: [v({ name: 'a' })] })).toBe(false)
  })

  it('survives the jsonb arriving empty or malformed', () => {
    expect(drawsRandomValues({ question_type: 'written', variables: null, extra_data: null })).toBe(false)
    expect(drawsRandomValues({ question_type: 'written', variables: 'oops' })).toBe(false)
  })
})
