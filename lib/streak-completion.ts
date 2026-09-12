import { isStreakEligible } from '@/lib/grading'
import type { CompletionRule } from '@/lib/types'

/**
 * The one place that decides whether a งาน really ends on a run of correct
 * answers, and what that run is allowed to look like.
 *
 * Both the wizard and createAssignment/updateAssignment ask this module, so a
 * setting the form offers and a setting the server stores cannot drift apart.
 * That drift is exactly what made สุ่มชุดโจทย์ look broken for แบบฝึกหัด: the
 * field rendered, the teacher filled it in, and the server dropped the value
 * on the floor because of a condition nobody could see from the form.
 *
 * Pure and side-effect free — it reads question *types*, never the database.
 */

/** Below 2 is not a run. Above 20 is past anything a teacher sets in practice,
 *  and both bounds are repeated as CHECK constraints on the column. */
export const STREAK_TARGET_MIN = 2
export const STREAK_TARGET_MAX = 20
export const STREAK_CAP_MIN = 1
export const STREAK_CAP_MAX = 200

/** What the form starts a new streak งาน at. Four in a row is long enough to
 *  rule out luck on a 4-choice ปรนัย and short enough to finish in a sitting. */
export const STREAK_TARGET_DEFAULT = 5
/** A ceiling proportional to the target, so raising the target does not
 *  silently make the ceiling the thing that ends every attempt. */
export function defaultQuestionCap(target: number): number {
  return Math.min(STREAK_CAP_MAX, target * 6)
}

/** A pool this much larger than the target is big enough that a student meets
 *  few repeats before passing. Advisory only — never a refusal. */
export const COMFORTABLE_POOL_MULTIPLE = 3

export interface CompletionRequest {
  requested?: CompletionRule | null
  mode: 'online' | 'print'
  target?: number | null
  questionCap?: number | null
  recyclePool?: boolean | null
  /** `question_type` of every ข้อ in the งาน's pool, in any order. */
  poolQuestionTypes: string[]
}

export interface CompletionDecision {
  rule: CompletionRule
  target: number | null
  questionCap: number | null
  recyclePool: boolean
  /**
   * Set when a streak was asked for and cannot be honored. The caller must
   * report this rather than storing `fixed` — a งาน quietly downgraded to a
   * different way of finishing is a งาน the teacher did not create.
   */
  refusedReason: string | null
}

/** How many ข้อ in the pool a streak could actually draw. */
export function streakEligibleCount(poolQuestionTypes: string[]): number {
  return poolQuestionTypes.filter(isStreakEligible).length
}

/** How many were left out, so the form can say so before the teacher commits. */
export function streakExcludedCount(poolQuestionTypes: string[]): number {
  return poolQuestionTypes.length - streakEligibleCount(poolQuestionTypes)
}

/**
 * Advice about a pool that works but will feel repetitive, in Thai, or null
 * when the pool is comfortable. Separate from `refusedReason` on purpose: a
 * teacher drilling one hard concept out of six ข้อ is making a real choice,
 * not a mistake.
 */
export function streakPoolAdvice(poolQuestionTypes: string[], target: number): string | null {
  const eligible = streakEligibleCount(poolQuestionTypes)
  if (eligible < target * COMFORTABLE_POOL_MULTIPLE) {
    return `คลังมีโจทย์ที่ใช้ได้ ${eligible} ข้อ ต่อเกณฑ์ ${target} ข้อ — น้อยกว่า ${COMFORTABLE_POOL_MULTIPLE} เท่า นักเรียนจะเจอข้อซ้ำเร็วและอาจจำคำตอบได้ก่อนที่จะแม่นจริง`
  }
  return null
}

function invalidTarget(target: number | null | undefined): boolean {
  return !Number.isInteger(target)
    || (target as number) < STREAK_TARGET_MIN
    || (target as number) > STREAK_TARGET_MAX
}

/**
 * Resolve what to store. Mirrors the CHECK constraints added in
 * 20260912131237 so a refusal reads as a sentence here instead of arriving as
 * a Postgres constraint violation.
 */
export function decideCompletion(request: CompletionRequest): CompletionDecision {
  const fixed: CompletionDecision = {
    rule: 'fixed',
    target: null,
    questionCap: null,
    recyclePool: true,
    refusedReason: null,
  }

  if (request.requested !== 'streak') return fixed

  // A printed ใบงาน has no moment at which a ข้อ is judged, so there is never
  // a run to count.
  if (request.mode !== 'online') {
    return { ...fixed, refusedReason: 'โหมดพิมพ์ใช้เงื่อนไข “ถูกติดต่อกัน” ไม่ได้ เพราะใบงานบนกระดาษไม่มีการตรวจทีละข้อ' }
  }

  if (invalidTarget(request.target)) {
    return {
      ...fixed,
      refusedReason: `จำนวนข้อที่ต้องถูกติดต่อกันต้องอยู่ระหว่าง ${STREAK_TARGET_MIN} ถึง ${STREAK_TARGET_MAX} ข้อ`,
    }
  }
  const target = request.target as number

  // Fewer usable ข้อ than the target means the streak is unreachable on the
  // first pass, and with recycling off it is unreachable at all. Refusing here
  // is the difference between a teacher finding out now and a student finding
  // out halfway through.
  const eligible = streakEligibleCount(request.poolQuestionTypes)
  if (eligible < target) {
    const excluded = streakExcludedCount(request.poolQuestionTypes)
    const excludedNote = excluded > 0
      ? ` (ข้อเขียนและข้อส่งไฟล์ ${excluded} ข้อใช้ในโหมดนี้ไม่ได้ เพราะระบบตรวจให้ทันทีไม่ได้)`
      : ''
    return {
      ...fixed,
      refusedReason: `เงื่อนไขนี้ต้องมีโจทย์ที่ระบบตรวจได้อย่างน้อย ${target} ข้อ ตอนนี้มี ${eligible} ข้อ${excludedNote}`,
    }
  }

  const cap = Number.isInteger(request.questionCap)
    && (request.questionCap as number) >= STREAK_CAP_MIN
    && (request.questionCap as number) <= STREAK_CAP_MAX
    ? (request.questionCap as number)
    : null

  return {
    rule: 'streak',
    target,
    // A ceiling below the target would end every attempt before it could
    // possibly pass, so it is raised to the target rather than refused.
    questionCap: cap != null ? Math.max(cap, target) : null,
    recyclePool: request.recyclePool !== false,
    refusedReason: null,
  }
}

/**
 * The settings a streak งาน cannot be stored with, whatever the form sent.
 * Each one is a constraint in the database too; this returns them as values so
 * the actions do not each re-derive the list.
 */
export interface StreakForcedSettings {
  /** The DB refuses streak without it: no verdict, nothing to count. */
  instant_check: true
  /** A variable-length attempt makes two students' totals incomparable. */
  passing_type: null
  passing_value: null
  /** The run is judged one ข้อ at a time, so a page of several cannot work. */
  questions_per_page: 1
  /** ผ่าน/ไม่ผ่าน averaged across attempts is not a number that means
   *  anything; the best attempt is the one that answers "did they get there". */
  score_strategy: 'best'
  /** There is no fixed set of missed ข้อ to come back to. */
  retry_scope: 'all'
}

export function streakForcedSettings(): StreakForcedSettings {
  return {
    instant_check: true,
    passing_type: null,
    passing_value: null,
    questions_per_page: 1,
    score_strategy: 'best',
    retry_scope: 'all',
  }
}
