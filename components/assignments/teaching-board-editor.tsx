'use client'

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  FONT_FAMILY,
  viewportCoordsToSceneCoords,
} from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronUp,
  ImagePlus,
  LibraryBig,
  Loader2,
  PackagePlus,
  PenLine,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { DrawingBoardCore } from '@/components/drawing-board/drawing-board-core'
import { TeacherDrawingToolbar } from '@/components/drawing-board/drawing-board-toolbar'
import type {
  DrawingBoardCommandState,
  DrawingBoardController,
} from '@/components/drawing-board/drawing-board-controller'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  createDrawingPreview,
  DRAWING_DEFAULT_ITEM_STATE,
  drawingBackgroundStyle,
  stableDrawingAppState,
  TRANSPARENT_CANVAS,
} from '@/components/exam/drawing-board-utils'
import {
  CURRENT_WORK_FORMAT_VERSION,
  isTeachingBoardSlot,
  MATH_WORK_BUCKET,
  type TeachingBoardOperation,
  type TeachingBoardView,
} from '@/lib/math-work'
import {
  initialHandledTeachingBoardOperationNonce,
  isTeachingBoardOperationPending,
} from '@/lib/teaching-board-lifecycle'
import {
  emptyScratchpadScene,
  type ScratchpadBackground,
  type ScratchpadScene,
} from '@/lib/scratchpad'
import {
  createLegacyTeacherImageSnapshot,
  isIncompleteTransientDrawingElement,
  snapshotDrawingScene,
  validateDrawingScene,
  type LegacyTeacherImageSnapshot,
} from '@/lib/drawing-board-policy'
import type { FingerInputMode } from '@/lib/drawing-board-input'
import {
  cleanTeacherDraftState,
  editedTeacherDraftState,
  initialTeacherDraftState,
  TEACHER_DRAFT_STATE_LABEL,
  type TeacherQuestionDraftState,
  type TeachingBoardDraftRecord,
  type TeachingBoardTarget,
} from '@/lib/teaching-board-draft-state'
import { scratchpadHasMeaningfulDraft } from '@/lib/scratchpad-state'
import {
  createDrawingBoardSessionLibraryItem,
  insertDrawingBoardSessionLibraryItem,
  MAX_DRAWING_SESSION_LIBRARY_ITEMS,
  type DrawingBoardSessionLibraryItem,
} from '@/lib/drawing-board-session-library'

interface Props {
  assignmentId: string
  questionId: string
  /** "ข้อ 15/22" — every save says which ข้อ it lands on. */
  questionLabel: string
  slot: number
  board: TeachingBoardView | null
  canManage: boolean
  operation: TeachingBoardOperation
  /** What was on this ข้อ's board when the teacher last left it. */
  initialScene?: ScratchpadScene | null
  initialDirty?: boolean
  initialDraftState?: TeacherQuestionDraftState
  onSaved: (
    questionId: string,
    slot: number,
    boardId: string,
    expectedTarget: { slot: number; boardId: string | null },
  ) => Promise<void>
  onDraftStateChange: (
    target: TeachingBoardTarget,
    state: TeacherQuestionDraftState,
    dirty: boolean,
  ) => void
  /** Reports the live scene so the ข้อ can be returned to as it was left. */
  onSceneChange?: (target: TeachingBoardTarget, scene: ScratchpadScene) => void
  /** The board being fetched while the committed target stays on screen. */
  pendingBoard?: TeachingBoardView | null
  onLoadResolved?: (
    nonce: number,
    target: TeachingBoardTarget,
    scene: ScratchpadScene,
    state: TeacherQuestionDraftState,
  ) => void
  onLoadFailed?: (nonce: number, target: TeachingBoardTarget) => void
  /** Gives the route owner a chance to confirm and keep one-step recovery. */
  onResetRequested?: (draft: TeachingBoardDraftRecord) => Promise<boolean>
  /** This ข้อ's pictures, offered on the board itself as well as in the card. */
  questionImages?: string[]
  /**
   * Where a new board should be saved: the next free ช่อง, or — when all of
   * them are taken — the one the teacher chose to write over. Null cancels.
   */
  onResolveSaveSlot?: () => Promise<{ slot: number; replacing: boolean } | null>
  /** A รูปประกอบโจทย์ the teacher asked to drop onto this board. */
  insertImage?: { url: string; nonce: number } | null
  onInsertImageHandled?: (nonce: number) => void
  /** Detaches the live draft from its source slot after a next-step clone. */
  onDuplicated?: (scene: ScratchpadScene) => void
  fingerInputMode: FingerInputMode
  onFingerInputModeChange: (mode: FingerInputMode) => void
  presentationLocked: boolean
  onPresentationLockedChange: (locked: boolean) => void
  gridEnabled: boolean
  onGridEnabledChange: (enabled: boolean) => void
  snapEnabled: boolean
  onSnapEnabledChange: (enabled: boolean) => void
  sessionLibraryItems: readonly DrawingBoardSessionLibraryItem[]
  onSessionLibraryItemAdd: (item: DrawingBoardSessionLibraryItem) => void
  onSessionLibraryItemRemove: (itemId: string) => void
  /** Given when the board can be folded away to its heading. */
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

function validateStoredTeacherScene(value: unknown) {
  return validateDrawingScene(value, {
    role: 'teacher',
    verifyTeacherImage: ({ claim }) => claim ? 'valid' : 'invalid',
    allowUnsignedTeacherImages: true,
  })
}

export default function TeachingBoardEditor({
  assignmentId,
  questionId,
  questionLabel,
  slot,
  board,
  canManage,
  operation,
  initialScene,
  initialDirty = false,
  initialDraftState,
  onSaved,
  onDraftStateChange,
  onSceneChange,
  pendingBoard,
  onLoadResolved,
  onLoadFailed,
  onResetRequested,
  questionImages = [],
  onResolveSaveSlot,
  insertImage,
  onInsertImageHandled,
  onDuplicated,
  fingerInputMode,
  onFingerInputModeChange,
  presentationLocked,
  onPresentationLockedChange,
  gridEnabled,
  onGridEnabledChange,
  snapEnabled,
  onSnapEnabledChange,
  sessionLibraryItems,
  onSessionLibraryItemAdd,
  onSessionLibraryItemRemove,
  onHide,
}: Props) {
  const initialValidation = useMemo(
    () => initialScene ? validateStoredTeacherScene(initialScene) : null,
    [initialScene],
  )
  const safeInitialScene = initialValidation?.ok ? initialValidation.scene : emptyScratchpadScene()
  const initialPolicyMessage = initialValidation && !initialValidation.ok
    ? 'กระดานฉบับนี้มีข้อมูลที่เวอร์ชันปัจจุบันยังไม่รองรับ จึงเก็บฉบับเดิมไว้และไม่เปิดให้แก้ไข'
    : null
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const target = useMemo<TeachingBoardTarget>(() => ({
    questionId,
    slot,
    boardId: board?.id ?? null,
  }), [board?.id, questionId, slot])
  const mountedRef = useRef(true)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const paperRef = useRef<HTMLDivElement | null>(null)
  const loadRequestRef = useRef(0)
  const sceneMutationEpochRef = useRef(0)
  const savingRef = useRef(false)
  const releasePersistenceOnReadyRef = useRef(false)
  const pendingLibrarySelectionRef = useRef<Set<string> | null>(null)
  const sceneRef = useRef<ScratchpadScene>(safeInitialScene)
  const contentSignatureRef = useRef(
    contentSignature(safeInitialScene.elements as readonly OrderedExcalidrawElement[]),
  )
  const handledOperationRef = useRef(initialHandledTeachingBoardOperationNonce({
    operation,
    questionId,
    slot,
    boardId: board?.id ?? null,
    hasValidParkedScene: Boolean(initialScene && initialValidation?.ok),
  }))
  // A matching load/reset must block in the very first render after the
  // parent switches targets. Waiting for the passive effect below leaves one
  // paint where the old scene can still be edited or saved under the new id.
  const operationPending = isTeachingBoardOperationPending({
    operation,
    handledNonce: handledOperationRef.current,
    questionId,
    slot,
  })
  const persistenceBlockedRef = useRef(
    Boolean(initialPolicyMessage) || !initialValidation?.ok || operationPending,
  )
  const legacyTeacherImagesRef = useRef<LegacyTeacherImageSnapshot | null>(
    createLegacyTeacherImageSnapshot(safeInitialScene),
  )
  const ignoreChangesRef = useRef(true)
  const [background, setBackground] = useState<ScratchpadBackground>(safeInitialScene.background)
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
  const [duplicating, setDuplicating] = useState(false)
  const [insertingImage, setInsertingImage] = useState(false)
  const [pickingImage, setPickingImage] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [draftState, setDraftState] = useState<TeacherQuestionDraftState>(() => (
    initialPolicyMessage
      ? 'unsupported_read_only'
      : initialDraftState ?? initialTeacherDraftState({
          hasBoard: Boolean(board),
          editable: canManage && (!board || board.editable),
          dirty: initialDirty,
        })
  ))
  const [apiReady, setApiReady] = useState(false)
  const [sceneReady, setSceneReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [policyReadOnlyMessage, setPolicyReadOnlyMessage] = useState<string | null>(initialPolicyMessage)
  const [editorScene, setEditorScene] = useState<ScratchpadScene>(safeInitialScene)
  const [editorRevision, setEditorRevision] = useState(0)
  const [selectedLibraryItemId, setSelectedLibraryItemId] = useState('')
  const [confirm, confirmDialog] = useConfirm()

  useEffect(() => {
    if (
      selectedLibraryItemId
      && !sessionLibraryItems.some(item => item.id === selectedLibraryItemId)
    ) setSelectedLibraryItemId(sessionLibraryItems.at(-1)?.id ?? '')
  }, [selectedLibraryItemId, sessionLibraryItems])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      loadRequestRef.current += 1
      apiRef.current = null
    }
  }, [])

  const editable = canManage
    && (!board || board.editable)
    && !policyReadOnlyMessage
    && !loading
    && !saving
    && sceneReady
    && !operationPending
  const canReset = canManage && (!board || board.editable)
  // A board left in ช่อง 4–5 from before the cap came down cannot be saved
  // back there — the parent sends it to a free ช่อง — so it is not บันทึกทับ.
  const savesOverBoard = board !== null && isTeachingBoardSlot(board.slot)

  const reportDraftState = useCallback((
    nextState: TeacherQuestionDraftState,
    nextDirty: boolean,
    nextTarget = target,
  ) => {
    setDraftState(nextState)
    onDraftStateChange(nextTarget, nextState, nextDirty)
  }, [onDraftStateChange, target])

  const markDirty = useCallback((next: boolean) => {
    setDirty(next)
    reportDraftState(
      next
        ? editedTeacherDraftState(Boolean(board))
        : cleanTeacherDraftState({
            hasBoard: Boolean(board),
            editable: canManage && (!board || board.editable),
          }),
      next,
    )
  }, [board, canManage, reportDraftState])

  const releaseChangeGuard = () => {
    requestAnimationFrame(() => { ignoreChangesRef.current = false })
  }

  const showSafeReadOnlyPlaceholder = useCallback((message: string) => {
    persistenceBlockedRef.current = true
    releasePersistenceOnReadyRef.current = false
    setSceneReady(false)
    setPolicyReadOnlyMessage(message)
    ignoreChangesRef.current = true
    const scene = emptyScratchpadScene()
    sceneRef.current = scene
    legacyTeacherImagesRef.current = createLegacyTeacherImageSnapshot(scene)
    contentSignatureRef.current = ''
    setBackground('lined')
    setEditorScene(scene)
    setEditorRevision(value => value + 1)
    setDirty(false)
  }, [])

  const resetCanvas = useCallback((dirtyAfterReset = false) => {
    loadRequestRef.current += 1
    sceneMutationEpochRef.current += 1
    setLoading(false)
    setSceneReady(false)
    persistenceBlockedRef.current = true
    releasePersistenceOnReadyRef.current = true
    ignoreChangesRef.current = true
    const scene = emptyScratchpadScene()
    sceneRef.current = scene
    legacyTeacherImagesRef.current = createLegacyTeacherImageSnapshot(scene)
    contentSignatureRef.current = ''
    setBackground(scene.background)
    setPolicyReadOnlyMessage(null)
    setEditorScene(scene)
    setEditorRevision(value => value + 1)
    onSceneChange?.(target, scene)
    markDirty(dirtyAfterReset)
  }, [markDirty, onSceneChange, target])

  const loadBoardScene = useCallback(async (
    targetBoard: TeachingBoardView,
    targetOperation: TeachingBoardOperation,
  ) => {
    if (!apiRef.current) return
    const requestId = ++loadRequestRef.current
    const requestedTarget: TeachingBoardTarget = {
      questionId,
      slot: targetBoard.slot,
      boardId: targetBoard.id,
    }
    const replacingCommittedTarget = target.boardId !== requestedTarget.boardId
      || target.slot !== requestedTarget.slot
    const previousSceneReady = sceneReady
    persistenceBlockedRef.current = true
    releasePersistenceOnReadyRef.current = false
    setSceneReady(false)
    setLoading(true)
    reportDraftState('loading_slot', dirty)
    try {
      const { getTeachingBoardScene } = await import('@/lib/actions/math-work')
      if (requestId !== loadRequestRef.current) return
      const loaded = await getTeachingBoardScene(targetBoard.id)
      if (requestId !== loadRequestRef.current) return
      if (!loaded || 'error' in loaded) throw new Error(loaded?.error ?? 'เปิดกระดานสอนไม่สำเร็จ')
      const validated = validateStoredTeacherScene(loaded.scene)
      if (!validated.ok) {
        showSafeReadOnlyPlaceholder(
          'กระดานฉบับนี้มีข้อมูลที่เวอร์ชันปัจจุบันยังไม่รองรับ ข้อมูลต้นฉบับยังเก็บอยู่และจะไม่ถูกเขียนทับ',
        )
        const placeholder = emptyScratchpadScene()
        reportDraftState('unsupported_read_only', false, requestedTarget)
        onLoadResolved?.(
          targetOperation.nonce,
          requestedTarget,
          placeholder,
          'unsupported_read_only',
        )
        return
      }
      const scene = validated.scene

      if (requestId !== loadRequestRef.current) return
      ignoreChangesRef.current = true
      contentSignatureRef.current = contentSignature(scene.elements as readonly OrderedExcalidrawElement[])
      sceneRef.current = scene
      sceneMutationEpochRef.current += 1
      legacyTeacherImagesRef.current = createLegacyTeacherImageSnapshot(scene)
      releasePersistenceOnReadyRef.current = true
      setPolicyReadOnlyMessage(null)
      setBackground(scene.background)
      setEditorScene(scene)
      setEditorRevision(value => value + 1)
      const resolvedState: TeacherQuestionDraftState = targetBoard.editable
        ? 'saved_slot'
        : 'read_only_slot'
      setDirty(false)
      setDraftState(resolvedState)
      onSceneChange?.(requestedTarget, scene)
      onLoadResolved?.(targetOperation.nonce, requestedTarget, scene, resolvedState)
      toast.success(loaded.legacySvgRasterized
        ? 'เปิดกระดานแล้ว · แปลงรูป SVG เดิมเป็นภาพปลอดภัยก่อนแก้ไข'
        : targetBoard.editable
          ? `เปิดกระดานช่อง ${targetBoard.slot} แล้ว`
          : `เปิดกระดานของ ${targetBoard.creatorName} แล้ว`)
    } catch (error) {
      if (requestId !== loadRequestRef.current) return
      if (replacingCommittedTarget && previousSceneReady) {
        persistenceBlockedRef.current = false
        setSceneReady(true)
        reportDraftState('load_failed', dirty)
      } else {
        showSafeReadOnlyPlaceholder(
          'เปิดกระดานฉบับนี้ไม่สำเร็จ จึงหยุดการแก้ไขและเก็บข้อมูลต้นฉบับไว้โดยไม่เขียนทับ',
        )
        onSceneChange?.(target, emptyScratchpadScene())
        reportDraftState('load_failed', false)
      }
      onLoadFailed?.(targetOperation.nonce, requestedTarget)
      toast.error(error instanceof Error ? error.message : 'เปิดกระดานสอนไม่สำเร็จ')
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false)
    }
  }, [dirty, onLoadFailed, onLoadResolved, onSceneChange, questionId, reportDraftState, sceneReady, showSafeReadOnlyPlaceholder, target])

  useEffect(() => {
    if (
      operation.nonce <= 0
      || handledOperationRef.current === operation.nonce
      || operation.questionId !== questionId
    ) return
    if (operation.kind === 'idle' || operation.kind === 'pending') return
    if (operation.kind === 'load') {
      const targetBoard = pendingBoard?.id === operation.boardId
        ? pendingBoard
        : board?.id === operation.boardId ? board : null
      if (!apiReady || !targetBoard) return
      handledOperationRef.current = operation.nonce
      void loadBoardScene(targetBoard, operation)
      return
    }
    if (board || operation.boardId !== null) return
    handledOperationRef.current = operation.nonce
    resetCanvas(false)
  }, [apiReady, board, loadBoardScene, operation, pendingBoard, questionId, resetCanvas, slot])

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

  // The strokes come back through initialData; this only restores the
  // "not saved yet" state that came with them.
  const restoredRef = useRef(false)
  useEffect(() => {
    if (!apiReady || restoredRef.current || !initialScene) return
    restoredRef.current = true
    setDirty(initialDirty)
    reportDraftState(
      initialDraftState ?? initialTeacherDraftState({
        hasBoard: Boolean(board),
        editable: canManage && (!board || board.editable),
        dirty: initialDirty,
      }),
      initialDirty,
    )
  }, [apiReady, board, canManage, initialDirty, initialDraftState, initialScene, reportDraftState])

  const handleChange = useCallback((
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    if (operationPending || persistenceBlockedRef.current) return
    const nextSignature = contentSignature(elements)
    const contentChanged = nextSignature !== contentSignatureRef.current
    contentSignatureRef.current = nextSignature
    if (contentChanged) sceneMutationEpochRef.current += 1
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
    onSceneChange?.(target, sceneRef.current)
    if (contentChanged && !ignoreChangesRef.current && editable) markDirty(true)
  }, [background, editable, markDirty, onSceneChange, operationPending, target])

  const chooseBackground = (next: ScratchpadBackground) => {
    if (!editable || presentationLocked) return
    sceneMutationEpochRef.current += 1
    setBackground(next)
    sceneRef.current = { ...sceneRef.current, background: next }
    onSceneChange?.(target, sceneRef.current)
    markDirty(true)
  }

  /**
   * Drops a รูปประกอบโจทย์ onto the sheet, centred on what the teacher is
   * looking at and scaled to sit inside it.
   *
   * The picture is embedded rather than linked: the board is saved as one
   * scene file, and a link would break the day the question's image moves.
   * The server verifies that the URL belongs to this question, rasterizes it,
   * strips metadata and returns a signed provenance claim with the file.
   */
  const dropQuestionImage = useCallback(async (url: string): Promise<boolean> => {
    const api = apiRef.current
    if (
      !api
      || !editable
      || presentationLocked
      || duplicating
      || !sceneReady
      || persistenceBlockedRef.current
      || savingRef.current
    ) return false
    const boardEpoch = loadRequestRef.current
    setInsertingImage(true)
    try {
      const { prepareTeachingQuestionImage } = await import('@/lib/actions/math-work')
      const prepared = await prepareTeachingQuestionImage({
        assignmentId,
        questionId,
        sourceUrl: url,
      })
      // A question/slot switch or remount while the server rasterizes must not
      // write into a detached editor or mark the new board dirty.
      if (
        apiRef.current !== api
        || loadRequestRef.current !== boardEpoch
        || persistenceBlockedRef.current
        || savingRef.current
      ) return true
      if (!prepared || 'error' in prepared) {
        throw new Error(prepared?.error ?? 'เตรียมรูปจากโจทย์ไม่สำเร็จ')
      }

      const state = api.getAppState()
      const box = surfaceRef.current?.getBoundingClientRect()
      const zoom = state.zoom.value
      const viewWidth = (box?.width ?? PAGE_WIDTH) / zoom
      const viewHeight = (box?.height ?? PAGE_HEIGHT) / zoom
      const fit = Math.min(
        1,
        (viewWidth * 0.7) / prepared.width,
        (viewHeight * 0.7) / prepared.height,
        (PAGE_WIDTH * 0.8) / prepared.width,
      )
      const width = Math.round(prepared.width * fit)
      const height = Math.round(prepared.height * fit)

      const fileId = prepared.file.id as BinaryFileData['id']
      api.addFiles([prepared.file as unknown as BinaryFileData])
      api.updateScene({
        elements: [
          // Keep deleted tombstones: Excalidraw's eraser can leave a surviving
          // binding pointed at one, and dropping history here would turn that
          // valid inert edge into a dangling relation.
          ...api.getSceneElementsIncludingDeleted(),
          ...convertToExcalidrawElements([{
            type: 'image',
            fileId,
            x: -state.scrollX + viewWidth / 2 - width / 2,
            y: -state.scrollY + viewHeight / 2 - height / 2,
            width,
            height,
          }]),
        ],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      })
      markDirty(true)
      toast.success('ใส่รูปจากโจทย์ลงกระดานแล้ว')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ใส่รูปจากโจทย์ไม่สำเร็จ')
    } finally {
      setInsertingImage(false)
    }
    return true
  }, [assignmentId, duplicating, editable, markDirty, presentationLocked, questionId, sceneReady])

  const handledInsertRef = useRef(0)
  useEffect(() => {
    if (
      !apiReady
      || !sceneReady
      || !editable
      || persistenceBlockedRef.current
      || !insertImage
      || insertImage.nonce === handledInsertRef.current
    ) return
    handledInsertRef.current = insertImage.nonce
    const request = insertImage
    void dropQuestionImage(request.url).then(attempted => {
      if (attempted) onInsertImageHandled?.(request.nonce)
      else if (handledInsertRef.current === request.nonce) handledInsertRef.current = 0
    })
  }, [apiReady, dropQuestionImage, editable, insertImage, onInsertImageHandled, sceneReady])

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

  const duplicateNextStep = async () => {
    const api = apiRef.current
    if (
      !api
      || !editable
      || presentationLocked
      || duplicating
      || insertingImage
      || savingRef.current
      || persistenceBlockedRef.current
    ) return
    const source = snapshotDrawingScene(sceneRef.current)
    const requestEpoch = loadRequestRef.current
    setDuplicating(true)
    try {
      const { duplicateTeachingBoardScene } = await import('@/lib/actions/math-work')
      const result = await duplicateTeachingBoardScene({
        assignmentId,
        questionId,
        sourceBoardId: board?.id ?? null,
        scene: source,
      })
      if (
        apiRef.current !== api
        || loadRequestRef.current !== requestEpoch
        || persistenceBlockedRef.current
        || savingRef.current
      ) return
      if (!result || 'error' in result) {
        throw new Error(result?.error ?? 'ทำสำเนากระดานไม่สำเร็จ')
      }
      const validated = validateStoredTeacherScene(result.scene)
      if (!validated.ok) throw new Error('สำเนากระดานมีข้อมูลที่ไม่รองรับ')
      const scene = validated.scene

      sceneMutationEpochRef.current += 1
      persistenceBlockedRef.current = true
      releasePersistenceOnReadyRef.current = true
      setSceneReady(false)
      ignoreChangesRef.current = true
      sceneRef.current = scene
      contentSignatureRef.current = contentSignature(scene.elements as readonly OrderedExcalidrawElement[])
      legacyTeacherImagesRef.current = createLegacyTeacherImageSnapshot(scene)
      setBackground(scene.background)
      setEditorScene(scene)
      setEditorRevision(value => value + 1)
      onDuplicated?.(scene)
      setDirty(true)
      setDraftState('unsaved_new')
      toast.success('สร้างขั้นถัดไปแล้ว · ต้นฉบับยังอยู่ช่องเดิม')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ทำสำเนากระดานไม่สำเร็จ')
    } finally {
      if (mountedRef.current) setDuplicating(false)
    }
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

  const saveBoard = async () => {
    const api = apiRef.current
    if (!api || !editable || savingRef.current || persistenceBlockedRef.current) return
    const resolveEpoch = loadRequestRef.current

    // Which ช่อง this lands in belongs to the parent: it is the side that
    // knows every ช่อง, and the one that asks when they are all taken.
    let target = { slot, replacing: Boolean(board) }
    if (onResolveSaveSlot) {
      const resolved = await onResolveSaveSlot()
      if (!resolved) return
      target = resolved
    } else if (board) {
      const ok = await confirm({
        title: `บันทึกทับกระดาน ${questionLabel} ช่อง ${slot}?`,
        description: 'ภาพและไฟล์ต้นฉบับเดิมในช่องนี้จะถูกแทนที่ด้วยกระดานที่กำลังเปิดอยู่',
        confirmLabel: 'บันทึกทับ',
      })
      if (!ok) return
    }
    if (
      apiRef.current !== api
      || loadRequestRef.current !== resolveEpoch
      || persistenceBlockedRef.current
    ) return

    const state = api.getAppState()
    const transientElementId = state.newElement?.id
      ?? state.editingLinearElement?.elementId
      ?? null
    if (isIncompleteTransientDrawingElement(
      api.getSceneElementsIncludingDeleted(),
      transientElementId,
    )) {
      toast.error('แก้เส้นให้เสร็จก่อนบันทึกกระดาน')
      return
    }
    const snapshot = snapshotDrawingScene(sceneRef.current)

    savingRef.current = true
    setSaving(true)
    reportDraftState('saving', true)
    const boardEpoch = loadRequestRef.current
    const mutationEpoch = sceneMutationEpochRef.current
    try {
      const validated = validateDrawingScene(snapshot, {
        role: 'teacher',
        verifyTeacherImage: ({ claim }) => claim ? 'valid' : 'invalid',
        legacyTeacherImages: legacyTeacherImagesRef.current,
      })
      if (!validated.ok) throw new Error('กระดานมีข้อมูลที่ไม่รองรับหรือรูปโจทย์ไม่ผ่านการตรวจสอบ')
      const preview = await createDrawingPreview(
        api,
        background,
        'เขียนบนกระดานก่อนกดบันทึก',
        snapshot,
      )
      const { prepareTeachingBoardUpload, saveTeachingBoard } = await import('@/lib/actions/math-work')
      const prepared = await prepareTeachingBoardUpload({
        assignmentId,
        questionId,
        slot: target.slot,
        formatVersion: CURRENT_WORK_FORMAT_VERSION,
        previewFormat: preview.format,
        scene: snapshot,
      })
      if (!prepared || 'error' in prepared) throw new Error(prepared?.error ?? 'เตรียมพื้นที่บันทึกไม่สำเร็จ')

      const { createClient } = await import('@/lib/supabase/client')
      const bucket = createClient().storage.from(MATH_WORK_BUCKET)
      await bucket.uploadToSignedUrl(prepared.preview.path, prepared.preview.token, preview.blob, {
        contentType: preview.blob.type,
        cacheControl: '300',
      })
      const saved = await saveTeachingBoard({
        assignmentId,
        questionId,
        slot: target.slot,
        uploadId: prepared.uploadId,
        uploadReceipt: prepared.uploadReceipt,
        formatVersion: CURRENT_WORK_FORMAT_VERSION,
        replaceExisting: target.replacing,
        previewFormat: preview.format,
      })
      if (!saved || 'error' in saved) throw new Error(saved?.error ?? 'บันทึกกระดานสอนไม่สำเร็จ')
      const stillCurrent = apiRef.current === api
        && loadRequestRef.current === boardEpoch
        && sceneMutationEpochRef.current === mutationEpoch
      const refreshed = onSaved(questionId, target.slot, saved.board.id, {
        slot,
        boardId: board?.id ?? null,
      })
      if (stillCurrent) {
        setDirty(false)
        setDraftState('saved_slot')
        await refreshed
        toast.success(target.replacing
          ? `บันทึกทับ ${questionLabel} ช่อง ${target.slot} แล้ว`
          : `บันทึกกระดานลง ${questionLabel} ช่อง ${target.slot} แล้ว`)
      } else {
        await refreshed
        toast.success(`บันทึก ${questionLabel} ช่อง ${target.slot} แล้ว · งานที่แก้ต่อยังไม่ได้บันทึก`)
      }
    } catch (error) {
      reportDraftState('save_failed', true)
      toast.error(error instanceof Error ? error.message : 'บันทึกกระดานสอนไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      savingRef.current = false
      if (mountedRef.current) setSaving(false)
    }
  }

  const requestReset = async () => {
    const snapshot = snapshotDrawingScene(sceneRef.current)
    if (
      onResetRequested
      && !await onResetRequested({
        target,
        scene: snapshot,
        state: draftState,
        dirty,
      })
    ) return
    resetCanvas(Boolean(board))
  }

  const storeSelectionInSessionLibrary = () => {
    const api = apiRef.current
    if (!api || !editable || presentationLocked) return
    const selectedElementIds = pendingLibrarySelectionRef.current ?? new Set(
      Object.entries(api.getAppState().selectedElementIds)
        .filter(([, selected]) => selected)
        .map(([elementId]) => elementId),
    )
    pendingLibrarySelectionRef.current = null
    const nextNumber = sessionLibraryItems.length + 1
    const result = createDrawingBoardSessionLibraryItem({
      scene: snapshotDrawingScene(sceneRef.current),
      selectedElementIds,
      id: crypto.randomUUID(),
      label: `รายการ ${nextNumber}`,
    })
    if (!result.ok) {
      const message = result.reason === 'empty-selection'
        ? 'เลือกเส้น รูปทรง หรือข้อความก่อนเก็บในคลังชั่วคราว'
        : result.reason === 'unsupported-selection'
          ? 'คลังชั่วคราวเก็บได้เฉพาะเส้น รูปทรง และข้อความ ไม่รวมรูปหรือกรอบ'
          : result.reason === 'too-many-elements' || result.reason === 'too-large'
            ? 'ส่วนที่เลือกมีขนาดใหญ่เกินไป กรุณาเลือกให้น้อยลง'
            : 'ส่วนที่เลือกมีข้อมูลที่คลังชั่วคราวไม่รองรับ'
      toast.error(message)
      return
    }
    const evicted = sessionLibraryItems.length >= MAX_DRAWING_SESSION_LIBRARY_ITEMS
    onSessionLibraryItemAdd(result.item)
    setSelectedLibraryItemId(result.item.id)
    toast.success(evicted
      ? 'เก็บในคลังชั่วคราวแล้ว และนำรายการเก่าสุดออก'
      : 'เก็บส่วนที่เลือกในคลังชั่วคราวแล้ว')
  }

  const insertSessionLibraryItem = () => {
    const api = apiRef.current
    const surface = surfaceRef.current
    const item = sessionLibraryItems.find(value => value.id === selectedLibraryItemId)
    if (!api || !surface || !item || !editable || presentationLocked) return
    const rect = surface.getBoundingClientRect()
    const center = viewportCoordsToSceneCoords({
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }, api.getAppState())
    const inserted = insertDrawingBoardSessionLibraryItem({ item, center })
    if (!inserted.ok) {
      toast.error('รายการนี้ผ่านการตรวจสอบไม่สำเร็จ จึงยังไม่ถูกวางลงกระดาน')
      return
    }
    const elements = [
      ...api.getSceneElementsIncludingDeleted(),
      ...inserted.elements,
    ]
    const candidate: ScratchpadScene = {
      ...snapshotDrawingScene(sceneRef.current),
      elements,
    }
    const validation = validateDrawingScene(candidate, {
      role: 'teacher',
      verifyTeacherImage: ({ claim }) => claim ? 'valid' : 'invalid',
      legacyTeacherImages: legacyTeacherImagesRef.current,
    })
    if (!validation.ok) {
      toast.error('วางรายการนี้ไม่ได้ เพราะกระดานจะเกินขีดจำกัดหรือมีข้อมูลไม่รองรับ')
      return
    }
    const selectedElementIds = Object.fromEntries(
      inserted.elements.flatMap(value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return []
        const elementId = (value as Record<string, unknown>).id
        return typeof elementId === 'string' ? [[elementId, true] as const] : []
      }),
    )
    api.updateScene({
      elements: validation.scene.elements as readonly OrderedExcalidrawElement[],
      appState: { selectedElementIds },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    })
    toast.success(`วาง ${item.label} ลงกระดานแล้ว`)
  }

  return (
    <>
      <Card role="region" aria-label="กระดานสอน" className="flex h-[70dvh] min-h-[560px] min-w-0 max-w-full flex-col overflow-hidden lg:h-full">
        <div className="shrink-0 border-b border-border bg-card px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <PenLine className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{questionLabel}</p>
              <p className="text-[10px] text-muted-foreground" aria-live="polite">
                {saving ? TEACHER_DRAFT_STATE_LABEL.saving
                  : insertingImage ? 'กำลังใส่รูปจากโจทย์...'
                    : duplicating ? 'กำลังสร้างขั้นถัดไป...'
                      : presentationLocked ? 'ล็อกพรีเซนต์ · เขียนแก้ไม่ได้'
                        : TEACHER_DRAFT_STATE_LABEL[draftState]}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              {canReset && (
                <Button type="button" variant="outline" size="xs" onClick={() => void requestReset()} disabled={saving || loading || operationPending || presentationLocked || duplicating || !scratchpadHasMeaningfulDraft(sceneRef.current)}>
                  <RotateCcw /> กระดานใหม่
                </Button>
              )}
              {editable && (
                <Button type="button" size="xs" onClick={() => void saveBoard()} disabled={saving || loading || duplicating || !dirty}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}
                  {saving ? 'กำลังบันทึก...' : savesOverBoard ? 'บันทึกทับ' : 'บันทึกเฉลย'}
                </Button>
              )}
              {onHide && (
                <Button type="button" variant="ghost" size="xs" aria-expanded={true} onClick={onHide} disabled={saving}>
                  <ChevronUp /> ซ่อน
                </Button>
              )}
            </div>
          </div>
          {editable && questionImages.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <Button
                type="button"
                variant={pickingImage ? 'secondary' : 'outline'}
                size="xs"
                disabled={insertingImage || presentationLocked}
                aria-pressed={questionImages.length > 1 ? pickingImage : undefined}
                onClick={() => {
                  if (questionImages.length === 1) void dropQuestionImage(questionImages[0])
                  else setPickingImage(value => !value)
                }}
              >
                {insertingImage ? <Loader2 className="animate-spin" /> : <ImagePlus />}
                รูปโจทย์{questionImages.length > 1 ? ` (${questionImages.length})` : ''}
              </Button>
            </div>
          )}
        </div>

        {pickingImage && questionImages.length > 1 && (
          <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-border bg-muted/30 px-3 py-2">
            {questionImages.map((url, index) => (
              <Button
                key={url}
                type="button"
                variant="outline"
                disabled={insertingImage}
                className="h-auto shrink-0 flex-col gap-1 p-1.5"
                aria-label={`ใส่รูปโจทย์ที่ ${index + 1} ลงกระดาน`}
                onClick={() => {
                  setPickingImage(false)
                  void dropQuestionImage(url)
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-14 w-20 rounded border bg-card object-contain" />
                <span className="text-[10px] font-normal">รูปที่ {index + 1}</span>
              </Button>
            ))}
          </div>
        )}

        {canManage && (
          <div
            role="group"
            aria-label="คลังชั่วคราวของกระดานสอน"
            className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border bg-muted/30 px-3 py-1.5"
          >
            <LibraryBig className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="shrink-0"
              disabled={!editable || presentationLocked || duplicating || insertingImage}
              onPointerDown={() => {
                const api = apiRef.current
                if (!api) return
                pendingLibrarySelectionRef.current = new Set(
                  Object.entries(api.getAppState().selectedElementIds)
                    .filter(([, selected]) => selected)
                    .map(([elementId]) => elementId),
                )
              }}
              onPointerUp={() => {
                // A click follows pointerup in the same browser task. Clear a
                // capture that did not become a click before a later keyboard
                // activation can accidentally reuse the stale selection.
                window.setTimeout(() => { pendingLibrarySelectionRef.current = null }, 0)
              }}
              onPointerCancel={() => { pendingLibrarySelectionRef.current = null }}
              onClick={storeSelectionInSessionLibrary}
            >
              <PackagePlus data-icon="inline-start" /> เก็บส่วนที่เลือก
            </Button>
            <NativeSelect
              aria-label="รายการในคลังชั่วคราว"
              className="h-8 w-36 shrink-0 text-xs"
              value={selectedLibraryItemId}
              disabled={sessionLibraryItems.length === 0}
              onChange={event => setSelectedLibraryItemId(event.target.value)}
            >
              <option value="">{sessionLibraryItems.length === 0 ? 'คลังยังว่าง' : 'เลือกจากคลัง'}</option>
              {sessionLibraryItems.map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </NativeSelect>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="shrink-0"
              disabled={!selectedLibraryItemId || !editable || presentationLocked || duplicating || insertingImage}
              onClick={insertSessionLibraryItem}
            >
              วางลงกระดาน
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              disabled={!selectedLibraryItemId}
              aria-label="ลบรายการที่เลือกจากคลังชั่วคราว"
              onClick={() => {
                if (!selectedLibraryItemId) return
                onSessionLibraryItemRemove(selectedLibraryItemId)
              }}
            >
              <Trash2 />
            </Button>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              อยู่เฉพาะหน้านี้ · {sessionLibraryItems.length}/{MAX_DRAWING_SESSION_LIBRARY_ITEMS}
            </span>
          </div>
        )}

        <TeacherDrawingToolbar
          controller={controller}
          state={commandState}
          background={background}
          fingerMode={fingerInputMode}
          disabled={!editable || presentationLocked || duplicating || insertingImage}
          presentationLocked={presentationLocked}
          gridEnabled={gridEnabled}
          snapEnabled={snapEnabled}
          duplicateBusy={duplicating}
          onBackgroundChange={chooseBackground}
          onFingerModeChange={onFingerInputModeChange}
          onFit={fitPaper}
          onPresentationLockedChange={locked => {
            setPickingImage(false)
            onPresentationLockedChange(locked)
          }}
          onGridEnabledChange={onGridEnabledChange}
          onSnapEnabledChange={onSnapEnabledChange}
          onDuplicateNextStep={() => void duplicateNextStep()}
        />

        <DrawingBoardCore
          role="teacher"
          background={background}
          surfaceRef={surfaceRef}
          onWheelCapture={passWheelToPage}
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
            if (releasePersistenceOnReadyRef.current) {
              releasePersistenceOnReadyRef.current = false
              persistenceBlockedRef.current = false
            }
            setSceneReady(!persistenceBlockedRef.current)
            releaseChangeGuard()
            setApiReady(true)
          }}
          onChange={handleChange}
          viewModeEnabled={!editable}
          contentEditingLocked={presentationLocked || duplicating}
          gridModeEnabled={gridEnabled}
          objectsSnapModeEnabled={snapEnabled}
          fingerInputMode={fingerInputMode}
          hideNativeControls
          onControllerReady={setController}
          onCommandStateChange={setCommandState}
          legacyTeacherImagesRef={legacyTeacherImagesRef}
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
          {(loading || operationPending) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-overlay/20 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-sm shadow-md">
                <Loader2 className="size-4 animate-spin" /> กำลังเปิดกระดาน...
              </div>
            </div>
          )}
          {policyReadOnlyMessage && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-overlay/20 p-6 backdrop-blur-[1px]">
              <Card role="status" radius="md" padding="md" elevation="md" className="max-w-sm text-center text-sm">
                <p className="font-semibold">เปิดแก้ไขกระดานฉบับนี้ไม่ได้</p>
                <p className="mt-1 text-xs text-muted-foreground">{policyReadOnlyMessage}</p>
              </Card>
            </div>
          )}
        </DrawingBoardCore>
      </Card>
      {confirmDialog}
    </>
  )
}
