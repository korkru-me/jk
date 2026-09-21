import { describe, expect, it, vi } from 'vitest'
import type {
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
} from '@excalidraw/excalidraw/element/types'
import {
  applyPartialEraserGesture,
  type DrawingEraserPoint,
} from '@/lib/drawing-board-partial-eraser'
import { validateDrawingScene } from '@/lib/drawing-board-policy'
import { CURRENT_WORK_FORMAT_VERSION } from '@/lib/math-work'

function freeDraw(overrides: Record<string, unknown> = {}): ExcalidrawElement {
  return {
    id: 'ink-1',
    type: 'freedraw',
    x: 0,
    y: 0,
    width: 100,
    height: 0,
    angle: 0,
    strokeColor: '#172554',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    roundness: null,
    seed: 7,
    version: 3,
    versionNonce: 11,
    index: 'a0',
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: 100,
    link: null,
    locked: false,
    points: [[0, 0], [100, 0]],
    pressures: [0.2, 0.8],
    simulatePressure: false,
    lastCommittedPoint: [100, 0],
    ...overrides,
  } as unknown as ExcalidrawElement
}

function rectangle(overrides: Record<string, unknown> = {}): ExcalidrawElement {
  return {
    id: 'box-1',
    type: 'rectangle',
    x: 40,
    y: -10,
    width: 20,
    height: 20,
    angle: 0,
    strokeColor: '#172554',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    roundness: null,
    seed: 8,
    version: 1,
    versionNonce: 12,
    index: 'a1',
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: 100,
    link: null,
    locked: false,
    ...overrides,
  } as unknown as ExcalidrawElement
}

const CROSSING_GESTURE: DrawingEraserPoint[] = [
  { x: 50, y: -20 },
  { x: 50, y: 20 },
]

function visibleFreeDraws(elements: readonly ExcalidrawElement[]) {
  return elements.filter((element): element is ExcalidrawFreeDrawElement => (
    element.type === 'freedraw' && !element.isDeleted
  ))
}

function fragmentScenePoints(element: ExcalidrawFreeDrawElement) {
  const center = { x: element.x + element.width / 2, y: element.y + element.height / 2 }
  const cosine = Math.cos(element.angle)
  const sine = Math.sin(element.angle)
  return element.points.map(point => {
    const absolute = { x: element.x + point[0], y: element.y + point[1] }
    const dx = absolute.x - center.x
    const dy = absolute.y - center.y
    return {
      x: center.x + dx * cosine - dy * sine,
      y: center.y + dx * sine + dy * cosine,
    }
  })
}

describe('partial drawing eraser', () => {
  it('cuts a freehand stroke into deterministic fragments at the original z position', () => {
    const after = rectangle({ id: 'after', index: 'a1' })
    const result = applyPartialEraserGesture(
      [freeDraw(), after],
      CROSSING_GESTURE,
      { radius: 4, minFragmentLength: 1, updated: 200 },
    )

    expect(result.status).toBe('applied')
    expect(result.erasedElementIds).toEqual(['ink-1'])
    expect(result.fragmentIds).toHaveLength(2)
    expect(result.elements.map(element => element.id)).toEqual([
      'ink-1',
      ...result.fragmentIds,
      'after',
    ])
    expect(result.elements[0]).toMatchObject({
      id: 'ink-1',
      isDeleted: true,
      version: 4,
      updated: 200,
    })
    const fragments = visibleFreeDraws(result.elements)
    expect(fragments).toHaveLength(2)
    expect(fragments[0]).toMatchObject({
      strokeColor: '#172554',
      strokeWidth: 2,
      opacity: 100,
      simulatePressure: false,
      groupIds: [],
      frameId: null,
      index: null,
    })
    expect(fragments[0].pressures.at(-1)).toBeCloseTo(0.47, 2)
    expect(fragments[1].pressures[0]).toBeCloseTo(0.53, 2)
  })

  it('preserves highlighter styling and grouping metadata on every remaining piece', () => {
    const result = applyPartialEraserGesture([
      freeDraw({
        strokeColor: '#facc15',
        strokeWidth: 4,
        opacity: 35,
        groupIds: ['group-deep', 'group-shallow'],
      }),
    ], CROSSING_GESTURE, { radius: 4, minFragmentLength: 1, updated: 200 })

    expect(result.status).toBe('applied')
    for (const fragment of visibleFreeDraws(result.elements)) {
      expect(fragment).toMatchObject({
        strokeColor: '#facc15',
        strokeWidth: 4,
        opacity: 35,
        groupIds: ['group-deep', 'group-shallow'],
      })
    }
  })

  it('keeps rotated fragment points at the same scene coordinates', () => {
    const rotated = freeDraw({ angle: Math.PI / 2 })
    const result = applyPartialEraserGesture(
      [rotated],
      [{ x: 30, y: 0 }, { x: 70, y: 0 }],
      { radius: 4, minFragmentLength: 1, updated: 200 },
    )

    expect(result.status).toBe('applied')
    const fragments = visibleFreeDraws(result.elements)
    expect(fragments).toHaveLength(2)
    const scenePoints = fragments.flatMap(fragment => fragmentScenePoints(fragment))
    expect(scenePoints.every(point => Math.abs(point.x - 50) < 1e-6)).toBe(true)
    expect(Math.min(...scenePoints.map(point => point.y))).toBeCloseTo(-50, 6)
    expect(Math.max(...scenePoints.map(point => point.y))).toBeCloseTo(50, 6)
  })

  it('deletes the source without creating a fragment when a tap covers the whole stroke', () => {
    const result = applyPartialEraserGesture(
      [freeDraw({ width: 2, points: [[0, 0], [2, 0]], lastCommittedPoint: [2, 0] })],
      [{ x: 1, y: 0 }],
      { radius: 8, minFragmentLength: 1, updated: 200 },
    )

    expect(result.status).toBe('applied')
    expect(result.fragmentIds).toEqual([])
    expect(result.elements).toHaveLength(1)
    expect(result.elements[0].isDeleted).toBe(true)
  })

  it('drops an invisible remainder while retaining the useful side', () => {
    const result = applyPartialEraserGesture(
      [freeDraw({ strokeWidth: 0 })],
      [{ x: 2, y: 0 }],
      { radius: 1, minFragmentLength: 2, updated: 200 },
    )

    expect(result.status).toBe('applied')
    const fragments = visibleFreeDraws(result.elements)
    expect(fragments).toHaveLength(1)
    const points = fragmentScenePoints(fragments[0])
    expect(points[0].x).toBeCloseTo(3, 6)
    expect(points.at(-1)?.x).toBeCloseTo(100, 6)
  })

  it('does not change line, shape, text, image, or frame elements', () => {
    const elements = [
      rectangle(),
      rectangle({ id: 'line-1', type: 'line', points: [[0, 0], [100, 0]], lastCommittedPoint: [100, 0], startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null }),
      rectangle({ id: 'text-1', type: 'text', text: 'ไทย', originalText: 'ไทย', fontSize: 20, fontFamily: 2, textAlign: 'left', verticalAlign: 'top', containerId: null, autoResize: true, lineHeight: 1.25 }),
      rectangle({ id: 'image-1', type: 'image', fileId: 'file-1', status: 'saved', scale: [1, 1], crop: null }),
      rectangle({ id: 'frame-1', type: 'frame', name: null }),
    ]
    const result = applyPartialEraserGesture(elements, CROSSING_GESTURE, { radius: 8 })

    expect(result.status).toBe('unchanged')
    expect(result.elements).toBe(elements)
  })

  it('is deterministic for the same scene, gesture, and update timestamp', () => {
    const input = [freeDraw()]
    const first = applyPartialEraserGesture(input, CROSSING_GESTURE, {
      radius: 4,
      minFragmentLength: 1,
      updated: 200,
    })
    const second = applyPartialEraserGesture(input, CROSSING_GESTURE, {
      radius: 4,
      minFragmentLength: 1,
      updated: 200,
    })

    expect(second).toEqual(first)
  })

  it('rejects the whole custom cut when it would exceed the element limit', () => {
    const input = [freeDraw(), rectangle()]
    const result = applyPartialEraserGesture(input, CROSSING_GESTURE, {
      radius: 4,
      minFragmentLength: 1,
      maxElements: input.length,
      updated: 200,
    })

    expect(result.status).toBe('rejected')
    expect(result.elements).toBe(input)
    expect(result.erasedElementIds).toEqual([])
  })

  it('runs the full-scene byte/sanitizer guard atomically before accepting fragments', () => {
    const acceptElements = vi.fn(() => false)
    const input = [freeDraw()]
    const result = applyPartialEraserGesture(input, CROSSING_GESTURE, {
      radius: 4,
      minFragmentLength: 1,
      updated: 200,
      acceptElements,
    })

    expect(acceptElements).toHaveBeenCalledOnce()
    expect(result.status).toBe('rejected')
    expect(result.elements).toBe(input)
  })

  it('produces a scene that passes the persisted student sanitizer', () => {
    const result = applyPartialEraserGesture([freeDraw()], CROSSING_GESTURE, {
      radius: 4,
      minFragmentLength: 1,
      updated: 200,
    })
    expect(result.status).toBe('applied')
    expect(validateDrawingScene({
      formatVersion: CURRENT_WORK_FORMAT_VERSION,
      elements: result.elements,
      appState: {},
      files: {},
      background: 'lined',
    }, { role: 'student' }).ok).toBe(true)
  })
})
