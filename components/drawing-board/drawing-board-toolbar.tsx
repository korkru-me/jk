'use client'

import { FONT_FAMILY } from '@excalidraw/excalidraw'
import {
  Circle,
  Diamond,
  Eraser,
  Hand,
  Highlighter,
  Maximize2,
  Minus,
  MousePointer2,
  MoveRight,
  PenLine,
  RectangleHorizontal,
  Redo2,
  Type,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import type { FingerInputMode } from '@/lib/drawing-board-input'
import type { ScratchpadBackground } from '@/lib/scratchpad'
import type { DrawingBoardTool } from '@/lib/drawing-board-policy'
import type {
  DrawingBoardCommandState,
  DrawingBoardController,
} from './drawing-board-controller'
import {
  DRAWING_BACKGROUNDS,
  HIGHLIGHTER_INK,
  MAX_STROKE_WIDTH,
  MIN_STROKE_WIDTH,
  PEN_INK,
} from '@/components/exam/drawing-board-utils'

interface StudentDrawingToolbarProps {
  controller: DrawingBoardController | null
  state: DrawingBoardCommandState
  background: ScratchpadBackground
  fingerMode: FingerInputMode
  disabled?: boolean
  onBackgroundChange: (background: ScratchpadBackground) => void
  onFingerModeChange: (mode: FingerInputMode) => void
}

const SHAPE_TOOLS: ReadonlyArray<{
  tool: Extract<DrawingBoardTool, 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'diamond'>
  label: string
  icon: typeof Minus
}> = [
  { tool: 'line', label: 'เส้นตรง', icon: Minus },
  { tool: 'arrow', label: 'ลูกศร', icon: MoveRight },
  { tool: 'rectangle', label: 'สี่เหลี่ยม', icon: RectangleHorizontal },
  { tool: 'ellipse', label: 'วงรี', icon: Circle },
  { tool: 'diamond', label: 'สี่เหลี่ยมข้าวหลามตัด', icon: Diamond },
]

const FONT_OPTIONS = [
  { value: FONT_FAMILY.Helvetica, label: 'ตัวพิมพ์' },
  { value: FONT_FAMILY.Virgil, label: 'ลายมือ' },
  { value: FONT_FAMILY.Cascadia, label: 'โมโน' },
] as const

const FONT_SIZES = [16, 20, 28, 36] as const

function toolSelected(state: DrawingBoardCommandState, tool: DrawingBoardTool): boolean {
  return state.activeTool === tool
}

function inkSelected(
  state: DrawingBoardCommandState,
  ink: { color: string; width: number; opacity: number },
): boolean {
  return toolSelected(state, 'freedraw')
    && state.strokeColor !== null
    && state.strokeColor.toLowerCase() === ink.color.toLowerCase()
    && state.strokeWidth === ink.width
    && state.opacity === ink.opacity
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden="true" />
}

/** Shared, app-owned student controls; teacher composition follows in Phase 5. */
export function StudentDrawingToolbar({
  controller,
  state,
  background,
  fingerMode,
  disabled = false,
  onBackgroundChange,
  onFingerModeChange,
}: StudentDrawingToolbarProps) {
  const contentDisabled = disabled || state.readOnly || !state.ready || !controller
  const navigationDisabled = !state.ready || !controller
  const chooseTool = (tool: DrawingBoardTool) => controller?.selectTool(tool)
  const currentFontIsListed = state.fontFamily === null
    || FONT_OPTIONS.some(option => option.value === state.fontFamily)
  const currentFontSizeIsListed = state.fontSize === null
    || FONT_SIZES.some(size => size === state.fontSize)

  return (
    <div className="shrink-0 border-t border-border bg-card px-2 py-1.5 sm:px-3">
      <div
        role="toolbar"
        aria-label="เครื่องมือหลักของกระดาษทด"
        className="flex min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain pb-1"
      >
        <Button
          type="button"
          variant={toolSelected(state, 'selection') ? 'secondary' : 'ghost'}
          size="xs"
          className="min-h-10 shrink-0 pointer-coarse:min-h-11"
          aria-pressed={toolSelected(state, 'selection')}
          disabled={contentDisabled}
          onClick={() => chooseTool('selection')}
        >
          <MousePointer2 data-icon="inline-start" /> เลือก/ย้าย
        </Button>
        <Button
          type="button"
          variant={inkSelected(state, PEN_INK) ? 'secondary' : 'ghost'}
          size="xs"
          className="min-h-10 shrink-0 pointer-coarse:min-h-11"
          aria-pressed={inkSelected(state, PEN_INK)}
          disabled={contentDisabled}
          onClick={() => controller?.selectInkPreset(PEN_INK)}
        >
          <PenLine data-icon="inline-start" /> ปากกา
        </Button>
        <Button
          type="button"
          variant={toolSelected(state, 'eraser') ? 'secondary' : 'ghost'}
          size="xs"
          className="min-h-10 shrink-0 pointer-coarse:min-h-11"
          aria-pressed={toolSelected(state, 'eraser')}
          disabled={contentDisabled}
          onClick={() => chooseTool('eraser')}
        >
          <Eraser data-icon="inline-start" /> ยางลบวัตถุ
        </Button>
        <Button
          type="button"
          variant={toolSelected(state, 'hand') ? 'secondary' : 'ghost'}
          size="xs"
          className="min-h-10 shrink-0 pointer-coarse:min-h-11"
          aria-pressed={toolSelected(state, 'hand')}
          disabled={navigationDisabled}
          onClick={() => chooseTool('hand')}
        >
          <Hand data-icon="inline-start" /> มือ/เลื่อน
        </Button>
        <ToolbarDivider />
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="min-h-10 shrink-0 pointer-coarse:min-h-11"
          disabled={contentDisabled || !state.canUndo}
          onClick={() => controller?.undo()}
        >
          <Undo2 data-icon="inline-start" /> ย้อนกลับ
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="min-h-10 shrink-0 pointer-coarse:min-h-11"
          disabled={contentDisabled || !state.canRedo}
          onClick={() => controller?.redo()}
        >
          <Redo2 data-icon="inline-start" /> ทำซ้ำ
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="min-h-10 shrink-0 pointer-coarse:min-h-11"
          disabled={navigationDisabled}
          onClick={() => controller?.fit()}
        >
          <Maximize2 data-icon="inline-start" /> พอดีจอ
        </Button>
        <ToolbarDivider />
        <Button
          type="button"
          variant={fingerMode === 'finger_draw' ? 'secondary' : 'ghost'}
          size="xs"
          className="min-h-10 shrink-0 pointer-coarse:min-h-11"
          aria-pressed={fingerMode === 'finger_draw'}
          onClick={() => onFingerModeChange('finger_draw')}
        >
          <PenLine data-icon="inline-start" /> นิ้วเขียน
        </Button>
        <Button
          type="button"
          variant={fingerMode === 'finger_pan' ? 'secondary' : 'ghost'}
          size="xs"
          className="min-h-10 shrink-0 pointer-coarse:min-h-11"
          aria-pressed={fingerMode === 'finger_pan'}
          onClick={() => onFingerModeChange('finger_pan')}
        >
          <Hand data-icon="inline-start" /> นิ้วเลื่อน
        </Button>
      </div>

      <div
        role="toolbar"
        aria-label="เครื่องมือเสริมของกระดาษทด"
        className="flex min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain"
      >
        <Button
          type="button"
          variant={inkSelected(state, HIGHLIGHTER_INK) ? 'secondary' : 'ghost'}
          size="xs"
          className="min-h-10 shrink-0 pointer-coarse:min-h-11"
          aria-pressed={inkSelected(state, HIGHLIGHTER_INK)}
          disabled={contentDisabled}
          onClick={() => controller?.selectInkPreset(HIGHLIGHTER_INK)}
        >
          <Highlighter data-icon="inline-start" /> ไฮไลต์
        </Button>

        <label className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground pointer-coarse:min-h-11">
          {state.strokeColor === null ? 'สีเส้น (หลายค่า)' : 'สีเส้น'}
          <input
            type="color"
            value={state.strokeColor ?? PEN_INK.color}
            onChange={event => controller?.setStrokeColor(event.currentTarget.value)}
            disabled={contentDisabled}
            aria-label={state.strokeColor === null ? 'สีเส้น หลายค่า' : 'สีเส้น'}
            className="size-10 cursor-pointer rounded-md border border-input bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:size-11"
          />
        </label>

        <label className="flex min-h-10 shrink-0 items-center gap-1.5 px-1 text-xs text-muted-foreground pointer-coarse:min-h-11">
          ขนาดเส้น
          <input
            type="range"
            min={MIN_STROKE_WIDTH}
            max={MAX_STROKE_WIDTH}
            step={1}
            value={state.strokeWidth ?? PEN_INK.width}
            onChange={event => controller?.setStrokeWidth(Number(event.currentTarget.value))}
            disabled={contentDisabled}
            aria-label="ขนาดเส้น"
            aria-valuetext={state.strokeWidth === null ? 'หลายขนาด' : undefined}
            className="h-10 w-24 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-11"
          />
          <span className="w-4 text-right font-mono text-foreground" aria-hidden="true">
            {state.strokeWidth ?? '—'}
          </span>
        </label>

        {SHAPE_TOOLS.map(item => {
          const Icon = item.icon
          const selected = toolSelected(state, item.tool)
          return (
            <Button
              key={item.tool}
              type="button"
              variant={selected ? 'secondary' : 'ghost'}
              size="xs"
              className="min-h-10 shrink-0 pointer-coarse:min-h-11"
              aria-pressed={selected}
              disabled={contentDisabled}
              onClick={() => chooseTool(item.tool)}
            >
              <Icon data-icon="inline-start" /> {item.label}
            </Button>
          )
        })}

        <Button
          type="button"
          variant={toolSelected(state, 'text') ? 'secondary' : 'ghost'}
          size="xs"
          className="min-h-10 shrink-0 pointer-coarse:min-h-11"
          aria-pressed={toolSelected(state, 'text')}
          disabled={contentDisabled}
          onClick={() => chooseTool('text')}
        >
          <Type data-icon="inline-start" /> ข้อความ
        </Button>

        <NativeSelect
          value={state.fontFamily ?? ''}
          onChange={event => controller?.setFontFamily(Number(event.currentTarget.value))}
          disabled={contentDisabled}
          aria-label="แบบอักษร"
          className="h-10 w-28 shrink-0 text-xs pointer-coarse:h-11"
        >
          {state.fontFamily === null && <option value="" disabled>หลายแบบ</option>}
          {state.fontFamily !== null && !currentFontIsListed && (
            <option value={state.fontFamily}>แบบอักษรเดิม</option>
          )}
          {FONT_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={state.fontSize ?? ''}
          onChange={event => controller?.setFontSize(Number(event.currentTarget.value))}
          disabled={contentDisabled}
          aria-label="ขนาดตัวอักษร"
          className="h-10 w-20 shrink-0 text-xs pointer-coarse:h-11"
        >
          {state.fontSize === null && <option value="" disabled>หลายขนาด</option>}
          {state.fontSize !== null && !currentFontSizeIsListed && (
            <option value={state.fontSize}>{state.fontSize} pt (เดิม)</option>
          )}
          {FONT_SIZES.map(size => <option key={size} value={size}>{size} pt</option>)}
        </NativeSelect>

        <ToolbarDivider />
        {DRAWING_BACKGROUNDS.map(item => (
          <Button
            key={item.value}
            type="button"
            variant={background === item.value ? 'secondary' : 'ghost'}
            size="xs"
            className="min-h-10 min-w-10 shrink-0 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            onClick={() => onBackgroundChange(item.value)}
            disabled={contentDisabled}
            aria-pressed={background === item.value}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
