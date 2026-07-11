'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

export type DraftStatus = 'idle' | 'saving' | 'saved'

export interface DraftRevision<T> {
  id: string
  savedAt: string
  label: string
  data: T
}

export interface AutoDraftReturn<T> {
  status: DraftStatus
  lastSaved: Date | null
  revisions: DraftRevision<T>[]
  restoreRevision: (id: string) => T | null
  clearDraft: () => void
}

const MAX_REVISIONS = 20

export function useAutoDraft<T>(
  storageKey: string,
  data: T,
  intervalMs = 3000
): AutoDraftReturn<T> {
  const [status, setStatus] = useState<DraftStatus>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [revisions, setRevisions] = useState<DraftRevision<T>[]>([])
  const latestData = useRef<T>(data)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep ref current without triggering effects
  useEffect(() => {
    latestData.current = data
  }, [data])

  // Load existing revisions on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`${storageKey}:revisions`)
      if (stored) {
        const parsed: DraftRevision<T>[] = JSON.parse(stored)
        setRevisions(parsed)
      }
    } catch {
      // Ignore parse errors
    }
  }, [storageKey])

  const save = useCallback(() => {
    setStatus('saving')
    try {
      const now = new Date()
      const rev: DraftRevision<T> = {
        id: `${Date.now()}`,
        savedAt: now.toISOString(),
        label: `บันทึกอัตโนมัติ ${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
        data: latestData.current,
      }

      // Persist current data as "latest draft"
      localStorage.setItem(`${storageKey}:latest`, JSON.stringify(latestData.current))

      // Append revision (keep max 20)
      setRevisions(prev => {
        const next = [rev, ...prev].slice(0, MAX_REVISIONS)
        localStorage.setItem(`${storageKey}:revisions`, JSON.stringify(next))
        return next
      })

      setLastSaved(now)
      setStatus('saved')
    } catch {
      setStatus('idle')
    }
  }, [storageKey])

  // Schedule periodic saves
  useEffect(() => {
    timerRef.current = setTimeout(function tick() {
      save()
      timerRef.current = setTimeout(tick, intervalMs)
    }, intervalMs)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [save, intervalMs])

  const restoreRevision = useCallback(
    (id: string): T | null => {
      const found = revisions.find(r => r.id === id)
      return found ? found.data : null
    },
    [revisions]
  )

  const clearDraft = useCallback(() => {
    localStorage.removeItem(`${storageKey}:latest`)
    localStorage.removeItem(`${storageKey}:revisions`)
    setRevisions([])
    setStatus('idle')
    setLastSaved(null)
  }, [storageKey])

  return { status, lastSaved, revisions, restoreRevision, clearDraft }
}

// ─── Load latest draft from storage ──────────────────────────────────────────

export function loadLatestDraft<T>(storageKey: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem(`${storageKey}:latest`)
    return stored ? (JSON.parse(stored) as T) : null
  } catch {
    return null
  }
}
