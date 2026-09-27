'use client'

import { FONT_FAMILY } from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, PenLine, RotateCcw, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { DrawingBoardCore } from '@/components/drawing-board/drawing-board-core'
import { TeacherDrawingToolbar } from '@/components/drawing-board/drawing-board-toolbar'
import { SessionLibraryBar } from '@/components/drawing-board/session-library-bar'
import type {
  DrawingBoardCommandState,
  DrawingBoardController,
} from '@/components/drawing-board/drawing-board-controller'
import {
  BOARD_SHEET_HEIGHT,
  BOARD_SHEET_WIDTH,
  createDrawingPreview,
  DRAWING_DEFAULT_ITEM_STATE,
  drawingBackgroundStyle,
  stableDrawingAppState,
  TRANSPARENT_CANVAS,
} from '@/components/exam/drawing-board-utils'
import { duplicateDrawingScene } from '@/lib/drawing-board-duplicate'
import type { FingerInputMode } from '@/lib/drawing-board-input'
import {
  createLegacyTeacherImageSnapshot,
  isIncompleteTransientDrawingElement,
  snapshotDrawingScene,
  type LegacyTeacherImageSnapshot,
} from '@/lib/drawing-board-policy'
import type { DrawingBoardSessionLibraryItem } from '@/lib/drawing-board-session-library'
import { CURRENT_WORK_FORMAT_VERSION } from '@/lib/math-work'
import { emptyScratchpadScene, type ScratchpadBackground, type ScratchpadScene } from '@/lib/scratchpad'
import { scratchpadHasMeaningfulDraft } from '@/lib/scratchpad-state'
import { embedSolutionBoardScene, validateSolutionBoardScene } from '@/lib/solution-board-png'

function contentSignature(elements: readonly OrderedExcalidrawElement[]): string {
  return elements.map(element => `${element.id}:${element.version}:${element.isDeleted ? 1 : 0}`).join('|')
}

interface Props {
  /** A board picture reopened for editing, with the scene read out of it; null starts a new board. */
  initial: { url: string; scene: ScratchpadScene } | null
  /**
   * Stores the picture and returns where it now lives. `replacing` is the
   * picture this board was opened from or last saved as, which the new one
   * takes the place of in the เฉลย.
   */
  onSave: (png: Blob, replacing: string | null) => Promise<string>
  onClose: () => void
  /** Kept by the section rather than the board, so closing a board keeps them. */
  sessionLibraryItems: readonly DrawingBoardSessionLibraryItem[]
  onSessionLibraryItemAdd: (item: DrawingBoardSessionLibraryItem) => void
  onSessionLibraryItemRemove: (itemId: string) => void
}

/**
 * The กระดานเขียนเฉลย: กระดานสอน's own sheet, toolbar and คลังชั่วคราว,
 * opened over the question form.
 *
 * What differs is only where a save goes. A กระดานสอน is saved into one of a
 * ข้อ's ช่อง inside an assignment; this board is saved as a picture in the
 * question's เฉลย, carrying its scene inside the PNG so it can be reopened
 * here and written on again. Two things of กระดานสอน's do not come along,
 * because both are vouched for by the server against an assignment: dropping
 * in a รูปประกอบโจทย์, and cloning a board that holds one. Nothing here can
 * take a picture in, so the scene validator refuses any.
 */
export default function SolutionBoardEditor({
  initial,
  onSave,
  onClose,
  sessionLibraryItems,
  onSessionLibraryItemAdd,
  onSessionLibraryItemRemove,
}: Props) {
  const [startScene] = useState(() => initial?.scene ?? emptyScratchpadScene())
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const paperRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<ScratchpadScene>(startScene)
  const contentSignatureRef = useRef(contentSignature(startScene.elements as readonly OrderedExcalidrawElement[]))
  const legacyTeacherImagesRef = useRef<LegacyTeacherImageSnapshot | null>(createLegacyTeacherImageSnapshot(startScene))
  // Excalidraw reports a change as it mounts; that is not the teacher writing.
  const ignoreChangesRef = useRef(true)
  const savingRef = useRef(false)
  const [editorScene, setEditorScene] = useState<ScratchpadScene>(startScene)
  const [editorRevision, setEditorRevision] = useState(0)
  const [background, setBackground] = useState<ScratchpadBackground>(startScene.background)
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
  // The picture in the เฉลย this board saves over; null until the first save.
  const [savedUrl, setSavedUrl] = useState<string | null>(initial?.url ?? null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [apiReady, setApiReady] = useState(false)
  const [fingerInputMode, setFingerInputMode] = useState<FingerInputMode>('finger_draw')
  const [presentationLocked, setPresentationLocked] = useState(false)
  const [gridEnabled, setGridEnabled] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(false)
  const [confirm, confirmDialog] = useConfirm()

  const editable = apiReady && !saving

  const releaseChangeGuard = () => {
    requestAnimationFrame(() => { ignoreChangesRef.current = false })
  }

  useEffect(() => {
    if (!apiReady) return
    const frame = requestAnimationFrame(() => {
      apiRef.current?.setActiveTool({
        type: presentationLocked ? 'laser' : editable ? 'freedraw' : 'hand',
        locked: true,
      })
      releaseChangeGuard()
    })
    return () => cancelAnimationFrame(frame)
  }, [apiReady, editable, presentationLocked])

  const handleChange = useCallback((
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    const nextSignature = contentSignature(elements)
    const contentChanged = nextSignature !== contentSignatureRef.current
    contentSignatureRef.current = nextSignature
    sceneRef.current = {
      formatVersion: CURRENT_WORK_FORMAT_VERSION,
      elements,
      appState: stableDrawingAppState(appState),
      files,
      background,
    }
    // The sheet is a plain DOM element under a transparent canvas, moved by
    // hand on every change for the same reason as on กระดานสอน.
    const paper = paperRef.current
    if (paper) {
      const zoom = appState.zoom.value
      paper.style.transform = `translate(${appState.scrollX * zoom}px, ${appState.scrollY * zoom}px) scale(${zoom})`
    }
    if (contentChanged && !ignoreChangesRef.current) setDirty(true)
  }, [background])

  const showScene = (scene: ScratchpadScene) => {
    // A new scene remounts Excalidraw, which comes back with its own default
    // tool; readiness drops until the new editor reports in, so the pen is
    // picked again on it the way กระดานสอน's reload does.
    setApiReady(false)
    ignoreChangesRef.current = true
    sceneRef.current = scene
    contentSignatureRef.current = contentSignature(scene.elements as readonly OrderedExcalidrawElement[])
    legacyTeacherImagesRef.current = createLegacyTeacherImageSnapshot(scene)
    setBackground(scene.background)
    setEditorScene(scene)
    setEditorRevision(value => value + 1)
  }

  const chooseBackground = (next: ScratchpadBackground) => {
    if (!editable || presentationLocked) return
    setBackground(next)
    sceneRef.current = { ...sceneRef.current, background: next }
    setDirty(true)
  }

  /** Puts the whole sheet on screen — the way back when the view wanders. */
  const fitPaper = () => {
    const api = apiRef.current
    const box = surfaceRef.current?.getBoundingClientRect()
    if (!api || !box || box.width === 0) return
    const zoom = Math.min(box.width / (BOARD_SHEET_WIDTH + 80), box.height / (BOARD_SHEET_HEIGHT + 80))
    api.updateScene({
      appState: {
        scrollX: box.width / (2 * zoom) - BOARD_SHEET_WIDTH / 2,
        scrollY: box.height / (2 * zoom) - BOARD_SHEET_HEIGHT / 2,
        zoom: { value: zoom as AppState['zoom']['value'] },
      },
    })
  }

  /** Saves the board as a picture in the เฉลย. Resolves to its URL, or null when nothing was saved. */
  const save = async (): Promise<string | null> => {
    const api = apiRef.current
    if (!api || savingRef.current) return null
    const state = api.getAppState()
    const transientElementId = state.newElement?.id ?? state.editingLinearElement?.elementId ?? null
    if (isIncompleteTransientDrawingElement(api.getSceneElementsIncludingDeleted(), transientElementId)) {
      toast.error('แก้เส้นให้เสร็จก่อนบันทึกเฉลย')
      return null
    }
    const validated = validateSolutionBoardScene(snapshotDrawingScene(sceneRef.current))
    if (!validated.ok) {
      toast.error('กระดานมีข้อมูลที่บันทึกเป็นเฉลยไม่ได้')
      return null
    }
    savingRef.current = true
    setSaving(true)
    const signatureAtSave = contentSignatureRef.current
    try {
      const preview = await createDrawingPreview(api, background, 'เขียนบนกระดานก่อนบันทึกเฉลย', validated.scene, 'png')
      const png = await embedSolutionBoardScene(new Uint8Array(await preview.blob.arrayBuffer()), validated.scene)
      const url = await onSave(new Blob([png], { type: 'image/png' }), savedUrl)
      setSavedUrl(url)
      // Strokes added while the picture was uploading are not in it.
      if (contentSignatureRef.current === signatureAtSave) setDirty(false)
      return url
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'บันทึกเฉลยไม่สำเร็จ กรุณาลองใหม่')
      return null
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  /**
   * ทำสำเนาเป็นขั้นถัดไป, as a เฉลย means it: the step on the board is kept
   * as its own picture first, then a copy of it becomes a new board to carry
   * on from — so each step of the working ends up as one picture, in order.
   */
  const duplicateNextStep = async () => {
    if (!apiRef.current || savingRef.current || presentationLocked) return
    if (!scratchpadHasMeaningfulDraft(sceneRef.current)) {
      toast.error('เขียนบนกระดานก่อนทำสำเนาเป็นขั้นถัดไป')
      return
    }
    if ((dirty || !savedUrl) && !await save()) return
    const copy = validateSolutionBoardScene(duplicateDrawingScene(snapshotDrawingScene(sceneRef.current)).scene)
    if (!copy.ok) {
      toast.error('ทำสำเนากระดานไม่สำเร็จ')
      return
    }
    showScene(copy.scene)
    setSavedUrl(null)
    setDirty(true)
    toast.success('เริ่มขั้นถัดไปจากสำเนาแล้ว · ขั้นก่อนหน้าอยู่ในเฉลยแล้ว')
  }

  const startNewBoard = async () => {
    if (savingRef.current) return
    if (dirty && scratchpadHasMeaningfulDraft(sceneRef.current)) {
      const ok = await confirm({
        title: 'เริ่มกระดานใหม่?',
        description: savedUrl
          ? 'เส้นที่เขียนหลังบันทึกล่าสุดจะหายไป ส่วนภาพที่บันทึกไว้ในเฉลยแล้วยังอยู่'
          : 'งานเขียนบนกระดานนี้ยังไม่ได้บันทึกเป็นเฉลย และจะหายไป',
        confirmLabel: 'เริ่มกระดานใหม่',
        variant: 'destructive',
      })
      if (!ok) return
    }
    showScene(emptyScratchpadScene())
    setSavedUrl(null)
    setDirty(false)
  }

  const close = async () => {
    if (savingRef.current) return
    if (dirty && scratchpadHasMeaningfulDraft(sceneRef.current)) {
      const ok = await confirm({
        title: 'ปิดกระดานโดยไม่บันทึก?',
        description: savedUrl
          ? 'เส้นที่เขียนหลังบันทึกล่าสุดจะหายไป ส่วนภาพที่บันทึกไว้ในเฉลยแล้วยังอยู่'
          : 'งานเขียนบนกระดานนี้ยังไม่ได้บันทึกเป็นเฉลย และจะหายไป',
        confirmLabel: 'ปิดโดยไม่บันทึก',
        variant: 'destructive',
      })
      if (!ok) return
    }
    onClose()
  }

  const status = saving ? 'กำลังบันทึก...'
    : presentationLocked ? 'ล็อกพรีเซนต์ · เขียนแก้ไม่ได้'
      : dirty
        ? savedUrl ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'กระดานใหม่ที่ยังไม่บันทึก'
        : savedUrl ? 'บันทึกในเฉลยแล้ว' : 'กระดานใหม่'

  return createPortal((
    <>
      <Card
        role="dialog"
        aria-modal="true"
        aria-label="กระดานเขียนเฉลย"
        className="fixed inset-0 z-50 flex h-[var(--app-height,100dvh)] min-h-0 flex-col overflow-hidden rounded-none"
      >
        <div className="shrink-0 border-b border-border bg-card px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <PenLine className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">กระดานเขียนเฉลย</p>
              <p className="text-[10px] text-muted-foreground" aria-live="polite">{status}</p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => void startNewBoard()}
                disabled={saving || presentationLocked || !scratchpadHasMeaningfulDraft(sceneRef.current)}
              >
                <RotateCcw /> กระดานใหม่
              </Button>
              <Button type="button" size="xs" onClick={() => void save()} disabled={!editable || !dirty}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                {saving ? 'กำลังบันทึก...' : savedUrl ? 'บันทึกทับ' : 'บันทึกเฉลย'}
              </Button>
              <Button type="button" variant="ghost" size="xs" onClick={() => void close()} disabled={saving}>
                <X /> ปิด
              </Button>
            </div>
          </div>
        </div>

        <SessionLibraryBar
          label="คลังชั่วคราวของกระดานเขียนเฉลย"
          items={sessionLibraryItems}
          disabled={!editable || presentationLocked}
          getApi={() => apiRef.current}
          getScene={() => sceneRef.current}
          getSurface={() => surfaceRef.current}
          getLegacyTeacherImages={() => legacyTeacherImagesRef.current}
          onAdd={onSessionLibraryItemAdd}
          onRemove={onSessionLibraryItemRemove}
        />

        <TeacherDrawingToolbar
          controller={controller}
          state={commandState}
          background={background}
          fingerMode={fingerInputMode}
          disabled={!editable || presentationLocked}
          presentationLocked={presentationLocked}
          gridEnabled={gridEnabled}
          snapEnabled={snapEnabled}
          duplicateBusy={saving}
          onBackgroundChange={chooseBackground}
          onFingerModeChange={setFingerInputMode}
          onFit={fitPaper}
          onPresentationLockedChange={setPresentationLocked}
          onGridEnabledChange={setGridEnabled}
          onSnapEnabledChange={setSnapEnabled}
          onDuplicateNextStep={() => void duplicateNextStep()}
        />

        <DrawingBoardCore
          role="teacher"
          background={background}
          surfaceRef={surfaceRef}
          autoFocus
          className="flex-1 bg-muted/40 [&_.excalidraw]:!min-w-0 [&_.excalidraw]:!bg-transparent"
          initialData={{
            elements: editorScene.elements as readonly OrderedExcalidrawElement[],
            appState: {
              ...DRAWING_DEFAULT_ITEM_STATE,
              ...editorScene.appState,
              viewBackgroundColor: TRANSPARENT_CANVAS,
            },
            files: editorScene.files as BinaryFiles,
            scrollToContent: false,
          }}
          editorRevision={editorRevision}
          onReady={api => {
            apiRef.current = api
            releaseChangeGuard()
            setApiReady(true)
          }}
          onChange={handleChange}
          viewModeEnabled={!editable}
          contentEditingLocked={presentationLocked}
          gridModeEnabled={gridEnabled}
          objectsSnapModeEnabled={snapEnabled}
          fingerInputMode={fingerInputMode}
          hideNativeControls
          onControllerReady={setController}
          onCommandStateChange={setCommandState}
          legacyTeacherImagesRef={legacyTeacherImagesRef}
        >
          <div
            ref={paperRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 origin-top-left rounded-md shadow-sm ring-1 ring-border"
            style={{ width: BOARD_SHEET_WIDTH, height: BOARD_SHEET_HEIGHT, ...drawingBackgroundStyle(background) }}
          />
        </DrawingBoardCore>
      </Card>
      {confirmDialog}
    </>
  ), document.body)
}
