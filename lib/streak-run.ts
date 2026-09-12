/**
 * Running a "ถูกติดต่อกัน" attempt: what the count becomes after a ข้อ is
 * judged, whether the attempt is over, and which ข้อ to hand out next.
 *
 * Pure so the rules can be tested without a database. The server action in
 * lib/actions/submissions.ts owns the writes and every authorization check;
 * this module owns the arithmetic and the choice, which is the part that is
 * easy to get subtly wrong and impossible to notice from the outside.
 *
 * Nothing here ever reads a verdict from the client. `advanceStreak` is called
 * with the result of gradeAnswer() on the server, because a count the browser
 * could influence is a count a student can finish the งาน with.
 */

export interface StreakState {
  current: number
  best: number
  reached: boolean
}

/**
 * The count after one ข้อ is judged.
 *
 * A wrong answer restarts at 0 rather than stepping back by one — the product
 * owner's decision, and the only reading of "ติดต่อกัน" a teacher can explain
 * to a class in one sentence.
 *
 * `reached` is sticky. A student who passes and then keeps practising (the
 * ฝึกต่ออีก button) can answer wrongly afterwards without losing what they
 * already earned.
 */
export function advanceStreak(state: StreakState, correct: boolean, target: number): StreakState {
  const current = correct ? state.current + 1 : 0
  return {
    current,
    best: Math.max(state.best, current),
    reached: state.reached || current >= target,
  }
}

/**
 * A ข้อ whose verdict auto-grading cannot decide (an unscored ช่องกรอกที่ครู
 * ตรวจเอง inside an otherwise gradable ข้อ) must not silently count as wrong:
 * the student would lose a run to something they were never told about. Such a
 * ข้อ leaves the count untouched, and the draw moves on.
 */
export function advanceStreakForVerdict(
  state: StreakState,
  verdict: 'correct' | 'partial' | 'wrong' | 'pending',
  target: number,
): StreakState {
  if (verdict === 'pending') return state
  // Partial credit is not a step forward. "ถูก" means full marks on that ข้อ,
  // otherwise the run stops meaning what it says — and a ข้อ with four ช่อง
  // would advance it on one correct blank.
  return advanceStreak(state, verdict === 'correct', target)
}

export type StreakEnding = 'reached' | 'question_cap' | 'pool_exhausted' | null

export interface StreakProgress {
  state: StreakState
  target: number
  /** How many ข้อ this attempt has been handed so far. */
  askedCount: number
  /** NULL = no ceiling. */
  questionCap: number | null
  /** Whether another ข้อ could be drawn at all (see pickNextStreakQuestion). */
  anotherAvailable: boolean
}

/**
 * Why the attempt is over, or null while it should continue.
 *
 * Order matters: a student who reaches the target on the very ข้อ that hits
 * the ceiling has passed, and must not be told they ran out.
 */
export function streakEnding(progress: StreakProgress): StreakEnding {
  if (progress.state.reached) return 'reached'
  if (progress.questionCap != null && progress.askedCount >= progress.questionCap) return 'question_cap'
  if (!progress.anotherAvailable) return 'pool_exhausted'
  return null
}

export interface PickNextInput {
  /** Pool ∩ streak-eligible, in the teacher's authored order. */
  eligibleIds: string[]
  /** Every ข้อ already handed out in this attempt, in the order it was asked. */
  askedIds: string[]
  recyclePool: boolean
  /** Injected so the choice is deterministic under test. */
  random?: () => number
}

/**
 * Which ข้อ to hand out next, or null when there is nothing left to give.
 *
 * Unseen ข้อ come first, so a student meets the whole pool before meeting
 * anything twice — a drill that repeats ข้อ 3 while ข้อ 11 has never been asked
 * is a worse drill, whatever the teacher set the pool size to.
 *
 * Once the pool is used up, `recyclePool` decides between drawing again and
 * ending the attempt. A redraw never repeats the ข้อ just answered: seeing the
 * same ข้อ twice in a row reads as the page failing to advance, and for a
 * โจทย์สุ่มตัวเลข (which comes back with new values) it is also the case where
 * the student is most likely to think it did.
 */
export function pickNextStreakQuestion(input: PickNextInput): string | null {
  const rand = input.random ?? Math.random
  if (input.eligibleIds.length === 0) return null

  const asked = new Set(input.askedIds)
  const unseen = input.eligibleIds.filter(id => !asked.has(id))
  if (unseen.length > 0) return unseen[Math.floor(rand() * unseen.length)] ?? unseen[0]

  if (!input.recyclePool) return null

  const previous = input.askedIds[input.askedIds.length - 1]
  // With a single eligible ข้อ there is no alternative to repeating it, and
  // refusing would end the attempt rather than honor the recycle setting.
  const candidates = input.eligibleIds.length > 1
    ? input.eligibleIds.filter(id => id !== previous)
    : input.eligibleIds
  return candidates[Math.floor(rand() * candidates.length)] ?? candidates[0]
}
