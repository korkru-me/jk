import { describe, it, expect } from 'vitest'
import {
  COMFORTABLE_POOL_MULTIPLE,
  STREAK_CAP_MAX,
  STREAK_TARGET_MAX,
  STREAK_TARGET_MIN,
  decideCompletion,
  defaultQuestionCap,
  streakEligibleCount,
  streakExcludedCount,
  streakForcedSettings,
  streakPoolAdvice,
} from './streak-completion'

/** A pool of `n` ปรนัย, the ordinary case. */
function mcqPool(n: number): string[] {
  return Array.from({ length: n }, () => 'mcq')
}

describe('streakEligibleCount', () => {
  it('counts every auto-gradable type', () => {
    const pool = ['mcq', 'written', 'true_false', 'fill_blank', 'ordering', 'matching', 'composite', 'classify']
    expect(streakEligibleCount(pool)).toBe(pool.length)
  })

  it('leaves out ข้อเขียน, which only a teacher can score', () => {
    expect(streakEligibleCount(['mcq', 'essay', 'mcq'])).toBe(2)
  })

  // Regression guard for the reason this is not just isInstantCheckable:
  // gradeAnswer gives a ส่งไฟล์งาน full marks for any attached file, which in
  // this mode would advance the streak for a blank photo, repeatedly.
  it('leaves out ข้อส่งไฟล์, where attaching anything earns full marks', () => {
    expect(streakEligibleCount(['mcq', 'file_upload'])).toBe(1)
  })

  it('reports how many were left out', () => {
    expect(streakExcludedCount(['mcq', 'essay', 'file_upload', 'written'])).toBe(2)
  })
})

describe('decideCompletion', () => {
  it('defaults to fixed, the behavior of every งาน before this setting', () => {
    const d = decideCompletion({ mode: 'online', poolQuestionTypes: mcqPool(10) })
    expect(d.rule).toBe('fixed')
    expect(d.target).toBeNull()
    expect(d.questionCap).toBeNull()
    expect(d.refusedReason).toBeNull()
  })

  it('keeps streak fields null when the rule is fixed, whatever was sent', () => {
    const d = decideCompletion({
      requested: 'fixed', mode: 'online', target: 5, questionCap: 30, poolQuestionTypes: mcqPool(10),
    })
    expect(d).toMatchObject({ rule: 'fixed', target: null, questionCap: null })
  })

  it('accepts a streak the pool can support', () => {
    const d = decideCompletion({
      requested: 'streak', mode: 'online', target: 5, questionCap: 30, poolQuestionTypes: mcqPool(20),
    })
    expect(d).toMatchObject({
      rule: 'streak', target: 5, questionCap: 30, recyclePool: true, refusedReason: null,
    })
  })

  it('treats an absent recyclePool as on and an explicit false as off', () => {
    const base = { requested: 'streak' as const, mode: 'online' as const, target: 3, poolQuestionTypes: mcqPool(20) }
    expect(decideCompletion(base).recyclePool).toBe(true)
    expect(decideCompletion({ ...base, recyclePool: false }).recyclePool).toBe(false)
  })

  // The point of refusedReason: a refused streak must not come back looking
  // like a งาน the teacher successfully created with a different ending.
  it('refuses print mode with a reason rather than downgrading silently', () => {
    const d = decideCompletion({
      requested: 'streak', mode: 'print', target: 5, poolQuestionTypes: mcqPool(20),
    })
    expect(d.rule).toBe('fixed')
    expect(d.refusedReason).toMatch(/โหมดพิมพ์/)
  })

  it('refuses a target outside the column bounds', () => {
    const pool = mcqPool(40)
    expect(decideCompletion({ requested: 'streak', mode: 'online', target: STREAK_TARGET_MIN - 1, poolQuestionTypes: pool }).refusedReason)
      .toMatch(/ระหว่าง/)
    expect(decideCompletion({ requested: 'streak', mode: 'online', target: STREAK_TARGET_MAX + 1, poolQuestionTypes: pool }).refusedReason)
      .toMatch(/ระหว่าง/)
    expect(decideCompletion({ requested: 'streak', mode: 'online', target: 2.5, poolQuestionTypes: pool }).refusedReason)
      .toMatch(/ระหว่าง/)
    expect(decideCompletion({ requested: 'streak', mode: 'online', poolQuestionTypes: pool }).refusedReason)
      .toMatch(/ระหว่าง/)
  })

  it('refuses a pool with fewer usable ข้อ than the target', () => {
    const d = decideCompletion({
      requested: 'streak', mode: 'online', target: 5, poolQuestionTypes: mcqPool(4),
    })
    expect(d.rule).toBe('fixed')
    expect(d.refusedReason).toMatch(/อย่างน้อย 5 ข้อ ตอนนี้มี 4 ข้อ/)
  })

  it('counts only usable ข้อ when refusing, and says what was skipped', () => {
    const d = decideCompletion({
      requested: 'streak',
      mode: 'online',
      target: 5,
      // Six ข้อ looks like enough until the three that cannot be judged
      // mid-attempt are taken out, which is the whole reason the message
      // names them: "ผมเลือกไว้ 6 ข้อแล้วนี่" is the teacher's first thought.
      poolQuestionTypes: ['mcq', 'mcq', 'mcq', 'essay', 'essay', 'file_upload'],
    })
    expect(d.rule).toBe('fixed')
    expect(d.refusedReason).toMatch(/อย่างน้อย 5 ข้อ ตอนนี้มี 3 ข้อ/)
    expect(d.refusedReason).toMatch(/ข้อเขียนและข้อส่งไฟล์ 3 ข้อ/)
  })

  it('accepts a pool whose usable count exactly equals the target', () => {
    const d = decideCompletion({
      requested: 'streak', mode: 'online', target: 5,
      poolQuestionTypes: ['mcq', 'mcq', 'mcq', 'mcq', 'mcq', 'essay', 'file_upload'],
    })
    expect(d).toMatchObject({ rule: 'streak', target: 5, refusedReason: null })
  })

  it('drops a ceiling outside the column bounds instead of refusing the งาน', () => {
    const pool = mcqPool(20)
    expect(decideCompletion({ requested: 'streak', mode: 'online', target: 5, questionCap: 0, poolQuestionTypes: pool }).questionCap).toBeNull()
    expect(decideCompletion({ requested: 'streak', mode: 'online', target: 5, questionCap: STREAK_CAP_MAX + 1, poolQuestionTypes: pool }).questionCap).toBeNull()
  })

  // A ceiling under the target would end every attempt one ข้อ before it could
  // pass, which reads as a broken งาน rather than a strict one.
  it('raises a ceiling below the target up to the target', () => {
    const d = decideCompletion({
      requested: 'streak', mode: 'online', target: 8, questionCap: 3, poolQuestionTypes: mcqPool(20),
    })
    expect(d.questionCap).toBe(8)
  })
})

describe('streakPoolAdvice', () => {
  it('warns when the pool is under the comfortable multiple of the target', () => {
    expect(streakPoolAdvice(mcqPool(5 * COMFORTABLE_POOL_MULTIPLE - 1), 5)).toMatch(/ข้อซ้ำ/)
  })

  it('stays quiet once the pool is comfortable', () => {
    expect(streakPoolAdvice(mcqPool(5 * COMFORTABLE_POOL_MULTIPLE), 5)).toBeNull()
  })

  it('measures the usable ข้อ, not the pool size', () => {
    const pool = [...mcqPool(10), ...Array.from({ length: 20 }, () => 'essay')]
    expect(streakPoolAdvice(pool, 5)).toMatch(/ใช้ได้ 10 ข้อ/)
  })
})

describe('defaultQuestionCap', () => {
  it('scales with the target so the ceiling is not what ends the attempt', () => {
    expect(defaultQuestionCap(5)).toBe(30)
    expect(defaultQuestionCap(2)).toBe(12)
  })

  it('never exceeds the column bound', () => {
    expect(defaultQuestionCap(STREAK_TARGET_MAX)).toBeLessThanOrEqual(STREAK_CAP_MAX)
  })
})

describe('streakForcedSettings', () => {
  // Each of these is also a CHECK constraint or an invariant the runtime
  // depends on, so the list is asserted whole rather than field by field.
  it('states every setting a streak งาน overrides', () => {
    expect(streakForcedSettings()).toEqual({
      instant_check: true,
      passing_type: null,
      passing_value: null,
      questions_per_page: 1,
      score_strategy: 'best',
      retry_scope: 'all',
    })
  })
})
