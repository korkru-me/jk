'use client'

import { CaptureUpdateAction, FONT_FAMILY } from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  History,
  Loader2,
  Paperclip,
  PenLine,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { DrawingBoardCore } from '@/components/drawing-board/drawing-board-core'
import { StudentDrawingToolbar } from '@/components/drawing-board/drawing-board-toolbar'
import type {
  DrawingBoardCommandState,
  DrawingBoardController,
} from '@/components/drawing-board/drawing-board-controller'
import {
  purgeExpiredScratchpads,
  readScratchpadDraft,
  saveScratchpadDraft,
} from '@/lib/scratchpad-storage'
import {
  emptyScratchpadScene,
  type ScratchpadBackground,
  type ScratchpadScene,
  type ScratchpadScope,
} from '@/lib/scratchpad'
import {
  isIncompleteTransientDrawingElement,
  snapshotDrawingScene,
  validateDrawingScene,
} from '@/lib/drawing-board-policy'
import {
  CURRENT_WORK_FORMAT_VERSION,
  MATH_WORK_BUCKET,
  type StudentWorkArtifactView,
} from '@/lib/math-work'
import {
  createDrawingPreview,
  DRAWING_DEFAULT_ITEM_STATE,
  drawingBackgroundStyle,
  stableDrawingAppState,
  TRANSPARENT_CANVAS,
} from './drawing-board-utils'
import type { FingerInputMode } from '@/lib/drawing-board-input'
import { cn } from '@/lib/utils'
import {
  initialScratchpadRevision,
  markScratchpadAttached,
  reviseScratchpad,
  scratchpadAttachmentState,
  scratchpadHasMeaningfulDraft,
  scratchpadSemanticFingerprint,
  type OneStepRecoveryState,
  type ScratchpadRevisionMetadata,
  type StudentAttachmentState,
  type StudentDraftState,
} from '@/lib/scratchpad-state'

export interface ScratchpadProps {
  open: boolean
  scope: ScratchpadScope
  targetLabel: string
  persistenceEnabled: boolean
  artifactPartKey: string
  artifact: StudentWorkArtifactView | null
  loadAttachedNonce: number
  previewMode: boolean
  fingerInputMode: FingerInputMode
  onFingerInputModeChange: (mode: FingerInputMode) => void
  onAttachmentSaved: (artifact: StudentWorkArtifactView) => void
  onAttachmentStateChange: (state: StudentAttachmentState) => void
  onClose: () => void
}

function statusText(status: StudentDraftState, persistenceEnabled: boolean): string {
  if (!persistenceEnabled) return 'ตัวอย่างชั่วคราว · ไม่บันทึก'
  if (status === 'loading') return 'กำลังเรียกกระดาษทดเดิม...'
  if (status === 'saving_local') return 'กำลังเก็บในเครื่อง...'
  if (status === 'saved_local') return 'เก็บฉบับล่าสุดในเครื่องแล้ว'
  if (status === 'dirty_local') return 'มีการแก้ไขที่ยังไม่เก็บในเครื่อง'
  if (status === 'limit_exceeded') return 'กระดาษทดเต็มแล้ว'
  if (status === 'load_failed') return 'เปิดฉบับเดิมไม่ได้ · ข้อมูลเดิมยังอยู่'
  if (status === 'unsupported_read_only') return 'ฉบับเดิมยังไม่รองรับ · เก็บข้อมูลเดิมไว้แล้ว'
  if (status === 'save_failed') return 'เก็บในเครื่องไม่สำเร็จ'
  return 'เก็บเฉพาะในเครื่อง · หมดอายุใน 7 วัน'
}

function attachmentStatusLabel(state: StudentAttachmentState): string | null {
  if (state === 'attaching') return 'กำลังแนบฉบับนี้'
  if (state === 'attached_current') return 'ฉบับที่แนบเป็นฉบับล่าสุด'
  if (state === 'attached_stale') return 'ฉบับที่แนบเก่ากว่ากระดาษทด'
  if (state === 'attached_unverified') return 'ยังเทียบกับฉบับที่แนบไม่ได้'
  if (state === 'attach_failed') return 'แนบไม่สำเร็จ · ฉบับเดิมยังอยู่'
  return null
}

/**
 * Local-only working paper. The entire component (and Excalidraw) sits behind
 * ExamClient's click-triggered lazy boundary, so students who do not open it
 * never download the editor runtime.
 */
export default function Scratchpad({
  open,
  scope,
  targetLabel,
  persistenceEnabled,
  artifactPartKey,
  artifact,
  loadAttachedNonce,
  previewMode,
  fingerInputMode,
  onFingerInputModeChange,
  onAttachmentSaved,
  onAttachmentStateChange,
  onClose,
}: ScratchpadProps) {
  const { resolvedTheme } = useTheme()
  const [confirm, confirmDialog] = useConfirm()
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const sceneRef = useRef<ScratchpadScene>(emptyScratchpadScene())
  const revisionRef = useRef<ScratchpadRevisionMetadata>(
    initialScratchpadRevision(emptyScratchpadScene()),
  )
  const previewAttachedSceneRef = useRef<ScratchpadScene | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const mountedRef = useRef(true)
  // A mounted editor is not allowed to write until its existing IndexedDB
  // record has finished loading and passed policy validation. This also keeps
  // an early close/unmount from replacing a real draft with the blank fallback.
  const persistenceBlockedRef = useRef(persistenceEnabled)
  const loadedArtifactNonceRef = useRef(0)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const compactLayoutRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const artifactRef = useRef(artifact)
  artifactRef.current = artifact
  const onAttachmentStateChangeRef = useRef(onAttachmentStateChange)
  onAttachmentStateChangeRef.current = onAttachmentStateChange
  const [background, setBackground] = useState<ScratchpadBackground>('lined')
  const [controller, setController] = useState<DrawingBoardController | null>(null)
  const [commandState, setCommandState] = useState<DrawingBoardCommandState>({
    ready: false,
    readOnly: false,
    activeTool: 'freedraw',
    strokeColor: DRAWING_DEFAULT_ITEM_STATE.currentItemStrokeColor,
    strokeWidth: DRAWING_DEFAULT_ITEM_STATE.currentItemStrokeWidth,
    opacity: DRAWING_DEFAULT_ITEM_STATE.currentItemOpacity,
    fontFamily: FONT_FAMILY.Helvetica,
    fontSize: 20,
    canUndo: false,
    canRedo: false,
  })
  const [status, setStatus] = useState<StudentDraftState>(persistenceEnabled ? 'loading' : 'empty')
  const [attachmentState, setAttachmentState] = useState<StudentAttachmentState>(
    artifact ? 'attached_unverified' : 'not_attached',
  )
  const [recoveryState, setRecoveryState] = useState<OneStepRecoveryState>('none')
  const [apiReady, setApiReady] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [loadingAttached, setLoadingAttached] = useState(false)
  const [confirmingAttachedLoad, setConfirmingAttachedLoad] = useState(false)
  const [compactLayout, setCompactLayout] = useState(false)
  const [readOnlyMessage, setReadOnlyMessage] = useState<string | null>(null)

  const publishAttachmentState = useCallback((next: StudentAttachmentState) => {
    setAttachmentState(next)
    onAttachmentStateChangeRef.current(next)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)')
    const update = () => {
      compactLayoutRef.current = media.matches
      setCompactLayout(media.matches)
    }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const initialData = useMemo(async () => {
    // Excalidraw accepts a Promise here. Always cross a microtask boundary so
    // preview mode cannot synchronously publish state to ExamClient while this
    // child is still rendering.
    await Promise.resolve()
    let scene = emptyScratchpadScene()
    persistenceBlockedRef.current = persistenceEnabled
    if (mountedRef.current) setReadOnlyMessage(null)
    if (persistenceEnabled) {
      try {
        await purgeExpiredScratchpads()
        const stored = await readScratchpadDraft(scope)
        if (stored.status === 'ready') {
          scene = stored.scene
          revisionRef.current = stored.revision
          persistenceBlockedRef.current = false
          if (mountedRef.current) {
            setStatus(stored.revision.savedRevision < stored.revision.editRevision
              ? 'dirty_local'
              : scratchpadHasMeaningfulDraft(scene) || stored.revision.editRevision > 0
                ? 'saved_local'
                : 'empty')
            setRecoveryState(stored.revision.recovery.state)
            publishAttachmentState(scratchpadAttachmentState({
              artifact: artifactRef.current,
              metadata: stored.revision,
            }))
          }
        } else if (stored.status === 'missing') {
          revisionRef.current = initialScratchpadRevision(scene)
          persistenceBlockedRef.current = false
          if (mountedRef.current) {
            setStatus('empty')
            setRecoveryState('none')
            publishAttachmentState(artifactRef.current ? 'attached_unverified' : 'not_attached')
          }
        } else {
          persistenceBlockedRef.current = true
          if (mountedRef.current) {
            const unsupported = stored.status === 'unsupported'
            setStatus(unsupported ? 'unsupported_read_only' : 'load_failed')
            publishAttachmentState(artifactRef.current ? 'attached_unverified' : 'not_attached')
            setReadOnlyMessage(unsupported
              ? 'กระดาษทดฉบับเดิมมีข้อมูลที่เวอร์ชันนี้ยังไม่รองรับ จึงเปิดแบบดูอย่างเดียวและเก็บข้อมูลเดิมไว้ในเครื่อง'
              : 'เปิดกระดาษทดฉบับเดิมไม่ได้ จึงหยุดการบันทึกไว้ก่อน ข้อมูลเดิมยังเก็บอยู่ในเครื่อง')
          }
        }
      } catch {
        persistenceBlockedRef.current = true
        if (mountedRef.current) {
          setStatus('load_failed')
          publishAttachmentState(artifactRef.current ? 'attached_unverified' : 'not_attached')
          setReadOnlyMessage('เปิดกระดาษทดฉบับเดิมไม่ได้ จึงหยุดการบันทึกไว้ก่อน ข้อมูลเดิมยังเก็บอยู่ในเครื่อง')
        }
      }
    } else {
      revisionRef.current = initialScratchpadRevision(scene)
      persistenceBlockedRef.current = false
      if (mountedRef.current) {
        setStatus('empty')
        setRecoveryState('none')
        publishAttachmentState(artifactRef.current ? 'attached_unverified' : 'not_attached')
      }
    }
    sceneRef.current = scene
    if (mountedRef.current) setBackground(scene.background)
    return {
      elements: scene.elements as readonly OrderedExcalidrawElement[],
      appState: {
        ...DRAWING_DEFAULT_ITEM_STATE,
        ...scene.appState,
        viewBackgroundColor: TRANSPARENT_CANVAS,
      } as Partial<AppState>,
      files: scene.files as BinaryFiles,
      scrollToContent: false,
    }
  }, [persistenceEnabled, publishAttachmentState, scope])

  const writeDraft = useCallback((
    scene: ScratchpadScene,
    metadata: ScratchpadRevisionMetadata,
  ): Promise<void> => {
    if (!persistenceEnabled || persistenceBlockedRef.current) return Promise.resolve()
    const operation = saveQueueRef.current
      .catch(() => undefined)
      .then(() => saveScratchpadDraft(scope, scene, metadata))
    saveQueueRef.current = operation.catch(() => undefined)
    return operation
  }, [persistenceEnabled, scope])

  const persist = useCallback((
    scene: ScratchpadScene,
    metadata = revisionRef.current,
    announce = true,
  ): Promise<boolean> => {
    if (!persistenceEnabled || persistenceBlockedRef.current) return Promise.resolve(true)
    const persistedRevision: ScratchpadRevisionMetadata = {
      ...metadata,
      savedRevision: metadata.editRevision,
    }
    const savesSemanticEdit = metadata.editRevision > metadata.savedRevision
    if (
      announce
      && mountedRef.current
      && savesSemanticEdit
    ) setStatus('saving_local')

    return writeDraft(scene, persistedRevision)
      .then(() => {
        const current = revisionRef.current
        if (
          current.currentFingerprint === persistedRevision.currentFingerprint
          && current.editRevision === persistedRevision.editRevision
        ) {
          revisionRef.current = {
            ...current,
            savedRevision: Math.max(current.savedRevision, persistedRevision.savedRevision),
          }
          if (mountedRef.current && announce && savesSemanticEdit) setStatus('saved_local')
        }
        return true
      })
      .catch((error: unknown) => {
        if (mountedRef.current && announce) {
          setStatus(error instanceof Error && error.message.includes('exceeds local limits')
            ? 'limit_exceeded'
            : 'save_failed')
        }
        return false
      })
  }, [persistenceEnabled, writeDraft])

  const scheduleSave = useCallback((delay = 650) => {
    if (!persistenceEnabled || persistenceBlockedRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void persist(sceneRef.current)
    }, delay)
  }, [persist, persistenceEnabled])

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const openedFromKeyboard = previousFocus?.matches(':focus-visible') ?? false
    const finePointer = window.matchMedia('(pointer: fine)').matches
    const frame = window.requestAnimationFrame(() => {
      // Excalidraw owns canvas focus. The close control is a predictable entry
      // point when a desktop or keyboard user opens an already-mounted panel.
      if (compactLayoutRef.current || openedFromKeyboard || finePointer) closeButtonRef.current?.focus()
    })
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        if (
          event.target instanceof Element
          && event.target.matches('textarea, [contenteditable="true"], .excalidraw-wysiwyg')
        ) return
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || event.defaultPrevented || !compactLayoutRef.current) return

      const panel = panelRef.current
      if (!panel) return
      const controls = Array.from(panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
      )).filter(element => (
        !element.hidden
        && element.getAttribute('aria-hidden') !== 'true'
        && element.getClientRects().length > 0
      ))
      if (controls.length === 0) return

      const first = controls[0]
      const last = controls[controls.length - 1]
      const activeElement = document.activeElement
      if (event.shiftKey && activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    // Listen during capture so Escape closes the surrounding panel before
    // Excalidraw consumes it, except while a text field is actively editing.
    window.addEventListener('keydown', closeOnEscape, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', closeOnEscape, true)
      // Excalidraw handles focus synchronously. Restore after React finishes
      // this effect cleanup so its blur path cannot call flushSync mid-commit.
      queueMicrotask(() => {
        const activeElement = document.activeElement
        const focusNeedsRestoring = activeElement === document.body
          || activeElement === document.documentElement
          || (activeElement instanceof Node && panelRef.current?.contains(activeElement))
        if (focusNeedsRestoring && previousFocus?.isConnected && previousFocus.getClientRects().length > 0) {
          previousFocus.focus()
        }
      })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => apiRef.current?.refresh())
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (open || !persistenceEnabled) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    void persist(sceneRef.current)
  }, [open, persist, persistenceEnabled])

  useEffect(() => {
    if (!persistenceEnabled) return
    const flushOnPageHide = () => { void persist(sceneRef.current) }
    window.addEventListener('pagehide', flushOnPageHide)
    return () => window.removeEventListener('pagehide', flushOnPageHide)
  }, [persist, persistenceEnabled])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (persistenceEnabled) void persist(sceneRef.current)
    }
  }, [persist, persistenceEnabled])

  const handleChange = useCallback((
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    if (persistenceBlockedRef.current) return
    const nextScene: ScratchpadScene = {
      ...sceneRef.current,
      elements,
      appState: stableDrawingAppState(appState),
      files,
    }
    const nextRevision = reviseScratchpad(revisionRef.current, nextScene)
    const semanticEdit = nextRevision !== revisionRef.current
    sceneRef.current = nextScene
    revisionRef.current = nextRevision
    if (semanticEdit) {
      if (mountedRef.current) setStatus('dirty_local')
      publishAttachmentState(scratchpadAttachmentState({
        artifact: artifactRef.current,
        metadata: nextRevision,
      }))
    }
    scheduleSave()
  }, [publishAttachmentState, scheduleSave])

  const chooseBackground = (next: ScratchpadBackground) => {
    if (persistenceBlockedRef.current) return
    setBackground(next)
    const nextScene = { ...sceneRef.current, background: next }
    const nextRevision = reviseScratchpad(revisionRef.current, nextScene)
    sceneRef.current = nextScene
    if (nextRevision !== revisionRef.current) {
      revisionRef.current = nextRevision
      setStatus('dirty_local')
      publishAttachmentState(scratchpadAttachmentState({
        artifact: artifactRef.current,
        metadata: nextRevision,
      }))
    }
    scheduleSave(150)
  }

  const loadAttachedScene = useCallback(async () => {
    const currentArtifact = artifactRef.current
    if (
      !currentArtifact
      || currentArtifact.sourceType !== 'scratchpad'
      || !apiRef.current
      || persistenceBlockedRef.current
    ) return
    setLoadingAttached(true)
    try {
      let resolvedArtifact = currentArtifact
      let scene: ScratchpadScene
      if (previewMode) {
        if (!previewAttachedSceneRef.current) throw new Error('ฉบับจำลองนี้ไม่มีไฟล์ต้นฉบับให้เปิด')
        scene = snapshotDrawingScene(previewAttachedSceneRef.current)
      } else {
        let sceneUrl = currentArtifact.sceneUrl
        let response = sceneUrl ? await fetch(sceneUrl, { cache: 'no-store' }) : null
        if (!response?.ok) {
          const { getStudentWorkArtifacts } = await import('@/lib/actions/math-work')
          const refreshed = await getStudentWorkArtifacts(scope.answerId)
          if (!refreshed || 'error' in refreshed) throw new Error(refreshed?.error ?? 'เปิดไฟล์ต้นฉบับไม่สำเร็จ')
          const matched = refreshed.artifacts.find(item => item.partKey === artifactPartKey)
          if (matched) {
            resolvedArtifact = {
              ...matched,
              submissionAnswerId: scope.answerId,
              sourceType: matched.sourceType === 'photo' ? 'photo' : 'scratchpad',
            }
          }
          sceneUrl = matched?.sceneUrl ?? null
          response = sceneUrl ? await fetch(sceneUrl, { cache: 'no-store' }) : null
        }
        if (!response?.ok) throw new Error('เปิดไฟล์ต้นฉบับไม่สำเร็จ')
        const validated = validateDrawingScene(await response.json(), { role: 'student' })
        if (!validated.ok) throw new Error('รูปแบบไฟล์ต้นฉบับไม่รองรับ')
        scene = validated.scene
      }

      const previousScene = snapshotDrawingScene(sceneRef.current)
      const previousFingerprint = revisionRef.current.currentFingerprint
      const attachedFingerprint = scratchpadSemanticFingerprint(scene)
      const replacingMeaningfulDraft = previousFingerprint !== attachedFingerprint
        && scratchpadHasMeaningfulDraft(previousScene)
      if (replacingMeaningfulDraft) {
        setConfirmingAttachedLoad(true)
        const accepted = await confirm({
          title: 'เปิดฉบับที่แนบแทนกระดาษทดนี้?',
          description: 'กระดาษทดในเครื่องไม่ตรงกับฉบับที่แนบ ระบบจะเก็บฉบับปัจจุบันไว้ให้กู้กลับได้ 1 ครั้งบนเครื่องนี้',
          confirmLabel: 'เปิดและเก็บฉบับเดิม',
        }).finally(() => setConfirmingAttachedLoad(false))
        if (!accepted) return
      }

      let nextRevision = reviseScratchpad(revisionRef.current, scene)
      if (replacingMeaningfulDraft) {
        nextRevision = {
          ...nextRevision,
          recovery: {
            state: 'available_once',
            scene: previousScene,
            fingerprint: previousFingerprint,
            createdAt: Date.now(),
          },
        }
      }
      nextRevision = markScratchpadAttached(
        nextRevision,
        resolvedArtifact,
        nextRevision.editRevision,
        attachedFingerprint,
      )

      const stored = await persist(scene, nextRevision, false)
      if (!stored) {
        setStatus('save_failed')
        throw new Error('เก็บฉบับกู้คืนในเครื่องไม่สำเร็จ จึงยังไม่เปิดทับกระดาษทดเดิม')
      }
      nextRevision = { ...nextRevision, savedRevision: nextRevision.editRevision }
      revisionRef.current = nextRevision
      artifactRef.current = resolvedArtifact
      sceneRef.current = scene
      setStatus('saved_local')
      setRecoveryState(nextRevision.recovery.state)
      publishAttachmentState('attached_current')
      if (
        resolvedArtifact.id !== currentArtifact.id
        || resolvedArtifact.updatedAt !== currentArtifact.updatedAt
        || resolvedArtifact.sceneUrl !== currentArtifact.sceneUrl
      ) onAttachmentSaved(resolvedArtifact)

      const api = apiRef.current
      api.updateScene({
        elements: scene.elements as readonly OrderedExcalidrawElement[],
        appState: { ...scene.appState, viewBackgroundColor: TRANSPARENT_CANVAS } as AppState,
        captureUpdate: CaptureUpdateAction.NEVER,
      })
      api.addFiles(Object.values(scene.files) as BinaryFileData[])
      if (!controller?.clearHistory()) api.history.clear()
      setBackground(scene.background)
      toast.success('เปิดฉบับที่แนบแล้ว แก้ไขต่อได้เลย')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'เปิดฉบับที่แนบไม่สำเร็จ')
    } finally {
      setLoadingAttached(false)
    }
  }, [artifactPartKey, confirm, controller, onAttachmentSaved, persist, previewMode, publishAttachmentState, scope.answerId])

  // Keep the chosen tool after each stroke: a line or an arrow is rarely
  // drawn only once, and reverting to selection breaks the flow.
  useEffect(() => {
    if (!apiReady || !controller || persistenceBlockedRef.current) return
    let frame: number | null = null
    let cancelled = false
    void initialData.then(() => {
      if (cancelled || persistenceBlockedRef.current) return
      frame = requestAnimationFrame(() => controller.selectTool('freedraw'))
    })
    return () => {
      cancelled = true
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [apiReady, controller, initialData])

  useEffect(() => {
    if (!apiReady || !open || loadAttachedNonce <= 0) return
    if (loadedArtifactNonceRef.current === loadAttachedNonce) return
    loadedArtifactNonceRef.current = loadAttachedNonce
    void loadAttachedScene()
  }, [apiReady, loadAttachedNonce, loadAttachedScene, open])

  useEffect(() => {
    let cancelled = false
    void initialData.then(() => {
      if (cancelled || persistenceBlockedRef.current) return
      publishAttachmentState(scratchpadAttachmentState({
        artifact,
        metadata: revisionRef.current,
      }))
    })
    return () => { cancelled = true }
  }, [artifact?.id, artifact?.updatedAt, artifact?.sourceType, initialData, publishAttachmentState])

  const restoreRecovery = async () => {
    const recovery = revisionRef.current.recovery
    const api = apiRef.current
    if (recovery.state !== 'available_once' || !api || loadingAttached || attaching) return
    setLoadingAttached(true)
    try {
      const scene = snapshotDrawingScene(recovery.scene)
      let nextRevision = reviseScratchpad(revisionRef.current, scene)
      if (nextRevision === revisionRef.current) {
        nextRevision = {
          ...nextRevision,
          editRevision: nextRevision.editRevision + 1,
        }
      }
      nextRevision = {
        ...nextRevision,
        recovery: { state: 'restored', restoredAt: Date.now() },
      }
      try {
        await writeDraft(scene, nextRevision)
      } catch {
        toast.error('กู้ฉบับก่อนโหลดไม่สำเร็จ ข้อมูลกู้คืนยังอยู่ในเครื่อง')
        return
      }

      revisionRef.current = nextRevision
      sceneRef.current = scene
      setStatus('dirty_local')
      setRecoveryState('restored')
      publishAttachmentState(scratchpadAttachmentState({
        artifact: artifactRef.current,
        metadata: nextRevision,
      }))
      api.updateScene({
        elements: scene.elements as readonly OrderedExcalidrawElement[],
        appState: { ...scene.appState, viewBackgroundColor: TRANSPARENT_CANVAS } as AppState,
        captureUpdate: CaptureUpdateAction.NEVER,
      })
      api.addFiles(Object.values(scene.files) as BinaryFileData[])
      if (!controller?.clearHistory()) api.history.clear()
      setBackground(scene.background)
      scheduleSave()
      toast.success('กู้กระดาษทดฉบับก่อนโหลดแล้ว')
    } finally {
      setLoadingAttached(false)
    }
  }

  const discardRecovery = async () => {
    if (revisionRef.current.recovery.state === 'none' || loadingAttached || attaching) return
    setLoadingAttached(true)
    const nextRevision: ScratchpadRevisionMetadata = {
      ...revisionRef.current,
      recovery: { state: 'none' },
    }
    try {
      await writeDraft(sceneRef.current, nextRevision)
    } catch {
      toast.error('ทิ้งข้อมูลกู้คืนไม่สำเร็จ กรุณาลองใหม่')
      return
    } finally {
      setLoadingAttached(false)
    }
    revisionRef.current = nextRevision
    setRecoveryState('none')
  }

  const attachAsWork = async () => {
    const api = apiRef.current
    if (!api || attaching || persistenceBlockedRef.current) return
    const state = api.getAppState()
    const transientElementId = state.newElement?.id
      ?? state.editingLinearElement?.elementId
      ?? null
    if (isIncompleteTransientDrawingElement(
      api.getSceneElementsIncludingDeleted(),
      transientElementId,
    )) {
      toast.error('แก้เส้นให้เสร็จก่อนแนบวิธีทำ')
      return
    }
    const snapshot = snapshotDrawingScene(sceneRef.current)
    const attachedRevision = revisionRef.current.editRevision
    const attachedFingerprint = scratchpadSemanticFingerprint(snapshot)
    setAttaching(true)
    publishAttachmentState('attaching')
    try {
      const validated = validateDrawingScene(snapshot, { role: 'student' })
      if (!validated.ok) throw new Error('กระดาษทดมีข้อมูลที่ไม่รองรับ ให้นำส่วนนั้นออกก่อนแนบ')
      const preview = await createDrawingPreview(
        api,
        background,
        'เขียนวิธีทำก่อนกดแนบ',
        snapshot,
      )

      if (previewMode) {
        previewAttachedSceneRef.current = snapshotDrawingScene(snapshot)
        const previewUrl = URL.createObjectURL(preview.blob)
        const savedArtifact: StudentWorkArtifactView = {
          id: `preview-${scope.answerId}-${artifactPartKey}`,
          submissionAnswerId: scope.answerId,
          partKey: artifactPartKey,
          sourceType: 'scratchpad',
          formatVersion: CURRENT_WORK_FORMAT_VERSION,
          previewUrl,
          sceneUrl: null,
          updatedAt: new Date().toISOString(),
        }
        artifactRef.current = savedArtifact
        const nextRevision = markScratchpadAttached(
          revisionRef.current,
          savedArtifact,
          attachedRevision,
          attachedFingerprint,
        )
        revisionRef.current = nextRevision
        onAttachmentSaved(savedArtifact)
        publishAttachmentState(scratchpadAttachmentState({
          artifact: savedArtifact,
          metadata: nextRevision,
        }))
        toast.success('จำลองการแนบวิธีทำแล้ว · ไม่ได้อัปโหลด')
        return
      }

      const {
        getStudentWorkArtifacts,
        prepareStudentWorkArtifactUpload,
        saveStudentWorkArtifact,
      } = await import('@/lib/actions/math-work')
      const prepared = await prepareStudentWorkArtifactUpload({
        submissionAnswerId: scope.answerId,
        partKey: artifactPartKey,
        sourceType: 'scratchpad',
        includeScene: true,
        formatVersion: CURRENT_WORK_FORMAT_VERSION,
        previewFormat: preview.format,
        scene: snapshot,
      })
      if (!prepared || 'error' in prepared) {
        throw new Error(prepared?.error ?? 'เตรียมพื้นที่อัปโหลดไม่สำเร็จ')
      }
      const { createClient } = await import('@/lib/supabase/client')
      const bucket = createClient().storage.from(MATH_WORK_BUCKET)
      // The server already validated and stored scene.json. The browser gets a
      // token only for the derived preview, so no unvalidated scene can race it.
      await bucket.uploadToSignedUrl(prepared.preview.path, prepared.preview.token, preview.blob, {
        contentType: preview.blob.type,
        cacheControl: '300',
      })
      const saved: Awaited<ReturnType<typeof saveStudentWorkArtifact>> = await saveStudentWorkArtifact({
        submissionAnswerId: scope.answerId,
        partKey: artifactPartKey,
        sourceType: 'scratchpad',
        uploadId: prepared.uploadId,
        uploadReceipt: prepared.uploadReceipt,
        includeScene: true,
        formatVersion: CURRENT_WORK_FORMAT_VERSION,
        previewFormat: preview.format,
      })
      if (!saved || 'error' in saved) throw new Error(saved?.error ?? 'บันทึกวิธีทำไม่สำเร็จ')
      const refreshed = await getStudentWorkArtifacts(scope.answerId)
      const attached = refreshed && !('error' in refreshed)
        ? refreshed.artifacts.find(item => item.partKey === artifactPartKey)
        : null
      const savedArtifact: StudentWorkArtifactView = attached ? {
        ...attached,
        submissionAnswerId: scope.answerId,
        sourceType: attached.sourceType === 'photo' ? 'photo' : 'scratchpad',
      } : {
        id: saved.artifact.id,
        submissionAnswerId: scope.answerId,
        partKey: saved.artifact.part_key,
        sourceType: saved.artifact.source_type === 'photo' ? 'photo' : 'scratchpad',
        formatVersion: saved.artifact.format_version,
        previewUrl: null,
        sceneUrl: null,
        updatedAt: saved.artifact.updated_at,
      }
      artifactRef.current = savedArtifact
      const nextRevision = markScratchpadAttached(
        revisionRef.current,
        savedArtifact,
        attachedRevision,
        attachedFingerprint,
      )
      revisionRef.current = nextRevision
      const metadataStored = await persist(sceneRef.current, nextRevision, false)
      if (metadataStored) {
        publishAttachmentState(scratchpadAttachmentState({
          artifact: savedArtifact,
          metadata: revisionRef.current,
        }))
      } else {
        revisionRef.current = { ...revisionRef.current, attachment: null }
        publishAttachmentState('attached_unverified')
      }
      onAttachmentSaved(savedArtifact)
      toast.success(artifact ? 'อัปเดตวิธีทำที่แนบแล้ว' : 'แนบวิธีทำแล้ว')
    } catch (error) {
      publishAttachmentState('attach_failed')
      toast.error(error instanceof Error ? error.message : 'แนบวิธีทำไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setAttaching(false)
    }
  }

  if (typeof document === 'undefined') return null

  const attachmentLabel = attachmentStatusLabel(attachmentState)
  const attachmentNeedsAttention = attachmentState === 'attached_stale'
    || attachmentState === 'attached_unverified'
    || attachmentState === 'attach_failed'

  return createPortal((
    <>
      <Card
        ref={panelRef}
        role="dialog"
        aria-modal={compactLayout || undefined}
        aria-label="กระดาษทด"
        elevation="xl"
        className={open
          ? cn(
              'fixed inset-x-0 top-0 z-[75] flex h-[var(--app-height,100dvh)] min-h-0 flex-col overflow-hidden rounded-none lg:inset-y-4 lg:left-auto lg:right-4 lg:h-auto lg:min-w-[28rem] lg:max-w-[80vw] lg:w-[48vw] lg:resize-x lg:rounded-2xl xl:w-[44rem]',
              confirmingAttachedLoad && 'invisible pointer-events-none',
            )
          : 'hidden'}
      >
      <div className="shrink-0 border-b border-border bg-card px-3 py-2.5">
        <div className="flex items-center gap-2">
          <PenLine className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">กระดาษทด</p>
            <p className="truncate text-[10px] text-muted-foreground">{targetLabel}</p>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
            <Database className="size-3 shrink-0" aria-hidden="true" />
            <span className="hidden max-w-44 truncate sm:inline" aria-live="polite">
              {statusText(status, persistenceEnabled)}
            </span>
          </div>
          {(artifact?.sceneUrl || (previewMode && artifact?.sourceType === 'scratchpad')) && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="min-h-10 pointer-coarse:min-h-11"
              onClick={() => void loadAttachedScene()}
              disabled={loadingAttached || attaching || Boolean(readOnlyMessage)}
              title="โหลดฉบับที่แนบล่าสุดมาแทนกระดาษทดปัจจุบัน"
            >
              {loadingAttached
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : <RefreshCw data-icon="inline-start" />}
              <span className="hidden lg:inline">ฉบับที่แนบ</span>
            </Button>
          )}
          <Button
            type="button"
            size="xs"
            className="min-h-10 pointer-coarse:min-h-11"
            onClick={() => void attachAsWork()}
            disabled={attaching || loadingAttached || Boolean(readOnlyMessage)}
          >
            {attaching
              ? <Loader2 className="animate-spin" data-icon="inline-start" />
              : <Paperclip data-icon="inline-start" />}
            {attaching ? 'กำลังแนบ...' : artifact ? 'อัปเดตวิธีทำ' : 'แนบวิธีทำ'}
          </Button>
          <Button ref={closeButtonRef} type="button" variant="ghost" size="icon-sm" className="size-10 pointer-coarse:size-11" onClick={onClose} aria-label="ปิดกระดาษทด">
            <X />
          </Button>
        </div>
        {attachmentLabel && (
          <div className="mt-1.5 flex items-center justify-end" aria-live="polite">
            <Badge
              variant={attachmentNeedsAttention ? 'destructive' : attachmentState === 'attached_current' ? 'secondary' : 'outline'}
              className={attachmentNeedsAttention ? 'bg-destructive text-destructive-foreground' : undefined}
              title={attachmentStatusLabel(attachmentState) ?? undefined}
            >
              {attachmentNeedsAttention
                ? <AlertTriangle data-icon="inline-start" />
                : attachmentState === 'attached_current'
                  ? <CheckCircle2 data-icon="inline-start" />
                  : <Paperclip data-icon="inline-start" />}
              {attachmentState === 'attached_current'
                ? 'แนบฉบับล่าสุด'
                : attachmentState === 'attached_stale'
                  ? 'ฉบับแนบเก่า'
                  : attachmentState === 'attached_unverified'
                    ? 'ยังเทียบฉบับแนบไม่ได้'
                    : attachmentState === 'attach_failed'
                      ? 'แนบไม่สำเร็จ'
                      : attachmentLabel}
            </Badge>
          </div>
        )}
      </div>

      <StudentDrawingToolbar
        controller={controller}
        state={commandState}
        background={background}
        fingerMode={fingerInputMode}
        disabled={Boolean(readOnlyMessage) || loadingAttached}
        onBackgroundChange={chooseBackground}
        onFingerModeChange={onFingerInputModeChange}
      />

      {recoveryState !== 'none' && (
        <div
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-warning/20 bg-warning/10 px-3 py-2 text-xs"
          role="status"
          aria-live="polite"
        >
          <History className="text-warning" aria-hidden="true" />
          <span className="min-w-48 flex-1">
            {recoveryState === 'available_once'
              ? 'เก็บกระดาษทดก่อนเปิดฉบับที่แนบไว้แล้ว กู้กลับได้อีก 1 ครั้ง'
              : 'กู้กระดาษทดฉบับก่อนโหลดกลับมาแล้ว'}
          </span>
          {recoveryState === 'available_once' && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void restoreRecovery()}
              disabled={loadingAttached || attaching}
              className="min-h-9 pointer-coarse:min-h-11"
            >
              <RotateCcw data-icon="inline-start" />
              กู้ฉบับเดิม
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void discardRecovery()}
            disabled={loadingAttached || attaching}
            className="min-h-9 pointer-coarse:min-h-11"
          >
            <Trash2 data-icon="inline-start" />
            {recoveryState === 'available_once' ? 'ทิ้งฉบับกู้คืน' : 'ปิดข้อความ'}
          </Button>
        </div>
      )}

      <DrawingBoardCore
        role="student"
        background={background}
        initialData={initialData}
        onReady={api => { apiRef.current = api; setApiReady(true) }}
        onChange={handleChange}
        onPointerUp={() => scheduleSave(120)}
        viewModeEnabled={Boolean(readOnlyMessage) || loadingAttached}
        fingerInputMode={fingerInputMode}
        hideNativeControls
        onControllerReady={setController}
        onCommandStateChange={setCommandState}
        autoFocus
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
        className="flex-1"
        style={drawingBackgroundStyle(background)}
      >
        {readOnlyMessage && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-overlay/20 p-6 backdrop-blur-[1px]">
            <Card role="status" radius="md" padding="md" elevation="md" className="max-w-sm text-center text-sm">
              <p className="font-semibold">เปิดแก้ไขฉบับเดิมไม่ได้</p>
              <p className="mt-1 text-xs text-muted-foreground">{readOnlyMessage}</p>
            </Card>
          </div>
        )}
      </DrawingBoardCore>
      </Card>
      {confirmDialog}
    </>
  ), document.body)
}
