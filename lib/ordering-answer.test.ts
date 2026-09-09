import { describe, it, expect } from 'vitest'
import { orderingDisplayOrder, orderingIsAnswered } from './ordering-answer'
import type { OrderingItem } from './types'

// Ordering became a drag list, but the stored answer did not change: item ids
// in the student's order, which 'ORDER:' in lib/assignment-attempt.ts grades
// position by position. Reading a saved answer back wrongly would show the
// student a different order from the one they gave — and mark that one.

const items = (...ids: string[]): OrderingItem[] => ids.map(id => ({ id, text: id }))
const SHUFFLED = items('c', 'a', 'b')

describe('orderingDisplayOrder', () => {
  it('shows the saved order', () => {
    expect(orderingDisplayOrder('["a","b","c"]', SHUFFLED).map(i => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('falls back to the shuffled order when nothing is saved', () => {
    expect(orderingDisplayOrder('', SHUFFLED).map(i => i.id)).toEqual(['c', 'a', 'b'])
    expect(orderingDisplayOrder('[]', SHUFFLED).map(i => i.id)).toEqual(['c', 'a', 'b'])
  })

  // The dropdown version saved this while an answer was incomplete. It says
  // nothing usable about order, so the student starts from the shuffle again.
  it('ignores the old half-finished object form', () => {
    expect(orderingDisplayOrder('{"a":"1"}', SHUFFLED).map(i => i.id)).toEqual(['c', 'a', 'b'])
  })

  // A question edited after the attempt began must not lose or duplicate a row:
  // every item shows exactly once, whatever the saved answer says.
  it('drops ids that no longer exist and appends items the answer never mentioned', () => {
    expect(orderingDisplayOrder('["b","gone"]', SHUFFLED).map(i => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('ignores a repeated id rather than showing the item twice', () => {
    expect(orderingDisplayOrder('["a","a"]', SHUFFLED).map(i => i.id)).toEqual(['a', 'c', 'b'])
  })

  it('survives malformed json', () => {
    expect(orderingDisplayOrder('[not json', SHUFFLED).map(i => i.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('orderingIsAnswered', () => {
  // The list always shows an order, so this is the only thing standing between
  // "the student placed these" and "the student never touched the question".
  it('counts a complete permutation as answered', () => {
    expect(orderingIsAnswered('["a","b","c"]', 3)).toBe(true)
  })

  it('does not count an untouched question', () => {
    expect(orderingIsAnswered('', 3)).toBe(false)
    expect(orderingIsAnswered('[]', 3)).toBe(false)
  })

  it('does not count a partial or duplicated order', () => {
    expect(orderingIsAnswered('["a","b"]', 3)).toBe(false)
    expect(orderingIsAnswered('["a","a","b"]', 3)).toBe(false)
  })

  it('does not count the old object draft as an answer', () => {
    expect(orderingIsAnswered('{"a":"1","b":"2","c":"3"}', 3)).toBe(false)
  })
})
