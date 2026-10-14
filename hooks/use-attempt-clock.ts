'use client'

import { useEffect, useRef, useState } from 'react'
import { attemptElapsedMs, attemptSecondsLeft } from '@/lib/attempt-expiry'

/** Anchor to server time. Keep elapsed time advancing through device sleep
 * and never rewind it with a device clock change. Resume refreshes the anchor. */
export function useAttemptClock(expiresAt: string | null | undefined, serverNow: string | null | undefined,
  onExpire?: () => void) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const callback = useRef(onExpire)
  useEffect(() => { callback.current = onExpire }, [onExpire])
  useEffect(() => {
    if (!expiresAt) { setSecondsLeft(null); return }
    const wallOrigin = Date.now()
    const parsedServerMs = serverNow ? Date.parse(serverNow) : NaN
    const serverMs = Number.isFinite(parsedServerMs) ? parsedServerMs : wallOrigin
    const origin = performance.now()
    let elapsed = 0
    let fired = false
    const tick = () => {
      elapsed = attemptElapsedMs(elapsed, performance.now() - origin, Date.now() - wallOrigin)
      const left = attemptSecondsLeft(expiresAt, serverMs + elapsed)
      setSecondsLeft(left)
      if (left === 0 && !fired) { fired = true; callback.current?.() }
    }
    tick()
    const interval = setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick) }
  }, [expiresAt, serverNow])
  return secondsLeft
}
