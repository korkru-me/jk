import type {
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
} from '@excalidraw/excalidraw/element/types'
import { MAX_WORK_ELEMENTS } from '@/lib/math-work'

export interface DrawingEraserPoint {
  x: number
  y: number
}

export interface PartialEraserOptions {
  /** Radius of the eraser path in scene coordinates, before stroke width. */
  radius: number
  /** Pieces shorter than this scene-coordinate length are discarded. */
  minFragmentLength?: number
  maxElements?: number
  updated?: number
  /** Final full-scene policy/byte guard supplied by the editor boundary. */
  acceptElements?: (elements: readonly ExcalidrawElement[]) => boolean
}

export interface PartialEraserResult {
  status: 'unchanged' | 'applied' | 'rejected'
  elements: readonly ExcalidrawElement[]
  erasedElementIds: readonly string[]
  fragmentIds: readonly string[]
}

interface Interval {
  start: number
  end: number
}

interface SampledPoint {
  point: [number, number]
  pressure?: number
}

const EPSILON = 1e-7

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function squaredDistance(left: DrawingEraserPoint, right: DrawingEraserPoint): number {
  const dx = left.x - right.x
  const dy = left.y - right.y
  return dx * dx + dy * dy
}

function samePoint(left: DrawingEraserPoint, right: DrawingEraserPoint): boolean {
  return squaredDistance(left, right) <= EPSILON * EPSILON
}

function normalizeGesture(points: readonly DrawingEraserPoint[]): DrawingEraserPoint[] {
  const normalized: DrawingEraserPoint[] = []
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    const previous = normalized.at(-1)
    if (!previous || !samePoint(previous, point)) normalized.push({ x: point.x, y: point.y })
  }
  return normalized
}

function intersectIntervals(left: Interval | null, right: Interval | null): Interval | null {
  if (!left || !right) return null
  const start = Math.max(left.start, right.start)
  const end = Math.min(left.end, right.end)
  return end - start > EPSILON ? { start, end } : null
}

function parameterRange(
  start: number,
  delta: number,
  minimum: number,
  maximum: number,
): Interval | null {
  if (Math.abs(delta) <= EPSILON) {
    return start >= minimum - EPSILON && start <= maximum + EPSILON
      ? { start: 0, end: 1 }
      : null
  }
  const first = (minimum - start) / delta
  const second = (maximum - start) / delta
  const range = {
    start: clamp(Math.min(first, second), 0, 1),
    end: clamp(Math.max(first, second), 0, 1),
  }
  return range.end - range.start > EPSILON ? range : null
}

function segmentCircleInterval(
  sourceStart: DrawingEraserPoint,
  sourceEnd: DrawingEraserPoint,
  center: DrawingEraserPoint,
  radius: number,
): Interval | null {
  const dx = sourceEnd.x - sourceStart.x
  const dy = sourceEnd.y - sourceStart.y
  const offsetX = sourceStart.x - center.x
  const offsetY = sourceStart.y - center.y
  const quadratic = dx * dx + dy * dy
  if (quadratic <= EPSILON) {
    return offsetX * offsetX + offsetY * offsetY <= radius * radius
      ? { start: 0, end: 1 }
      : null
  }
  const linear = 2 * (offsetX * dx + offsetY * dy)
  const constant = offsetX * offsetX + offsetY * offsetY - radius * radius
  const discriminant = linear * linear - 4 * quadratic * constant
  if (discriminant <= EPSILON) return null
  const root = Math.sqrt(discriminant)
  const start = clamp((-linear - root) / (2 * quadratic), 0, 1)
  const end = clamp((-linear + root) / (2 * quadratic), 0, 1)
  return end - start > EPSILON ? { start, end } : null
}

/** Intersection of a source segment with a swept circular eraser segment. */
function segmentCapsuleIntervals(
  sourceStart: DrawingEraserPoint,
  sourceEnd: DrawingEraserPoint,
  eraserStart: DrawingEraserPoint,
  eraserEnd: DrawingEraserPoint,
  radius: number,
): Interval[] {
  const eraserDx = eraserEnd.x - eraserStart.x
  const eraserDy = eraserEnd.y - eraserStart.y
  const eraserLength = Math.hypot(eraserDx, eraserDy)
  if (eraserLength <= EPSILON) {
    const circle = segmentCircleInterval(sourceStart, sourceEnd, eraserStart, radius)
    return circle ? [circle] : []
  }

  const axisX = eraserDx / eraserLength
  const axisY = eraserDy / eraserLength
  const normalX = -axisY
  const normalY = axisX
  const sourceDx = sourceEnd.x - sourceStart.x
  const sourceDy = sourceEnd.y - sourceStart.y
  const fromEraserX = sourceStart.x - eraserStart.x
  const fromEraserY = sourceStart.y - eraserStart.y
  const localX = fromEraserX * axisX + fromEraserY * axisY
  const localY = fromEraserX * normalX + fromEraserY * normalY
  const localDx = sourceDx * axisX + sourceDy * axisY
  const localDy = sourceDx * normalX + sourceDy * normalY
  const rectangle = intersectIntervals(
    parameterRange(localX, localDx, 0, eraserLength),
    parameterRange(localY, localDy, -radius, radius),
  )
  const startCap = segmentCircleInterval(sourceStart, sourceEnd, eraserStart, radius)
  const endCap = segmentCircleInterval(sourceStart, sourceEnd, eraserEnd, radius)
  return [rectangle, startCap, endCap].filter((value): value is Interval => value !== null)
}

function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals
    .map(interval => ({
      start: clamp(interval.start, 0, 1),
      end: clamp(interval.end, 0, 1),
    }))
    .filter(interval => interval.end - interval.start > EPSILON)
    .sort((left, right) => left.start - right.start || left.end - right.end)
  const merged: Interval[] = []
  for (const interval of sorted) {
    const previous = merged.at(-1)
    if (!previous || interval.start > previous.end + EPSILON) {
      merged.push({ ...interval })
    } else {
      previous.end = Math.max(previous.end, interval.end)
    }
  }
  return merged
}

function erasedIntervals(
  sourceStart: DrawingEraserPoint,
  sourceEnd: DrawingEraserPoint,
  gesture: readonly DrawingEraserPoint[],
  radius: number,
): Interval[] {
  if (gesture.length === 1) {
    const interval = segmentCircleInterval(sourceStart, sourceEnd, gesture[0], radius)
    return interval ? [interval] : []
  }
  const intervals: Interval[] = []
  for (let index = 1; index < gesture.length; index += 1) {
    intervals.push(...segmentCapsuleIntervals(
      sourceStart,
      sourceEnd,
      gesture[index - 1],
      gesture[index],
      radius,
    ))
  }
  return mergeIntervals(intervals)
}

function keptIntervals(erased: readonly Interval[]): Interval[] {
  if (erased.length === 0) return [{ start: 0, end: 1 }]
  const kept: Interval[] = []
  let cursor = 0
  for (const interval of erased) {
    if (interval.start - cursor > EPSILON) kept.push({ start: cursor, end: interval.start })
    cursor = Math.max(cursor, interval.end)
  }
  if (1 - cursor > EPSILON) kept.push({ start: cursor, end: 1 })
  return kept
}

function rotatePoint(
  point: DrawingEraserPoint,
  center: DrawingEraserPoint,
  angle: number,
): DrawingEraserPoint {
  if (Math.abs(angle) <= EPSILON) return { ...point }
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const dx = point.x - center.x
  const dy = point.y - center.y
  return {
    x: center.x + dx * cosine - dy * sine,
    y: center.y + dx * sine + dy * cosine,
  }
}

function localToScene(
  element: ExcalidrawFreeDrawElement,
  point: readonly [number, number],
): DrawingEraserPoint {
  return rotatePoint(
    { x: element.x + point[0], y: element.y + point[1] },
    { x: element.x + element.width / 2, y: element.y + element.height / 2 },
    element.angle,
  )
}

function pressureAt(element: ExcalidrawFreeDrawElement, segmentIndex: number, ratio: number): number | undefined {
  if (element.pressures.length === 0) return undefined
  const start = element.pressures[Math.min(segmentIndex, element.pressures.length - 1)] ?? 0
  const end = element.pressures[Math.min(segmentIndex + 1, element.pressures.length - 1)] ?? start
  return clamp(start + (end - start) * ratio, 0, 1)
}

function interpolateSample(
  element: ExcalidrawFreeDrawElement,
  segmentIndex: number,
  ratio: number,
): SampledPoint {
  const start = element.points[segmentIndex]
  const end = element.points[segmentIndex + 1]
  return {
    point: [
      start[0] + (end[0] - start[0]) * ratio,
      start[1] + (end[1] - start[1]) * ratio,
    ],
    pressure: pressureAt(element, segmentIndex, ratio),
  }
}

function appendSample(samples: SampledPoint[], sample: SampledPoint): void {
  const previous = samples.at(-1)
  if (previous && samePoint(
    { x: previous.point[0], y: previous.point[1] },
    { x: sample.point[0], y: sample.point[1] },
  )) return
  samples.push(sample)
}

function fragmentLength(samples: readonly SampledPoint[]): number {
  let length = 0
  for (let index = 1; index < samples.length; index += 1) {
    length += Math.hypot(
      samples[index].point[0] - samples[index - 1].point[0],
      samples[index].point[1] - samples[index - 1].point[1],
    )
  }
  return length
}

function splitFreeDraw(
  element: ExcalidrawFreeDrawElement,
  gesture: readonly DrawingEraserPoint[],
  radius: number,
  minFragmentLength: number,
): SampledPoint[][] | null {
  if (element.points.length === 0) return null
  if (element.points.length === 1) {
    const point = localToScene(element, element.points[0])
    const touched = gesture.length === 1
      ? squaredDistance(point, gesture[0]) <= radius * radius
      : gesture.some((gesturePoint, index) => (
          index > 0
          && segmentCapsuleIntervals(point, point, gesture[index - 1], gesturePoint, radius).length > 0
        ))
    return touched ? [] : null
  }

  const fragments: SampledPoint[][] = []
  let active: SampledPoint[] | null = null
  let didErase = false
  const closeActive = () => {
    if (active && active.length >= 2 && fragmentLength(active) >= minFragmentLength) {
      fragments.push(active)
    }
    active = null
  }

  for (let index = 0; index < element.points.length - 1; index += 1) {
    const sourceStart = localToScene(element, element.points[index])
    const sourceEnd = localToScene(element, element.points[index + 1])
    const erased = erasedIntervals(sourceStart, sourceEnd, gesture, radius)
    if (erased.length > 0) didErase = true
    const kept = keptIntervals(erased)
    if (kept.length === 0) {
      closeActive()
      continue
    }
    for (const interval of kept) {
      if (interval.start > EPSILON) closeActive()
      if (!active) active = []
      appendSample(active, interpolateSample(element, index, interval.start))
      appendSample(active, interpolateSample(element, index, interval.end))
      if (interval.end < 1 - EPSILON) closeActive()
    }
  }
  closeActive()
  return didErase ? fragments : null
}

function hashText(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function gestureFingerprint(gesture: readonly DrawingEraserPoint[]): string {
  return hashText(gesture.map(point => `${point.x.toFixed(4)},${point.y.toFixed(4)}`).join(';')).toString(36)
}

function uniqueFragmentId(
  source: ExcalidrawFreeDrawElement,
  gestureHash: string,
  ordinal: number,
  usedIds: Set<string>,
): string {
  const base = `partial-${hashText(`${source.id}:${source.version}:${gestureHash}:${ordinal}`).toString(36)}`
  let candidate = base
  let collision = 0
  while (usedIds.has(candidate)) {
    collision += 1
    candidate = `${base}-${collision.toString(36)}`
  }
  usedIds.add(candidate)
  return candidate
}

function deterministicNonce(value: string): number {
  return hashText(value) & 0x7fffffff
}

function normalizeFragment(
  source: ExcalidrawFreeDrawElement,
  samples: readonly SampledPoint[],
  id: string,
  updated: number,
): ExcalidrawFreeDrawElement {
  let minimumX = Number.POSITIVE_INFINITY
  let maximumX = Number.NEGATIVE_INFINITY
  let minimumY = Number.POSITIVE_INFINITY
  let maximumY = Number.NEGATIVE_INFINITY
  for (const sample of samples) {
    minimumX = Math.min(minimumX, sample.point[0])
    maximumX = Math.max(maximumX, sample.point[0])
    minimumY = Math.min(minimumY, sample.point[1])
    maximumY = Math.max(maximumY, sample.point[1])
  }
  const width = maximumX - minimumX
  const height = maximumY - minimumY
  const sourceCenter = {
    x: source.x + source.width / 2,
    y: source.y + source.height / 2,
  }
  const fragmentCenter = rotatePoint({
    x: source.x + (minimumX + maximumX) / 2,
    y: source.y + (minimumY + maximumY) / 2,
  }, sourceCenter, source.angle)
  const points = samples.map(sample => [
    sample.point[0] - minimumX,
    sample.point[1] - minimumY,
  ] as [number, number])
  const pressures = source.pressures.length > 0
    ? samples.map(sample => clamp(sample.pressure ?? 0, 0, 1))
    : []
  return {
    ...source,
    id,
    x: fragmentCenter.x - width / 2,
    y: fragmentCenter.y - height / 2,
    width,
    height,
    points: points as ExcalidrawFreeDrawElement['points'],
    pressures,
    lastCommittedPoint: points.at(-1) as ExcalidrawFreeDrawElement['lastCommittedPoint'],
    index: null,
    isDeleted: false,
    version: 1,
    versionNonce: deterministicNonce(id),
    updated,
  }
}

function deletedSource(
  source: ExcalidrawFreeDrawElement,
  gestureHash: string,
  updated: number,
): ExcalidrawFreeDrawElement {
  return {
    ...source,
    isDeleted: true,
    version: source.version + 1,
    versionNonce: deterministicNonce(`${source.id}:${gestureHash}:deleted`),
    updated,
  }
}

/**
 * Produces one atomic scene replacement for a partial-eraser gesture.
 * Non-freedraw elements are intentionally untouched here; Excalidraw keeps
 * ownership of its existing whole-object eraser behavior for those elements.
 */
export function applyPartialEraserGesture(
  elements: readonly ExcalidrawElement[],
  gesturePoints: readonly DrawingEraserPoint[],
  options: PartialEraserOptions,
): PartialEraserResult {
  const gesture = normalizeGesture(gesturePoints)
  if (gesture.length === 0 || !Number.isFinite(options.radius) || options.radius <= 0) {
    return { status: 'unchanged', elements, erasedElementIds: [], fragmentIds: [] }
  }
  const maxElements = options.maxElements ?? MAX_WORK_ELEMENTS
  const minimumLength = Math.max(0, options.minFragmentLength ?? 0.75)
  const updated = options.updated ?? Math.max(0, ...elements.map(element => element.updated)) + 1
  const gestureHash = gestureFingerprint(gesture)
  const usedIds = new Set(elements.map(element => element.id))
  const next: ExcalidrawElement[] = []
  const erasedElementIds: string[] = []
  const fragmentIds: string[] = []

  for (const element of elements) {
    if (element.type !== 'freedraw' || element.isDeleted) {
      next.push(element)
      continue
    }
    const effectiveRadius = options.radius + element.strokeWidth / 2
    const fragments = splitFreeDraw(element, gesture, effectiveRadius, minimumLength)
    if (fragments === null) {
      next.push(element)
      continue
    }
    erasedElementIds.push(element.id)
    next.push(deletedSource(element, gestureHash, updated))
    fragments.forEach((fragment, ordinal) => {
      const id = uniqueFragmentId(element, gestureHash, ordinal, usedIds)
      fragmentIds.push(id)
      next.push(normalizeFragment(element, fragment, id, updated))
    })
  }

  if (erasedElementIds.length === 0) {
    return { status: 'unchanged', elements, erasedElementIds: [], fragmentIds: [] }
  }
  if (
    next.length > maxElements
    || (options.acceptElements && !options.acceptElements(next))
  ) {
    return { status: 'rejected', elements, erasedElementIds: [], fragmentIds: [] }
  }
  return {
    status: 'applied',
    elements: next,
    erasedElementIds,
    fragmentIds,
  }
}
