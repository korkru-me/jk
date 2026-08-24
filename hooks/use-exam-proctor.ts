'use client'

import { useEffect, useRef, useState } from 'react'
import { recordProctorSignal } from '@/lib/actions/exam-proctor'
import type { ProctorEvent, ProctorEventType } from '@/lib/exam-proctor'

type ProctorConnectionStatus = 'disabled' | 'connecting' | 'connected' | 'offline'

interface UseExamProctorOptions {
  enabled: boolean
  submissionId: string
  blockClipboard: boolean
}

const HEARTBEAT_INTERVAL_MS = 15_000
const FLUSH_DELAY_MS = 250

/**
 * Sends browser-level presence and integrity signals to the teacher's live
 * room. It intentionally captures no screen contents, keystrokes, answers,
 * camera, microphone, IP address or arbitrary metadata.
 */
export function useExamProctor({ enabled, submissionId, blockClipboard }: UseExamProctorOptions) {
  const [status, setStatus] = useState<ProctorConnectionStatus>(enabled ? 'connecting' : 'disabled')
  const queueRef = useRef<ProctorEvent[]>([])
  const flushingRef = useRef(false)
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) {
      setStatus('disabled')
      return
    }

    let active = true

    const flush = async () => {
      if (!active || flushingRef.current) return
      const batch = queueRef.current.splice(0, 20)
      flushingRef.current = true
      try {
        const result = await recordProctorSignal({
          submissionId,
          tabVisible: !document.hidden,
          fullscreen: Boolean(document.fullscreenElement),
          events: batch,
        })
        if (!active) return
        if (result.error) {
          queueRef.current = [...batch, ...queueRef.current].slice(-60)
          setStatus(navigator.onLine ? 'connecting' : 'offline')
        } else {
          setStatus('connected')
        }
      } catch {
        queueRef.current = [...batch, ...queueRef.current].slice(-60)
        if (active) setStatus(navigator.onLine ? 'connecting' : 'offline')
      } finally {
        flushingRef.current = false
      }
    }

    const scheduleFlush = () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
      flushTimerRef.current = setTimeout(() => void flush(), FLUSH_DELAY_MS)
    }

    const record = (type: ProctorEventType) => {
      queueRef.current.push({ id: crypto.randomUUID(), type, clientAt: new Date().toISOString() })
      queueRef.current = queueRef.current.slice(-60)
      scheduleFlush()
    }

    const onVisibility = () => record(document.hidden ? 'tab_hidden' : 'tab_visible')
    const onFullscreen = () => record(document.fullscreenElement ? 'fullscreen_entered' : 'fullscreen_exited')
    const onBlur = () => record('window_blur')
    const onFocus = () => record('window_focus')
    const onOnline = () => {
      setStatus('connecting')
      void flush()
    }
    const onOffline = () => setStatus('offline')
    const onCopy = (event: ClipboardEvent) => {
      if (!blockClipboard) return
      event.preventDefault()
      record('copy_attempt')
    }
    const onCut = (event: ClipboardEvent) => {
      if (!blockClipboard) return
      event.preventDefault()
      record('cut_attempt')
    }
    const onPaste = (event: ClipboardEvent) => {
      if (!blockClipboard) return
      event.preventDefault()
      record('paste_attempt')
    }
    const onContextMenu = (event: MouseEvent) => {
      if (!blockClipboard) return
      event.preventDefault()
      record('context_menu_attempt')
    }
    const onKeyDown = (event: KeyboardEvent) => {
      // Browsers cannot reliably prevent an operating-system screenshot. The
      // key is recorded only as a review signal when the browser exposes it.
      if (event.key === 'PrintScreen') record('screenshot_key')
    }
    const onPageHide = () => void flush()

    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('fullscreenchange', onFullscreen)
    document.addEventListener('copy', onCopy, true)
    document.addEventListener('cut', onCut, true)
    document.addEventListener('paste', onPaste, true)
    document.addEventListener('contextmenu', onContextMenu, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('pagehide', onPageHide)

    record('monitoring_started')
    const heartbeat = setInterval(() => void flush(), HEARTBEAT_INTERVAL_MS)

    return () => {
      active = false
      clearInterval(heartbeat)
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('fullscreenchange', onFullscreen)
      document.removeEventListener('copy', onCopy, true)
      document.removeEventListener('cut', onCut, true)
      document.removeEventListener('paste', onPaste, true)
      document.removeEventListener('contextmenu', onContextMenu, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [blockClipboard, enabled, submissionId])

  return { status }
}
