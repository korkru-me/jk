'use client'

import { exportToCanvas } from '@excalidraw/excalidraw'
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { CSSProperties } from 'react'
import type { ScratchpadBackground } from '@/lib/scratchpad'
import { MAX_WORK_PREVIEW_BYTES, WORK_PREVIEW_MIMES, type WorkPreviewFormat } from '@/lib/math-work'

export const DRAWING_BACKGROUNDS: Array<{ value: ScratchpadBackground; label: string }> = [
  { value: 'blank', label: 'เปล่า' },
  { value: 'lined', label: 'เส้นบรรทัด' },
  { value: 'grid', label: 'ตาราง' },
  { value: 'dots', label: 'จุด' },
]

export const TRANSPARENT_CANVAS = 'transparent'

/** Ink presets behind the ปากกา / ไฮไลต์ buttons. */
export const PEN_INK = { color: '#172554', width: 2, opacity: 100 } as const
export const HIGHLIGHTER_INK = { color: '#facc15', width: 4, opacity: 35 } as const

/**
 * Stroke widths the slider offers. Excalidraw's own panel has three steps
 * (1 / 2 / 4); teachers write at a range of sizes on a projector, so the
 * board exposes every whole width in between and above.
 */
export const MIN_STROKE_WIDTH = 1
export const MAX_STROKE_WIDTH = 12

export function clampStrokeWidth(value: number): number {
  if (!Number.isFinite(value)) return PEN_INK.width
  return Math.min(MAX_STROKE_WIDTH, Math.max(MIN_STROKE_WIDTH, Math.round(value)))
}

/**
 * What a fresh board opens with: the navy pen, no shape fill, plain solid
 * strokes drawn straight rather than sketchy. A board that was saved with
 * other settings restores its own — these only fill the gaps.
 */
export const DRAWING_DEFAULT_ITEM_STATE = {
  currentItemStrokeColor: PEN_INK.color,
  currentItemBackgroundColor: 'transparent',
  currentItemStrokeWidth: PEN_INK.width,
  currentItemStrokeStyle: 'solid',
  // Excalidraw's "architect" roughness: no hand-drawn wobble.
  currentItemRoughness: 0,
  currentItemOpacity: PEN_INK.opacity,
} as const satisfies Partial<AppState>

function paintPreviewBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: ScratchpadBackground,
) {
  context.fillStyle = '#fffefb'
  context.fillRect(0, 0, width, height)
  if (background === 'blank') return

  context.lineWidth = 1
  if (background === 'lined' || background === 'grid') {
    context.strokeStyle = 'rgba(59, 130, 246, 0.18)'
    for (let y = 32; y < height; y += 32) {
      context.beginPath()
      context.moveTo(0, y + 0.5)
      context.lineTo(width, y + 0.5)
      context.stroke()
    }
  }
  if (background === 'grid') {
    for (let x = 24; x < width; x += 24) {
      context.beginPath()
      context.moveTo(x + 0.5, 0)
      context.lineTo(x + 0.5, height)
      context.stroke()
    }
  }
  if (background === 'dots') {
    context.fillStyle = 'rgba(71, 85, 105, 0.32)'
    for (let y = 11; y < height; y += 22) {
      for (let x = 11; x < width; x += 22) {
        context.beginPath()
        context.arc(x, y, 1.2, 0, Math.PI * 2)
        context.fill()
      }
    }
  }
}

export interface DrawingPreview {
  blob: Blob
  format: WorkPreviewFormat
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob), type, 0.86))
}

/**
 * WebP where the browser can encode it, PNG where it cannot.
 *
 * No version of Safari encodes WebP from a canvas — it silently hands back a
 * PNG instead — so on iPad, iPhone and Safari on Mac this used to fail every
 * save. Keep the PNG that came back rather than encoding the canvas twice.
 */
async function encodePreview(canvas: HTMLCanvasElement): Promise<DrawingPreview> {
  const preferred = await encode(canvas, WORK_PREVIEW_MIMES.webp)
  if (preferred?.type === WORK_PREVIEW_MIMES.webp) return { blob: preferred, format: 'webp' }

  const fallback = preferred?.type === WORK_PREVIEW_MIMES.png
    ? preferred
    : await encode(canvas, WORK_PREVIEW_MIMES.png)
  if (fallback?.type === WORK_PREVIEW_MIMES.png) return { blob: fallback, format: 'png' }

  throw new Error('เบราว์เซอร์นี้สร้างภาพจากพื้นที่เขียนไม่สำเร็จ')
}

export async function createDrawingPreview(
  api: ExcalidrawImperativeAPI,
  background: ScratchpadBackground,
  emptyMessage: string,
): Promise<DrawingPreview> {
  const elements = api.getSceneElements()
  if (elements.length === 0) throw new Error(emptyMessage)
  const drawing = await exportToCanvas({
    elements,
    appState: {
      ...api.getAppState(),
      exportBackground: false,
      viewBackgroundColor: TRANSPARENT_CANVAS,
    },
    files: api.getFiles(),
    maxWidthOrHeight: 1600,
    exportPadding: 36,
  })
  const canvas = document.createElement('canvas')
  canvas.width = drawing.width
  canvas.height = drawing.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('สร้างภาพจากพื้นที่เขียนไม่สำเร็จ')
  paintPreviewBackground(context, canvas.width, canvas.height, background)
  context.drawImage(drawing, 0, 0)
  const preview = await encodePreview(canvas)
  if (preview.blob.size > MAX_WORK_PREVIEW_BYTES) throw new Error('ภาพจากพื้นที่เขียนมีขนาดใหญ่เกิน 5 MB')
  return preview
}

export function drawingBackgroundStyle(background: ScratchpadBackground): CSSProperties {
  if (background === 'lined') {
    return {
      backgroundColor: '#fffefb',
      backgroundImage: 'linear-gradient(to bottom, transparent 31px, rgba(59, 130, 246, 0.18) 32px)',
      backgroundSize: '100% 32px',
    }
  }
  if (background === 'grid') {
    return {
      backgroundColor: '#fffefb',
      backgroundImage: [
        'linear-gradient(rgba(59, 130, 246, 0.13) 1px, transparent 1px)',
        'linear-gradient(90deg, rgba(59, 130, 246, 0.13) 1px, transparent 1px)',
      ].join(','),
      backgroundSize: '24px 24px',
    }
  }
  if (background === 'dots') {
    return {
      backgroundColor: '#fffefb',
      backgroundImage: 'radial-gradient(circle, rgba(71, 85, 105, 0.28) 1.2px, transparent 1.3px)',
      backgroundSize: '22px 22px',
    }
  }
  return { backgroundColor: '#fffefb' }
}

/** Persist only stable preferences; transient selections/dialog state is excluded. */
export function stableDrawingAppState(appState: AppState): Record<string, unknown> {
  return {
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom,
    currentItemStrokeColor: appState.currentItemStrokeColor,
    currentItemBackgroundColor: appState.currentItemBackgroundColor,
    currentItemFillStyle: appState.currentItemFillStyle,
    currentItemStrokeWidth: appState.currentItemStrokeWidth,
    currentItemStrokeStyle: appState.currentItemStrokeStyle,
    currentItemRoughness: appState.currentItemRoughness,
    currentItemOpacity: appState.currentItemOpacity,
    currentItemFontFamily: appState.currentItemFontFamily,
    currentItemFontSize: appState.currentItemFontSize,
    currentItemTextAlign: appState.currentItemTextAlign,
    currentItemStartArrowhead: appState.currentItemStartArrowhead,
    currentItemEndArrowhead: appState.currentItemEndArrowhead,
    currentItemRoundness: appState.currentItemRoundness,
    currentItemArrowType: appState.currentItemArrowType,
    penMode: appState.penMode,
  }
}
