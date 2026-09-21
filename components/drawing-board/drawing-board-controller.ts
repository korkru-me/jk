import type { DrawingBoardTool } from '@/lib/drawing-board-policy'

export interface DrawingBoardInkPreset {
  color: string
  width: number
  opacity: number
}

export interface DrawingBoardCommandState {
  ready: boolean
  readOnly: boolean
  activeTool: DrawingBoardTool
  /** Null means the current selection contains more than one value. */
  strokeColor: string | null
  strokeWidth: number | null
  opacity: number | null
  fontFamily: number | null
  fontSize: number | null
  canUndo: boolean
  canRedo: boolean
}

/**
 * App-owned commands supported by the shared Excalidraw adapter.
 *
 * Hosts keep persistence and product lifecycle concerns, while all editor
 * commands stay behind this facade so student and teacher tools cannot drift
 * into different shortcut or selection semantics.
 */
export interface DrawingBoardController {
  selectTool: (tool: DrawingBoardTool) => boolean
  selectInkPreset: (preset: DrawingBoardInkPreset) => boolean
  setStrokeColor: (color: string) => boolean
  setStrokeWidth: (width: number) => boolean
  setFontFamily: (fontFamily: number) => boolean
  setFontSize: (fontSize: number) => boolean
  undo: () => boolean
  redo: () => boolean
  clearHistory: () => boolean
  fit: () => boolean
}
