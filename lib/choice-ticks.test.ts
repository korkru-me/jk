import { describe, it, expect } from 'vitest'
import { scoreChoiceTicks } from './choice-ticks'

/** The beaker question: 7 choices, of which 1, 3, 5 and 6 are the answer. */
const TARGETS = ['true', 'false', 'true', 'false', 'true', 'true', 'false']

/** Ticks as the exam page writes them: only the clicked indices exist. */
function ticks(...clicked: number[]): string {
  const arr: (string | null)[] = []
  for (const i of clicked) {
    while (arr.length < i) arr.push(null)
    arr[i] = 'true'
  }
  return JSON.stringify(arr)
}

describe('scoreChoiceTicks', () => {
  it('pays a spotless list in full, however sparsely it was written', () => {
    expect(scoreChoiceTicks(ticks(0, 2, 4, 5), TARGETS))
      .toEqual({ matched: 7, perfect: true, share: 1 })
  })

  it('reads a list written out in full the same way', () => {
    expect(scoreChoiceTicks(JSON.stringify(TARGETS), TARGETS))
      .toEqual({ matched: 7, perfect: true, share: 1 })
  })

  it('counts a box wrongly ticked and a box wrongly left alone alike', () => {
    expect(scoreChoiceTicks(ticks(0, 1, 2, 4, 5), TARGETS).matched).toBe(6)   // ticked one too many
    expect(scoreChoiceTicks(ticks(0, 2, 4), TARGETS).matched).toBe(6)         // ticked one too few
  })

  it('pays nothing for a question never opened', () => {
    for (const raw of [null, undefined, '', '[]', 'not json', '{"answers":[]}']) {
      expect(scoreChoiceTicks(raw, TARGETS)).toMatchObject({ matched: 0, share: 0 })
    }
  })

  describe('all_or_nothing', () => {
    it('pays a spotless list in full', () => {
      expect(scoreChoiceTicks(ticks(0, 2, 4, 5), TARGETS, 'all_or_nothing').share).toBe(1)
    })

    it('pays nothing for one box out of place', () => {
      expect(scoreChoiceTicks(ticks(0, 2, 4), TARGETS, 'all_or_nothing'))
        .toMatchObject({ matched: 6, perfect: false, share: 0 })
    })

    // What the default costs, and why a teacher might turn it off: a single
    // tick opens credit for every box correctly left alone.
    it('is what stops one lucky tick from paying', () => {
      expect(scoreChoiceTicks(ticks(0), TARGETS).share).toBe(4 / 7)
      expect(scoreChoiceTicks(ticks(0), TARGETS, 'all_or_nothing').share).toBe(0)
    })
  })

  it('treats an unkeyed list as worth nothing rather than as perfect', () => {
    expect(scoreChoiceTicks(ticks(0), [])).toEqual({ matched: 0, perfect: false, share: 0 })
    expect(scoreChoiceTicks(ticks(0), [], 'all_or_nothing')).toEqual({ matched: 0, perfect: false, share: 0 })
  })
})
