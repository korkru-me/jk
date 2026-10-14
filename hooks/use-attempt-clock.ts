'use client'

import { useEffect, useRef, useState } from 'react'
import { attemptSecondsLeft } from '@/lib/attempt-expiry'

/** Anchor to server time, then use a monotonic clock rather than the device's
 * editable wall clock. A resumed page receives a new server anchor. */
export function useAttemptClock(expiresAt: string | null | undefined, serverNow: string | null | undefined,
  onExpire?: () => void) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const callback = useRef(onExpire)
  useEffect(() => { callback.current = onExpire }, [onExpire])
  useEffect(() => {
    if (!expiresAt) { setSecondsLeft(null); return }
    const serverMs = serverNow ? Date.parse(serverNow) : Date.now()
    const origin = performance.now()
    let fired = false
    const tick = () => {
      const left = attemptSecondsLeft(expiresAt, serverMs + performance.now() - origin)
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
