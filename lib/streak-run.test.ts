import { describe, it, expect } from 'vitest'
import {
  advanceStreak,
  advanceStreakForVerdict,
  pickNextStreakQuestion,
  streakEnding,
  type StreakState,
} from './streak-run'

const fresh: StreakState = { current: 0, best: 0, reached: false }

/** A random() that walks a fixed list, so a pick is a assertion not a coin flip. */
function seeded(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}

describe('advanceStreak', () => {
  it('counts up on a correct answer', () => {
    expect(advanceStreak(fresh, true, 5)).toEqual({ current: 1, best: 1, reached: false })
  })

  it('restarts at 0 on a wrong answer, not one step back', () => {
    const at3: StreakState = { current: 3, best: 3, reached: false }
    expect(advanceStreak(at3, false, 5)).toEqual({ current: 0, best: 3, reached: false })
  })

  it('keeps the best run a wrong answer wiped out', () => {
    let s = fresh
    for (const correct of [true, true, true, true, false, true]) s = advanceStreak(s, correct, 5)
    expect(s).toEqual({ current: 1, best: 4, reached: false })
  })

  it('marks reached on the answer that hits the target', () => {
    let s = fresh
    for (let i = 0; i < 5; i++) s = advanceStreak(s, true, 5)
    expect(s).toEqual({ current: 5, best: 5, reached: true })
  })

  // The ฝึกต่ออีก button lets a student keep going after passing; what they
  // already earned must not be taken back by a later mistake.
  it('never un-reaches once the target was hit', () => {
    let s: StreakState = { current: 5, best: 5, reached: true }
    s = advanceStreak(s, false, 5)
    expect(s).toEqual({ current: 0, best: 5, reached: true })
  })
})

describe('advanceStreakForVerdict', () => {
  it('advances only on full marks', () => {
    expect(advanceStreakForVerdict(fresh, 'correct', 5).current).toBe(1)
  })

  // "ถูก" means full marks. A ข้อ with four ช่อง must not step the run forward
  // because one blank was right.
  it('treats partial credit as wrong', () => {
    const at2: StreakState = { current: 2, best: 2, reached: false }
    expect(advanceStreakForVerdict(at2, 'partial', 5)).toEqual({ current: 0, best: 2, reached: false })
  })

  it('treats a wrong answer as wrong', () => {
    const at2: StreakState = { current: 2, best: 2, reached: false }
    expect(advanceStreakForVerdict(at2, 'wrong', 5).current).toBe(0)
  })

  // A ข้อ nobody can judge yet must not cost the student a run they were never
  // told they were losing.
  it('leaves the count untouched when the verdict is pending', () => {
    const at2: StreakState = { current: 2, best: 2, reached: false }
    expect(advanceStreakForVerdict(at2, 'pending', 5)).toEqual(at2)
  })
})

describe('streakEnding', () => {
  const base = {
    target: 5,
    askedCount: 3,
    questionCap: null as number | null,
    anotherAvailable: true,
  }

  it('continues while there is nothing to stop it', () => {
    expect(streakEnding({ ...base, state: fresh })).toBeNull()
  })

  it('ends on reaching the target', () => {
    expect(streakEnding({ ...base, state: { current: 5, best: 5, reached: true } })).toBe('reached')
  })

  it('ends at the ceiling', () => {
    expect(streakEnding({ ...base, state: fresh, askedCount: 30, questionCap: 30 })).toBe('question_cap')
  })

  it('ends when nothing can be drawn', () => {
    expect(streakEnding({ ...base, state: fresh, anotherAvailable: false })).toBe('pool_exhausted')
  })

  // Passing on the very ข้อ that fills the ceiling is passing. Reporting
  // "ทำครบเพดานแล้วยังไม่ผ่าน" to a student who just passed would be a lie the
  // order of these checks is the only thing preventing.
  it('reports passing, not the ceiling, when both happen at once', () => {
    expect(streakEnding({
      ...base,
      state: { current: 5, best: 5, reached: true },
      askedCount: 30,
      questionCap: 30,
      anotherAvailable: false,
    })).toBe('reached')
  })
})

describe('pickNextStreakQuestion', () => {
  const pool = ['q1', 'q2', 'q3', 'q4']

  it('gives nothing when the pool is empty', () => {
    expect(pickNextStreakQuestion({ eligibleIds: [], askedIds: [], recyclePool: true })).toBeNull()
  })

  it('draws from the pool on the first ข้อ', () => {
    const picked = pickNextStreakQuestion({
      eligibleIds: pool, askedIds: [], recyclePool: true, random: seeded([0]),
    })
    expect(picked).toBe('q1')
  })

  // A drill that repeats ข้อ 3 while ข้อ 11 was never asked is a worse drill,
  // so unseen ข้อ are exhausted before anything comes back.
  it('prefers ข้อ the student has not seen', () => {
    const picked = pickNextStreakQuestion({
      eligibleIds: pool, askedIds: ['q1', 'q2'], recyclePool: true, random: seeded([0]),
    })
    expect(picked).toBe('q3')
  })

  it('covers the whole pool before repeating anything', () => {
    const seen: string[] = []
    for (let i = 0; i < pool.length; i++) {
      const next = pickNextStreakQuestion({
        eligibleIds: pool, askedIds: seen, recyclePool: true, random: seeded([0]),
      })
      seen.push(next as string)
    }
    expect([...seen].sort()).toEqual([...pool].sort())
  })

  it('stops once the pool is used up when recycling is off', () => {
    expect(pickNextStreakQuestion({
      eligibleIds: pool, askedIds: [...pool], recyclePool: false,
    })).toBeNull()
  })

  it('draws again once the pool is used up when recycling is on', () => {
    const picked = pickNextStreakQuestion({
      eligibleIds: pool, askedIds: [...pool], recyclePool: true, random: seeded([0]),
    })
    expect(pool).toContain(picked)
  })

  // The same ข้อ twice in a row reads as the page failing to advance — most of
  // all for a โจทย์สุ่มตัวเลข, which comes back with different numbers.
  it('never repeats the ข้อ just answered on a redraw', () => {
    for (const r of [0, 0.34, 0.67, 0.99]) {
      const picked = pickNextStreakQuestion({
        eligibleIds: pool, askedIds: ['q1', 'q2', 'q3', 'q4'], recyclePool: true, random: seeded([r]),
      })
      expect(picked).not.toBe('q4')
    }
  })

  // With one ข้อ there is no alternative, and refusing would end the attempt
  // instead of honoring the teacher's recycle setting.
  it('repeats the only ข้อ there is rather than ending the attempt', () => {
    expect(pickNextStreakQuestion({
      eligibleIds: ['q1'], askedIds: ['q1'], recyclePool: true, random: seeded([0]),
    })).toBe('q1')
  })

  it('never returns a ข้อ outside the eligible pool', () => {
    for (let i = 0; i < 50; i++) {
      const picked = pickNextStreakQuestion({
        eligibleIds: pool, askedIds: ['q2', 'q4', 'q1', 'q3', 'q2'], recyclePool: true,
      })
      expect(pool).toContain(picked)
    }
  })
})
