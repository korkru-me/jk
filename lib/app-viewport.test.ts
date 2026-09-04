import { describe, expect, it } from 'vitest'
import { appShellHeight } from './app-viewport'

describe('app shell height', () => {
  it('follows the visual viewport at rest, which is the iOS keyboard fix', () => {
    expect(appShellHeight({ height: 844, scale: 1 })).toBe(844)
    expect(appShellHeight({ height: 520.4, scale: 1 })).toBe(520)
  })

  it('hands the shell back to 100dvh while the page is pinch-zoomed', () => {
    // A zoomed page reports a fraction of the layout viewport; sizing the
    // shell to it is what left a white band below the board.
    expect(appShellHeight({ height: 300, scale: 2.5 })).toBeNull()
    expect(appShellHeight({ height: 844, scale: 1.005 })).toBe(844)
  })

  it('ignores a viewport height a browser cannot have', () => {
    expect(appShellHeight({ height: 0, scale: 1 })).toBeNull()
    expect(appShellHeight({ height: Number.NaN, scale: 1 })).toBeNull()
  })
})
