'use client'

import { useEffect, useState } from 'react'

interface FullscreenCapableElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void
}

interface FullscreenCapableDocument extends Document {
  webkitFullscreenElement?: Element | null
}

/**
 * iPhone Safari — and therefore every browser on iOS, since they all run
 * WebKit — ships no Fullscreen API on the document at all. Calling
 * `requestFullscreen()` there is not a rejected promise but a `TypeError` on
 * `undefined`, which used to escape this effect and tear down the whole exam.
 */
function fullscreenRequest(): (() => Promise<void>) | null {
  if (typeof document === 'undefined') return null
  const el = document.documentElement as FullscreenCapableElement
  const request = el.requestFullscreen ?? el.webkitRequestFullscreen
  if (typeof request !== 'function') return null
  return () => Promise.resolve(request.call(el))
}

function isInFullscreen(): boolean {
  const doc = document as FullscreenCapableDocument
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement)
}

/**
 * Puts the document into fullscreen for an exam that enforces it, and reports
 * when the student leaves.
 *
 * The browser only grants `requestFullscreen()` from a user gesture, so the
 * call on mount is best-effort: if it is refused, `isFullscreen` stays false
 * and the caller can prompt the student to enter fullscreen manually.
 *
 * On a device with no Fullscreen API the requirement is dropped rather than
 * enforced — `isSupported` reports false and the warning never rises. A
 * blocking "return to fullscreen" overlay there can never be satisfied, so it
 * would lock a phone out of the exam entirely instead of deterring anything.
 */
export function useFullscreenGuard(enabled: boolean) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showFullscreenWarning, setShowFullscreenWarning] = useState(false)
  const [isSupported, setIsSupported] = useState(true)

  useEffect(() => {
    if (!enabled) {
      setIsFullscreen(false)
      setShowFullscreenWarning(false)
      return
    }
    const request = fullscreenRequest()
    if (!request) {
      setIsSupported(false)
      setIsFullscreen(false)
      setShowFullscreenWarning(false)
      return
    }
    setIsSupported(true)
    const onChange = () => {
      const inFS = isInFullscreen()
      setIsFullscreen(inFS)
      if (!inFS) setShowFullscreenWarning(true)
    }
    // Only fall back to the prefixed event where the standard one does not
    // exist. Browsers that have both dispatch both, and listening to the pair
    // would run onChange twice per change on every desktop browser — harmless,
    // since it is idempotent, but it is a behaviour change on a path that was
    // working, and this fix has no business touching it.
    const changeEvent = 'onfullscreenchange' in document
      ? 'fullscreenchange'
      : 'webkitfullscreenchange'
    document.addEventListener(changeEvent, onChange)
    request()
      .then(() => {
        setIsFullscreen(true)
        setShowFullscreenWarning(false)
      })
      .catch(() => setShowFullscreenWarning(true))
    return () => document.removeEventListener(changeEvent, onChange)
  }, [enabled])

  /**
   * Re-enter fullscreen after the student dismissed the warning. Rejects if
   * the browser refuses or cannot do it at all, so the caller can surface that
   * however it likes.
   */
  const requestFullscreen = async () => {
    const request = fullscreenRequest()
    if (!request) {
      setIsSupported(false)
      setShowFullscreenWarning(false)
      throw new Error('อุปกรณ์นี้ไม่รองรับโหมดเต็มจอ')
    }
    await request()
    setIsFullscreen(true)
    setShowFullscreenWarning(false)
  }

  return {
    isFullscreen,
    isSupported,
    showFullscreenWarning,
    dismissWarning: () => setShowFullscreenWarning(false),
    requestFullscreen,
  }
}
