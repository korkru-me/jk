import { describe, expect, it } from 'vitest'
import { avatarCrop, moveAvatarCrop } from './avatar-crop'

describe('avatar crop', () => {
  it('covers a square frame with either a portrait or landscape source', () => {
    expect(avatarCrop(1200, 600, 1, { x: .5, y: .5 })).toMatchObject({ x: 300, y: 0, side: 600 })
    expect(avatarCrop(600, 1200, 1, { x: .5, y: .5 })).toMatchObject({ x: 0, y: 300, side: 600 })
  })
  it('can choose either edge without exposing space outside the image', () => {
    expect(avatarCrop(1200, 600, 1, { x: -10, y: -10 })).toMatchObject({ x: 0, y: 0 })
    expect(avatarCrop(1200, 600, 1, { x: 10, y: 10 })).toMatchObject({ x: 600, y: 0 })
    expect(avatarCrop(600, 1200, 2, { x: 10, y: 10 })).toMatchObject({ x: 300, y: 900, side: 300 })
  })
  it('moves in the pointer direction and rescales movement with frame size', () => {
    const a = moveAvatarCrop(1200, 600, 1, { x: .5, y: .5 }, 300, 75, 0)
    const b = moveAvatarCrop(1200, 600, 1, { x: .5, y: .5 }, 150, 37.5, 0)
    expect(a).toEqual(b)
    expect(avatarCrop(1200, 600, 1, a).x).toBe(150)
  })
  it('allows vertical movement after zooming and clamps large drags', () => {
    const position = moveAvatarCrop(600, 600, 2, { x: .5, y: .5 }, 300, 0, -10000)
    expect(avatarCrop(600, 600, 2, position)).toMatchObject({ x: 150, y: 300, side: 300 })
  })
  it('bounds zoom and reclamps the position when zooming out', () => {
    expect(avatarCrop(600, 600, .1, { x: 1, y: 1 })).toMatchObject({ x: 0, y: 0, side: 600, zoom: 1 })
    expect(avatarCrop(600, 600, 99, { x: .5, y: .5 })).toMatchObject({ side: 200, zoom: 3 })
  })
  it('rejects invalid dimensions and pointer values before drawing', () => {
    expect(() => avatarCrop(0, 600, 1, { x: .5, y: .5 })).toThrow(RangeError)
    expect(() => avatarCrop(600, 600, 1, { x: NaN, y: .5 })).toThrow(RangeError)
    expect(() => moveAvatarCrop(600, 600, 1, { x: .5, y: .5 }, 0, 1, 1)).toThrow(RangeError)
    expect(() => moveAvatarCrop(600, 600, 1, { x: .5, y: .5 }, 300, Infinity, 1)).toThrow(RangeError)
  })
})
