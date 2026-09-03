'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { saveAnswer } from '@/lib/actions/submissions'
import { callIdempotentAction } from '@/lib/retry-action'
import type { MathInputModes } from '@/lib/math/input-mode'
import {
  copyMathInputModes,
  parseAnswerBackup,
  sameAnswerPayload,
  serializeAnswerBackup,
  type PendingAnswerPayload,
} from '@/lib/math/answer-backup'
import type { MathInputMode } from '@/lib/types'

const LS_KEY = (submissionId: string) => `korkru_exam_${submissionId}`
const DEBOUNCE_MS = 500

export interface SaveOutcome {
  ok: boolean
  error?: string
}

const SAVED: SaveOutcome = { ok: true }

function combineOutcomes(outcomes: SaveOutcome[]): SaveOutcome {
  if (outcomes.every(outcome => outcome.ok)) return SAVED
  return { ok: false, error: outcomes.find(outcome => !outcome.ok && outcome.error)?.error }
}

interface Options {
  submissionId: string
  /** Lazy initial values, keyed by answer id — usually derived from DB rows. */
  initialAnswers: () => Record<string, string>
  /** DEG/RAD per logical numeric input, grouped by answer id. */
  initialMathInputModes?: () => Record<string, MathInputModes>
  /** Teacher preview keeps local behaviour but never writes a submission row. */
  previewMode?: boolean
}

/**
 * Owns in-progress answer text and its angle-mode metadata as one atomic save.
 * Both are backed up locally, coalesced, chained per answer, and retried after
 * a dropped request so a RAD answer cannot later be graded as legacy DEG.
 */
export function useAnswerAutosave({
  submissionId,
  initialAnswers,
  initialMathInputModes,
  previewMode = false,
}: Options) {
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>(initialAnswers)
  const [localMathInputModes, setLocalMathInputModes] = useState<Record<string, MathInputModes>>(
    () => initialMathInputModes?.() ?? {},
  )
  const [pendingSync, setPendingSync] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const localAnswersRef = useRef(localAnswers)
  const localMathInputModesRef = useRef(localMathInputModes)
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pendingRef = useRef<Map<string, PendingAnswerPayload>>(new Map())
  const inFlightRef = useRef<Map<string, Promise<SaveOutcome>>>(new Map())
  const backupRef = useRef<Map<string, PendingAnswerPayload>>(new Map())

  const currentPayload = useCallback((answerId: string): PendingAnswerPayload => ({
    value: localAnswersRef.current[answerId] ?? '',
    mathInputModes: copyMathInputModes(localMathInputModesRef.current[answerId]),
  }), [])

  const persistPendingBackup = useCallback(() => {
    try {
      if (backupRef.current.size === 0) {
        localStorage.removeItem(LS_KEY(submissionId))
        return
      }
      localStorage.setItem(LS_KEY(submissionId), serializeAnswerBackup(backupRef.current))
    } catch { /* ignore quota errors */ }
  }, [submissionId])

  const refreshSavingState = useCallback(() => {
    setSaving(
      saveTimersRef.current.size > 0
      || pendingRef.current.size > 0
      || inFlightRef.current.size > 0,
    )
  }, [])

  const flushAnswer = useCallback((answerId: string): Promise<SaveOutcome> => {
    const timer = saveTimersRef.current.get(answerId)
    if (timer) clearTimeout(timer)
    saveTimersRef.current.delete(answerId)

    const payload = pendingRef.current.get(answerId)
    const existing = inFlightRef.current.get(answerId)
    if (!payload) return existing ?? Promise.resolve(SAVED)
    pendingRef.current.delete(answerId)

    const markSaved = (): SaveOutcome => {
      const queued = pendingRef.current.get(answerId)
      if (sameAnswerPayload(queued, payload)) pendingRef.current.delete(answerId)
      setPendingSync(previous => {
        if (!previous.has(answerId) || pendingRef.current.has(answerId)) return previous
        const next = new Set(previous)
        next.delete(answerId)
        return next
      })
      if (sameAnswerPayload(backupRef.current.get(answerId), payload) && !pendingRef.current.has(answerId)) {
        backupRef.current.delete(answerId)
        persistPendingBackup()
      }
      return SAVED
    }

    const markUnsaved = (error?: string): SaveOutcome => {
      const latest = currentPayload(answerId)
      if (!pendingRef.current.has(answerId)) pendingRef.current.set(answerId, latest)
      backupRef.current.set(answerId, latest)
      persistPendingBackup()
      setPendingSync(previous => new Set(previous).add(answerId))
      return { ok: false, error }
    }

    const task = (existing ?? Promise.resolve(SAVED))
      .catch(() => SAVED)
      .then(async () => {
        if (previewMode) return markSaved()
        const call = await callIdempotentAction(() => saveAnswer(
          answerId,
          payload.value,
          payload.mathInputModes,
        ))
        if (!call.ok) return markUnsaved()
        if (call.data.error) return markUnsaved(call.data.error)
        return markSaved()
      })
      .catch(() => markUnsaved())
      .finally(() => {
        if (inFlightRef.current.get(answerId) === task) inFlightRef.current.delete(answerId)
        refreshSavingState()
      })

    inFlightRef.current.set(answerId, task)
    setSaving(true)
    return task
  }, [currentPayload, persistPendingBackup, previewMode, refreshSavingState])

  const scheduleSave = useCallback((answerId: string, payload: PendingAnswerPayload) => {
    pendingRef.current.set(answerId, payload)
    backupRef.current.set(answerId, payload)
    persistPendingBackup()

    const existingTimer = saveTimersRef.current.get(answerId)
    if (existingTimer) clearTimeout(existingTimer)

    if (!navigator.onLine) {
      setPendingSync(previous => new Set(previous).add(answerId))
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

  const flushQueuedAnswers = useCallback(async (): Promise<SaveOutcome> => {
    const queuedIds = [...pendingRef.current.keys()]
    const queuedResults = await Promise.all(queuedIds.map(id => flushAnswer(id)))
    const inFlightResults = await Promise.all([...inFlightRef.current.values()])
    return combineOutcomes([...queuedResults, ...inFlightResults])
  }, [flushAnswer])

  const setAnswer = useCallback((answerId: string, value: string) => {
    localAnswersRef.current = { ...localAnswersRef.current, [answerId]: value }
    setLocalAnswers(previous => ({ ...previous, [answerId]: value }))
    scheduleSave(answerId, currentPayload(answerId))
  }, [currentPayload, scheduleSave])

  const setMathInputMode = useCallback((answerId: string, partKey: string, mode: MathInputMode) => {
    const answerModes = {
      ...(localMathInputModesRef.current[answerId] ?? {}),
      [partKey]: mode,
    }
    localMathInputModesRef.current = {
      ...localMathInputModesRef.current,
      [answerId]: answerModes,
    }
    setLocalMathInputModes(previous => ({ ...previous, [answerId]: answerModes }))
    scheduleSave(answerId, currentPayload(answerId))
  }, [currentPayload, scheduleSave])

  const retryPending = useCallback(async (): Promise<SaveOutcome> => {
    const ids = [...pendingSync]
    if (ids.length === 0) return SAVED
    setPendingSync(new Set())
    for (const id of ids) pendingRef.current.set(id, currentPayload(id))
    return combineOutcomes(await Promise.all(ids.map(id => flushAnswer(id))))
  }, [currentPayload, flushAnswer, pendingSync])

  const clearSavedAnswers = useCallback(() => {
    backupRef.current.clear()
    try {
      localStorage.removeItem(LS_KEY(submissionId))
    } catch { /* ignore */ }
  }, [submissionId])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY(submissionId))
      if (!saved) return
      const entries = parseAnswerBackup(saved)
      const restoredIds = Object.keys(entries).filter((answerId) => {
        const serverPayload: PendingAnswerPayload = {
          value: localAnswersRef.current[answerId] ?? '',
          mathInputModes: localMathInputModesRef.current[answerId] ?? {},
        }
        return !sameAnswerPayload(serverPayload, entries[answerId])
      })
      if (restoredIds.length === 0) {
        backupRef.current.clear()
        persistPendingBackup()
        return
      }

      const nextAnswers = { ...localAnswersRef.current }
      const nextModes = { ...localMathInputModesRef.current }
      for (const answerId of restoredIds) {
        const payload = entries[answerId]
        nextAnswers[answerId] = payload.value
        nextModes[answerId] = copyMathInputModes(payload.mathInputModes)
        backupRef.current.set(answerId, payload)
        pendingRef.current.set(answerId, payload)
      }
      localAnswersRef.current = nextAnswers
      localMathInputModesRef.current = nextModes
      setLocalAnswers(nextAnswers)
      setLocalMathInputModes(nextModes)
      persistPendingBackup()

      if (navigator.onLine) void Promise.all(restoredIds.map(id => flushAnswer(id)))
      else {
        setPendingSync(previous => new Set([...previous, ...restoredIds]))
        refreshSavingState()
      }
    } catch { /* ignore corrupt data */ }
  }, [flushAnswer, persistPendingBackup, refreshSavingState, submissionId])

  useEffect(() => () => {
    for (const timer of saveTimersRef.current.values()) clearTimeout(timer)
    saveTimersRef.current.clear()
  }, [])

  return {
    localAnswers,
    localAnswersRef,
    localMathInputModes,
    localMathInputModesRef,
    setAnswer,
    setMathInputMode,
    flushAnswer,
    flushQueuedAnswers,
    retryPending,
    clearSavedAnswers,
    saving,
    pendingCount: pendingSync.size,
  }
}
