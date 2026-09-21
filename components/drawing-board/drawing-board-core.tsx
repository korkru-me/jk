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
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  RefObject,
  WheelEventHandler,
} from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  DrawingBoardCommandState,
  DrawingBoardController,
  DrawingBoardInkPreset,
} from '@/components/drawing-board/drawing-board-controller'
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
  type DrawingBoardTool,
  type LegacyTeacherImageSnapshot,
  type RevisionedDrawingSceneSnapshot,
} from '@/lib/drawing-board-policy'
import {
  INITIAL_DRAWING_POINTER_ROUTING_STATE,
  resetDrawingPointerRouting,
  routeDrawingPointerDown,
  routeDrawingPointerEnd,
  type DrawingPointerRoutingEffects,
  type DrawingPointerRoutingState,
  type FingerInputMode,
} from '@/lib/drawing-board-input'
import { CURRENT_WORK_FORMAT_VERSION } from '@/lib/math-work'
import type { ScratchpadBackground, ScratchpadScene } from '@/lib/scratchpad'
import {
  clampStrokeWidth,
  stableDrawingAppState,
  TRANSPARENT_CANVAS,
} from '@/components/exam/drawing-board-utils'

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
  fingerInputMode?: FingerInputMode
  hideNativeControls?: boolean
  onControllerReady?: (controller: DrawingBoardController | null) => void
  onCommandStateChange?: (state: DrawingBoardCommandState) => void
}

type NativeActionName =
  | 'undo'
  | 'redo'
  | 'changeStrokeColor'
  | 'changeStrokeWidth'
  | 'changeFontFamily'
  | 'changeFontSize'

type PrivateExcalidrawAction = Parameters<ExcalidrawImperativeAPI['registerAction']>[0]

interface PrivateExcalidrawApp {
  actionManager: {
    actions: Partial<Record<NativeActionName, PrivateExcalidrawAction>>
    executeAction: (action: PrivateExcalidrawAction, source: 'api', value?: unknown) => void
  }
  history: {
    isUndoStackEmpty: boolean
    isRedoStackEmpty: boolean
    onHistoryChangedEmitter: {
      on: (listener: (event: {
        isUndoStackEmpty: boolean
        isRedoStackEmpty: boolean
      }) => void) => () => void
    }
  }
}

const COMMAND_BRIDGE_NAME = 'korkru-command-bridge'
const COMMAND_BRIDGE_KEY = 'F13'

function isPrivateExcalidrawApp(value: unknown): value is PrivateExcalidrawApp {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PrivateExcalidrawApp>
  const actionManager = candidate.actionManager
  const history = candidate.history
  return Boolean(
    actionManager
    && typeof actionManager === 'object'
    && actionManager.actions
    && typeof actionManager.actions === 'object'
    && typeof actionManager.executeAction === 'function'
    && history
    && typeof history === 'object'
    && typeof history.isUndoStackEmpty === 'boolean'
    && typeof history.isRedoStackEmpty === 'boolean'
    && history.onHistoryChangedEmitter
    && typeof history.onHistoryChangedEmitter.on === 'function',
  )
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

function editorKeyboardTarget(surface: HTMLDivElement): HTMLElement {
  return surface.querySelector<HTMLElement>('.excalidraw') ?? surface
}

function dispatchEditorKey(
  surface: HTMLDivElement,
  type: 'keydown' | 'keyup',
  init: KeyboardEventInit,
): void {
  editorKeyboardTarget(surface).dispatchEvent(new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    ...init,
  }))
}

function nativeHistoryAvailability(surface: HTMLDivElement): Pick<
  DrawingBoardCommandState,
  'canUndo' | 'canRedo'
> {
  const undo = surface.querySelector<HTMLButtonElement>('[data-testid="button-undo"]')
  const redo = surface.querySelector<HTMLButtonElement>('[data-testid="button-redo"]')
  return {
    canUndo: Boolean(undo && !undo.disabled),
    canRedo: Boolean(redo && !redo.disabled),
  }
}

function commonSelectedValue<T>(
  elements: readonly OrderedExcalidrawElement[],
  fallback: T,
  read: (element: OrderedExcalidrawElement) => T | undefined,
): T | null {
  const values = elements
    .map(read)
    .filter((value): value is T => value !== undefined)
  if (values.length === 0) return fallback
  return values.every(value => Object.is(value, values[0])) ? values[0] : null
}

function commandStateFromApp(
  surface: HTMLDivElement,
  api: ExcalidrawImperativeAPI,
  appState: AppState,
  readOnly: boolean,
  historyOverride?: Pick<DrawingBoardCommandState, 'canUndo' | 'canRedo'>,
): DrawingBoardCommandState {
  const activeTool = isDrawingBoardToolAllowed('teacher', appState.activeTool.type)
    ? appState.activeTool.type
    : 'freedraw'
  const history = historyOverride ?? nativeHistoryAvailability(surface)
  const selectedIds = appState.selectedElementIds
  const sceneElements = api.getSceneElements()
  const selectedElements = sceneElements.filter(element => selectedIds[element.id])
  const selectedTextElements = sceneElements.filter(element => (
    element.type === 'text'
    && (selectedIds[element.id] || Boolean(element.containerId && selectedIds[element.containerId]))
  ))
  return {
    ready: true,
    readOnly,
    activeTool,
    strokeColor: commonSelectedValue(
      selectedElements,
      appState.currentItemStrokeColor,
      element => element.strokeColor,
    ),
    strokeWidth: commonSelectedValue(
      selectedElements,
      appState.currentItemStrokeWidth,
      element => element.strokeWidth,
    ),
    opacity: commonSelectedValue(
      selectedElements,
      appState.currentItemOpacity,
      element => element.opacity,
    ),
    fontFamily: commonSelectedValue(
      selectedTextElements,
      appState.currentItemFontFamily,
      element => element.type === 'text' ? element.fontFamily : undefined,
    ),
    fontSize: commonSelectedValue(
      selectedTextElements,
      appState.currentItemFontSize,
      element => element.type === 'text' ? element.fontSize : undefined,
    ),
    canUndo: !readOnly && history.canUndo,
    canRedo: !readOnly && history.canRedo,
  }
}

function sameCommandState(
  left: DrawingBoardCommandState | null,
  right: DrawingBoardCommandState,
): boolean {
  return Boolean(left)
    && left?.ready === right.ready
    && left.readOnly === right.readOnly
    && left.activeTool === right.activeTool
    && left.strokeColor === right.strokeColor
    && left.strokeWidth === right.strokeWidth
    && left.opacity === right.opacity
    && left.fontFamily === right.fontFamily
    && left.fontSize === right.fontSize
    && left.canUndo === right.canUndo
    && left.canRedo === right.canRedo
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
  fingerInputMode,
  hideNativeControls = false,
  onControllerReady,
  onCommandStateChange,
}: DrawingBoardCoreProps) {
  const fingerInputEnabled = fingerInputMode !== undefined
  const localSurfaceRef = useRef<HTMLDivElement | null>(null)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const privateAppRef = useRef<PrivateExcalidrawApp | null>(null)
  const historyUnsubscribeRef = useRef<(() => void) | null>(null)
  const historyStateRef = useRef({ canUndo: false, canRedo: false })
  const lastCommandStateRef = useRef<DrawingBoardCommandState | null>(null)
  const commandStateFrameRef = useRef<number | null>(null)
  const penModeResetFrameRef = useRef<number | null>(null)
  const lifecycleGenerationRef = useRef(0)
  const inputModeRef = useRef(fingerInputMode)
  const viewModeEnabledRef = useRef(viewModeEnabled)
  const onControllerReadyRef = useRef(onControllerReady)
  const onCommandStateChangeRef = useRef(onCommandStateChange)
  const pointerRoutingRef = useRef<DrawingPointerRoutingState>(
    INITIAL_DRAWING_POINTER_ROUTING_STATE,
  )
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
  inputModeRef.current = fingerInputMode
  viewModeEnabledRef.current = viewModeEnabled
  onControllerReadyRef.current = onControllerReady
  onCommandStateChangeRef.current = onCommandStateChange

  const setSurface = useCallback((node: HTMLDivElement | null) => {
    localSurfaceRef.current = node
    if (surfaceRef) surfaceRef.current = node
  }, [surfaceRef])

  const publishCommandState = useCallback((nextAppState?: AppState) => {
    const surface = localSurfaceRef.current
    const api = apiRef.current
    if (!surface || !api || !onCommandStateChangeRef.current) return
    const next = commandStateFromApp(
      surface,
      api,
      nextAppState ?? api.getAppState(),
      viewModeEnabledRef.current,
      privateAppRef.current ? historyStateRef.current : undefined,
    )
    if (sameCommandState(lastCommandStateRef.current, next)) return
    lastCommandStateRef.current = next
    onCommandStateChangeRef.current(next)
  }, [])

  const scheduleCommandState = useCallback((nextAppState?: AppState) => {
    if (commandStateFrameRef.current !== null) cancelAnimationFrame(commandStateFrameRef.current)
    commandStateFrameRef.current = requestAnimationFrame(() => {
      commandStateFrameRef.current = null
      publishCommandState(nextAppState)
    })
  }, [publishCommandState])

  useEffect(() => {
    const generation = ++lifecycleGenerationRef.current

    return () => {
      // React development Strict Effects immediately runs setup -> cleanup -> setup.
      // Deferring lets the replacement setup advance the generation before we tear
      // down the controller bridge that the surviving Excalidraw instance owns.
      queueMicrotask(() => {
        if (lifecycleGenerationRef.current !== generation) return
        historyUnsubscribeRef.current?.()
        historyUnsubscribeRef.current = null
        privateAppRef.current = null
        apiRef.current = null
        if (commandStateFrameRef.current !== null) {
          cancelAnimationFrame(commandStateFrameRef.current)
          commandStateFrameRef.current = null
        }
        if (penModeResetFrameRef.current !== null) {
          cancelAnimationFrame(penModeResetFrameRef.current)
          penModeResetFrameRef.current = null
        }
      })
    }
  }, [])

  const handleReady = useCallback((api: ExcalidrawImperativeAPI) => {
    if (activeEditorRevisionRef.current !== editorRevision) return
    onControllerReadyRef.current?.(null)
    apiRef.current = api
    if (inputModeRef.current !== undefined && api.getAppState().penMode) {
      api.updateScene({
        appState: { penMode: false },
        captureUpdate: CaptureUpdateAction.NEVER,
      })
    }
    privateAppRef.current = null
    historyUnsubscribeRef.current?.()
    historyUnsubscribeRef.current = null
    historyStateRef.current = { canUndo: false, canRedo: false }
    restoringRevisionRef.current = null
    onReady(api)
    queueMicrotask(() => {
      if (apiRef.current !== api || activeEditorRevisionRef.current !== editorRevision) return
      registerGuardedActions(api, role)
      api.registerAction({
        name: COMMAND_BRIDGE_NAME,
        label: '',
        trackEvent: false,
        viewMode: true,
        keyPriority: 10_000,
        keyTest: (event: KeyboardEvent | ReactKeyboardEvent) => (
          event.key === COMMAND_BRIDGE_KEY && event.code === COMMAND_BRIDGE_KEY
        ),
        perform: (
          _elements: readonly OrderedExcalidrawElement[],
          _appState: Readonly<AppState>,
          _value: unknown,
          app: unknown,
        ) => {
          if (apiRef.current !== api || activeEditorRevisionRef.current !== editorRevision) return false
          if (!isPrivateExcalidrawApp(app)) return false
          const privateApp = app
          privateAppRef.current = privateApp
          historyStateRef.current = {
            canUndo: !privateApp.history.isUndoStackEmpty,
            canRedo: !privateApp.history.isRedoStackEmpty,
          }
          historyUnsubscribeRef.current?.()
          historyUnsubscribeRef.current = privateApp.history.onHistoryChangedEmitter.on(event => {
            historyStateRef.current = {
              canUndo: !event.isUndoStackEmpty,
              canRedo: !event.isRedoStackEmpty,
            }
            scheduleCommandState()
          })

          const runNativeAction = (name: NativeActionName, value?: unknown): boolean => {
            if (apiRef.current !== api || activeEditorRevisionRef.current !== editorRevision) return false
            const action = privateApp.actionManager.actions[name]
            if (!action) return false
            privateApp.actionManager.executeAction(action, 'api', value)
            scheduleCommandState()
            return true
          }
          const canChangeContent = () => !viewModeEnabledRef.current
          const controller: DrawingBoardController = {
            selectTool: tool => {
              if (!isDrawingBoardToolAllowed(role, tool)) return false
              if (viewModeEnabledRef.current && tool !== 'hand') return false
              api.setActiveTool({ type: tool, locked: true })
              scheduleCommandState()
              return true
            },
            selectInkPreset: (preset: DrawingBoardInkPreset) => {
              if (!canChangeContent() || !isDrawingBoardToolAllowed(role, 'freedraw')) return false
              if (
                !/^#[0-9a-f]{6}$/i.test(preset.color)
                || !Number.isFinite(preset.width)
                || !Number.isFinite(preset.opacity)
              ) return false
              api.updateScene({
                appState: {
                  currentItemStrokeColor: preset.color,
                  currentItemStrokeWidth: preset.width,
                  currentItemOpacity: Math.min(100, Math.max(0, Math.round(preset.opacity))),
                },
                captureUpdate: CaptureUpdateAction.NEVER,
              })
              api.setActiveTool({ type: 'freedraw', locked: true })
              scheduleCommandState()
              return true
            },
            setStrokeColor: color => (
              canChangeContent()
              && /^#[0-9a-f]{6}$/i.test(color)
              && runNativeAction('changeStrokeColor', { currentItemStrokeColor: color })
            ),
            setStrokeWidth: width => (
              canChangeContent()
              && Number.isFinite(width)
              && runNativeAction('changeStrokeWidth', clampStrokeWidth(width))
            ),
            setFontFamily: fontFamily => (
              canChangeContent()
              && Number.isInteger(fontFamily)
              && runNativeAction('changeFontFamily', {
                openPopup: null,
                currentHoveredFontFamily: null,
                currentItemFontFamily: fontFamily,
              })
            ),
            setFontSize: fontSize => (
              canChangeContent()
              && Number.isFinite(fontSize)
              && runNativeAction('changeFontSize', Math.min(72, Math.max(8, Math.round(fontSize))))
            ),
            undo: () => canChangeContent() && historyStateRef.current.canUndo && runNativeAction('undo'),
            redo: () => canChangeContent() && historyStateRef.current.canRedo && runNativeAction('redo'),
            clearHistory: () => {
              if (apiRef.current !== api || activeEditorRevisionRef.current !== editorRevision) return false
              api.history.clear()
              historyStateRef.current = { canUndo: false, canRedo: false }
              scheduleCommandState()
              return true
            },
            fit: () => {
              if (apiRef.current !== api || activeEditorRevisionRef.current !== editorRevision) return false
              const elements = api.getSceneElements()
              if (elements.length > 0) {
                api.scrollToContent(elements, {
                  fitToViewport: true,
                  viewportZoomFactor: 0.86,
                  animate: true,
                })
              } else {
                api.updateScene({
                  appState: {
                    scrollX: 0,
                    scrollY: 0,
                    zoom: { value: 1 as AppState['zoom']['value'] },
                  },
                  captureUpdate: CaptureUpdateAction.NEVER,
                })
              }
              scheduleCommandState()
              return true
            },
          }
          onControllerReadyRef.current?.(controller)
          scheduleCommandState()
          return false
        },
      } as unknown as Parameters<ExcalidrawImperativeAPI['registerAction']>[0])

      queueMicrotask(() => {
        const surface = localSurfaceRef.current
        if (!surface || apiRef.current !== api) return
        dispatchEditorKey(surface, 'keydown', {
          key: COMMAND_BRIDGE_KEY,
          code: COMMAND_BRIDGE_KEY,
        })
      })
    })
  }, [editorRevision, onReady, role, scheduleCommandState])

  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    const frame = requestAnimationFrame(() => registerGuardedActions(api, role))
    return () => cancelAnimationFrame(frame)
  }, [role])

  useEffect(() => {
    scheduleCommandState()
  }, [scheduleCommandState, viewModeEnabled])

  useLayoutEffect(() => {
    const surface = localSurfaceRef.current
    if (!surface || !fingerInputEnabled) return

    const applyEffects = (effects: DrawingPointerRoutingEffects) => {
      const api = apiRef.current
      if (!api) return
      if (effects.penMode !== null && api.getAppState().penMode !== effects.penMode) {
        api.updateScene({
          appState: { penMode: effects.penMode as boolean },
          captureUpdate: CaptureUpdateAction.NEVER,
        })
      }
      if (effects.spacePan === 'press') {
        dispatchEditorKey(surface, 'keydown', { key: ' ', code: 'Space' })
      } else if (effects.spacePan === 'release') {
        dispatchEditorKey(surface, 'keyup', { key: ' ', code: 'Space' })
      }
    }

    const pointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLCanvasElement)) return
      const api = apiRef.current
      if (!api) return
      if (event.pointerType === 'pen') {
        queueMicrotask(() => {
          if (apiRef.current !== api || !api.getAppState().penMode) return
          api.updateScene({
            appState: { penMode: false },
            captureUpdate: CaptureUpdateAction.NEVER,
          })
        })
      }
      const routed = routeDrawingPointerDown(pointerRoutingRef.current, {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        fingerMode: inputModeRef.current ?? 'finger_draw',
        // Product finger routing is independent from Excalidraw's pen-only
        // preference. This student surface keeps that technical flag off so
        // stylus use never silently disables the next finger gesture.
        penMode: false,
      })
      pointerRoutingRef.current = routed.state
      applyEffects(routed.effects)
    }
    const pointerEnd = (event: PointerEvent) => {
      const routed = routeDrawingPointerEnd(pointerRoutingRef.current, {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
      })
      if (routed.state === pointerRoutingRef.current) return
      pointerRoutingRef.current = routed.state
      queueMicrotask(() => applyEffects(routed.effects))
    }

    surface.addEventListener('pointerdown', pointerDown, true)
    window.addEventListener('pointerup', pointerEnd)
    window.addEventListener('pointercancel', pointerEnd)
    return () => {
      surface.removeEventListener('pointerdown', pointerDown, true)
      window.removeEventListener('pointerup', pointerEnd)
      window.removeEventListener('pointercancel', pointerEnd)
      const reset = resetDrawingPointerRouting(pointerRoutingRef.current)
      pointerRoutingRef.current = reset.state
      applyEffects(reset.effects)
      if (penModeResetFrameRef.current !== null) {
        cancelAnimationFrame(penModeResetFrameRef.current)
        penModeResetFrameRef.current = null
      }
    }
  }, [fingerInputEnabled])

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
    scheduleCommandState(appState)
    const api = apiRef.current
    if (fingerInputEnabled && appState.penMode && penModeResetFrameRef.current === null) {
      penModeResetFrameRef.current = requestAnimationFrame(() => {
        penModeResetFrameRef.current = null
        const currentApi = apiRef.current
        if (!currentApi || !currentApi.getAppState().penMode) return
        currentApi.updateScene({
          appState: { penMode: false },
          captureUpdate: CaptureUpdateAction.NEVER,
        })
      })
    }
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
    const stableAppStateSource = fingerInputEnabled
      ? { ...appState, penMode: false }
      : pointerRoutingRef.current.penModeBeforeTouch === null
      ? appState
      : {
          ...appState,
          penMode: pointerRoutingRef.current.penModeBeforeTouch,
        }
    const candidate: ScratchpadScene = {
      formatVersion: CURRENT_WORK_FORMAT_VERSION,
      elements,
      appState: stableDrawingAppState(stableAppStateSource),
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
  }, [editorRevision, fingerInputEnabled, legacyTeacherImagesRef, onChange, role, scheduleCommandState, viewModeEnabled])

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
      className={`drawing-board-policy ${hideNativeControls ? 'drawing-board-app-controls' : ''} relative min-h-0 min-w-0 overflow-hidden ${className}`}
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
