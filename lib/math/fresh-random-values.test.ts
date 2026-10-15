import { describe, expect, it, vi } from 'vitest'
import { drawFreshValues, parseRandomValues, sameRandomValues } from './fresh-random-values'

describe('fresh random values', () => {
  it('compares variable values independently of object key order', () => {
    expect(sameRandomValues({ x: 1, y: 2 }, { y: 2, x: 1 })).toBe(true)
    expect(sameRandomValues({ x: 1 }, { x: 2 })).toBe(false)
  })
  it('rejects repeated draws and returns a distinct draw', () => {
    const draw = vi.fn().mockReturnValueOnce({ x: 2 }).mockReturnValueOnce({ x: 2 }).mockReturnValue({ x: 3 })
    expect(drawFreshValues(draw, value => value, { x: 2 })).toEqual({ x: 3 })
    expect(draw).toHaveBeenCalledTimes(3)
  })
  it('bounds impossible authored ranges rather than pretending the numbers changed', () => {
    const draw = vi.fn(() => ({ x: 2 }))
    expect(drawFreshValues(draw, value => value, { x: 2 })).toBeNull()
    expect(draw).toHaveBeenCalledTimes(128)
  })
  it('accepts only bounded finite numeric maps', () => {
    expect(parseRandomValues({ x: 2 })).toEqual({ x: 2 })
    for (const value of [[], { x: NaN }, { x: '2' }, JSON.parse('{"__proto__":3}')]) expect(parseRandomValues(value)).toBeNull()
  })
})
