'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle, Save } from 'lucide-react'
import { toast } from 'sonner'
import { saveGradingReview, type SaveGradingReviewInput } from '@/lib/actions/grading-review'
import { editGradingScoreDraft, prepareGradingScoreDrafts, settleGradingScoreDrafts, type GradingScoreDraftSource, type GradingScoreDrafts, type GradingScoreKind } from '@/lib/grading-score-drafts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SavedScore {
  input: SaveGradingReviewInput
  revision: string | null
}
interface GradingBatchContextValue {
  dirtyCount: number
  busy: boolean
  canSave: boolean
  error: string
  hasUnsavedChanges: boolean
  awaitingRefresh: boolean
  refreshScores: () => void
  saveAll: () => Promise<boolean>
  discardChanges: () => void
  drafts: GradingScoreDrafts
  rowErrors: Record<string, string>
  awaiting: Record<string, SavedScore>
  registerSource: (source: GradingScoreDraftSource) => void
  edit: (source: GradingScoreDraftSource, kind: GradingScoreKind, value: string) => void
}
const GradingBatchContext = createContext<GradingBatchContextValue | null>(null)

export function useGradingBatch() {
  const context = useContext(GradingBatchContext)
  if (!context) throw new Error('GradingScoreFields requires GradingBatchProvider')
  return context
}

export interface GradingBatchProviderProps {
  assignmentId: string
  save?: typeof saveGradingReview
  disabled?: boolean
  children: ReactNode
  onDirtyChange?: (dirty: boolean) => void
}

/** Page-local drafts survive refreshed server rows; there is no cross-user or
 * persistent cache. The existing action authorizes and commits each answer. */
export function GradingBatchProvider({ assignmentId, save = saveGradingReview, disabled = false, children, onDirtyChange }: GradingBatchProviderProps) {
  const router = useRouter()
  const [drafts, setDrafts] = useState<GradingScoreDrafts>({})
  const draftsRef = useRef(drafts)
  const sources = useRef(new Map<string, GradingScoreDraftSource>())
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [writing, setWriting] = useState(false)
  const busyRef = useRef(false)
  const [refreshing, startRefresh] = useTransition()
  const [awaiting, setAwaiting] = useState<Record<string, SavedScore>>({})
  const awaitingRef = useRef(awaiting)
  const busy = writing || refreshing || Object.keys(awaiting).length > 0
  const awaitingRefresh = !writing && !refreshing && Object.keys(awaiting).length > 0
  const dirtyCount = Object.keys(drafts).length
  const hasUnsavedChanges = dirtyCount > 0 || busy

  function updateDrafts(next: GradingScoreDrafts) { draftsRef.current = next; setDrafts(next) }
  function updateAwaiting(next: Record<string, SavedScore>) { awaitingRef.current = next; setAwaiting(next) }

  const registerSource = useCallback((source: GradingScoreDraftSource) => {
    sources.current.set(source.answerId, source)
    const saved = awaitingRef.current[source.answerId]
    if (saved && source.scoreEditedAt !== saved.revision) {
      const next = { ...awaitingRef.current }
      delete next[source.answerId]
      awaitingRef.current = next; setAwaiting(next)
    }
  }, [])

  useEffect(() => { busyRef.current = busy }, [busy])
  useEffect(() => { onDirtyChange?.(hasUnsavedChanges) }, [hasUnsavedChanges, onDirtyChange])

  function edit(source: GradingScoreDraftSource, kind: GradingScoreKind, value: string) {
    if (disabled || busyRef.current || source.disabled) return
    sources.current.set(source.answerId, source)
    const next = { ...draftsRef.current }
    const draft = editGradingScoreDraft(next[source.answerId], source, kind, value)
    if (draft) next[source.answerId] = draft
    else delete next[source.answerId]
    updateDrafts(next)
    setRowErrors(previous => { const errors = { ...previous }; delete errors[source.answerId]; return errors })
    setError('')
  }

  function discardChanges() {
    if (busyRef.current) return
    updateDrafts({}); setRowErrors({}); setError('')
  }

  function refreshScores() {
    if (writing || refreshing) return
    startRefresh(() => router.refresh())
  }

  async function saveAll(): Promise<boolean> {
    if (disabled || busyRef.current) return false
    const submitted = draftsRef.current
    const prepared = prepareGradingScoreDrafts(assignmentId, submitted, sources.current)
    if (Object.keys(prepared.errors).length) {
      setRowErrors(prepared.errors); setError('กรุณาตรวจคะแนนที่ระบุ ก่อนบันทึกคะแนนทั้งหมด')
      return false
    }
    if (!prepared.inputs.length) return true
    busyRef.current = true; setWriting(true); setError(''); setRowErrors({})
    const successful = new Set<string>()
    const failed: Record<string, string> = {}
    for (const input of prepared.inputs) {
      try {
        const result = await save(input)
        if ('error' in result) { failed[input.answerId] = result.error; continue }
        successful.add(input.answerId)
        // Revalidation can deliver new server props before the action resolves.
        if (sources.current.get(input.answerId)?.scoreEditedAt === input.expectedScoreEditedAt) {
          updateAwaiting({ ...awaitingRef.current, [input.answerId]: { input, revision: input.expectedScoreEditedAt } })
        }
        updateDrafts(settleGradingScoreDrafts(draftsRef.current, submitted, successful))
      } catch {
        failed[input.answerId] = 'บันทึกคะแนนไม่สำเร็จ ร่างคะแนนยังอยู่ กรุณาลองใหม่'
      }
    }
    setRowErrors(failed)
    const failures = Object.keys(failed).length
    if (failures) setError(`บันทึกแล้ว ${successful.size} คำตอบ · อีก ${failures} คำตอบยังไม่สำเร็จ ร่างคะแนนยังอยู่`)
    else toast.success(`บันทึกคะแนนแล้ว ${successful.size} คำตอบ`)
    // Exactly one explicit refresh; failed drafts retain their first-edit CAS.
    startRefresh(() => router.refresh())
    setWriting(false)
    return failures === 0
  }

  const displayedError = awaitingRefresh
    ? [error, 'บันทึกคะแนนแล้ว แต่ยังโหลดคะแนนล่าสุดไม่ได้ กรุณากดโหลดคะแนนล่าสุดอีกครั้ง'].filter(Boolean).join(' · ')
    : error
  return <GradingBatchContext.Provider value={{ dirtyCount, busy, canSave: !disabled && !busy && dirtyCount > 0, error: displayedError, hasUnsavedChanges, awaitingRefresh, refreshScores, saveAll, discardChanges, drafts, rowErrors, awaiting, registerSource, edit }}>{children}</GradingBatchContext.Provider>
}

/** One instance belongs in the page toolbar, never inside an answer row. */
export function GradingBatchSaveButton({ className }: { className?: string }) {
  const { busy, canSave, dirtyCount, saveAll, awaitingRefresh, refreshScores } = useGradingBatch()
  return <Button type="button" size="sm" className={cn('pointer-coarse:min-h-11', className)} disabled={!canSave && !awaitingRefresh} onClick={() => { if (awaitingRefresh) refreshScores(); else void saveAll() }}>
    {busy && !awaitingRefresh ? <LoaderCircle data-icon="inline-start" className="motion-safe:animate-spin" /> : <Save data-icon="inline-start" />}
    {awaitingRefresh ? 'โหลดคะแนนล่าสุดอีกครั้ง' : busy ? 'กำลังบันทึกคะแนน' : 'บันทึกคะแนนทั้งหมด'}{dirtyCount > 0 && !busy ? ` (${dirtyCount})` : ''}
  </Button>
}
