import { describe, expect, it } from 'vitest'
import {
  createDrawingBoardSessionLibraryItem,
  insertDrawingBoardSessionLibraryItem,
  MAX_DRAWING_SESSION_LIBRARY_ELEMENTS,
  type DrawingBoardSessionLibraryItem,
} from '@/lib/drawing-board-session-library'
import { CURRENT_WORK_FORMAT_VERSION } from '@/lib/math-work'
import type { ScratchpadScene } from '@/lib/scratchpad'

function element(type: string, id: string, overrides: Record<string, unknown> = {}) {
  const value: Record<string, unknown> = {
    id, type, x: 10, y: 20, width: 100, height: 50, angle: 0,
    strokeColor: '#172554', backgroundColor: 'transparent', fillStyle: 'hachure',
    strokeWidth: 2, strokeStyle: 'solid', roundness: null, roughness: 0, opacity: 100,
    seed: 1, version: 1, versionNonce: 2, index: null, isDeleted: false,
    link: null, groupIds: [], frameId: null, boundElements: null, updated: 1, locked: false,
  }
  if (type === 'text') Object.assign(value, {
    text: 'อธิบาย', originalText: 'อธิบาย', fontSize: 20, fontFamily: 1,
    textAlign: 'left', verticalAlign: 'top', containerId: null,
    autoResize: true, lineHeight: 1.25,
  })
  if (type === 'line' || type === 'arrow') Object.assign(value, {
    points: [[0, 0], [100, 50]], lastCommittedPoint: null,
    startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null,
    ...(type === 'arrow' ? { elbowed: false } : {}),
  })
  if (type === 'image') Object.assign(value, {
    fileId: 'file-1', status: 'saved', scale: [1, 1], crop: null,
  })
  if (type === 'frame') value.name = null
  return { ...value, ...overrides }
}

function scene(elements: readonly unknown[]): ScratchpadScene {
  return {
    formatVersion: CURRENT_WORK_FORMAT_VERSION,
    elements,
    appState: {},
    files: {},
    background: 'lined',
  }
}

describe('teacher session-only drawing Library', () => {
  it('sanitizes selected vector/text content and detaches every relation', () => {
    const result = createDrawingBoardSessionLibraryItem({
      scene: scene([
        element('rectangle', 'box', {
          x: 50, y: 80, groupIds: ['group-1'], frameId: 'frame-1',
          boundElements: [{ id: 'label', type: 'text' }],
        }),
        element('text', 'label', {
          x: 80, y: 100, groupIds: ['group-1'], frameId: 'frame-1', containerId: 'box',
        }),
      ]),
      selectedElementIds: new Set(['box', 'label']),
      id: 'library-1',
      label: '  ขั้นอธิบาย  ',
      now: 99,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.label).toBe('ขั้นอธิบาย')
    expect(result.item.elements).toHaveLength(2)
    expect(result.item.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'box', x: 0, y: 0, groupIds: [], frameId: null, boundElements: null }),
      expect.objectContaining({ id: 'label', x: 30, y: 20, groupIds: [], frameId: null, containerId: null }),
    ]))
  })

  it.each(['image', 'frame', 'embeddable'])('rejects a selection containing %s', type => {
    const result = createDrawingBoardSessionLibraryItem({
      scene: scene([element(type, 'unsafe')]),
      selectedElementIds: new Set(['unsafe']),
      id: 'library-unsafe',
      label: 'ไม่ปลอดภัย',
    })
    expect(result).toEqual({ ok: false, reason: 'unsupported-selection' })
  })

  it('rejects empty and over-limit selections', () => {
    expect(createDrawingBoardSessionLibraryItem({
      scene: scene([element('rectangle', 'box')]),
      selectedElementIds: new Set(),
      id: 'empty',
      label: 'ว่าง',
    })).toEqual({ ok: false, reason: 'empty-selection' })

    const elements = Array.from(
      { length: MAX_DRAWING_SESSION_LIBRARY_ELEMENTS + 1 },
      (_, index) => element('rectangle', `box-${index}`),
    )
    expect(createDrawingBoardSessionLibraryItem({
      scene: scene(elements),
      selectedElementIds: new Set(elements.map(value => String(value.id))),
      id: 'large',
      label: 'มากเกินไป',
    })).toEqual({ ok: false, reason: 'too-many-elements' })
  })

  it('creates fresh ids and positions a validated item around the requested point', () => {
    const created = createDrawingBoardSessionLibraryItem({
      scene: scene([element('rectangle', 'box', { x: 20, y: 30 })]),
      selectedElementIds: new Set(['box']),
      id: 'library-1',
      label: 'กล่อง',
      now: 10,
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const ids = ['box-copy']
    const nonces = [101, 102]
    const inserted = insertDrawingBoardSessionLibraryItem({
      item: created.item,
      center: { x: 500, y: 400 },
      createId: () => ids.shift() ?? 'unexpected',
      createNonce: () => nonces.shift() ?? 999,
      now: 200,
    })
    expect(inserted).toMatchObject({
      ok: true,
      elements: [{ id: 'box-copy', x: 450, y: 375, seed: 101, versionNonce: 102, updated: 200 }],
    })
  })

  it('revalidates a library item before insertion', () => {
    const tampered: DrawingBoardSessionLibraryItem = {
      id: 'tampered',
      label: 'แอบใส่ลิงก์',
      createdAt: 1,
      elements: [element('text', 'text-1', { link: 'https://example.test' })],
    }
    expect(insertDrawingBoardSessionLibraryItem({
      item: tampered,
      center: { x: 0, y: 0 },
    })).toEqual({ ok: false, reason: 'invalid-item' })
  })
})
