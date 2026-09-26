import type { Variable } from '@/lib/types'

/**
 * A repeatable stand-in for Math.random, for "ให้นักเรียนทุกคนได้ตัวเลขชุดเดียวกัน"
 * (`assignments.shared_random_seed`).
 *
 * Sharing the numbers is done by sharing the *draw*, not by storing its
 * result: every attempt runs the same randomizeVariables over the same
 * question with a generator started from the same point, so it lands on the
 * same values — logic rules, answer_step and Pythagorean groups included,
 * because those are just more calls to the same generator.
 *
 * The stream is per question (seed + question id) rather than one stream for
 * the whole งาน, so a ข้อ's numbers do not depend on which other ข้อ came
 * before it. That is what keeps them the same when สับลำดับข้อ or สุ่มชุดโจทย์
 * hands each student a different order or subset.
 *
 * What would move them: editing the question's variables, or changing how
 * randomizeVariables consumes random numbers. Attempts already started keep
 * the values frozen in submission_answers either way.
 */

/** Largest seed createSharedRandomSeed hands out — fits the `integer` column. */
export const SHARED_RANDOM_SEED_MAX = 2_147_483_647

/** A fresh seed for a งาน, 1…2^31−1 (the column refuses 0 and below). */
export function createSharedRandomSeed(): number {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return (buffer[0] % SHARED_RANDOM_SEED_MAX) + 1
}

export function isSharedRandomSeed(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= SHARED_RANDOM_SEED_MAX
}

// FNV-1a over UTF-16 code units: enough to spread "seed:questionId" across a
// 32-bit starting state. Not cryptographic, and does not need to be — the
// numbers it leads to are shown to every student anyway.
function hashString(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

// mulberry32: a small, well-distributed 32-bit generator. Same contract as
// Math.random — a float in [0, 1).
function mulberry32(state: number): () => number {
  let a = state >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The generator one question draws its shared numbers from. */
export function questionRandom(seed: number, questionId: string): () => number {
  return mulberry32(hashString(`${seed}:${questionId}`))
}

/** What drawsRandomValues reads — the columns, not a whole Question row. */
export type RandomValuesShape = {
  question_type: string
  variables?: unknown
  extra_data?: unknown
}

/**
 * Whether a question hands students numbers that can differ between them —
 * the only questions "ตัวเลขชุดเดียวกัน" changes anything for, and so the only
 * reason the switch is offered at all.
 *
 * Only เติมคำตอบตัวเลข (`written`) keeps its drawn values: every other type is
 * frozen with empty random_values in buildSkeletonBase. Within it, a constant,
 * a reference to an earlier answer, the answer itself, a computed variable and
 * a range with one value in it cannot differ between students.
 */
export function drawsRandomValues(q: RandomValuesShape): boolean {
  if (q.question_type !== 'written') return false
  const groups = (q.extra_data as { pythagorean_groups?: unknown } | null | undefined)?.pythagorean_groups
  if (Array.isArray(groups) && groups.length > 0) return true
  const variables = Array.isArray(q.variables) ? (q.variables as Variable[]) : []
  return variables.some(v => {
    if (!v || v.type === 'reference' || v.is_answer || v.is_constant) return false
    if (typeof v.formula === 'string' && v.formula.trim().length > 0) return false
    if (Array.isArray(v.values) && v.values.length > 0) return new Set(v.values).size > 1
    return Number(v.max) > Number(v.min)
  })
}
