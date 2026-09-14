import { describe, expect, it } from 'vitest'
import {
  effectiveIocThreshold,
  formatIocIndex,
  formatIocPercent,
  IocInputError,
  iocIndex,
  iocPasses,
  summarizeIocForm,
  type IocRatingInput,
} from '@/lib/ioc'

const EXPERTS = ['expert-1', 'expert-2', 'expert-3']

/**
 * The worked example the approved mockups are drawn from: three experts,
 * eleven items, two of them below the 0.50 threshold. Keeping it here means the
 * screens, the exported document and the arithmetic can be checked against one
 * another rather than against three separate guesses.
 */
const WORKED_EXAMPLE: Record<string, [number, number, number]> = {
  'item-1': [1, 1, 1],
  'item-2': [1, 1, 1],
  'item-3': [1, 1, 0],
  'item-4': [1, 0, -1],
  'item-5': [1, 1, 1],
  'item-6': [1, 1, 0],
  'item-7': [1, 1, 1],
  'item-8': [1, 1, 1],
  'item-9': [1, 0, 0],
  'item-10': [1, 1, 0],
  'item-11': [1, 1, 1],
}

function workedExampleRatings(): IocRatingInput[] {
  return Object.entries(WORKED_EXAMPLE).flatMap(([itemId, scores]) =>
    scores.map((score, index) => ({ expertId: EXPERTS[index], itemId, score })),
  )
}

describe('iocIndex', () => {
  it('divides the sum of expert scores by the number of experts', () => {
    expect(iocIndex([1, 1, 1])).toBe(1)
    expect(iocIndex([1, 0, -1])).toBe(0)
    expect(iocIndex([-1, -1, -1])).toBe(-1)
    expect(iocIndex([1, 1, 0])).toBeCloseTo(2 / 3, 12)
  })

  it('returns null for an unjudged item instead of zero', () => {
    expect(iocIndex([])).toBeNull()
  })

  it('refuses a score the rating scale does not contain', () => {
    expect(() => iocIndex([1, 2])).toThrow(IocInputError)
    expect(() => iocIndex([0.5])).toThrow(IocInputError)
  })
})

describe('iocPasses', () => {
  it('reads a threshold typed at display precision as the value it prints', () => {
    // 2/3 prints as "0.67", so a teacher who types 0.67 must not fail it.
    expect(iocPasses(2 / 3, 0.67)).toBe(true)
    expect(iocPasses(2 / 3, 0.5)).toBe(true)
  })

  it('does not round a failing index up to the threshold', () => {
    expect(iocPasses(1 / 3, 0.5)).toBe(false)
    expect(iocPasses(0, 0.5)).toBe(false)
    expect(iocPasses(1 / 3, 0.67)).toBe(false)
  })

  it('leaves an unjudged item undecided', () => {
    expect(iocPasses(null, 0.5)).toBeNull()
  })
})

describe('effectiveIocThreshold', () => {
  it('reports what a threshold means once the panel size is known', () => {
    expect(effectiveIocThreshold(0.5, 3)).toBeCloseTo(2 / 3, 12)
    expect(effectiveIocThreshold(0.67, 3)).toBeCloseTo(2 / 3, 12)
    expect(effectiveIocThreshold(0.5, 4)).toBe(0.5)
    expect(effectiveIocThreshold(0.6, 5)).toBeCloseTo(0.6, 12)
  })

  it('returns null when no achievable index could clear it', () => {
    expect(effectiveIocThreshold(1.2, 3)).toBeNull()
    expect(effectiveIocThreshold(0.5, 0)).toBeNull()
    expect(effectiveIocThreshold(Number.NaN, 3)).toBeNull()
  })
})

describe('summarizeIocForm', () => {
  it('reproduces the worked example the mockups and the document share', () => {
    const summary = summarizeIocForm({
      itemIds: Object.keys(WORKED_EXAMPLE),
      submittedExpertIds: EXPERTS,
      ratings: workedExampleRatings(),
    })

    expect(summary.expertCount).toBe(3)
    expect(summary.itemCount).toBe(11)
    expect(summary.complete).toBe(true)
    expect(summary.warnings).toEqual([])

    expect(summary.failedItemIds).toEqual(['item-4', 'item-9'])
    expect(summary.passedItemIds).toHaveLength(9)
    expect(summary.percent).toBeCloseTo(81.8181, 3)
    expect(formatIocPercent(summary.percent)).toBe('81.82')

    const item4 = summary.items.find(item => item.itemId === 'item-4')
    expect(item4).toMatchObject({ agree: 1, unsure: 1, disagree: 1, ratedBy: 3, passed: false })
    expect(formatIocIndex(item4?.index ?? null)).toBe('0.00')

    const item9 = summary.items.find(item => item.itemId === 'item-9')
    expect(item9).toMatchObject({ agree: 1, unsure: 2, disagree: 0, ratedBy: 3, passed: false })
    expect(formatIocIndex(item9?.index ?? null)).toBe('0.33')

    const item3 = summary.items.find(item => item.itemId === 'item-3')
    expect(formatIocIndex(item3?.index ?? null)).toBe('0.67')
    expect(item3?.passed).toBe(true)
  })

  it('offers the mean-index rule as a different number on the same data', () => {
    const summary = summarizeIocForm({
      itemIds: Object.keys(WORKED_EXAMPLE),
      submittedExpertIds: EXPERTS,
      ratings: workedExampleRatings(),
      percentRule: 'mean_index',
    })

    expect(summary.percentRule).toBe('mean_index')
    expect(summary.percent).toBeCloseTo(75.7575, 3)
    expect(formatIocPercent(summary.percent)).toBe('75.76')
  })

  it('keeps the three counts adding up to the number who rated the item', () => {
    const summary = summarizeIocForm({
      itemIds: ['item-1'],
      submittedExpertIds: EXPERTS,
      ratings: [
        { expertId: 'expert-1', itemId: 'item-1', score: 1 },
        { expertId: 'expert-2', itemId: 'item-1', score: 0 },
        { expertId: 'expert-3', itemId: 'item-1', score: -1 },
      ],
    })

    const [item] = summary.items
    expect(item.agree + item.unsure + item.disagree).toBe(item.ratedBy)
    expect(item.ratedBy).toBe(3)
  })

  it('ignores ratings from experts who have not submitted yet', () => {
    const summary = summarizeIocForm({
      itemIds: ['item-1'],
      submittedExpertIds: ['expert-1'],
      ratings: [
        { expertId: 'expert-1', itemId: 'item-1', score: 1 },
        // Still a draft: it must not move the index or the count.
        { expertId: 'expert-2', itemId: 'item-1', score: -1 },
      ],
    })

    expect(summary.items[0]).toMatchObject({ ratedBy: 1, index: 1, agree: 1, disagree: 0 })
    expect(summary.expertCount).toBe(1)
  })

  it('ignores a rating left behind by an item that is no longer in the form', () => {
    const summary = summarizeIocForm({
      itemIds: ['item-1'],
      submittedExpertIds: ['expert-1'],
      ratings: [
        { expertId: 'expert-1', itemId: 'item-1', score: 1 },
        { expertId: 'expert-1', itemId: 'removed-item', score: -1 },
      ],
    })

    expect(summary.itemCount).toBe(1)
    expect(summary.items[0].ratedBy).toBe(1)
  })

  it('counts an unjudged item in the denominator without calling it passed', () => {
    const summary = summarizeIocForm({
      itemIds: ['item-1', 'item-2'],
      submittedExpertIds: EXPERTS,
      ratings: EXPERTS.map(expertId => ({ expertId, itemId: 'item-1', score: 1 })),
    })

    expect(summary.unratedItemIds).toEqual(['item-2'])
    expect(summary.items[1]).toMatchObject({ index: null, passed: null, ratedBy: 0 })
    expect(summary.passedItemIds).toEqual(['item-1'])
    expect(summary.percent).toBe(50)
    expect(summary.complete).toBe(false)
    expect(summary.warnings).toContainEqual({ kind: 'partial_items', itemIds: ['item-2'] })
  })

  it('averages only the items that were judged for the mean-index rule', () => {
    const summary = summarizeIocForm({
      itemIds: ['item-1', 'item-2'],
      submittedExpertIds: EXPERTS,
      ratings: EXPERTS.map(expertId => ({ expertId, itemId: 'item-1', score: 1 })),
      percentRule: 'mean_index',
    })

    expect(summary.ratedItemCount).toBe(1)
    expect(summary.meanIndex).toBe(1)
    expect(summary.percent).toBe(100)
  })

  it('flags an item that only some of the panel scored, with its own N', () => {
    const summary = summarizeIocForm({
      itemIds: ['item-1'],
      submittedExpertIds: EXPERTS,
      ratings: [
        { expertId: 'expert-1', itemId: 'item-1', score: 1 },
        { expertId: 'expert-2', itemId: 'item-1', score: 1 },
      ],
    })

    expect(summary.items[0].ratedBy).toBe(2)
    expect(summary.items[0].index).toBe(1)
    expect(summary.complete).toBe(false)
    expect(summary.warnings).toContainEqual({ kind: 'partial_items', itemIds: ['item-1'] })
  })

  it('warns about a panel that is too small or an even one', () => {
    const two = summarizeIocForm({
      itemIds: ['item-1'],
      submittedExpertIds: ['expert-1', 'expert-2'],
      ratings: [
        { expertId: 'expert-1', itemId: 'item-1', score: 1 },
        { expertId: 'expert-2', itemId: 'item-1', score: 1 },
      ],
    })

    expect(two.warnings).toContainEqual({ kind: 'few_experts', expertCount: 2 })
    expect(two.warnings).toContainEqual({ kind: 'even_expert_count', expertCount: 2 })

    const four = summarizeIocForm({
      itemIds: ['item-1'],
      submittedExpertIds: [...EXPERTS, 'expert-4'],
      ratings: [...EXPERTS, 'expert-4'].map(expertId => ({ expertId, itemId: 'item-1', score: 1 as const })),
    })

    expect(four.warnings).toContainEqual({ kind: 'even_expert_count', expertCount: 4 })
    expect(four.warnings.some(warning => warning.kind === 'few_experts')).toBe(false)
  })

  it('reports nothing to read before anyone submits', () => {
    const summary = summarizeIocForm({
      itemIds: ['item-1', 'item-2'],
      submittedExpertIds: [],
      ratings: [{ expertId: 'expert-1', itemId: 'item-1', score: 1 }],
    })

    expect(summary.expertCount).toBe(0)
    // Not 0.00%, which would read as a damning result rather than an empty one.
    expect(summary.percent).toBeNull()
    expect(formatIocPercent(summary.percent)).toBe('—')
    expect(summary.meanIndex).toBeNull()
    expect(summary.complete).toBe(false)
    expect(summary.warnings).toContainEqual({ kind: 'no_ratings' })
  })

  it('refuses two ratings from one expert on one item', () => {
    expect(() =>
      summarizeIocForm({
        itemIds: ['item-1'],
        submittedExpertIds: ['expert-1'],
        ratings: [
          { expertId: 'expert-1', itemId: 'item-1', score: 1 },
          { expertId: 'expert-1', itemId: 'item-1', score: -1 },
        ],
      }),
    ).toThrow(IocInputError)
  })

  it('refuses a threshold outside the range an index can reach', () => {
    expect(() =>
      summarizeIocForm({ itemIds: ['item-1'], submittedExpertIds: [], ratings: [], threshold: 1.5 }),
    ).toThrow(IocInputError)
  })
})

describe('formatting', () => {
  it('prints two decimals and an em dash for nothing', () => {
    expect(formatIocIndex(1)).toBe('1.00')
    expect(formatIocIndex(2 / 3)).toBe('0.67')
    expect(formatIocIndex(-1)).toBe('-1.00')
    expect(formatIocIndex(null)).toBe('—')
    expect(formatIocPercent(81.81818)).toBe('81.82')
    expect(formatIocPercent(null)).toBe('—')
  })

  it('never prints a negative zero', () => {
    expect(formatIocIndex(-0)).toBe('0.00')
  })
})
