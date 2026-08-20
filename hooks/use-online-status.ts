'use client'

import { useEffect, useRef, useState } from 'react'

interface Options {
  /** Runs when the connection comes back. Use it to flush anything queued. */
  onOnline?: () => void
  /** Runs when the connection drops. */
  onOffline?: () => void
}

/**
 * Tracks connectivity and notifies on each transition.
 *
 * The callbacks are held in refs, so passing inline functions does not
 * re-register the listeners on every render.
 */
export function useOnlineStatus({ onOnline, onOffline }: Options = {}) {
  const [isOnline, setIsOnline] = useState(true)

  const onOnlineRef = useRef(onOnline)
  const onOfflineRef = useRef(onOffline)
  useEffect(() => {
    onOnlineRef.current = onOnline
    onOfflineRef.current = onOffline
  })

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      onOnlineRef.current?.()
    }
    const handleOffline = () => {
      setIsOnline(false)
      onOfflineRef.current?.()
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setIsOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
