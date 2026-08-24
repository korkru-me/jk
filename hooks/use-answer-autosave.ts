'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { saveAnswer } from '@/lib/actions/submissions'

const LS_KEY = (submissionId: string) => `korkru_exam_${submissionId}`
const DEBOUNCE_MS = 500

interface Options {
  submissionId: string
  /** Lazy initial values, keyed by answer id — usually derived from the DB rows. */
  initialAnswers: () => Record<string, string>
  /**
   * Teacher preview: keep every behaviour except the writes, since there is no
   * real submission row behind `submissionId`.
   */
  previewMode?: boolean
}

/**
 * Owns the student's in-progress answers and everything involved in getting
 * them persisted.
 *
 * Three guarantees this is here to provide:
 *  - typing stays instant — edits are coalesced per answer before they hit the
 *    server, instead of firing a server action per keystroke;
 *  - saves for one answer are chained, so a slow earlier response can never
 *    land after a newer one and overwrite it;
 *  - nothing is lost offline — values go to localStorage on every change and
 *    the failed ones are queued for `retryPending()` when the network returns.
 */
export function useAnswerAutosave({ submissionId, initialAnswers, previewMode = false }: Options) {
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>(initialAnswers)
  const [pendingSync, setPendingSync] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const localAnswersRef = useRef(localAnswers)
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pendingValuesRef = useRef<Map<string, string>>(new Map())
  const inFlightRef = useRef<Map<string, Promise<boolean>>>(new Map())
  // Only dirty values belong in localStorage. Keeping every server-confirmed
  // value there would let an old backup overwrite a newer answer from another
  // device the next time this attempt opens.
  const backupValuesRef = useRef<Map<string, string>>(new Map())

  const persistPendingBackup = useCallback(() => {
    try {
      if (backupValuesRef.current.size === 0) {
        localStorage.removeItem(LS_KEY(submissionId))
        return
      }
      localStorage.setItem(
        LS_KEY(submissionId),
        JSON.stringify(Object.fromEntries(backupValuesRef.current)),
      )
    } catch { /* ignore quota errors */ }
  }, [submissionId])

  const refreshSavingState = useCallback(() => {
    setSaving(
      saveTimersRef.current.size > 0
      || pendingValuesRef.current.size > 0
      || inFlightRef.current.size > 0
    )
  }, [])

  const flushAnswer = useCallback((answerId: string): Promise<boolean> => {
    const timer = saveTimersRef.current.get(answerId)
    if (timer) clearTimeout(timer)
    saveTimersRef.current.delete(answerId)

    const value = pendingValuesRef.current.get(answerId)
    const existing = inFlightRef.current.get(answerId)
    if (value === undefined) return existing ?? Promise.resolve(true)
    pendingValuesRef.current.delete(answerId)

    const task = (existing ?? Promise.resolve(true))
      .catch(() => false)
      .then(async () => {
        const result: { error?: string } = previewMode ? {} : await saveAnswer(answerId, value)
        if (result.error) throw new Error(result.error)
        if (pendingValuesRef.current.get(answerId) === value) {
          pendingValuesRef.current.delete(answerId)
        }
        setPendingSync(prev => {
          if (!prev.has(answerId)) return prev
          const next = new Set(prev)
          next.delete(answerId)
          return next
        })
        if (backupValuesRef.current.get(answerId) === value && !pendingValuesRef.current.has(answerId)) {
          backupValuesRef.current.delete(answerId)
          persistPendingBackup()
        }
        return true
      })
      .catch(() => {
        const latest = localAnswersRef.current[answerId] ?? value
        if (!pendingValuesRef.current.has(answerId)) pendingValuesRef.current.set(answerId, latest)
        backupValuesRef.current.set(answerId, latest)
        persistPendingBackup()
        setPendingSync(prev => new Set(prev).add(answerId))
        return false
      })
      .finally(() => {
        if (inFlightRef.current.get(answerId) === task) {
          inFlightRef.current.delete(answerId)
        }
        refreshSavingState()
      })

    inFlightRef.current.set(answerId, task)
    setSaving(true)
    return task
  }, [persistPendingBackup, refreshSavingState, previewMode])

  /** Force every queued edit out and report whether every write reached the server. */
  const flushQueuedAnswers = useCallback(async (): Promise<boolean> => {
    const queuedIds = [...pendingValuesRef.current.keys()]
    const queuedResults = await Promise.all(queuedIds.map(id => flushAnswer(id)))
    const inFlightResults = await Promise.all([...inFlightRef.current.values()])
    return [...queuedResults, ...inFlightResults].every(Boolean)
  }, [flushAnswer])

  /** Record an edit and schedule it to be persisted. */
  const setAnswer = useCallback((answerId: string, value: string) => {
    localAnswersRef.current = { ...localAnswersRef.current, [answerId]: value }
    setLocalAnswers(prev => ({ ...prev, [answerId]: value }))
    pendingValuesRef.current.set(answerId, value)
    backupValuesRef.current.set(answerId, value)
    persistPendingBackup()

    const existingTimer = saveTimersRef.current.get(answerId)
    if (existingTimer) clearTimeout(existingTimer)

    if (!navigator.onLine) {
      setPendingSync(prev => new Set([...prev, answerId]))
      saveTimersRef.current.delete(answerId)
      refreshSavingState()
      return
    }

    setSaving(true)
    const timer = setTimeout(() => {
      saveTimersRef.current.delete(answerId)
      void flushAnswer(answerId)
    }, DEBOUNCE_MS)
    saveTimersRef.current.set(answerId, timer)
  }, [flushAnswer, persistPendingBackup, refreshSavingState])

  /**
   * Re-send everything that failed while offline. Resolves to whether all of
   * it made it this time.
   */
  const retryPending = useCallback(async (): Promise<boolean> => {
    const ids = [...pendingSync]
    if (ids.length === 0) return true
    setPendingSync(new Set())
    for (const id of ids) {
      const value = localAnswersRef.current[id]
      if (value !== undefined) pendingValuesRef.current.set(id, value)
    }
    const results = await Promise.all(ids.map(id => flushAnswer(id)))
    return results.every(Boolean)
  }, [pendingSync, flushAnswer])

  /** Drop the local backup once the attempt is committed. */
  const clearSavedAnswers = useCallback(() => {
    backupValuesRef.current.clear()
    try {
      localStorage.removeItem(LS_KEY(submissionId))
    } catch { /* ignore */ }
  }, [submissionId])

  // Restore anything the last session left behind. A differing local value is
  // treated as a write that may have missed the server (for example the tab
  // closed inside the debounce window), so it wins on this device and is
  // immediately queued for server sync instead of remaining a display-only
  // recovery that disappears on the next device/reload.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY(submissionId))
      if (!saved) return
      const savedAnswers: Record<string, string> = JSON.parse(saved)
      const current = localAnswersRef.current
      const merged = { ...current, ...savedAnswers }
      const restoredIds = Object.keys(savedAnswers).filter(id => savedAnswers[id] !== current[id])
      if (restoredIds.length === 0) {
        // The server already has the same values, so this backup is no longer dirty.
        backupValuesRef.current.clear()
        persistPendingBackup()
        return
      }
      for (const id of restoredIds) backupValuesRef.current.set(id, savedAnswers[id])
      persistPendingBackup()

      localAnswersRef.current = merged
      setLocalAnswers(merged)
      for (const id of restoredIds) pendingValuesRef.current.set(id, merged[id])

      if (navigator.onLine) {
        void Promise.all(restoredIds.map(id => flushAnswer(id)))
      } else {
        setPendingSync(prev => new Set([...prev, ...restoredIds]))
        refreshSavingState()
      }
    } catch { /* ignore corrupt data */ }
  }, [submissionId, flushAnswer, persistPendingBackup, refreshSavingState])

  useEffect(() => {
    localAnswersRef.current = localAnswers
  }, [localAnswers])

  // A debounce timer must not outlive this attempt view. Whatever it was about
  // to write is still in localStorage as a recovery fallback.
  useEffect(() => () => {
    for (const timer of saveTimersRef.current.values()) clearTimeout(timer)
    saveTimersRef.current.clear()
  }, [])

  return {
    localAnswers,
    localAnswersRef,
    setAnswer,
    flushAnswer,
    flushQueuedAnswers,
    retryPending,
    clearSavedAnswers,
    saving,
    pendingCount: pendingSync.size,
  }
}
