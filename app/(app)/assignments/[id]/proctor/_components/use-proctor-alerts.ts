'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  collapseProctorAlertEvents,
  PROCTOR_EVENT_LABELS,
  takeUnseenReviewableProctorEvents,
} from '@/lib/exam-proctor-alerts'
import type { ProctorEventRow } from '@/lib/exam-proctor-realtime'

const ALERT_BATCH_DELAY_MS = 1_250
const MAX_TOAST_DETAILS = 3

type StudentNameSource =
  | ReadonlyMap<string, string>
  | ((studentId: string) => string | undefined)

export type ProctorNotificationPermission = NotificationPermission | 'unsupported'
export type ProctorAlertStatus = 'disabled' | 'sound-only' | 'sound-and-system'

interface UseProctorAlertsOptions {
  initialEvents: ProctorEventRow[]
  studentNameById: StudentNameSource
}

interface UseProctorAlertsResult {
  ingestEvents: (events: ProctorEventRow[]) => void
  alertsEnabled: boolean
  notificationPermission: ProctorNotificationPermission
  toggleAlerts: () => Promise<void>
  testAlert: () => Promise<void>
  alertStatus: ProctorAlertStatus
}

function resolveStudentName(source: StudentNameSource, studentId: string): string {
  const name = typeof source === 'function'
    ? source(studentId)
    : source.get(studentId)
  return name?.trim() || 'นักเรียน'
}

function playTone(context: AudioContext): void {
  const startedAt = context.currentTime
  const oscillator = context.createOscillator()
  const gain = context.createGain()

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(660, startedAt)
  oscillator.frequency.exponentialRampToValueAtTime(880, startedAt + 0.16)
  gain.gain.setValueAtTime(0.0001, startedAt)
  gain.gain.exponentialRampToValueAtTime(0.18, startedAt + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.22)

  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.onended = () => {
    oscillator.disconnect()
    gain.disconnect()
  }
  oscillator.start(startedAt)
  oscillator.stop(startedAt + 0.23)
}

function showSystemNotification(eventCount: number): boolean {
  if (
    typeof window === 'undefined'
    || typeof document === 'undefined'
    || typeof Notification === 'undefined'
    || Notification.permission !== 'granted'
    || (document.visibilityState === 'visible' && document.hasFocus())
  ) return true

  try {
    const notification = new Notification('KorKru: มีสัญญาณใหม่ในห้องสอบ', {
      body: `เปิดหน้าคุมสอบเพื่อตรวจสัญญาณใหม่จากนักเรียน ${eventCount} คน`,
      tag: 'korkru-proctor-alert',
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
    return true
  } catch (error) {
    // Some browsers expose the API but only support notifications through a
    // service worker. The in-page toast and opted-in sound remain available.
    console.warn('Unable to show the proctor system notification.', error)
    return false
  }
}

export function useProctorAlerts({
  initialEvents,
  studentNameById,
}: UseProctorAlertsOptions): UseProctorAlertsResult {
  const [alertsEnabled, setAlertsEnabled] = useState(false)
  const [notificationPermission, setNotificationPermission] =
    useState<ProctorNotificationPermission>('default')
  const mountedRef = useRef(true)
  const alertsEnabledRef = useRef(false)
  const permissionRef = useRef<ProctorNotificationPermission>('default')
  const systemNotificationUnavailableRef = useRef(false)
  const studentNameSourceRef = useRef(studentNameById)
  const seenEventIdsRef = useRef(new Set(initialEvents.map(event => event.id)))
  const pendingEventsRef = useRef<ProctorEventRow[]>([])
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    studentNameSourceRef.current = studentNameById
  }, [studentNameById])

  useEffect(() => {
    const permission: ProctorNotificationPermission =
      typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
    permissionRef.current = permission
    setNotificationPermission(permission)
  }, [])

  const playEnabledSound = useCallback(async (): Promise<boolean> => {
    const context = audioContextRef.current
    if (!context || context.state === 'closed') return false

    try {
      if (context.state === 'suspended') await context.resume()
      if (context.state !== 'running') return false
      playTone(context)
      return true
    } catch (error) {
      console.warn('Unable to play the proctor alert sound.', error)
      return false
    }
  }, [])

  const flushAlertBatch = useCallback(() => {
    batchTimerRef.current = null
    const pendingEvents = pendingEventsRef.current
    pendingEventsRef.current = []
    const alertEvents = collapseProctorAlertEvents(pendingEvents)
    if (alertEvents.length === 0) return

    const details = alertEvents.slice(0, MAX_TOAST_DETAILS).map(event => {
      const studentName = resolveStudentName(studentNameSourceRef.current, event.student_id)
      const eventLabel = PROCTOR_EVENT_LABELS[event.event_type] ?? 'มีสัญญาณให้ตรวจสอบ'
      return `${studentName}: ${eventLabel}`
    })
    const remainingCount = alertEvents.length - details.length
    const description = remainingCount > 0
      ? `${details.join(' · ')} · และอีก ${remainingCount} คน`
      : details.join(' · ')

    toast.warning(
      alertEvents.length === 1
        ? 'พบสัญญาณใหม่ในห้องสอบ'
        : `พบสัญญาณใหม่จากนักเรียน ${alertEvents.length} คน`,
      { description, duration: 8_000 },
    )

    if (alertsEnabledRef.current) {
      void playEnabledSound()
      if (permissionRef.current === 'granted') {
        const notificationWorked = showSystemNotification(alertEvents.length)
        if (!notificationWorked) {
          systemNotificationUnavailableRef.current = true
          permissionRef.current = 'unsupported'
          if (mountedRef.current) setNotificationPermission('unsupported')
          toast.info('อุปกรณ์นี้ใช้การแจ้งเตือนนอกแท็บไม่ได้ ระบบยังเปิดเสียงแจ้งเตือนไว้ให้')
        }
      }
    }
  }, [playEnabledSound])

  const ingestEvents = useCallback((nextEvents: ProctorEventRow[]) => {
    const unseenReviewableEvents = takeUnseenReviewableProctorEvents(
      nextEvents,
      seenEventIdsRef.current,
    )

    if (unseenReviewableEvents.length === 0) return
    pendingEventsRef.current.push(...unseenReviewableEvents)
    if (batchTimerRef.current !== null) return
    batchTimerRef.current = setTimeout(flushAlertBatch, ALERT_BATCH_DELAY_MS)
  }, [flushAlertBatch])

  const toggleAlerts = useCallback(async () => {
    if (alertsEnabledRef.current) {
      alertsEnabledRef.current = false
      if (mountedRef.current) setAlertsEnabled(false)
      const context = audioContextRef.current
      audioContextRef.current = null
      if (context && context.state !== 'closed') {
        try {
          await context.close()
        } catch (error) {
          console.warn('Unable to close the proctor alert audio context.', error)
        }
      }
      return
    }

    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
      toast.error('เบราว์เซอร์นี้ไม่รองรับเสียงแจ้งเตือน')
      return
    }

    // Permission is requested only from this user-initiated action. Start it
    // before awaiting audio work so browsers retain the click activation.
    const notificationPermissionPromise: Promise<ProctorNotificationPermission> =
      typeof Notification === 'undefined'
        ? Promise.resolve('unsupported')
        : Notification.permission === 'default'
          ? Notification.requestPermission()
          : Promise.resolve(Notification.permission)

    let context: AudioContext | null = null
    try {
      context = new window.AudioContext()
      audioContextRef.current = context
      if (context.state === 'suspended') await context.resume()
      if (context.state !== 'running') throw new Error('Audio context did not start')

      alertsEnabledRef.current = true
      if (mountedRef.current) setAlertsEnabled(true)
      playTone(context)
      toast.success('เปิดเสียงแจ้งเตือนในห้องคุมสอบแล้ว')
    } catch (error) {
      audioContextRef.current = null
      if (context && context.state !== 'closed') {
        void context.close().catch(() => undefined)
      }
      console.warn('Unable to enable proctor alert audio.', error)
      toast.error('เปิดเสียงแจ้งเตือนไม่สำเร็จ ลองกดอีกครั้ง')
    }

    const permission = await notificationPermissionPromise.catch(error => {
      console.warn('Unable to request proctor system notification permission.', error)
      return typeof Notification === 'undefined'
        ? 'unsupported' as const
        : Notification.permission
    })
    const effectivePermission = permission === 'granted' && systemNotificationUnavailableRef.current
      ? 'unsupported'
      : permission
    permissionRef.current = effectivePermission
    if (mountedRef.current) setNotificationPermission(effectivePermission)
  }, [])

  const testAlert = useCallback(async () => {
    if (!alertsEnabledRef.current) {
      toast.info('เปิดเสียงแจ้งเตือนก่อนทดสอบ')
      return
    }

    const played = await playEnabledSound()
    if (played) toast.success('ทดสอบเสียงแจ้งเตือนแล้ว')
    else toast.error('เล่นเสียงทดสอบไม่สำเร็จ ลองปิดแล้วเปิดการแจ้งเตือนอีกครั้ง')
  }, [playEnabledSound])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (batchTimerRef.current !== null) clearTimeout(batchTimerRef.current)
      batchTimerRef.current = null
      pendingEventsRef.current = []

      const context = audioContextRef.current
      audioContextRef.current = null
      if (context && context.state !== 'closed') {
        void context.close().catch(error => {
          console.warn('Unable to close the proctor alert audio context.', error)
        })
      }
    }
  }, [])

  const alertStatus = useMemo<ProctorAlertStatus>(() => {
    if (!alertsEnabled) return 'disabled'
    return notificationPermission === 'granted' ? 'sound-and-system' : 'sound-only'
  }, [alertsEnabled, notificationPermission])

  return {
    ingestEvents,
    alertsEnabled,
    notificationPermission,
    toggleAlerts,
    testAlert,
    alertStatus,
  }
}
