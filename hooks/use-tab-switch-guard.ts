'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * When enabled for a real exam, counts how many times the student left the tab
 * and raises a warning banner for a few seconds each time it happens.
 *
 * Only leaving is counted — coming back is not a separate event.
 */
export function useTabSwitchGuard(enabled: boolean, warningDurationMs = 4000) {
  const [tabSwitchCount, setTabSwitchCount] = useState(0)
  const [showTabWarning, setShowTabWarning] = useState(false)
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return

    const onVisibilityChange = () => {
      if (!document.hidden) return
      setTabSwitchCount(n => n + 1)
      setShowTabWarning(true)
      if (warningTimer.current) clearTimeout(warningTimer.current)
      warningTimer.current = setTimeout(() => setShowTabWarning(false), warningDurationMs)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (warningTimer.current) clearTimeout(warningTimer.current)
    }
  }, [enabled, warningDurationMs])

  return {
    tabSwitchCount: enabled ? tabSwitchCount : 0,
    showTabWarning: enabled && showTabWarning,
  }
}
