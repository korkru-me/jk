import type { ChoiceScoring } from './types'

/**
 * Scoring a list of boxes the student ticks — a ถูก-ผิดแบบชุด part's choices, or
 * a select_matching ถูก-ผิด's statements. Both store the ticks the same way (a
 * JSON array where 'true' means ticked) and are keyed the same way (one
 * 'true'/'false' per entry, already flipped for select_target at build time),
 * so both score through here.
 *
 * A box left alone is an answer, not a missing one: the exam page writes only
 * the indices the student actually clicked, so anything untouched arrives as
 * null and has to be read as 'false'. Comparing that raw null against the key
 * instead capped a list at the share of its entries that wanted ticking — a
 * 7-choice question with 4 correct answers could score at most 4/7 however well
 * it was answered.
 *
 * An empty list still earns nothing. That is a question never opened, and
 * paying it for every 'false' entry would put points on a blank submission.
 */
export interface ChoiceTickScore {
  /** How many entries the student judged right, ticked or deliberately left alone. */
  matched: number
  /** Whether every entry was judged right. */
  perfect: boolean
  /** The fraction of the list's points earned, under `scoring`. */
  share: number
}

export function scoreChoiceTicks(
  rawTicks: string | unknown[] | null | undefined,
  targets: string[],
  scoring?: ChoiceScoring | null,
): ChoiceTickScore {
  let ticks: unknown[] = []
  if (Array.isArray(rawTicks)) {
    ticks = rawTicks
  } else {
    try {
      const parsed = JSON.parse(rawTicks || '[]')
      if (Array.isArray(parsed)) ticks = parsed
    } catch { /* an unreadable answer is no answer */ }
  }

  const answered = ticks.length > 0
  let matched = 0
  if (answered) {
    for (let i = 0; i < targets.length; i++) {
      const ticked = String(ticks[i] ?? '').trim() === 'true'
      if ((ticked ? 'true' : 'false') === targets[i]) matched++
    }
  }

  const perfect = targets.length > 0 && matched === targets.length
  if (targets.length === 0) return { matched, perfect: false, share: 0 }
  if (scoring === 'all_or_nothing') return { matched, perfect, share: perfect ? 1 : 0 }
  return { matched, perfect, share: matched / targets.length }
}
