import { CURRENT_WORK_FORMAT_VERSION } from '@/lib/math-work'
import { validateDrawingScene } from '@/lib/drawing-board-policy'
import type { ScratchpadScene } from '@/lib/scratchpad'

const SESSION_LIBRARY_ELEMENT_TYPES = new Set([
  'rectangle',
  'diamond',
  'ellipse',
  'arrow',
  'line',
  'freedraw',
  'text',
])

export const MAX_DRAWING_SESSION_LIBRARY_ITEMS = 12
export const MAX_DRAWING_SESSION_LIBRARY_ELEMENTS = 100
export const MAX_DRAWING_SESSION_LIBRARY_ITEM_BYTES = 256 * 1024

export interface DrawingBoardSessionLibraryItem {
  id: string
  label: string
  createdAt: number
  /** Sanitized vector/text elements only; files and app state never enter an item. */
  elements: readonly unknown[]
}

export type DrawingBoardSessionLibraryResult =
  | { ok: true; item: DrawingBoardSessionLibraryItem }
  | { ok: false; reason: 'empty-selection' | 'unsupported-selection' | 'too-many-elements' | 'too-large' | 'invalid-selection' }

export type DrawingBoardSessionLibraryInsertResult =
  | { ok: true; elements: readonly unknown[] }
  | { ok: false; reason: 'invalid-item' | 'invalid-position' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function itemScene(elements: readonly unknown[]): ScratchpadScene {
  return {
    formatVersion: CURRENT_WORK_FORMAT_VERSION,
    elements,
    appState: {},
    files: {},
    background: 'blank',
  }
}

function sanitizeLibraryElement(value: Record<string, unknown>, now: number): Record<string, unknown> {
  const element = structuredClone(value)
  element.groupIds = []
  element.frameId = null
  element.boundElements = null
  element.link = null
  element.locked = false
  element.isDeleted = false
  element.index = null
  element.updated = now
  delete element.customData
  if (element.type === 'text') element.containerId = null
  if (element.type === 'line' || element.type === 'arrow') {
    element.startBinding = null
    element.endBinding = null
  }
  return element
}

function sceneBounds(elements: readonly Record<string, unknown>[]) {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const element of elements) {
    const x = Number(element.x)
    const y = Number(element.y)
    const width = Number(element.width)
    const height = Number(element.height)
    if (![x, y, width, height].every(Number.isFinite)) return null
    left = Math.min(left, x, x + width)
    top = Math.min(top, y, y + height)
    right = Math.max(right, x, x + width)
    bottom = Math.max(bottom, y, y + height)
  }
  return Number.isFinite(left) && Number.isFinite(top) && Number.isFinite(right) && Number.isFinite(bottom)
    ? { left, top, right, bottom }
    : null
}

/**
 * Builds one route-memory-only Library item from the current teacher scene.
 *
 * Any selected image/frame rejects the whole selection. Vector/text items are
 * detached from groups, frames, bindings, links and custom data before the
 * student-safe validator proves they cannot carry a file or active payload.
 */
export function createDrawingBoardSessionLibraryItem(input: {
  scene: ScratchpadScene
  selectedElementIds: ReadonlySet<string>
  id: string
  label: string
  now?: number
}): DrawingBoardSessionLibraryResult {
  const now = input.now ?? Date.now()
  const selected = input.scene.elements.filter(value => (
    isRecord(value)
    && value.isDeleted !== true
    && typeof value.id === 'string'
    && input.selectedElementIds.has(value.id)
  )) as Record<string, unknown>[]
  if (selected.length === 0) return { ok: false, reason: 'empty-selection' }
  if (selected.length > MAX_DRAWING_SESSION_LIBRARY_ELEMENTS) {
    return { ok: false, reason: 'too-many-elements' }
  }
  if (selected.some(element => !SESSION_LIBRARY_ELEMENT_TYPES.has(String(element.type)))) {
    return { ok: false, reason: 'unsupported-selection' }
  }

  const elements = selected.map(element => sanitizeLibraryElement(element, now))
  const bounds = sceneBounds(elements)
  if (!bounds) return { ok: false, reason: 'invalid-selection' }
  for (const element of elements) {
    element.x = Number(element.x) - bounds.left
    element.y = Number(element.y) - bounds.top
  }
  const validation = validateDrawingScene(itemScene(elements), { role: 'student' })
  if (!validation.ok) return { ok: false, reason: 'invalid-selection' }
  if (new TextEncoder().encode(JSON.stringify(validation.scene.elements)).byteLength > MAX_DRAWING_SESSION_LIBRARY_ITEM_BYTES) {
    return { ok: false, reason: 'too-large' }
  }
  return {
    ok: true,
    item: {
      id: input.id,
      label: input.label.trim().slice(0, 80) || 'รายการจากกระดาน',
      createdAt: now,
      elements: validation.scene.elements,
    },
  }
}

function browserSafeInteger(): number {
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)
  return value[0]
}

/** Creates fresh editor identities and places an item around a scene point. */
export function insertDrawingBoardSessionLibraryItem(input: {
  item: DrawingBoardSessionLibraryItem
  center: { x: number; y: number }
  createId?: () => string
  createNonce?: () => number
  now?: number
}): DrawingBoardSessionLibraryInsertResult {
  if (!Number.isFinite(input.center.x) || !Number.isFinite(input.center.y)) {
    return { ok: false, reason: 'invalid-position' }
  }
  const validation = validateDrawingScene(itemScene(input.item.elements), { role: 'student' })
  if (!validation.ok || validation.scene.elements.length > MAX_DRAWING_SESSION_LIBRARY_ELEMENTS) {
    return { ok: false, reason: 'invalid-item' }
  }
  const source = validation.scene.elements.filter(isRecord)
  const bounds = sceneBounds(source)
  if (!bounds) return { ok: false, reason: 'invalid-item' }
  const createId = input.createId ?? (() => crypto.randomUUID())
  const createNonce = input.createNonce ?? browserSafeInteger
  const now = input.now ?? Date.now()
  const offsetX = input.center.x - (bounds.left + bounds.right) / 2
  const offsetY = input.center.y - (bounds.top + bounds.bottom) / 2
  const elements = source.map(value => ({
    ...structuredClone(value),
    id: createId(),
    x: Number(value.x) + offsetX,
    y: Number(value.y) + offsetY,
    seed: createNonce(),
    version: 1,
    versionNonce: createNonce(),
    updated: now,
    index: null,
  }))
  return validateDrawingScene(itemScene(elements), { role: 'student' }).ok
    ? { ok: true, elements }
    : { ok: false, reason: 'invalid-position' }
}
