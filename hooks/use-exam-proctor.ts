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
const COLLISION_PROBE_MS = 80
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Sends browser-level presence and integrity signals to the teacher's live
 * room. It intentionally captures no screen contents, keystrokes, answers,
 * camera, microphone, IP address, user agent, device fingerprint or arbitrary
 * metadata. A random per-tab id exists only to count overlapping exam windows.
 */
export function useExamProctor({ enabled, submissionId, blockClipboard }: UseExamProctorOptions) {
  const [status, setStatus] = useState<ProctorConnectionStatus>(enabled ? 'connecting' : 'disabled')
  const [activeConnectionCount, setActiveConnectionCount] = useState(0)
  const queueRef = useRef<ProctorEvent[]>([])
  const flushingRef = useRef(false)
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) {
      setStatus('disabled')
      setActiveConnectionCount(0)
      return
    }

    let active = true
    let monitoringStarted = false
    let heartbeat: ReturnType<typeof setInterval> | null = null
    let startupTimer: ReturnType<typeof setTimeout> | null = null
    let clientInstanceId = ''
    let candidateInstanceId = ''
    let collisionDetected = false
    let broadcast: BroadcastChannel | null = null

    const storageKey = `korkru:exam-proctor-instance:${submissionId}`
    try {
      const stored = window.sessionStorage.getItem(storageKey)
      candidateInstanceId = stored && UUID_PATTERN.test(stored) ? stored : crypto.randomUUID()
      window.sessionStorage.setItem(storageKey, candidateInstanceId)
    } catch {
      candidateInstanceId = crypto.randomUUID()
    }

    // Some browsers clone sessionStorage when a tab is duplicated. A short
    // BroadcastChannel handshake makes the clone choose a new id while a
    // normal reload keeps the existing id and therefore does not look like a
    // second device.
    const probeNonce = crypto.randomUUID()
    if ('BroadcastChannel' in window) {
      broadcast = new BroadcastChannel(`korkru:exam-proctor:${submissionId}`)
      broadcast.addEventListener('message', event => {
        const message = event.data
        if (!message || typeof message !== 'object') return
        if (
          message.type === 'probe'
          && message.instanceId === candidateInstanceId
          && typeof message.nonce === 'string'
        ) {
          broadcast?.postMessage({
            type: 'collision',
            instanceId: candidateInstanceId,
            nonce: message.nonce,
          })
        }
        if (
          !monitoringStarted
          && message.type === 'collision'
          && message.instanceId === candidateInstanceId
          && message.nonce === probeNonce
        ) {
          collisionDetected = true
        }
      })
      broadcast.postMessage({ type: 'probe', instanceId: candidateInstanceId, nonce: probeNonce })
    }

    const flush = async (connectionClosed = false) => {
      if (!active || !clientInstanceId || flushingRef.current) return
      const batch = queueRef.current.splice(0, 20)
      flushingRef.current = true
      try {
        const result = await recordProctorSignal({
          submissionId,
          clientInstanceId,
          tabVisible: !document.hidden,
          fullscreen: Boolean(document.fullscreenElement),
          connectionClosed,
          events: batch,
        })
        if (!active) return
        if (result.error) {
          if (!connectionClosed) queueRef.current = [...batch, ...queueRef.current].slice(-60)
          setStatus(navigator.onLine ? 'connecting' : 'offline')
        } else {
          setStatus('connected')
          setActiveConnectionCount(result.activeConnectionCount ?? 0)
        }
      } catch {
        if (!connectionClosed) queueRef.current = [...batch, ...queueRef.current].slice(-60)
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
    const onPageShow = () => {
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
    const onPageHide = () => void flush(true)

    const attachListeners = () => {
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
      window.addEventListener('pageshow', onPageShow)
      window.addEventListener('pagehide', onPageHide)
    }

    const detachListeners = () => {
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
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('pagehide', onPageHide)
    }

    startupTimer = setTimeout(() => {
      if (!active) return
      if (collisionDetected) {
        candidateInstanceId = crypto.randomUUID()
        try {
          window.sessionStorage.setItem(storageKey, candidateInstanceId)
        } catch {
          // The in-memory id is sufficient when storage is unavailable.
        }
      }
      clientInstanceId = candidateInstanceId
      monitoringStarted = true
      attachListeners()
      record('monitoring_started')
      heartbeat = setInterval(() => void flush(), HEARTBEAT_INTERVAL_MS)
    }, broadcast ? COLLISION_PROBE_MS : 0)

    return () => {
      active = false
      if (startupTimer) clearTimeout(startupTimer)
      if (heartbeat) clearInterval(heartbeat)
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
      if (monitoringStarted) detachListeners()
      broadcast?.close()
    }
  }, [blockClipboard, enabled, submissionId])

  return { status, activeConnectionCount }
}
