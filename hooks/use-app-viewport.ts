'use client'

import { useEffect } from 'react'
import { appShellHeight } from '@/lib/app-viewport'

/**
 * Keeps the app shell exactly as tall as the part of the window the user can
 * actually see, and keeps the document parked at its origin.
 *
 * The shell is one viewport tall and never scrolls — every scroll in the app
 * happens inside <main> or, on the exam page, inside the question column. On
 * iOS/iPadOS that arrangement has one failure mode, and it is the white
 * half-screen students and teachers hit while answering:
 *
 *   The software keyboard does not shrink the layout viewport, so `100vh`
 *   stays at the full screen height. What WebKit shrinks is the *visual*
 *   viewport, and to get the focused field out from under the keyboard it
 *   scrolls the document — even here, where the document has nothing to
 *   scroll. The shell is then sitting above the visible area, and the strip
 *   the keyboard used to cover repaints as bare <body> background: pure white
 *   in the light theme. Dismissing the keyboard does not put it back, and
 *   nothing in the page can scroll it back either, because the shell is
 *   `overflow-hidden`. Same story sideways, which is why the sidebar ends up
 *   half off the left edge while the fixed banner still spans the screen —
 *   fixed elements stay pinned to the layout viewport, the rest slides.
 *
 * Sizing the shell to `visualViewport.height` gives <main> exactly the
 * keyboard's worth of room back, so WebKit has no reason to scroll the
 * document at all, and resetting the scroll undoes any offset it took anyway.
 * A pinch-zoomed page is left alone entirely — neither resized nor scrolled:
 * its visual viewport is a fraction of the layout viewport on purpose, and
 * sizing the shell to that is what left a white band across the bottom of a
 * zoomed-in board. `appShellHeight` owns that decision.
 *
 * Browsers without `visualViewport` keep the `100dvh` fallback in the shell's
 * own class, so nothing here has to run for the layout to be correct.
 */
export function useAppViewport() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const root = document.documentElement
    let frame = 0

    const sync = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const height = appShellHeight(viewport)
        if (height === null) {
          root.style.removeProperty('--app-height')
          return
        }
        root.style.setProperty('--app-height', `${height}px`)
        if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0)
      })
    }

    /**
     * The shell has just given up the keyboard's height, so whatever the
     * student was typing in may now be below the fold of its own scroller.
     * `nearest` moves it the minimum needed — enough to be visible, without
     * yanking the page around mid-keystroke.
     */
    const revealFocusedField = () => {
      const active = document.activeElement
      if (
        active instanceof HTMLInputElement
        || active instanceof HTMLTextAreaElement
        || (active instanceof HTMLElement && active.isContentEditable)
      ) {
        active.scrollIntoView({ block: 'nearest' })
      }
    }

    const onResize = () => {
      sync()
      requestAnimationFrame(revealFocusedField)
    }

    sync()
    viewport.addEventListener('resize', onResize)
    viewport.addEventListener('scroll', sync)
    window.addEventListener('orientationchange', sync)

    return () => {
      cancelAnimationFrame(frame)
      viewport.removeEventListener('resize', onResize)
      viewport.removeEventListener('scroll', sync)
      window.removeEventListener('orientationchange', sync)
      root.style.removeProperty('--app-height')
    }
  }, [])
}
