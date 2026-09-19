/**
 * The right-hand column of a จับคู่ โจทย์: one entry per pair, then the
 * distractors that belong to no pair.
 *
 * A matching question stores its pairs in `mcq_options` and its distractors in
 * `extra_data`, which means the list a student actually picks from exists in
 * neither place — it is the two put together. Four screens need that list (the
 * exam, the preview of an assignment, the teacher's own preview, and the
 * shuffle frozen into an attempt) and they must agree about it exactly:
 * `option_order` is a permutation of *these* positions, stored per attempt, so
 * a screen that builds the list differently reads a student's answer against
 * the wrong chips.
 *
 * Order matters and cannot change: pairs first, in authored order, then
 * distractors. Positions below `pairs.length` therefore mean the same thing
 * they did before distractors existed, so every attempt already in the
 * database still resolves correctly.
 */
import type { MatchingConfig, MatchingDistractor, MatchingPair } from '@/lib/types'

export interface MatchingChoice {
  right_text: string
  right_image?: string
}

function asDistractors(config: MatchingConfig | null | undefined): MatchingDistractor[] {
  const list = config?.distractors
  return Array.isArray(list) ? list : []
}

/** Every choice a student may pick, in the order positions are numbered. */
export function matchingChoices(
  pairs: MatchingPair[],
  config: MatchingConfig | null | undefined,
): MatchingChoice[] {
  return [
    ...pairs.map(pair => ({
      right_text: pair.right_text,
      ...(pair.right_image ? { right_image: pair.right_image } : {}),
    })),
    ...asDistractors(config).map(distractor => ({
      right_text: distractor.text,
      ...(distractor.image ? { right_image: distractor.image } : {}),
    })),
  ]
}

/** How many choices there are to shuffle — pairs plus distractors. */
export function matchingChoiceCount(
  pairs: MatchingPair[],
  config: MatchingConfig | null | undefined,
): number {
  return pairs.length + asDistractors(config).length
}
