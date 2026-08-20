'use client'

import { useEffect, useState } from 'react'

/**
 * Puts the document into fullscreen for an exam that enforces it, and reports
 * when the student leaves.
 *
 * The browser only grants `requestFullscreen()` from a user gesture, so the
 * call on mount is best-effort: if it is refused, `isFullscreen` stays false
 * and the caller can prompt the student to enter fullscreen manually.
 */
export function useFullscreenGuard(enabled: boolean) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showFullscreenWarning, setShowFullscreenWarning] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const onChange = () => {
      const inFS = !!document.fullscreenElement
      setIsFullscreen(inFS)
      if (!inFS) setShowFullscreenWarning(true)
    }
    document.addEventListener('fullscreenchange', onChange)
    document.documentElement
      .requestFullscreen()
      .then(() => setIsFullscreen(true))
      .catch(() => {})
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [enabled])

  /**
   * Re-enter fullscreen after the student dismissed the warning. Rejects if
   * the browser refuses, so the caller can surface that however it likes.
   */
  const requestFullscreen = async () => {
    await document.documentElement.requestFullscreen()
    setIsFullscreen(true)
    setShowFullscreenWarning(false)
  }

  return {
    isFullscreen,
    showFullscreenWarning,
    dismissWarning: () => setShowFullscreenWarning(false),
    requestFullscreen,
  }
}
