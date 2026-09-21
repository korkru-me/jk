'use client'

import '@excalidraw/excalidraw/index.css'
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  MainMenu,
  viewportCoordsToSceneCoords,
} from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from '@excalidraw/excalidraw/types'
import type { CSSProperties, ReactNode, RefObject, WheelEventHandler } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  isDrawingBoardCommandAllowed,
  isIncompleteTransientDrawingElement,
  isDrawingBoardToolAllowed,
  isSerializedDrawingClipboardText,
  recoveryDrawingScene,
  referencedDrawingFiles,
  snapshotDrawingScene,
  shouldBlockDrawingBoardKeyboardEvent,
  validateDrawingScene,
  type DrawingBoardCommand,
  type DrawingBoardRole,
  type LegacyTeacherImageSnapshot,
  type RevisionedDrawingSceneSnapshot,
} from '@/lib/drawing-board-policy'
import { CURRENT_WORK_FORMAT_VERSION } from '@/lib/math-work'
import type { ScratchpadBackground, ScratchpadScene } from '@/lib/scratchpad'
import { stableDrawingAppState, TRANSPARENT_CANVAS } from '@/components/exam/drawing-board-utils'

const GUARDED_ACTIONS: ReadonlyArray<readonly [string, DrawingBoardCommand]> = [
  ['copy', 'copy-elements'], ['copyText', 'copy-elements'], ['copyStyles', 'copy-elements'],
  ['cut', 'cut-elements'], ['paste', 'paste-elements'], ['pasteStyles', 'paste-elements'],
  ['duplicateSelection', 'duplicate-elements'],
  ['sendBackward', 'change-order'], ['bringForward', 'change-order'],
  ['sendToBack', 'change-order'], ['bringToFront', 'change-order'],
  ['group', 'group'], ['ungroup', 'group'],
  ['alignTop', 'align'], ['alignBottom', 'align'], ['alignLeft', 'align'],
  ['alignRight', 'align'], ['alignVerticallyCentered', 'align'],
  ['alignHorizontallyCentered', 'align'], ['distributeHorizontally', 'align'],
  ['distributeVertically', 'align'], ['flipHorizontal', 'align'], ['flipVertical', 'align'],
  ['hyperlink', 'hyperlink'], ['copyElementLink', 'hyperlink'],
  ['linkToElement', 'hyperlink'], ['elementLinkSelector', 'hyperlink'],
  ['setEmbeddableAsActiveTool', 'embed'], ['ttd', 'embed'],
  ['clearCanvas', 'clear-native'],
  ['copyAsPng', 'export-native'], ['copyAsSvg', 'export-native'],
  ['imageExport', 'export-native'], ['jsonExport', 'export-native'],
  ['exportWithDarkMode', 'export-native'], ['changeExportBackground', 'export-native'],
  ['changeExportEmbedScene', 'export-native'], ['changeExportScale', 'export-native'],
  ['saveToActiveFile', 'export-native'], ['saveFileToDisk', 'export-native'],
  ['loadScene', 'export-native'], ['changeProjectName', 'export-native'],
  ['help', 'help-native'], ['toggleShortcuts', 'help-native'], ['commandPalette', 'help-native'],
  ['searchMenu', 'help-native'], ['elementStats', 'help-native'], ['stats', 'help-native'],
  ['toggleCanvasMenu', 'help-native'], ['toggleEditMenu', 'help-native'],
  ['toggleFullScreen', 'help-native'], ['toggleTheme', 'help-native'],
  ['zenMode', 'help-native'], ['viewMode', 'help-native'], ['goToCollaborator', 'help-native'],
  ['setFrameAsActiveTool', 'frame-native'], ['wrapSelectionInFrame', 'frame-native'],
  ['selectAllElementsInFrame', 'frame-native'], ['removeAllElementsFromFrame', 'frame-native'],
  ['updateFrameRendering', 'frame-native'],
  ['gridMode', 'grid-native'], ['objectsSnapMode', 'grid-native'],
  ['addToLibrary', 'library-native'],
  ['unlockAllElements', 'native-lock'], ['toggleElementLock', 'native-lock'],
  ['bindText', 'group'], ['unbindText', 'group'], ['createContainerFromText', 'group'],
  ['wrapTextInContainer', 'group'], ['cropEditor', 'generic-image'],
  ['changeViewBackgroundColor', 'export-native'],
]

const FORBIDDEN_CONTROL_SELECTOR = [
  '.App-toolbar__extra-tools-trigger', '.App-toolbar__extra-tools-dropdown',
  '.ToolIcon__lock', '.sidebar-trigger__label-element', '.default-sidebar-trigger', '.main-menu-trigger',
  '.help-icon', '.context-menu',
].join(',')

interface DrawingBoardCoreProps {
  role: DrawingBoardRole
  background: ScratchpadBackground
  initialData: ExcalidrawProps['initialData']
  onChange: (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => void
  onReady: (api: ExcalidrawImperativeAPI) => void
  onPointerUp?: ExcalidrawProps['onPointerUp']
  viewModeEnabled?: boolean
  autoFocus?: boolean
  theme?: ExcalidrawProps['theme']
  surfaceRef?: RefObject<HTMLDivElement | null>
  className?: string
  style?: CSSProperties
  onWheelCapture?: WheelEventHandler<HTMLDivElement>
  children?: ReactNode
  editorRevision?: number
  legacyTeacherImagesRef?: RefObject<LegacyTeacherImageSnapshot | null>
}

function targetInside(surface: HTMLDivElement, target: EventTarget | null): boolean {
  return target instanceof Node && surface.contains(target)
}

function isTextEditor(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.matches('textarea, input, [contenteditable="true"], .excalidraw-wysiwyg')
}

function plainClipboardText(event: ClipboardEvent): string | null {
  if (!event.clipboardData || event.clipboardData.files.length > 0) return null
  const text = event.clipboardData.getData('text/plain')
  if (!text || isSerializedDrawingClipboardText(text)) return null
  return text
}

function insertLiteralText(target: EventTarget | null, text: string): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    if (target.disabled || target.readOnly) return false
    const start = target.selectionStart ?? target.value.length
    const end = target.selectionEnd ?? start
    target.setRangeText(text, start, end, 'end')
    target.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertFromPaste',
      data: text,
    }))
    return true
  }
  if (!(target instanceof HTMLElement) || !target.isContentEditable) return false
  const selection = window.getSelection()
  if (!selection) return false
  let range = selection.rangeCount > 0 ? selection.getRangeAt(0) : document.createRange()
  if (!target.contains(range.commonAncestorContainer)) {
    range = document.createRange()
    range.selectNodeContents(target)
    range.collapse(false)
  }
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  target.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertFromPaste',
    data: text,
  }))
  return true
}

function registerGuardedActions(api: ExcalidrawImperativeAPI, role: DrawingBoardRole) {
  for (const [name, command] of GUARDED_ACTIONS) {
    if (isDrawingBoardCommandAllowed(role, command)) continue
    api.registerAction({
      name,
      label: '',
      perform: () => false,
      predicate: () => false,
      trackEvent: false,
    } as Parameters<ExcalidrawImperativeAPI['registerAction']>[0])
  }
}

/** Shared Excalidraw boundary for student and teacher hosts. */
export function DrawingBoardCore({
  role,
  background,
  initialData,
  onChange,
  onReady,
  onPointerUp,
  viewModeEnabled = false,
  autoFocus = false,
  theme,
  surfaceRef,
  className = '',
  style,
  onWheelCapture,
  children,
  editorRevision = 0,
  legacyTeacherImagesRef,
}: DrawingBoardCoreProps) {
  const localSurfaceRef = useRef<HTMLDivElement | null>(null)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const activeEditorRevisionRef = useRef(editorRevision)
  const lastGoodRef = useRef<RevisionedDrawingSceneSnapshot | null>(null)
  const restoringRevisionRef = useRef<number | null>(null)
  const backgroundRef = useRef(background)
  const recoverySequenceRef = useRef(0)
  const [recovery, setRecovery] = useState<{
    editorRevision: number
    sequence: number
    scene: ScratchpadScene
  } | null>(null)
  activeEditorRevisionRef.current = editorRevision
  backgroundRef.current = background

  const setSurface = useCallback((node: HTMLDivElement | null) => {
    localSurfaceRef.current = node
    if (surfaceRef) surfaceRef.current = node
  }, [surfaceRef])

  const handleReady = useCallback((api: ExcalidrawImperativeAPI) => {
    if (activeEditorRevisionRef.current !== editorRevision) return
    apiRef.current = api
    restoringRevisionRef.current = null
    queueMicrotask(() => registerGuardedActions(api, role))
    onReady(api)
  }, [editorRevision, onReady, role])

  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    const frame = requestAnimationFrame(() => registerGuardedActions(api, role))
    return () => cancelAnimationFrame(frame)
  }, [role])

  useLayoutEffect(() => {
    const surface = localSurfaceRef.current
    if (!surface) return
    const isScoped = (target: EventTarget | null) => (
      targetInside(surface, target) || targetInside(surface, document.activeElement)
    )
    const stop = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }
    const keydown = (event: KeyboardEvent) => {
      if (isScoped(event.target) && shouldBlockDrawingBoardKeyboardEvent(event)) stop(event)
    }
    const clipboardWrite = (event: ClipboardEvent) => {
      if (isScoped(event.target) && !isTextEditor(event.target)) stop(event)
    }
    const paste = (event: ClipboardEvent) => {
      if (!isScoped(event.target)) return
      const text = plainClipboardText(event)
      if (isTextEditor(event.target)) {
        stop(event)
        if (text !== null) insertLiteralText(event.target, text)
        return
      }
      const api = apiRef.current
      if (!api || api.getAppState().activeTool.type !== 'text' || text === null || viewModeEnabled) {
        stop(event)
        return
      }
      stop(event)
      const rect = surface.getBoundingClientRect()
      const state = api.getAppState()
      const point = viewportCoordsToSceneCoords(
        { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 },
        state,
      )
      const inserted = convertToExcalidrawElements([{ type: 'text', x: point.x, y: point.y, text }])
      api.updateScene({
        elements: [...api.getSceneElementsIncludingDeleted(), ...inserted],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      })
    }
    const denyTransfer = (event: Event) => {
      if (isScoped(event.target)) stop(event)
    }
    const denyContext = (event: MouseEvent) => {
      if (targetInside(surface, event.target)) stop(event)
    }
    const denyControl = (event: Event) => {
      if (
        event.target instanceof Element
        && targetInside(surface, event.target)
        && event.target.closest(FORBIDDEN_CONTROL_SELECTOR)
      ) stop(event)
    }

    window.addEventListener('keydown', keydown, true)
    window.addEventListener('paste', paste, true)
    window.addEventListener('copy', clipboardWrite, true)
    window.addEventListener('cut', clipboardWrite, true)
    window.addEventListener('drop', denyTransfer, true)
    window.addEventListener('dragover', denyTransfer, true)
    window.addEventListener('contextmenu', denyContext, true)
    window.addEventListener('pointerdown', denyControl, true)
    window.addEventListener('click', denyControl, true)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('paste', paste, true)
      window.removeEventListener('copy', clipboardWrite, true)
      window.removeEventListener('cut', clipboardWrite, true)
      window.removeEventListener('drop', denyTransfer, true)
      window.removeEventListener('dragover', denyTransfer, true)
      window.removeEventListener('contextmenu', denyContext, true)
      window.removeEventListener('pointerdown', denyControl, true)
      window.removeEventListener('click', denyControl, true)
    }
  }, [viewModeEnabled])

  const handleChange = useCallback((
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    if (activeEditorRevisionRef.current !== editorRevision) return
    const api = apiRef.current
    const activeTool = appState.activeTool.type
    if (api && (!isDrawingBoardToolAllowed(role, activeTool) || (
      !['selection', 'hand', 'eraser', 'laser'].includes(activeTool)
      && appState.activeTool.locked !== true
    ))) {
      api.setActiveTool({
        type: isDrawingBoardToolAllowed(role, activeTool)
          ? activeTool as 'freedraw'
          : (viewModeEnabled ? 'hand' : 'freedraw'),
        locked: true,
      })
    }

    const transientPatch: Partial<AppState> = {}
    if (appState.contextMenu !== null) transientPatch.contextMenu = null
    if (appState.openSidebar !== null) transientPatch.openSidebar = null
    if (appState.openMenu !== null) transientPatch.openMenu = null
    if (appState.openDialog !== null) transientPatch.openDialog = null
    if (appState.showHyperlinkPopup !== false) transientPatch.showHyperlinkPopup = false
    if (appState.gridModeEnabled) transientPatch.gridModeEnabled = false
    if (appState.objectsSnapModeEnabled) transientPatch.objectsSnapModeEnabled = false
    if (appState.fileHandle !== null) transientPatch.fileHandle = null
    if (appState.pendingImageElementId !== null) transientPatch.pendingImageElementId = null
    if (Object.keys(transientPatch).length > 0) api?.updateScene({ appState: transientPatch as AppState })

    // Excalidraw's binary-file map is intentionally outside undo history. A
    // trusted image insertion therefore emits one transient file-only change,
    // and undo can leave that file orphaned. Neither is persisted or treated as
    // a policy breach: only files referenced by current/deleted image elements
    // cross this boundary. Full ingress validation remains exact.
    const policyFiles = role === 'teacher'
      ? referencedDrawingFiles(elements, files as Record<string, unknown>) as BinaryFiles
      : files
    const candidate: ScratchpadScene = {
      formatVersion: CURRENT_WORK_FORMAT_VERSION,
      elements,
      appState: stableDrawingAppState(appState),
      files: policyFiles,
      background: backgroundRef.current,
    }
    const transientElementId = appState.newElement?.id
      ?? appState.editingLinearElement?.elementId
      ?? null
    const validated = validateDrawingScene(candidate, {
      role,
      verifyTeacherImage: ({ claim }) => claim ? 'valid' : 'invalid',
      legacyTeacherImages: legacyTeacherImagesRef?.current ?? null,
      mode: 'live',
      transientElementId,
    })
    if (!validated.ok) {
      const previous = recoveryDrawingScene(
        lastGoodRef.current,
        editorRevision,
        backgroundRef.current,
      )
      if (restoringRevisionRef.current === editorRevision) return
      restoringRevisionRef.current = editorRevision
      // Excalidraw's resetScene() intentionally keeps its binary file map.
      // Remounting is the only public, deterministic way to ensure a rejected
      // image/file cannot survive and later leak into a valid scene.
      setRecovery({
        editorRevision,
        sequence: ++recoverySequenceRef.current,
        scene: previous,
      })
      return
    }
    // Mid-gesture and point-editor shapes are valid for the live canvas but
    // are not valid persistence snapshots. Keep the previous detached
    // last-good scene until Excalidraw emits a complete element again.
    if (isIncompleteTransientDrawingElement(elements, transientElementId)) return
    const snapshot = snapshotDrawingScene(validated.scene)
    lastGoodRef.current = {
      editorRevision,
      scene: snapshot,
    }
    // Hosts receive the same complete, detached snapshot used by recovery.
    // They must never retain Excalidraw's live mutable element objects.
    onChange(
      snapshot.elements as readonly OrderedExcalidrawElement[],
      snapshot.appState as unknown as AppState,
      snapshot.files as BinaryFiles,
    )
  }, [editorRevision, legacyTeacherImagesRef, onChange, role, viewModeEnabled])

  const activeRecovery = recovery?.editorRevision === editorRevision ? recovery : null
  const effectiveInitialData = activeRecovery ? {
    elements: activeRecovery.scene.elements as readonly OrderedExcalidrawElement[],
    appState: {
      ...activeRecovery.scene.appState,
      viewBackgroundColor: TRANSPARENT_CANVAS,
    } as Partial<AppState>,
    files: activeRecovery.scene.files as BinaryFiles,
    scrollToContent: false,
  } : initialData

  return (
    <div
      ref={setSurface}
      className={`drawing-board-policy relative min-h-0 min-w-0 overflow-hidden ${className}`}
      style={style}
      onWheelCapture={onWheelCapture}
    >
      {children}
      <Excalidraw
        key={`${editorRevision}:${activeRecovery?.sequence ?? 0}`}
        initialData={effectiveInitialData}
        excalidrawAPI={handleReady}
        onChange={handleChange}
        onPointerUp={onPointerUp}
        onPaste={() => false}
        onDuplicate={(_next, previous) => [...previous]}
        onLinkOpen={(_element, event) => event.preventDefault()}
        langCode="th-TH"
        viewModeEnabled={viewModeEnabled}
        handleKeyboardGlobally={false}
        autoFocus={autoFocus}
        aiEnabled={false}
        validateEmbeddable={false}
        theme={theme}
        gridModeEnabled={false}
        objectsSnapModeEnabled={false}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            saveAsImage: false,
            toggleTheme: false,
          },
          tools: { image: false },
        }}
      >
        <MainMenu />
      </Excalidraw>
    </div>
  )
}
