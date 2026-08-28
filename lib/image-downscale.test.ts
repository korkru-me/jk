import { describe, it, expect } from 'vitest'
import {
  MAX_EDGE,
  SKIP_BELOW_BYTES,
  canShrink,
  fitWithin,
  renameForType,
  shouldShrink,
} from './image-downscale'

const KB = 1024

describe('canShrink', () => {
  it('accepts the still raster types a canvas can redraw', () => {
    expect(canShrink('image/jpeg')).toBe(true)
    expect(canShrink('image/png')).toBe(true)
    expect(canShrink('image/webp')).toBe(true)
  })

  it('refuses GIF, so an animation is not flattened to its first frame', () => {
    expect(canShrink('image/gif')).toBe(false)
  })

  it('refuses vectors and documents', () => {
    expect(canShrink('image/svg+xml')).toBe(false)
    expect(canShrink('application/pdf')).toBe(false)
  })

  it('ignores case, which is how some phones report the type', () => {
    expect(canShrink('IMAGE/JPEG')).toBe(true)
  })
})

describe('fitWithin', () => {
  it('scales the longest edge down to the cap and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it('leaves an image that already fits exactly as it is', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1600, 900, 1600)).toEqual({ width: 1600, height: 900 })
  })

  it('never enlarges a small image', () => {
    expect(fitWithin(64, 64, 1600)).toEqual({ width: 64, height: 64 })
  })

  it('keeps a very wide panorama at least one pixel tall', () => {
    expect(fitWithin(16000, 3, 1600).height).toBeGreaterThanOrEqual(1)
  })

  it('does not divide by zero on a degenerate size', () => {
    expect(fitWithin(0, 0, 1600)).toEqual({ width: 0, height: 0 })
  })
})

describe('shouldShrink', () => {
  it('resizes anything past the pixel cap however little it weighs', () => {
    expect(shouldShrink('image/png', 20 * KB, 3000, 2000)).toBe(true)
  })

  it('re-encodes a heavy file even when its pixels already fit', () => {
    expect(shouldShrink('image/jpeg', 3000 * KB, 1200, 900)).toBe(true)
  })

  it('leaves the small diagrams this คลัง is mostly made of alone', () => {
    // The median question image is about 4 KB — re-encoding it costs quality
    // and saves nothing.
    expect(shouldShrink('image/png', 4 * KB, 600, 400)).toBe(false)
    expect(shouldShrink('image/png', SKIP_BELOW_BYTES, 800, 600)).toBe(false)
  })

  it('never touches a type it cannot redraw, at any size', () => {
    expect(shouldShrink('image/gif', 9000 * KB, 4000, 4000)).toBe(false)
    expect(shouldShrink('application/pdf', 9000 * KB, 4000, 4000)).toBe(false)
  })

  it('catches a phone camera photo, which is the case this exists for', () => {
    expect(shouldShrink('image/jpeg', 4200 * KB, 4032, 3024, MAX_EDGE)).toBe(true)
  })
})

describe('renameForType', () => {
  it('follows the new encoding, because the storage key is built from the name', () => {
    expect(renameForType('photo.jpg', 'image/webp')).toBe('photo.webp')
    expect(renameForType('scan.PNG', 'image/jpeg')).toBe('scan.jpg')
  })

  it('keeps dots that are part of the name', () => {
    expect(renameForType('งาน 2.1 ข้อ 3.png', 'image/webp')).toBe('งาน 2.1 ข้อ 3.webp')
  })

  it('handles a name with no extension at all', () => {
    expect(renameForType('image', 'image/webp')).toBe('image.webp')
  })

  it('still produces a usable name when the file is called only ".jpg"', () => {
    expect(renameForType('.jpg', 'image/webp')).toBe('image.webp')
  })
})
