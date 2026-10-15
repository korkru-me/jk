'use client'

import { useEffect, useRef, useState } from 'react'
import { PracticeQuestionRunner } from './practice-question-runner'
import { getPracticeRunQuestion } from '@/lib/actions/practice-exercises'
import type { PracticeRunQuestion, PracticeRunQuestionLoader, PracticeRunAnswerAction } from '@/lib/practice-run'
import { readPracticeVisibleValues, rememberPracticeVisibleValues } from '@/lib/practice-visible-variant'
import { visibleRandomValueStorage } from '@/lib/math/visible-random-values'
import { sameRandomValues } from '@/lib/math/fresh-random-values'
import { Button } from '@/components/ui/button'

export function PracticeSingleQuestionRunner({ initial, libraryId, libraryTitle, storageOwnerId, returnHref, questionLoader = getPracticeRunQuestion, checkAction }: {
  initial: PracticeRunQuestion
  libraryId: string
  libraryTitle: string
  storageOwnerId: string
  returnHref: string
  questionLoader?: PracticeRunQuestionLoader
  checkAction?: PracticeRunAnswerAction
}) {
  const [question, setQuestion] = useState(initial)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const visibleValues = useRef(initial.question.random_values)
  useEffect(() => {
    let cancelled = false
    const id = initial.question.question_id
    const previous = nonce > 0 ? visibleValues.current : readPracticeVisibleValues(visibleRandomValueStorage(), storageOwnerId, libraryId, id)
    const reload = nonce > 0 || (previous && initial.changesOnRefresh && sameRandomValues(previous, initial.question.random_values))
    async function load() {
      setReady(false)
      setError('')
      const result = reload ? await questionLoader(libraryId, id, previous) : { ok: true as const, data: initial }
      if (cancelled) return
      if (!result.ok) { setError(result.error); return }
      rememberPracticeVisibleValues(visibleRandomValueStorage(), storageOwnerId, libraryId, id, result.data.question.random_values)
      visibleValues.current = result.data.question.random_values
      setQuestion(result.data)
      setReady(true)
    }
    void load().catch(() => { if (!cancelled) setError('ยังสุ่มโจทย์ชุดใหม่ไม่ได้ กรุณาลองอีกครั้ง') })
    return () => { cancelled = true }
  }, [initial, libraryId, storageOwnerId, nonce, questionLoader])
  if (error) return <div className="flex flex-col gap-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button size="sm" variant="outline" onClick={() => setNonce(value => value + 1)}>ลองอีกครั้ง</Button></div>
  if (!ready) return <p role="status" className="text-sm text-muted-foreground">กำลังเปิดโจทย์ชุดใหม่…</p>
  return <PracticeQuestionRunner key={question.variantReceipt} libraryId={libraryId} libraryTitle={libraryTitle} question={question.question} variantReceipt={question.variantReceipt}
    changesOnRefresh={question.changesOnRefresh} calculatorEnabled={question.calculatorEnabled} scratchpadEnabled={question.scratchpadEnabled}
    storageOwnerId={storageOwnerId} returnHref={returnHref} checkAction={checkAction} onReload={() => setNonce(value => value + 1)} />
}
