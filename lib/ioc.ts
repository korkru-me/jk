/**
 * IOC — Index of Item-Objective Congruence.
 *
 * An expert scores one exam item +1 / 0 / −1 against the indicator it is meant
 * to measure, and the item's index is the mean of the scores it was given.
 * Every IOC number a teacher sees — per-item index, the counts behind it, the
 * percentage, the warnings — is computed here and nowhere else, so the figure
 * on screen and the figure printed in the signed document cannot drift apart.
 *
 * The rules, their sources, and the cases that must never be computed silently
 * are written down in `docs/EDUCATION_RESEARCH_IOC.md`.
 */

export type IocScore = -1 | 0 | 1

/** How a form turns per-item results into one headline percentage. */
export type IocPercentRule = 'items_passing' | 'mean_index'

export const IOC_DEFAULT_THRESHOLD = 0.5
export const IOC_DEFAULT_PERCENT_RULE: IocPercentRule = 'items_passing'

/** Fewer judges than this is reported but flagged: one opinion is not a panel. */
export const IOC_MIN_RECOMMENDED_EXPERTS = 3

/**
 * Half of the last digit a teacher can type, because a threshold is entered at
 * the same two decimals an index is displayed with.
 *
 * Three experts can only produce 1, 2/3, 1/3, 0 and their negatives, and the
 * second of those prints as "0.67". A teacher who then sets the threshold to
 * 0.67 means that value — but 2/3 = 0.6666... is smaller than 0.67, so a bare
 * `>=` would fail every item the panel had actually agreed on. Widening the
 * comparison by half a display step keeps a typed number meaning what it looks
 * like. The index itself is never rounded before the comparison: 0.33 still
 * fails a 0.50 threshold by a mile, which is the mistake this guards against
 * in the other direction.
 */
export const IOC_COMPARISON_TOLERANCE = 0.005

/**
 * Raised for data that the database's own constraints already rule out — a
 * score outside −1...1, or two ratings from one expert on one item. Reaching
 * this means a write path skipped the schema, so it is louder than a warning
 * on purpose.
 */
export class IocInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IocInputError'
  }
}

export interface IocRatingInput {
  expertId: string
  itemId: string
  score: number
}

export interface IocSummaryInput {
  /** Items in the order they are printed. Defines the denominator. */
  itemIds: readonly string[]
  /** Only experts who have submitted; a draft in progress must not move a number. */
  submittedExpertIds: readonly string[]
  ratings: readonly IocRatingInput[]
  threshold?: number
  percentRule?: IocPercentRule
}

export interface IocItemSummary {
  itemId: string
  /** Experts who scored +1, 0 and −1. The three always add up to `ratedBy`. */
  agree: number
  unsure: number
  disagree: number
  /** How many submitted experts scored this item — not how many were invited. */
  ratedBy: number
  /** null when nobody scored the item: an absent judgement is not a zero. */
  index: number | null
  passed: boolean | null
}

export type IocWarning =
  /** Nothing has been submitted yet, so there is no result to read. */
  | { kind: 'no_ratings' }
  /** Fewer judges than research practice expects. */
  | { kind: 'few_experts'; expertCount: number }
  /** An even panel can split evenly and land exactly on the threshold. */
  | { kind: 'even_expert_count'; expertCount: number }
  /** Items that not every submitted expert scored, so their N differs. */
  | { kind: 'partial_items'; itemIds: string[] }

export interface IocSummary {
  threshold: number
  percentRule: IocPercentRule
  /** Submitted experts. The result stays provisional until every invited one is here. */
  expertCount: number
  itemCount: number
  items: IocItemSummary[]
  ratedItemCount: number
  passedItemIds: string[]
  failedItemIds: string[]
  unratedItemIds: string[]
  meanIndex: number | null
  percent: number | null
  /** Every item scored by every submitted expert, and at least one expert. */
  complete: boolean
  warnings: IocWarning[]
}

export function isIocScore(value: unknown): value is IocScore {
  return value === -1 || value === 0 || value === 1
}

/** ΣR ÷ N. null for an empty panel, because dividing by nobody is not zero. */
export function iocIndex(scores: readonly number[]): number | null {
  if (scores.length === 0) return null
  let sum = 0
  for (const score of scores) {
    if (!isIocScore(score)) {
      throw new IocInputError(`IOC score must be -1, 0 or 1, received ${String(score)}`)
    }
    sum += score
  }
  return sum / scores.length
}

export function iocPasses(index: number | null, threshold: number): boolean | null {
  if (index === null) return null
  return index >= threshold - IOC_COMPARISON_TOLERANCE
}

/**
 * The smallest index `expertCount` judges can actually produce that still
 * clears `threshold` — what the teacher's number means once the panel size is
 * known. With three experts both 0.50 and 0.67 come back as 2/3, which is why
 * the two thresholds behave identically there.
 *
 * null when the panel is unusable or the threshold is out of reach.
 */
export function effectiveIocThreshold(threshold: number, expertCount: number): number | null {
  if (!Number.isFinite(threshold)) return null
  if (!Number.isInteger(expertCount) || expertCount <= 0) return null
  const steps = Math.ceil((threshold - IOC_COMPARISON_TOLERANCE) * expertCount)
  if (steps > expertCount) return null
  return Math.max(steps, -expertCount) / expertCount
}

function assertUsableThreshold(threshold: number): void {
  if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) {
    throw new IocInputError(`IOC threshold must be between -1 and 1, received ${String(threshold)}`)
  }
}

export function summarizeIocForm(input: IocSummaryInput): IocSummary {
  const threshold = input.threshold ?? IOC_DEFAULT_THRESHOLD
  assertUsableThreshold(threshold)
  const percentRule = input.percentRule ?? IOC_DEFAULT_PERCENT_RULE

  const submitted = new Set(input.submittedExpertIds)
  const known = new Set(input.itemIds)
  const scoresByItem = new Map<string, IocScore[]>()
  const seen = new Set<string>()

  for (const rating of input.ratings) {
    // A rating still sitting in someone's draft, or left behind by an item the
    // teacher removed, must not reach the arithmetic.
    if (!submitted.has(rating.expertId) || !known.has(rating.itemId)) continue

    const pairKey = `${rating.expertId} ${rating.itemId}`
    if (seen.has(pairKey)) {
      throw new IocInputError(
        `expert ${rating.expertId} rated item ${rating.itemId} more than once`,
      )
    }
    seen.add(pairKey)

    if (!isIocScore(rating.score)) {
      throw new IocInputError(`IOC score must be -1, 0 or 1, received ${String(rating.score)}`)
    }

    const bucket = scoresByItem.get(rating.itemId)
    if (bucket) bucket.push(rating.score)
    else scoresByItem.set(rating.itemId, [rating.score])
  }

  const expertCount = submitted.size
  const items: IocItemSummary[] = input.itemIds.map(itemId => {
    const scores = scoresByItem.get(itemId) ?? []
    const index = iocIndex(scores)
    return {
      itemId,
      agree: scores.filter(score => score === 1).length,
      unsure: scores.filter(score => score === 0).length,
      disagree: scores.filter(score => score === -1).length,
      ratedBy: scores.length,
      index,
      passed: iocPasses(index, threshold),
    }
  })

  const passedItemIds = items.filter(item => item.passed === true).map(item => item.itemId)
  const failedItemIds = items.filter(item => item.passed === false).map(item => item.itemId)
  const unratedItemIds = items.filter(item => item.index === null).map(item => item.itemId)
  const ratedItems = items.filter(item => item.index !== null)
  const meanIndex = ratedItems.length === 0
    ? null
    : ratedItems.reduce((sum, item) => sum + (item.index ?? 0), 0) / ratedItems.length

  // The denominator is every item in the form, not only the scored ones: an
  // item nobody judged has not passed, and dropping it would inflate the
  // figure a committee reads as coverage of the whole test.
  //
  // But a form nobody has judged yet has no percentage at all. Reporting 0.00%
  // there would read as a damning result rather than as an empty one.
  const hasResult = items.length > 0 && ratedItems.length > 0
  const percent = !hasResult
    ? null
    : percentRule === 'items_passing'
      ? (passedItemIds.length / items.length) * 100
      : (meanIndex === null ? null : meanIndex * 100)

  const partialItemIds = expertCount === 0
    ? []
    : items.filter(item => item.ratedBy < expertCount).map(item => item.itemId)

  const warnings: IocWarning[] = []
  if (expertCount === 0 || ratedItems.length === 0) warnings.push({ kind: 'no_ratings' })
  if (expertCount > 0 && expertCount < IOC_MIN_RECOMMENDED_EXPERTS) {
    warnings.push({ kind: 'few_experts', expertCount })
  }
  if (expertCount >= 2 && expertCount % 2 === 0) {
    warnings.push({ kind: 'even_expert_count', expertCount })
  }
  if (partialItemIds.length > 0) warnings.push({ kind: 'partial_items', itemIds: partialItemIds })

  return {
    threshold,
    percentRule,
    expertCount,
    itemCount: items.length,
    items,
    ratedItemCount: ratedItems.length,
    passedItemIds,
    failedItemIds,
    unratedItemIds,
    meanIndex,
    percent,
    complete: expertCount > 0 && items.length > 0 && partialItemIds.length === 0,
    warnings,
  }
}

/** Two decimals, as the source document prints them. Em dash when unjudged. */
export function formatIocIndex(value: number | null): string {
  if (value === null) return '—'
  return (value === 0 ? 0 : value).toFixed(2)
}

/** The headline percentage, without the % sign. Em dash when there is no result. */
export function formatIocPercent(value: number | null): string {
  if (value === null) return '—'
  return (value === 0 ? 0 : value).toFixed(2)
}
