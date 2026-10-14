'use client'

import { useCallback, useEffect, useState } from 'react'
import { PracticeLibraryView } from '@/components/practice/practice-library-view'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  changeLocalPracticeExercise, changeLocalPracticePin, EMPTY_PRACTICE_LOCAL_REVIEW,
  localPracticeExercises, practiceLocalReviewSchema, type PracticeLocalReview,
} from '@/lib/practice-local-review'
import { PRACTICE_PAGE_SIZE, practiceTotalPages, type PracticeSearchState } from '@/lib/practice-search'
import type { PracticeQuestionListItem, StudentPracticeLibrary } from '@/lib/practice-question-access.server'
import type { getPracticeAttachedSolution } from '@/lib/actions/practice-exercises'
import type { buildPracticeSearchHref, buildPracticeQuestionHref } from '@/lib/practice-search'

export function PracticeLocalLibraryView({ library, items, matchingIds, state, storageOwnerId, solutionLoader, libraryHrefBuilder, questionHrefBuilder, searchHiddenFields }: {
  library: StudentPracticeLibrary
  items: PracticeQuestionListItem[]
  matchingIds: string[]
  state: PracticeSearchState
  storageOwnerId: string
  solutionLoader?: (questionId: string) => ReturnType<typeof getPracticeAttachedSolution>
  libraryHrefBuilder?: typeof buildPracticeSearchHref
  questionHrefBuilder?: typeof buildPracticeQuestionHref
  searchHiddenFields?: Record<string, string>
}) {
  const storageKey = `korkru:practice-local-review:${storageOwnerId}:${library.id}`
  const [stored, setStored] = useState<PracticeLocalReview>(EMPTY_PRACTICE_LOCAL_REVIEW)
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const readStored = useCallback(() => {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey) || JSON.stringify(EMPTY_PRACTICE_LOCAL_REVIEW))
    return practiceLocalReviewSchema.parse(raw)
  }, [storageKey])
  useEffect(() => {
    function hydrate() {
      try { setStored(readStored()); setStorageError(false); setReady(true) }
      catch { setStorageError(true); setReady(false) }
    }
    hydrate()
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) hydrate() }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storageKey, readStored])
  function commit(next: PracticeLocalReview) {
    localStorage.setItem(storageKey, JSON.stringify(next))
    setStored(next)
  }
  const groups = localPracticeExercises(stored, items)
  const active = groups.find(group => group.id === state.exerciseId)
  const matched = new Set(matchingIds)
  const pins = new Set(stored.pinnedQuestionIds)
  let visible = items.filter(item => matched.has(item.id) && (active ? active.questionIds.includes(item.id)
    : !state.reviewOnly || pins.has(item.id)))
  if (active) visible = [...visible].sort((a, b) => active.questionIds.indexOf(a.id) - active.questionIds.indexOf(b.id))
    .map((item, position) => ({ ...item, position }))
  const totalPages = practiceTotalPages(visible.length)
  const page = Math.min(state.page, totalPages)
  const missingGroup = ready && state.exerciseId && !active
  return <div className="flex min-w-0 w-full max-w-[1200px] flex-col gap-2">
    <Alert className="w-full px-3 py-2 text-xs">
      <AlertDescription>ตรวจโลคอล · ชุดฝึกและหมุดเก็บในเบราว์เซอร์นี้ ยังไม่ซิงก์ข้ามอุปกรณ์</AlertDescription>
    </Alert>
    {storageError && <p role="alert" className="w-full text-sm text-destructive">ยังอ่านข้อมูลแบบฝึกหัดในเบราว์เซอร์ไม่ได้ กรุณาตรวจการอนุญาตพื้นที่จัดเก็บแล้วโหลดหน้าใหม่</p>}
    {missingGroup && <p role="alert" className="w-full text-sm text-muted-foreground">ไม่พบชุดนี้ในเบราว์เซอร์นี้ เลือกชุดจากแบบฝึกหัดของฉันหรือกลับไปดูโจทย์ทั้งหมดได้</p>}
    {!ready && !storageError ? <p role="status" className="w-full text-sm text-muted-foreground">กำลังโหลดแบบฝึกหัดที่บันทึกในเบราว์เซอร์…</p> : <PracticeLibraryView library={library} items={missingGroup ? [] : visible.slice((page - 1) * PRACTICE_PAGE_SIZE, page * PRACTICE_PAGE_SIZE)}
      total={missingGroup ? 0 : visible.length} totalPages={totalPages} state={{ ...state, page }} storageOwnerId={storageOwnerId}
      exercises={groups} exercisesReady={ready} pinnedQuestionIds={stored.pinnedQuestionIds} pinsReady={ready} solutionLoader={solutionLoader}
      libraryHrefBuilder={libraryHrefBuilder} questionHrefBuilder={questionHrefBuilder} searchHiddenFields={searchHiddenFields}
      createExerciseAction={async input => {
        try {
          const result = changeLocalPracticeExercise(readStored(), library.id, items, input, false)
          if (!result.ok) return result
          commit(result.state)
          return { ok: true }
        } catch { return { ok: false, error: 'ยังบันทึกในเบราว์เซอร์ไม่ได้ กรุณาลองอีกครั้ง' } }
      }}
      updateExerciseAction={async input => {
        try {
          const current = readStored()
          const result = changeLocalPracticeExercise(current, library.id, items, input, true)
          if (!result.ok) { setStored(current); return result }
          commit(result.state)
          return { ok: true }
        } catch { return { ok: false, error: 'ยังบันทึกในเบราว์เซอร์ไม่ได้ กรุณาลองอีกครั้ง' } }
      }}
      pinAction={async input => {
        try {
          const result = changeLocalPracticePin(readStored(), library.id, items, input)
          if (!result.ok) return result
          commit(result.state)
          return { ok: true }
        } catch { return { ok: false, error: 'ยังบันทึกในเบราว์เซอร์ไม่ได้ กรุณาลองอีกครั้ง' } }
      }}
    />}
  </div>
}
