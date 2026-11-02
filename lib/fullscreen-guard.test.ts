import { describe, expect, it } from 'vitest'
import { blocksTypingInFullscreen } from './fullscreen-guard'

const SAFARI_DESKTOP_CLASS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

describe('browsers that drop fullscreen when the student types', () => {
  it('catches an iPad even though Safari there reports itself as a Mac', () => {
    // What Safari on iPadOS sends by default: the Mac string, told apart only
    // by its touch points.
    expect(blocksTypingInFullscreen({ userAgent: SAFARI_DESKTOP_CLASS, maxTouchPoints: 5 })).toBe(true)
    expect(blocksTypingInFullscreen({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 })).toBe(true)
  })

  it('catches every other browser on iPad and iPhone, which all run WebKit', () => {
    expect(blocksTypingInFullscreen({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 })).toBe(true)
    expect(blocksTypingInFullscreen({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.17.0', maxTouchPoints: 5 })).toBe(true)
  })

  it('keeps enforcing on a Mac, where typing in fullscreen works', () => {
    expect(blocksTypingInFullscreen({ userAgent: SAFARI_DESKTOP_CLASS, maxTouchPoints: 0 })).toBe(false)
    expect(blocksTypingInFullscreen({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', maxTouchPoints: 0 })).toBe(false)
  })

  it('keeps enforcing on touch devices that are not Apple', () => {
    expect(blocksTypingInFullscreen({ userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', maxTouchPoints: 5 })).toBe(false)
    expect(blocksTypingInFullscreen({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', maxTouchPoints: 10 })).toBe(false)
  })
})
