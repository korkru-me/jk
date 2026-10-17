'use client'

import { useEffect, useRef, useState } from 'react'
import { rerollCheckedRandomAnswer } from '@/lib/actions/submissions'
import type { SafeExamAnswer } from '@/lib/exam-safe'
import type { Question } from '@/lib/types'
import type { RandomValues } from '@/lib/math/fresh-random-values'
import { drawsRandomValues } from '@/lib/math/shared-random'
import { readVisibleRandomValues, rememberVisibleRandomValues, visibleRandomValueStorage } from '@/lib/math/visible-random-values'

type Change = { id: string; values: RandomValues; correctAnswer?: string }
let documentReloadConsumed = false

/** Deliberate client POST on a document reload. RSC GET/prefetch stays read-only. */
export function useRefreshRandomAnswers({ answers, previewMode, ownerId, flush, onReplace }: {
  answers: SafeExamAnswer[]
  previewMode: boolean
  ownerId: string
  flush: () => Promise<{ ok: boolean; error?: string }>
  onReplace: (change: Change) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const completed = useRef(new Set<string>())
  const flight = useRef<Promise<{ changes: Change[]; error?: string }> | null>(null)
  const handledGeneration = useRef(-1)
  useEffect(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const identity = (id: string) => JSON.stringify([ownerId, location.pathname, id])
    const previous = Object.fromEntries(answers.map(answer => [answer.id, readVisibleRandomValues(visibleRandomValueStorage(), identity(answer.question_id))]))
    if (navigation?.type !== 'reload') {
      for (const answer of answers) rememberVisibleRandomValues(visibleRandomValueStorage(), identity(answer.question_id), answer.random_values ?? {})
      return
    }
    if (new URL(navigation.name).pathname !== location.pathname || handledGeneration.current === retry) return
    if (!flight.current && retry === 0) {
      if (documentReloadConsumed) return
      documentReloadConsumed = true
    }
    const random = answers.filter(answer => answer.questions.question_type === 'written' && Object.keys(answer.random_values ?? {}).length && !completed.current.has(answer.id))
    if (!random.length) return
    let cancelled = false
    setBusy(true)
    setError('')
    if (!flight.current) flight.current = (async () => {
      const changes: Change[] = []
      const saved = await flush()
      if (!saved.ok) return { changes, error: saved.error ?? 'ยังบันทึกคำตอบเดิมไม่สำเร็จ' }
      for (const answer of random) {
        try {
          if (previewMode) {
            const { buildFreshRandomQuestion } = await import('@/lib/assignment-attempt')
            const next = buildFreshRandomQuestion({ id: answer.question_id, ...answer.questions } as unknown as Question, previous[answer.id] ?? answer.random_values)
            if (next) changes.push({ id: answer.id, values: next.random_values, correctAnswer: next.correct_answer })
            else if (drawsRandomValues(answer.questions)) return { changes, error: 'ยังสุ่มตัวเลขชุดใหม่ไม่ได้ กรุณาตรวจช่วงค่าตัวแปร' }
          } else {
            const result = await rerollCheckedRandomAnswer(answer.id, 'refresh', answer.random_values)
            if ('error' in result) return { changes, error: result.error }
            if (result.rerolled) changes.push({ id: answer.id, values: result.randomValues })
          }
          completed.current.add(answer.id)
        } catch { return { changes, error: 'การสุ่มตัวเลขชุดใหม่สะดุด กรุณาลองอีกครั้ง' } }
      }
      return { changes }
    })().catch(() => ({ changes: [], error: 'การสุ่มตัวเลขชุดใหม่สะดุด กรุณาลองอีกครั้ง' }))
    void flight.current.then(result => {
      if (cancelled) return
      handledGeneration.current = retry
      for (const change of result.changes) {
        onReplace(change)
        const answer = answers.find(answer => answer.id === change.id)
        if (answer) rememberVisibleRandomValues(visibleRandomValueStorage(), identity(answer.question_id), change.values)
      }
      setError(result.error ?? '')
      setBusy(false)
    })
    return () => { cancelled = true }
  }, [answers, previewMode, ownerId, flush, onReplace, retry])
  return { busy, error, retry: () => { flight.current = null; setRetry(value => value + 1) } }
}
