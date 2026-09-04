'use client'

import '@excalidraw/excalidraw/index.css'
import { CaptureUpdateAction, Excalidraw, MainMenu } from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser, Highlighter, Loader2, Maximize2, PanelRightClose, PenLine, RotateCcw, Save, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  clampStrokeWidth,
  createDrawingPreview,
  DRAWING_BACKGROUNDS,
  DRAWING_DEFAULT_ITEM_STATE,
  drawingBackgroundStyle,
  HIGHLIGHTER_INK,
  MAX_STROKE_WIDTH,
  MIN_STROKE_WIDTH,
  PEN_INK,
  stableDrawingAppState,
  TRANSPARENT_CANVAS,
} from '@/components/exam/drawing-board-utils'
import {
  CURRENT_WORK_FORMAT_VERSION,
  MATH_WORK_BUCKET,
  type TeachingBoardView,
} from '@/lib/math-work'
import {
  emptyScratchpadScene,
  isScratchpadSceneWithinLimits,
  sanitizeScratchpadScene,
  type ScratchpadBackground,
  type ScratchpadScene,
} from '@/lib/scratchpad'

interface Props {
  assignmentId: string
  questionId: string
  /** "ข้อ 15/22" — every save says which ข้อ it lands on. */
  questionLabel: string
  slot: number
  board: TeachingBoardView | null
  canManage: boolean
  loadNonce: number
  resetNonce: number
  /** What was on this ข้อ's board when the teacher last left it. */
  initialScene?: ScratchpadScene | null
  initialDirty?: boolean
  onSaved: (slot: number) => Promise<void>
  onDirtyChange: (dirty: boolean) => void
  /** Reports the live scene so the ข้อ can be returned to as it was left. */
  onSceneChange?: (scene: ScratchpadScene) => void
  /** Given when the board can be put away. */
  onHide?: () => void
}

/**
 * The sheet the board writes on, in scene units.
 *
 * Excalidraw's canvas is endless, which on a blank board reads as "nothing is
 * happening" while panning and makes it easy to end up lost in white space.
 * A sheet of a fixed size is something to aim at: it moves and scales with the
 * scene, and the scroll wheel hands the page back once its edge is reached.
 */
const PAGE_WIDTH = 1600
const PAGE_HEIGHT = 1100

function contentSignature(elements: readonly OrderedExcalidrawElement[]): string {
  return elements.map(element => `${element.id}:${element.version}:${element.isDeleted ? 1 : 0}`).join('|')
}

export default function TeachingBoardEditor({
  assignmentId,
  questionId,
  questionLabel,
  slot,
  board,
  canManage,
  loadNonce,
  resetNonce,
  initialScene,
  initialDirty = false,
  onSaved,
  onDirtyChange,
  onSceneChange,
  onHide,
}: Props) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const paperRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<ScratchpadScene>(initialScene ?? emptyScratchpadScene())
  const contentSignatureRef = useRef(
    initialScene ? contentSignature(initialScene.elements as readonly OrderedExcalidrawElement[]) : '',
  )
  const ignoreChangesRef = useRef(true)
  const handledLoadRef = useRef(0)
  const handledResetRef = useRef(0)
  const [background, setBackground] = useState<ScratchpadBackground>(initialScene?.background ?? 'lined')
  const [strokeWidth, setStrokeWidth] = useState<number>(DRAWING_DEFAULT_ITEM_STATE.currentItemStrokeWidth)
  const [toolsHidden, setToolsHidden] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [apiReady, setApiReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirm, confirmDialog] = useConfirm()

  const editable = canManage && (!board || board.editable)

  const markDirty = useCallback((next: boolean) => {
    setDirty(next)
    onDirtyChange(next)
  }, [onDirtyChange])

  const releaseChangeGuard = () => {
    requestAnimationFrame(() => { ignoreChangesRef.current = false })
  }

  const resetCanvas = useCallback((dirtyAfterReset = false) => {
    const api = apiRef.current
    if (!api) return
    ignoreChangesRef.current = true
    api.resetScene()
    api.updateScene({
      appState: { ...DRAWING_DEFAULT_ITEM_STATE, viewBackgroundColor: TRANSPARENT_CANVAS },
      captureUpdate: CaptureUpdateAction.NEVER,
    })
    setStrokeWidth(DRAWING_DEFAULT_ITEM_STATE.currentItemStrokeWidth)
    api.setActiveTool({ type: 'freedraw', locked: true })
    api.history.clear()
    const scene = emptyScratchpadScene()
    sceneRef.current = scene
    contentSignatureRef.current = ''
    setBackground(scene.background)
    markDirty(dirtyAfterReset)
    releaseChangeGuard()
  }, [markDirty])

  const loadBoardScene = useCallback(async () => {
    if (!board || !apiRef.current) return
    setLoading(true)
    try {
      let sceneUrl = board.sceneUrl
      let response = sceneUrl ? await fetch(sceneUrl, { cache: 'no-store' }) : null
      if (!response?.ok) {
        const { getTeachingBoards } = await import('@/lib/actions/math-work')
        const refreshed = await getTeachingBoards(assignmentId, questionId)
        if (!refreshed || 'error' in refreshed) throw new Error(refreshed?.error ?? 'เปิดกระดานสอนไม่สำเร็จ')
        sceneUrl = refreshed.boards.find(item => item.id === board.id)?.sceneUrl ?? null
        response = sceneUrl ? await fetch(sceneUrl, { cache: 'no-store' }) : null
      }
      if (!response?.ok) throw new Error('เปิดไฟล์ต้นฉบับของกระดานไม่สำเร็จ')
      const scene = sanitizeScratchpadScene(await response.json())
      if (!scene || !isScratchpadSceneWithinLimits(scene)) throw new Error('รูปแบบกระดานสอนไม่รองรับ')

      const api = apiRef.current
      ignoreChangesRef.current = true
      contentSignatureRef.current = contentSignature(scene.elements as readonly OrderedExcalidrawElement[])
      api.resetScene()
      api.updateScene({
        elements: scene.elements as readonly OrderedExcalidrawElement[],
        appState: {
          ...DRAWING_DEFAULT_ITEM_STATE,
          ...scene.appState,
          viewBackgroundColor: TRANSPARENT_CANVAS,
        } as AppState,
        captureUpdate: CaptureUpdateAction.NEVER,
      })
      api.addFiles(Object.values(scene.files) as BinaryFileData[])
      api.history.clear()
      if (board.editable) api.setActiveTool({ type: 'freedraw', locked: true })
      sceneRef.current = scene
      setBackground(scene.background)
      markDirty(false)
      releaseChangeGuard()
      toast.success(board.editable ? `เปิดกระดานช่อง ${board.slot} แล้ว` : `เปิดกระดานของ ${board.creatorName} แล้ว`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'เปิดกระดานสอนไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [assignmentId, board, markDirty, questionId])

  useEffect(() => {
    if (!apiReady || loadNonce <= 0 || handledLoadRef.current === loadNonce) return
    handledLoadRef.current = loadNonce
    void loadBoardScene()
  }, [apiReady, loadBoardScene, loadNonce])

  useEffect(() => {
    if (!apiReady || resetNonce <= 0 || handledResetRef.current === resetNonce) return
    handledResetRef.current = resetNonce
    resetCanvas(false)
  }, [apiReady, resetCanvas, resetNonce])

  useEffect(() => {
    if (!apiReady) return
    const frame = requestAnimationFrame(() => {
      apiRef.current?.setActiveTool({ type: editable ? 'freedraw' : 'hand', locked: true })
      releaseChangeGuard()
    })
    return () => cancelAnimationFrame(frame)
  }, [apiReady, editable])

  // The strokes come back through initialData; this only restores the
  // "not saved yet" state that came with them.
  const restoredRef = useRef(false)
  useEffect(() => {
    if (!apiReady || restoredRef.current || !initialScene) return
    restoredRef.current = true
    markDirty(initialDirty)
  }, [apiReady, initialDirty, initialScene, markDirty])

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
    // The sheet is a plain DOM element under a transparent canvas, so it is
    // moved by hand on every change — written straight to the node, because a
    // re-render per pointer move while panning is not affordable.
    const paper = paperRef.current
    if (paper) {
      const zoom = appState.zoom.value
      paper.style.transform = `translate(${appState.scrollX * zoom}px, ${appState.scrollY * zoom}px) scale(${zoom})`
    }
    onSceneChange?.(sceneRef.current)
    // Excalidraw's own thin/bold/extra-bold buttons move the slider too.
    setStrokeWidth(current => current === appState.currentItemStrokeWidth ? current : appState.currentItemStrokeWidth)
    if (contentChanged && !ignoreChangesRef.current && editable) markDirty(true)
  }, [background, editable, markDirty, onSceneChange])

  const chooseBackground = (next: ScratchpadBackground) => {
    if (!editable) return
    setBackground(next)
    sceneRef.current = { ...sceneRef.current, background: next }
    markDirty(true)
  }

  const chooseInkPreset = (kind: 'pen' | 'highlighter' | 'eraser') => {
    const api = apiRef.current
    if (!api || !editable) return
    if (kind === 'eraser') {
      api.setActiveTool({ type: 'eraser', locked: true })
      return
    }
    const ink = kind === 'pen' ? PEN_INK : HIGHLIGHTER_INK
    api.updateScene({
      appState: {
        currentItemStrokeColor: ink.color,
        currentItemStrokeWidth: ink.width,
        currentItemOpacity: ink.opacity,
      },
    })
    setStrokeWidth(ink.width)
    api.setActiveTool({ type: 'freedraw', locked: true })
  }

  /** Puts the whole sheet on screen — the way back when the view wanders. */
  const fitPaper = () => {
    const api = apiRef.current
    const box = surfaceRef.current?.getBoundingClientRect()
    if (!api || !box || box.width === 0) return
    const zoom = Math.min(box.width / (PAGE_WIDTH + 80), box.height / (PAGE_HEIGHT + 80))
    api.updateScene({
      appState: {
        scrollX: box.width / (2 * zoom) - PAGE_WIDTH / 2,
        scrollY: box.height / (2 * zoom) - PAGE_HEIGHT / 2,
        zoom: { value: zoom as AppState['zoom']['value'] },
      },
    })
  }

  /**
   * Scrolling past the top or bottom edge of the sheet belongs to the page,
   * not to the board: that is how a teacher reaches the next ข้อ with the same
   * gesture instead of panning further into empty space. Stopping the event
   * here in the capture phase keeps Excalidraw from seeing it at all, and the
   * browser scrolls as it would over any other part of the page.
   */
  const passWheelToPage = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) return
    const paper = paperRef.current?.getBoundingClientRect()
    const box = surfaceRef.current?.getBoundingClientRect()
    if (!paper || !box) return
    const pastBottom = event.deltaY > 0 && paper.bottom <= box.bottom + 1
    const pastTop = event.deltaY < 0 && paper.top >= box.top - 1
    if (pastBottom || pastTop) event.stopPropagation()
  }

  const chooseStrokeWidth = (value: number) => {
    const api = apiRef.current
    if (!api || !editable) return
    const next = clampStrokeWidth(value)
    setStrokeWidth(next)
    api.updateScene({ appState: { currentItemStrokeWidth: next } })
  }

  const saveBoard = async () => {
    const api = apiRef.current
    if (!api || !editable || saving) return
    if (board) {
      const ok = await confirm({
        title: `บันทึกทับกระดาน ${questionLabel} ช่อง ${slot}?`,
        description: 'ภาพและไฟล์ต้นฉบับเดิมในช่องนี้จะถูกแทนที่ด้วยกระดานที่กำลังเปิดอยู่',
        confirmLabel: 'บันทึกทับ',
      })
      if (!ok) return
    }

    setSaving(true)
    try {
      const scene: ScratchpadScene = {
        formatVersion: CURRENT_WORK_FORMAT_VERSION,
        elements: api.getSceneElementsIncludingDeleted(),
        appState: stableDrawingAppState(api.getAppState()),
        files: api.getFiles(),
        background,
      }
      if (!isScratchpadSceneWithinLimits(scene)) throw new Error('กระดานมีขนาดใหญ่เกิน 2 MB หรือมีเส้นมากเกินไป')
      const preview = await createDrawingPreview(api, background, 'เขียนบนกระดานก่อนกดบันทึก')
      const sceneBlob = new Blob([JSON.stringify(scene)], { type: 'application/json' })
      const { prepareTeachingBoardUpload, saveTeachingBoard } = await import('@/lib/actions/math-work')
      const prepared = await prepareTeachingBoardUpload({
        assignmentId,
        questionId,
        slot,
        formatVersion: CURRENT_WORK_FORMAT_VERSION,
        previewFormat: preview.format,
      })
      if (!prepared || 'error' in prepared) throw new Error(prepared?.error ?? 'เตรียมพื้นที่บันทึกไม่สำเร็จ')
      if (!prepared.scene) throw new Error('เตรียมไฟล์ต้นฉบับไม่สำเร็จ')

      const { createClient } = await import('@/lib/supabase/client')
      const bucket = createClient().storage.from(MATH_WORK_BUCKET)
      await Promise.allSettled([
        bucket.uploadToSignedUrl(prepared.preview.path, prepared.preview.token, preview.blob, {
          contentType: preview.blob.type,
          cacheControl: '300',
        }),
        bucket.uploadToSignedUrl(prepared.scene.path, prepared.scene.token, sceneBlob, {
          contentType: 'application/json',
          cacheControl: '300',
        }),
      ])
      const saved = await saveTeachingBoard({
        assignmentId,
        questionId,
        slot,
        uploadId: prepared.uploadId,
        formatVersion: CURRENT_WORK_FORMAT_VERSION,
        replaceExisting: Boolean(board),
        previewFormat: preview.format,
      })
      if (!saved || 'error' in saved) throw new Error(saved?.error ?? 'บันทึกกระดานสอนไม่สำเร็จ')
      markDirty(false)
      await onSaved(slot)
      toast.success(board ? `บันทึกทับ ${questionLabel} ช่อง ${slot} แล้ว` : `บันทึกกระดานลง ${questionLabel} ช่อง ${slot} แล้ว`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'บันทึกกระดานสอนไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Card role="region" aria-label="กระดานสอน" className="flex h-[70dvh] min-h-[560px] min-w-0 max-w-full flex-col overflow-hidden lg:h-full">
        <div className="shrink-0 border-b border-border bg-card px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <PenLine className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{questionLabel} · ช่อง {slot}</p>
              <p className="text-[10px] text-muted-foreground" aria-live="polite">
                {!editable ? 'ดูอย่างเดียว' : saving ? 'กำลังบันทึก...' : dirty ? 'มีการแก้ไขที่ยังไม่บันทึก' : board ? 'บันทึกแล้ว' : 'กระดานใหม่'}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              {editable && (
                <Button type="button" variant="outline" size="xs" onClick={() => resetCanvas(Boolean(board))} disabled={saving || loading}>
                  <RotateCcw /> กระดานใหม่
                </Button>
              )}
              {editable && (
                <Button type="button" size="xs" onClick={() => void saveBoard()} disabled={saving || loading || (Boolean(board) && !dirty)}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}
                  {saving ? 'กำลังบันทึก...' : board ? 'บันทึกทับ' : 'บันทึก'}
                </Button>
              )}
              {onHide && (
                <Button type="button" variant="ghost" size="xs" onClick={onHide} disabled={saving}>
                  <PanelRightClose /> ซ่อน
                </Button>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <Button type="button" variant="outline" size="xs" onClick={() => chooseInkPreset('pen')} disabled={!editable}>
              <PenLine /> ปากกา
            </Button>
            <Button type="button" variant="outline" size="xs" onClick={() => chooseInkPreset('highlighter')} disabled={!editable}>
              <Highlighter /> ไฮไลต์
            </Button>
            <Button type="button" variant="outline" size="xs" onClick={() => chooseInkPreset('eraser')} disabled={!editable}>
              <Eraser /> ยางลบ
            </Button>
            <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
            <label className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
              ขนาดเส้น
              <input
                type="range"
                min={MIN_STROKE_WIDTH}
                max={MAX_STROKE_WIDTH}
                step={1}
                value={strokeWidth}
                onChange={event => chooseStrokeWidth(Number(event.target.value))}
                disabled={!editable}
                aria-label="ขนาดเส้น"
                className="h-1 w-24 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="w-3 text-right font-mono text-[10px] text-foreground" aria-hidden="true">{strokeWidth}</span>
            </label>
            <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
            <Button type="button" variant="outline" size="xs" onClick={fitPaper} title="จัดกระดาษให้พอดีจอ">
              <Maximize2 /> พอดีจอ
            </Button>
            <Button
              type="button"
              variant={toolsHidden ? 'secondary' : 'outline'}
              size="xs"
              aria-pressed={toolsHidden}
              onClick={() => setToolsHidden(value => !value)}
              title="ซ่อน/แสดงแถบเครื่องมือของกระดาน"
            >
              <SlidersHorizontal /> {toolsHidden ? 'แสดงแถบเครื่องมือ' : 'ซ่อนแถบเครื่องมือ'}
            </Button>
            <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
            {DRAWING_BACKGROUNDS.map(item => (
              <Button
                key={item.value}
                type="button"
                variant={background === item.value ? 'secondary' : 'ghost'}
                size="xs"
                className="shrink-0"
                onClick={() => chooseBackground(item.value)}
                disabled={!editable}
                aria-pressed={background === item.value}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        {/* `main-menu-trigger` is Excalidraw's ☰ button. An empty MainMenu
            leaves nothing behind it, and this takes the button away too. */}
        <div
          ref={surfaceRef}
          onWheelCapture={passWheelToPage}
          className={`relative min-h-0 min-w-0 flex-1 overflow-hidden bg-muted/40 [&_.excalidraw]:!min-w-0 [&_.excalidraw]:!bg-transparent [&_.main-menu-trigger]:!hidden ${toolsHidden ? 'board-tools-hidden' : ''}`}
        >
          {/* The sheet: sits under a transparent canvas and is moved by
              handleChange, so panning and zooming are visible even on a board
              with nothing written on it yet. */}
          <div
            ref={paperRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 origin-top-left rounded-md shadow-sm ring-1 ring-border"
            style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, ...drawingBackgroundStyle(background) }}
          />
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-overlay/20 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-sm shadow-md">
                <Loader2 className="size-4 animate-spin" /> กำลังเปิดกระดาน...
              </div>
            </div>
          )}
          <Excalidraw
            /* Coming back to a ข้อ opens its board exactly as it was left,
               unsaved strokes included, because the parked scene is what
               Excalidraw mounts with. */
            initialData={{
              elements: (initialScene?.elements ?? []) as readonly OrderedExcalidrawElement[],
              appState: {
                ...DRAWING_DEFAULT_ITEM_STATE,
                ...(initialScene?.appState ?? {}),
                viewBackgroundColor: TRANSPARENT_CANVAS,
              },
              files: (initialScene?.files ?? {}) as BinaryFiles,
              scrollToContent: false,
            }}
            excalidrawAPI={api => {
              apiRef.current = api
              setApiReady(true)
            }}
            onChange={handleChange}
            langCode="th-TH"
            viewModeEnabled={!editable}
            handleKeyboardGlobally={false}
            autoFocus={false}
            aiEnabled={false}
            validateEmbeddable={false}
            UIOptions={{
              canvasActions: {
                changeViewBackgroundColor: false,
                export: false,
                loadScene: false,
                saveToActiveFile: false,
                saveAsImage: false,
                toggleTheme: false,
              },
              tools: { image: false },
            }}
          >
            {/*
              Replaces Excalidraw's own ☰ menu, which otherwise offers Reset
              the canvas — a second, blunter กระดานใหม่ that skips our state —
              beside links out to Excalidraw's GitHub, X and Discord. A board
              used to work an answer in front of a class needs none of it.
            */}
            <MainMenu />
          </Excalidraw>
        </div>
      </Card>
      {confirmDialog}
    </>
  )
}
