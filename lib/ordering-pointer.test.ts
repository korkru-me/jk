import { describe, expect, it } from 'vitest'
import { shouldDelayOrderingDrag, startOrderingHandleDrag } from './ordering-pointer'

describe('shouldDelayOrderingDrag', () => {
  it('delays a bare finger drag so the page can still scroll', () => {
    expect(shouldDelayOrderingDrag('touch', false)).toBe(true)
  })

  it('starts touch immediately from the dedicated drag handle', () => {
    expect(shouldDelayOrderingDrag('touch', true)).toBe(false)
  })

  it('starts a mouse or trackpad without a long press', () => {
    expect(shouldDelayOrderingDrag('mouse', false)).toBe(false)
  })

  it.each(['pen', ''])('delays %s off the handle so direct scrolling remains possible', pointerType => {
    expect(shouldDelayOrderingDrag(pointerType, false)).toBe(true)
  })

  it.each(['pen', ''])('starts %s immediately from the dedicated handle', pointerType => {
    expect(shouldDelayOrderingDrag(pointerType, true)).toBe(false)
  })

  it('stops a handle press before starting so the row cannot replace it', () => {
    const calls: string[] = []

    startOrderingHandleDrag(
      { stopPropagation: () => calls.push('stop') },
      () => calls.push('start'),
    )

    expect(calls).toEqual(['stop', 'start'])
  })
})
