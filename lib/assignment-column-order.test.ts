import { describe, expect, it } from 'vitest'
import { moveVisibleAssignmentColumn, reconcileAssignmentOrder } from './assignment-column-order'

describe('reconcileAssignmentOrder', () => {
  it('keeps the arranged order, removes stale ids, and appends new work', () => {
    expect(reconcileAssignmentOrder(['b', 'stale', 'a'], ['a', 'b', 'c'])).toEqual(['b', 'a', 'c'])
  })

  it('removes duplicate ids', () => {
    expect(reconcileAssignmentOrder(['b', 'b', 'a'], ['a', 'b'])).toEqual(['b', 'a'])
  })
})

describe('moveVisibleAssignmentColumn', () => {
  it('moves a visible column and preserves filtered-out column slots', () => {
    expect(moveVisibleAssignmentColumn(
      ['a', 'hidden-1', 'b', 'hidden-2', 'c'],
      ['a', 'b', 'c'],
      'c',
      'a',
    )).toEqual(['c', 'hidden-1', 'a', 'hidden-2', 'b'])
  })

  it('returns the current order when the drop target is not visible', () => {
    const current = ['a', 'b', 'c']
    expect(moveVisibleAssignmentColumn(current, ['a', 'c'], 'a', 'b')).toBe(current)
  })
})

