'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { FilePenLine, LoaderCircle, Save } from 'lucide-react'
import { toast } from 'sonner'
import { saveGradingDrafts, publishGradingDrafts } from '@/lib/actions/grading-drafts'
import type { SaveGradingReviewInput } from '@/lib/actions/grading-review'
import type { GradingSavedDraft, SaveGradingDraftsInput } from '@/lib/grading-draft-types'
import { combinedGradingDrafts, editPrivateGradingDraft } from '@/lib/grading-private-drafts'
import { prepareGradingScoreDrafts, settleGradingScoreDrafts, type GradingScoreDraftSource, type GradingScoreDrafts, type GradingScoreKind } from '@/lib/grading-score-drafts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'

interface SavedScore { input: SaveGradingReviewInput; revision: string | null }
interface PendingRequest { mode: 'draft' | 'publish'; input: SaveGradingDraftsInput; edits: GradingScoreDrafts }
interface GradingBatchContextValue {
  dirtyCount: number
  unpublishedCount: number
  savedDrafts: Record<string, GradingSavedDraft>
  busy: boolean
  workflowDisabled: boolean
  canSave: boolean
  error: string
  hasUnsavedChanges: boolean
  awaitingRefresh: boolean
  uncertain: boolean
  writing: boolean
  refreshScores: () => void
  saveDraft: () => Promise<boolean>
  saveAll: () => Promise<boolean>
  retryWrite: () => Promise<boolean>
  discardChanges: () => void
  drafts: GradingScoreDrafts
  unsavedDrafts: GradingScoreDrafts
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
  sources?: GradingScoreDraftSource[]
  savedDrafts?: GradingSavedDraft[]
  saveDrafts?: typeof saveGradingDrafts
  publish?: typeof publishGradingDrafts
  publishSuccessHref?: string
  disabled?: boolean
  children: ReactNode
  onDirtyChange?: (dirty: boolean) => void
}

export function GradingBatchProvider({ assignmentId, sources: suppliedSources, savedDrafts: initialSaved = [], saveDrafts = saveGradingDrafts, publish = publishGradingDrafts, publishSuccessHref, disabled = false, children, onDirtyChange }: GradingBatchProviderProps) {
  const router = useRouter()
  const initialSources = suppliedSources ?? []
  const sources = useRef(new Map(initialSources.map(source => [source.answerId, source])))
  // All official score summaries are available, including rows beyond page 1.
  if (suppliedSources) sources.current = new Map(initialSources.map(source => [source.answerId, source]))
  const [edits, setEdits] = useState<GradingScoreDrafts>({})
  const editsRef = useRef(edits)
  const [savedDrafts, setSavedDrafts] = useState<Record<string, GradingSavedDraft>>(() => Object.fromEntries(initialSaved.filter(draft => sources.current.has(draft.answerId)).map(draft => [draft.answerId, draft])))
  const savedRef = useRef(savedDrafts)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [writing, setWriting] = useState(false)
  const writingRef = useRef(false)
  const [uncertain, setUncertain] = useState(false)
  const uncertainRef = useRef(false)
  const request = useRef<PendingRequest | null>(null)
  const [refreshing, startRefresh] = useTransition()
  const [awaiting, setAwaiting] = useState<Record<string, SavedScore>>({})
  const awaitingRef = useRef(awaiting)
  const busy = writing || uncertain || refreshing || Object.keys(awaiting).length > 0
  const busyRef = useRef(busy)
  const awaitingRefresh = !writing && !uncertain && !refreshing && Object.keys(awaiting).length > 0
  const dirtyCount = Object.keys(edits).length
  const drafts = combinedGradingDrafts(edits, savedDrafts, sources.current)
  const unpublishedCount = Object.keys(drafts).length
  const hasUnsavedChanges = dirtyCount > 0 || busy

  function updateEdits(next: GradingScoreDrafts) { editsRef.current = next; setEdits(next) }
  function updateSaved(next: Record<string, GradingSavedDraft>) { savedRef.current = next; setSavedDrafts(next) }
  function updateAwaiting(next: Record<string, SavedScore>) { awaitingRef.current = next; setAwaiting(next) }

  const registerSource = useCallback((source: GradingScoreDraftSource) => {
    sources.current.set(source.answerId, source)
    const saved = awaitingRef.current[source.answerId]
    if (saved && source.scoreEditedAt === saved.revision) {
      const next = { ...awaitingRef.current }; delete next[source.answerId]
      awaitingRef.current = next; setAwaiting(next)
    }
  }, [])
  const sourceVersion = JSON.stringify(initialSources)
  useEffect(() => {
    for (const source of initialSources) registerSource(source)
    if (suppliedSources) {
      const next = { ...awaitingRef.current }
      let removed = false
      for (const id of Object.keys(next)) if (!sources.current.has(id)) { delete next[id]; removed = true }
      if (removed) updateAwaiting(next)
    }
    // Includes off-page rows after a uniform grade publication.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceVersion, registerSource])
  const savedVersion = JSON.stringify(initialSaved)
  useEffect(() => {
    if (writingRef.current || uncertainRef.current) return
    const incoming = Object.fromEntries(initialSaved.filter(draft => sources.current.has(draft.answerId)).map(draft => [draft.answerId, draft]))
    // A refreshed baseline cannot rebase edits already made against an older CAS.
    for (const id of Object.keys(editsRef.current)) {
      if (savedRef.current[id]) incoming[id] = savedRef.current[id]
      else delete incoming[id]
    }
    updateSaved(incoming)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedVersion, sourceVersion])
  useEffect(() => { busyRef.current = busy }, [busy])
  useEffect(() => { onDirtyChange?.(hasUnsavedChanges) }, [hasUnsavedChanges, onDirtyChange])

  function edit(source: GradingScoreDraftSource, kind: GradingScoreKind, value: string) {
    if (disabled || busyRef.current || source.disabled) return
    sources.current.set(source.answerId, source)
    updateEdits(editPrivateGradingDraft(editsRef.current, source, savedRef.current[source.answerId], kind, value))
    setRowErrors(previous => { const next = { ...previous }; delete next[source.answerId]; return next }); setError('')
  }
  function discardChanges() {
    if (busyRef.current) return
    updateEdits({}); setRowErrors({}); setError('')
  }
  function refreshScores() {
    if (writingRef.current || uncertainRef.current || refreshing) return
    startRefresh(() => router.refresh())
  }

  async function perform(pending: PendingRequest): Promise<boolean> {
    writingRef.current = true; busyRef.current = true; setWriting(true); setError(''); setRowErrors({})
    let returnHref: string | undefined
    try {
      const result = pending.mode === 'publish'
        ? await publish({ ...pending.input, confirmed: true })
        : await saveDrafts(pending.input)
      if ('error' in result) {
        const ambiguous = result.code === 'connection'
        uncertainRef.current = ambiguous; setUncertain(ambiguous)
        setError(ambiguous ? 'ยังยืนยันผลการบันทึกไม่ได้ กรุณาลองคำสั่งเดิมอีกครั้ง คะแนนที่กรอกยังอยู่' : result.error)
        if (!ambiguous) request.current = null
        return false
      }
      const nextSaved = { ...savedRef.current }
      for (const id of result.deletedDraftIds) delete nextSaved[id]
      if ('drafts' in result) for (const draft of result.drafts) nextSaved[draft.answerId] = draft
      updateSaved(nextSaved)
      const remainingEdits = settleGradingScoreDrafts(editsRef.current, pending.edits, new Set(pending.input.items.map(item => item.answerId)))
      updateEdits(remainingEdits)
      if ('published' in result) {
        const nextAwaiting = { ...awaitingRef.current }
        for (const row of result.published) {
          const item = pending.input.items.find(item => item.answerId === row.answerId)!
          if ((!suppliedSources || sources.current.has(row.answerId)) && sources.current.get(row.answerId)?.scoreEditedAt !== row.scoreEditedAt) nextAwaiting[row.answerId] = { input: { assignmentId, answerId: item.answerId, expectedScoreEditedAt: item.expectedScoreEditedAt, ...(item.answerScore === undefined ? {} : { answerScore: item.answerScore }), ...(item.workScore === undefined ? {} : { workScore: item.workScore }) }, revision: row.scoreEditedAt }
        }
        updateAwaiting(nextAwaiting)
        toast.success(`บันทึกคะแนนแล้ว ${result.published.length} คำตอบ · แจ้งนักเรียน ${result.notificationCount} คน`)
      } else toast.success('บันทึกร่างแล้ว · ยังไม่ส่งคะแนนให้นักเรียน')
      request.current = null; uncertainRef.current = false; setUncertain(false)
      // Only an acknowledged publication finishes this review. Draft saves,
      // failed/uncertain requests and any newer edits must stay on this page.
      returnHref = 'published' in result && Object.keys(remainingEdits).length === 0 ? publishSuccessHref : undefined
    } catch {
      uncertainRef.current = true; setUncertain(true)
      setError('ยังยืนยันผลการบันทึกไม่ได้ กรุณาลองคำสั่งเดิมอีกครั้ง คะแนนที่กรอกยังอยู่')
      return false
    } finally { writingRef.current = false; setWriting(false) }
    // Navigation errors must not turn a confirmed write into an uncertain RPC.
    startRefresh(() => returnHref ? router.replace(returnHref) : router.refresh())
    return true
  }
  async function write(mode: PendingRequest['mode']): Promise<boolean> {
    if (disabled || busyRef.current) return false
    const merged = combinedGradingDrafts(editsRef.current, savedRef.current, sources.current)
    const selected = mode === 'draft' ? Object.fromEntries(Object.entries(merged).filter(([id]) => !!editsRef.current[id])) : merged
    const prepared = prepareGradingScoreDrafts(assignmentId, selected, sources.current)
    if (Object.keys(prepared.errors).length) {
      setRowErrors(prepared.errors); setError('กรุณาตรวจคะแนนที่ระบุ ก่อนบันทึกคะแนนทั้งหมด'); return false
    }
    const items = prepared.inputs.map(({ assignmentId: _, ...item }) => ({ ...item, expectedDraftUpdatedAt: savedRef.current[item.answerId]?.updatedAt ?? null }))
    if (!items.length) return true
    const pending = { mode, input: { assignmentId, requestId: crypto.randomUUID(), items }, edits: editsRef.current }
    request.current = pending
    return perform(pending)
  }
  async function retryWrite() {
    if (!request.current || writingRef.current) return false
    return perform(request.current)
  }
  const displayedError = awaitingRefresh ? [error, 'บันทึกคะแนนแล้ว แต่ยังโหลดคะแนนล่าสุดไม่ได้ กรุณากดโหลดคะแนนล่าสุดอีกครั้ง'].filter(Boolean).join(' · ') : error
  return <GradingBatchContext.Provider value={{ dirtyCount, unpublishedCount, savedDrafts, busy, workflowDisabled: disabled, canSave: !disabled && !busy && unpublishedCount > 0, error: displayedError, hasUnsavedChanges, awaitingRefresh, uncertain, writing, refreshScores, saveDraft: () => write('draft'), saveAll: () => write('publish'), retryWrite, discardChanges, drafts, unsavedDrafts: edits, rowErrors, awaiting, registerSource, edit }}>{children}</GradingBatchContext.Provider>
}

/** Private persistence and student publication are distinct explicit actions. */
export function GradingBatchSaveButton({ className }: { className?: string }) {
  const batch = useGradingBatch()
  const [confirm, setConfirm] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const focus = useRef<HTMLElement | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  return <div className={cn('flex flex-wrap items-center justify-end gap-1.5', className)}>
    {batch.awaitingRefresh ? <Button size="sm" variant="outline" className="pointer-coarse:min-h-11" onClick={batch.refreshScores}>โหลดคะแนนล่าสุดอีกครั้ง</Button> : batch.uncertain ? <Button size="sm" className="pointer-coarse:min-h-11" disabled={batch.writing} onClick={() => void batch.retryWrite()}>ลองคำสั่งเดิมอีกครั้ง</Button> : <>
      <Button type="button" size="sm" variant="outline" className="pointer-coarse:min-h-11" disabled={batch.workflowDisabled || batch.busy || !batch.dirtyCount} aria-label="บันทึกร่างคะแนน" title="บันทึกร่างคะแนน โดยยังไม่ส่งให้นักเรียน" onClick={() => void batch.saveDraft()}><FilePenLine data-icon="inline-start" />บันทึกร่าง</Button>
      <Button type="button" size="sm" className="pointer-coarse:min-h-11" aria-label="บันทึกและแจ้งนักเรียน" title="บันทึกและแจ้งคะแนนนักเรียน" disabled={!batch.canSave} onClick={event => { trigger.current = event.currentTarget; setConfirm(true) }}>{batch.busy ? <LoaderCircle data-icon="inline-start" className="motion-safe:animate-spin" /> : <Save data-icon="inline-start" />}ส่งคะแนน{batch.unpublishedCount > 0 ? ` (${batch.unpublishedCount})` : ''}</Button>
    </>}
    <Dialog open={confirm} onOpenChangeComplete={open => {
      if (!open) requestAnimationFrame(() => {
        if (trigger.current?.isConnected && !trigger.current.disabled) trigger.current.focus({ preventScroll: true })
      })
    }} onOpenChange={(next, details) => {
      if (!next && (details.reason === 'outside-press' || details.reason === 'escape-key')) { details.cancel(); focus.current = document.activeElement as HTMLElement; setConfirmClose(true); return }
      if (!batch.busy && !next) setConfirm(false)
    }}>
      <DialogContent showCloseButton={false} finalFocus={trigger} className="gap-3 sm:max-w-md">
        <DialogHeader><DialogTitle>บันทึกและแจ้งคะแนนนักเรียน?</DialogTitle><DialogDescription>กำลังบันทึก {batch.unpublishedCount} คำตอบเป็นคะแนนจริง นักเรียนจะได้รับแจ้งว่าครูตรวจคะแนนแล้ว และเห็นคะแนนตามการตั้งค่าการแสดงผลของงาน หากยังตรวจไม่เสร็จ ให้กลับไปบันทึกร่างคะแนนก่อน</DialogDescription></DialogHeader>
        <DialogFooter className="flex-row flex-wrap gap-2 py-3"><Button variant="outline" className="pointer-coarse:min-h-11" disabled={batch.busy} onClick={() => setConfirm(false)}>กลับไปตรวจต่อ</Button><Button className="pointer-coarse:min-h-11" disabled={batch.busy} onClick={() => { setConfirm(false); void batch.saveAll() }}>ยืนยันบันทึกและแจ้งนักเรียน</Button></DialogFooter>
      </DialogContent>
      <ConfirmDialog open={confirmClose} onOpenChange={setConfirmClose} title="ปิดหน้าต่างยืนยัน?" description="ยังไม่มีการส่งคะแนนให้นักเรียน ร่างคะแนนในหน้าตรวจยังอยู่" cancelLabel="กลับไปดำเนินการต่อ" confirmLabel="ยืนยันปิด" finalFocus={() => !confirm ? trigger.current : focus.current} onConfirm={() => { setConfirmClose(false); setConfirm(false) }} />
    </Dialog>
  </div>
}
