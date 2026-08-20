'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Counts down the time left in a timed attempt and fires `onExpire` once when
 * it runs out. Returns `null` for an untimed attempt.
 *
 * Each tick recomputes the remaining time from `startedAt` rather than
 * decrementing a counter, so the clock stays truthful when the browser
 * throttles timers in a backgrounded tab.
 */
export function useExamTimer(
  durationMinutes: number | null | undefined,
  startedAt: string,
  onExpire: () => void,
) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  // Kept in a ref so a re-created onExpire does not restart the countdown,
  // while expiry still calls the current version rather than a stale one.
  const onExpireRef = useRef(onExpire)
  useEffect(() => {
    onExpireRef.current = onExpire
  })

  useEffect(() => {
    if (!durationMinutes) return
    const totalSeconds = durationMinutes * 60
    const startMs = new Date(startedAt).getTime()
    let interval: ReturnType<typeof setInterval> | undefined
    let expired = false

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startMs) / 1000)
      const remaining = Math.max(0, totalSeconds - elapsed)
      setSecondsLeft(remaining)
      if (remaining === 0 && !expired) {
        expired = true
        if (interval) clearInterval(interval)
        onExpireRef.current()
      }
    }

    tick()
    if (!expired) interval = setInterval(tick, 1000)
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [durationMinutes, startedAt])

  return secondsLeft
}
