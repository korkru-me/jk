import {
  CURRENT_WORK_FORMAT_VERSION,
  MAX_WORK_ELEMENTS,
  MAX_WORK_SCENE_BYTES,
} from '@/lib/math-work'
import type { ScratchpadBackground, ScratchpadScene } from '@/lib/scratchpad'

export type DrawingBoardRole = 'student' | 'teacher'

export type DrawingBoardTool =
  | 'selection'
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text'
  | 'eraser'
  | 'hand'
  | 'frame'
  | 'laser'

export type DrawingBoardCommand =
  | 'select'
  | 'edit'
  | 'delete'
  | 'erase-object'
  | 'erase-partial'
  | 'undo'
  | 'redo'
  | 'pan'
  | 'zoom'
  | 'fit'
  | 'change-tool'
  | 'paste-literal-text'
  | 'copy-elements'
  | 'cut-elements'
  | 'paste-elements'
  | 'duplicate-elements'
  | 'group'
  | 'align'
  | 'change-order'
  | 'hyperlink'
  | 'embed'
  | 'clear-native'
  | 'export-native'
  | 'help-native'
  | 'frame-native'
  | 'grid-native'
  | 'library-native'
  | 'frame-app'
  | 'laser-app'
  | 'grid-app'
  | 'library-session'
  | 'trusted-question-image'
  | 'generic-image'
  | 'native-lock'

const COMMON_COMMANDS = new Set<DrawingBoardCommand>([
  'select',
  'edit',
  'delete',
  'erase-object',
  'erase-partial',
  'undo',
  'redo',
  'pan',
  'zoom',
  'fit',
  'change-tool',
  'paste-literal-text',
])

const TEACHER_APP_COMMANDS = new Set<DrawingBoardCommand>([
  'frame-app',
  'laser-app',
  'grid-app',
  'library-session',
  'trusted-question-image',
])

const COMMON_TOOLS = new Set<DrawingBoardTool>([
  'selection', 'rectangle', 'diamond', 'ellipse', 'arrow', 'line',
  'freedraw', 'text', 'eraser', 'hand',
])

const TEACHER_TOOLS = new Set<DrawingBoardTool>([...COMMON_TOOLS, 'frame', 'laser'])

export function isDrawingBoardCommandAllowed(
  role: DrawingBoardRole,
  command: DrawingBoardCommand,
): boolean {
  return COMMON_COMMANDS.has(command) || (role === 'teacher' && TEACHER_APP_COMMANDS.has(command))
}

export function isDrawingBoardToolAllowed(role: DrawingBoardRole, tool: string): tool is DrawingBoardTool {
  return (role === 'teacher' ? TEACHER_TOOLS : COMMON_TOOLS).has(tool as DrawingBoardTool)
}

const COMMON_ELEMENT_TYPES = new Set([
  'rectangle',
  'diamond',
  'ellipse',
  'arrow',
  'line',
  'freedraw',
  'text',
])

const TEACHER_ELEMENT_TYPES = new Set([...COMMON_ELEMENT_TYPES, 'frame', 'image'])

const BACKGROUNDS = new Set<ScratchpadBackground>(['blank', 'lined', 'grid', 'dots'])
const SCENE_ENVELOPE_KEYS = new Set(['formatVersion', 'elements', 'appState', 'files', 'background'])

/** Exact stable subset emitted by stableDrawingAppState(). */
const STABLE_APP_STATE_KEYS = new Set([
  'scrollX',
  'scrollY',
  'zoom',
  'currentItemStrokeColor',
  'currentItemBackgroundColor',
  'currentItemFillStyle',
  'currentItemStrokeWidth',
  'currentItemStrokeStyle',
  'currentItemRoughness',
  'currentItemOpacity',
  'currentItemFontFamily',
  'currentItemFontSize',
  'currentItemTextAlign',
  'currentItemStartArrowhead',
  'currentItemEndArrowhead',
  'currentItemRoundness',
  'currentItemArrowType',
  'penMode',
])

const APPROVED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'])
const MAX_EMBEDDED_IMAGE_BYTES = 1_500_000
const CLAIM_FIELD = 'korkruQuestionImage'
const MAX_SCENE_COORDINATE = 1_000_000
const MAX_STROKE_WIDTH = 100
const MAX_FONT_SIZE = 1_000
const MAX_LINE_HEIGHT = 10
const MIN_ZOOM = 0.1
const MAX_ZOOM = 30

const BASE_ELEMENT_KEYS = new Set([
  'id', 'type', 'x', 'y', 'strokeColor', 'backgroundColor', 'fillStyle',
  'strokeWidth', 'strokeStyle', 'roundness', 'roughness', 'opacity', 'width',
  'height', 'angle', 'seed', 'version', 'versionNonce', 'index', 'isDeleted',
  'groupIds', 'frameId', 'boundElements', 'updated', 'link', 'locked', 'customData',
])
const ELEMENT_EXTRA_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  rectangle: new Set(),
  diamond: new Set(),
  ellipse: new Set(),
  text: new Set([
    'fontSize', 'fontFamily', 'text', 'textAlign', 'verticalAlign', 'containerId',
    'originalText', 'autoResize', 'lineHeight',
  ]),
  line: new Set([
    'points', 'lastCommittedPoint', 'startBinding', 'endBinding',
    'startArrowhead', 'endArrowhead',
  ]),
  arrow: new Set([
    'points', 'lastCommittedPoint', 'startBinding', 'endBinding',
    'startArrowhead', 'endArrowhead', 'elbowed', 'fixedSegments',
    'startIsSpecial', 'endIsSpecial',
  ]),
  freedraw: new Set(['points', 'pressures', 'simulatePressure', 'lastCommittedPoint']),
  image: new Set(['fileId', 'status', 'scale', 'crop']),
  frame: new Set(['name']),
}
const FILE_KEYS = new Set(['id', 'dataURL', 'mimeType', 'created', 'lastRetrieved', 'version', CLAIM_FIELD])

export type DrawingSceneIssueCode =
  | 'not-an-object'
  | 'unsupported-version'
  | 'invalid-envelope'
  | 'scene-too-large'
  | 'too-many-elements'
  | 'unsupported-app-state'
  | 'invalid-element'
  | 'unsupported-element'
  | 'element-link'
  | 'element-custom-data'
  | 'element-group'
  | 'element-lock'
  | 'invalid-element-relation'
  | 'invalid-frame-relation'
  | 'student-file'
  | 'invalid-image-relation'
  | 'invalid-image-file'
  | 'expired-image-claim'
  | 'untrusted-image'

export type DrawingSceneValidationResult =
  | { ok: true; scene: ScratchpadScene }
  | { ok: false; kind: 'invalid' | 'unsupported'; code: DrawingSceneIssueCode }

export type TeacherImageTrustDecision = 'valid' | 'expired-authentic' | 'invalid'

export interface TeacherImageTrustInput {
  fileId: string
  mimeType: string
  dataURL: string
  bytes: Uint8Array
  claim: string | null
}

export interface LegacyTeacherImageSnapshot {
  files: ReadonlyMap<string, {
    mimeType: string
    dataURL: string
    claim: string | null
    claimWasPresent: boolean
  }>
  relations: ReadonlySet<string>
}

export interface DrawingSceneValidationOptions {
  role: DrawingBoardRole
  verifyTeacherImage?: (input: TeacherImageTrustInput) => TeacherImageTrustDecision
  legacyTeacherImages?: LegacyTeacherImageSnapshot | null
  /** Used only while classifying an already-stored v1 board before a snapshot exists. */
  allowUnsignedTeacherImages?: boolean
  /** Internal editor changes were already fully checked at ingress. */
  mode?: 'full' | 'live'
  /** The sole in-progress element Excalidraw exposes in live app state. */
  transientElementId?: string | null
}

/**
 * Detach a validated JSON scene from Excalidraw's mutable element objects.
 * Excalidraw mutates scene elements in place while a pointer gesture runs, so
 * recovery must never retain the same object graph as the live editor.
 */
export function snapshotDrawingScene(scene: ScratchpadScene): ScratchpadScene {
  return JSON.parse(JSON.stringify(scene)) as ScratchpadScene
}

export interface RevisionedDrawingSceneSnapshot {
  editorRevision: number
  scene: ScratchpadScene
}

/** Never recover a scene accepted by a different board/editor identity. */
export function recoveryDrawingScene(
  snapshot: RevisionedDrawingSceneSnapshot | null,
  editorRevision: number,
  background: ScratchpadBackground,
): ScratchpadScene {
  if (snapshot?.editorRevision === editorRevision) return snapshotDrawingScene(snapshot.scene)
  return {
    formatVersion: CURRENT_WORK_FORMAT_VERSION,
    elements: [],
    appState: {},
    files: {},
    background,
  }
}

/** True only for the temporary point shape Excalidraw may emit mid-gesture/edit. */
export function isIncompleteTransientDrawingElement(
  elements: readonly unknown[],
  elementId: string | null,
): boolean {
  if (!elementId) return false
  const candidate = elements.find(value => isRecord(value) && value.id === elementId)
  if (!isRecord(candidate) || candidate.isDeleted !== false || !Array.isArray(candidate.points)) return false
  return (candidate.type === 'line' || candidate.type === 'arrow')
    ? candidate.points.length < 2
    : candidate.type === 'freedraw' && candidate.points.length === 0
}

function fail(
  kind: 'invalid' | 'unsupported',
  code: DrawingSceneIssueCode,
): DrawingSceneValidationResult {
  return { ok: false, kind, code }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every(key => allowed.has(key))
}

function jsonBytes(value: unknown): number | null {
  try {
    const json = JSON.stringify(value)
    if (typeof json !== 'string') return null
    return new TextEncoder().encode(json).byteLength
  } catch {
    return null
  }
}

function decodeCanonicalDataURL(
  dataURL: unknown,
  mimeType: unknown,
): { dataURL: string; mimeType: string; bytes: Uint8Array } | null {
  if (typeof dataURL !== 'string' || typeof mimeType !== 'string') return null
  if (!APPROVED_IMAGE_MIMES.has(mimeType)) return null
  const match = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataURL)
  if (!match || match[1] !== mimeType || match[2].length % 4 !== 0) return null
  try {
    const binary = atob(match[2])
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_EMBEDDED_IMAGE_BYTES) return null
    const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
    const signatureMatches = mimeType === 'image/png'
      ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)
      : mimeType === 'image/jpeg' || mimeType === 'image/jpg'
        ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : mimeType === 'image/webp'
          ? ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
          : ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a'
    if (!signatureMatches) return null
    const canonical = btoa(binary)
    if (canonical !== match[2]) return null
    return { dataURL, mimeType, bytes }
  } catch {
    return null
  }
}

function imageClaim(file: Record<string, unknown>): string | null {
  const metadata = file[CLAIM_FIELD]
  if (
    !isRecord(metadata)
    || !hasOnlyKeys(metadata, new Set(['version', 'claim']))
    || metadata.version !== 1
    || typeof metadata.claim !== 'string'
  ) return null
  return metadata.claim
}

function hasClaimField(file: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(file, CLAIM_FIELD)
}

function relationKey(elementId: string, fileId: string): string {
  return JSON.stringify([elementId, fileId])
}

function legacyMatches(
  snapshot: LegacyTeacherImageSnapshot | null | undefined,
  fileId: string,
  mimeType: string,
  dataURL: string,
  elementIds: readonly string[],
  claim: string | null,
  claimWasPresent: boolean,
): boolean {
  if (!snapshot) return false
  const previous = snapshot.files.get(fileId)
  return previous?.mimeType === mimeType
    && previous.dataURL === dataURL
    && previous.claim === claim
    && previous.claimWasPresent === claimWasPresent
    && elementIds.every(elementId => snapshot.relations.has(relationKey(elementId, fileId)))
}

function finiteBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function sceneCoordinate(value: unknown): value is number {
  return finiteBetween(value, -MAX_SCENE_COORDINATE, MAX_SCENE_COORDINATE)
}

function safeInteger(value: unknown, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
}

function scenePoint(value: unknown): boolean {
  return Array.isArray(value)
    && value.length === 2
    && sceneCoordinate(value[0])
    && sceneCoordinate(value[1])
}

function nullOrString(value: unknown): boolean {
  return value === null || typeof value === 'string'
}

function validBinding(value: unknown): boolean {
  return value === null || (
    isRecord(value)
    && hasOnlyKeys(value, new Set(['elementId', 'focus', 'gap', 'fixedPoint']))
    && typeof value.elementId === 'string'
    && value.elementId.length > 0
    && sceneCoordinate(value.focus)
    && sceneCoordinate(value.gap)
    && (!Object.prototype.hasOwnProperty.call(value, 'fixedPoint') || scenePoint(value.fixedPoint))
  )
}

function hasBoundElement(
  candidate: Record<string, unknown>,
  id: string,
  type: 'arrow' | 'text',
): boolean {
  return Array.isArray(candidate.boundElements)
    && candidate.boundElements.some(value => (
      isRecord(value) && value.id === id && value.type === type
    ))
}

function validFixedSegments(value: unknown): boolean {
  return value === null || (
    Array.isArray(value)
    && value.every(segment => (
      isRecord(segment)
      && hasOnlyKeys(segment, new Set(['start', 'end', 'index']))
      && scenePoint(segment.start)
      && scenePoint(segment.end)
      && safeInteger(segment.index, 0, MAX_WORK_ELEMENTS)
    ))
  )
}

function validateElementKeys(candidate: Record<string, unknown>): boolean {
  if (typeof candidate.type !== 'string') return false
  const extras = ELEMENT_EXTRA_KEYS[candidate.type]
  return !!extras && Object.keys(candidate).every(key => BASE_ELEMENT_KEYS.has(key) || extras.has(key))
}

function validateBaseElement(candidate: Record<string, unknown>): boolean {
  if (
    !validateElementKeys(candidate)
    || !sceneCoordinate(candidate.x)
    || !sceneCoordinate(candidate.y)
    || !sceneCoordinate(candidate.width)
    || !sceneCoordinate(candidate.height)
    || !finiteBetween(candidate.angle, -1_000, 1_000)
    || !finiteBetween(candidate.strokeWidth, 0, MAX_STROKE_WIDTH)
    || !finiteBetween(candidate.roughness, 0, 2)
    || !finiteBetween(candidate.opacity, 0, 100)
    || !safeInteger(candidate.seed)
    || !safeInteger(candidate.version, 0)
    || !safeInteger(candidate.versionNonce)
    || !safeInteger(candidate.updated, 0)
  ) return false
  if (
    typeof candidate.strokeColor !== 'string' || candidate.strokeColor.length > 64
    || typeof candidate.backgroundColor !== 'string' || candidate.backgroundColor.length > 64
    || !['hachure', 'cross-hatch', 'solid', 'zigzag'].includes(String(candidate.fillStyle))
    || !['solid', 'dashed', 'dotted'].includes(String(candidate.strokeStyle))
    || !Array.isArray(candidate.groupIds)
    || !candidate.groupIds.every(value => typeof value === 'string')
    || !nullOrString(candidate.frameId)
    || candidate.isDeleted !== true && candidate.isDeleted !== false
    || candidate.locked !== false
    || candidate.link !== null
    || !(candidate.index === null || (
      typeof candidate.index === 'string' && candidate.index.length > 0 && candidate.index.length <= 128
    ))
  ) return false
  if (
    candidate.roundness !== null
    && (
      !isRecord(candidate.roundness)
      || !hasOnlyKeys(candidate.roundness, new Set(['type', 'value']))
      || ![1, 2, 3].includes(candidate.roundness.type as number)
      || (candidate.roundness.value !== undefined
        && !finiteBetween(candidate.roundness.value, 0, MAX_SCENE_COORDINATE))
    )
  ) return false
  if (candidate.boundElements !== null) {
    if (!Array.isArray(candidate.boundElements)) return false
    if (!candidate.boundElements.every(value => (
      isRecord(value)
      && hasOnlyKeys(value, new Set(['id', 'type']))
      && typeof value.id === 'string'
      && (value.type === 'arrow' || value.type === 'text')
    ))) return false
  }
  if (
    candidate.customData !== undefined
    && (!isRecord(candidate.customData) || Object.keys(candidate.customData).length > 0)
  ) return false
  return true
}

function validateElementShape(candidate: Record<string, unknown>, allowIncomplete = false): boolean {
  if (!validateBaseElement(candidate)) return false
  if (candidate.type === 'text') {
    return typeof candidate.text === 'string'
      && typeof candidate.originalText === 'string'
      && finiteBetween(candidate.fontSize, 1, MAX_FONT_SIZE)
      && safeInteger(candidate.fontFamily, 1, 1_000)
      && ['left', 'center', 'right'].includes(String(candidate.textAlign))
      && ['top', 'middle', 'bottom'].includes(String(candidate.verticalAlign))
      && nullOrString(candidate.containerId)
      && typeof candidate.autoResize === 'boolean'
      && finiteBetween(candidate.lineHeight, 0.1, MAX_LINE_HEIGHT)
  }
  if (candidate.type === 'line' || candidate.type === 'arrow') {
    if (
      !Array.isArray(candidate.points)
      || (!allowIncomplete && candidate.points.length < 2)
      || !candidate.points.every(scenePoint)
      || !(candidate.lastCommittedPoint === null || scenePoint(candidate.lastCommittedPoint))
      || !validBinding(candidate.startBinding)
      || !validBinding(candidate.endBinding)
      || ![null, 'arrow', 'bar', 'dot', 'circle', 'circle_outline', 'triangle', 'triangle_outline', 'diamond', 'diamond_outline', 'crowfoot_one', 'crowfoot_many', 'crowfoot_one_or_many'].includes(candidate.startArrowhead as null | string)
      || ![null, 'arrow', 'bar', 'dot', 'circle', 'circle_outline', 'triangle', 'triangle_outline', 'diamond', 'diamond_outline', 'crowfoot_one', 'crowfoot_many', 'crowfoot_one_or_many'].includes(candidate.endArrowhead as null | string)
    ) return false
    if (candidate.type !== 'arrow' || typeof candidate.elbowed !== 'boolean') return candidate.type !== 'arrow'
    if (!candidate.elbowed) {
      // Excalidraw keeps the former elbow metadata when an elbow arrow is
      // switched back to a sharp/round arrow. Accept that stable shape, but
      // continue validating every retained field rather than silently
      // accepting arbitrary data.
      return (!Object.prototype.hasOwnProperty.call(candidate, 'fixedSegments')
          || validFixedSegments(candidate.fixedSegments))
        && (!Object.prototype.hasOwnProperty.call(candidate, 'startIsSpecial')
          || candidate.startIsSpecial === null
          || typeof candidate.startIsSpecial === 'boolean')
        && (!Object.prototype.hasOwnProperty.call(candidate, 'endIsSpecial')
          || candidate.endIsSpecial === null
          || typeof candidate.endIsSpecial === 'boolean')
    }
    return validFixedSegments(candidate.fixedSegments)
      && (candidate.startIsSpecial === null || typeof candidate.startIsSpecial === 'boolean')
      && (candidate.endIsSpecial === null || typeof candidate.endIsSpecial === 'boolean')
      && (candidate.startBinding === null || (isRecord(candidate.startBinding) && scenePoint(candidate.startBinding.fixedPoint)))
      && (candidate.endBinding === null || (isRecord(candidate.endBinding) && scenePoint(candidate.endBinding.fixedPoint)))
  }
  if (candidate.type === 'freedraw') {
    return Array.isArray(candidate.points)
      && (allowIncomplete || candidate.points.length > 0)
      && candidate.points.every(scenePoint)
      && Array.isArray(candidate.pressures)
      && candidate.pressures.every(value => finiteBetween(value, 0, 1))
      && typeof candidate.simulatePressure === 'boolean'
      && (candidate.lastCommittedPoint === null || scenePoint(candidate.lastCommittedPoint))
  }
  if (candidate.type === 'image') {
    const crop = candidate.crop
    return typeof candidate.fileId === 'string'
      && candidate.fileId.length > 0
      && ['pending', 'saved', 'error'].includes(String(candidate.status))
      && Array.isArray(candidate.scale)
      && candidate.scale.length === 2
      && candidate.scale.every(value => value === -1 || value === 1)
      && (crop === null || (
        isRecord(crop)
        && hasOnlyKeys(crop, new Set(['x', 'y', 'width', 'height', 'naturalWidth', 'naturalHeight']))
        && finiteBetween(crop.x, 0, MAX_SCENE_COORDINATE)
        && finiteBetween(crop.y, 0, MAX_SCENE_COORDINATE)
        && finiteBetween(crop.width, 0, MAX_SCENE_COORDINATE)
        && finiteBetween(crop.height, 0, MAX_SCENE_COORDINATE)
        && finiteBetween(crop.naturalWidth, 1, MAX_SCENE_COORDINATE)
        && finiteBetween(crop.naturalHeight, 1, MAX_SCENE_COORDINATE)
      ))
  }
  if (candidate.type === 'frame') return nullOrString(candidate.name)
  return true
}

function validateAppState(appState: Record<string, unknown>): boolean {
  if (!Object.keys(appState).every(key => STABLE_APP_STATE_KEYS.has(key))) return false
  for (const [key, value] of Object.entries(appState)) {
    if (key === 'scrollX' || key === 'scrollY') {
      if (!sceneCoordinate(value)) return false
    } else if (key === 'zoom') {
      if (
        !isRecord(value)
        || !hasOnlyKeys(value, new Set(['value']))
        || !finiteBetween(value.value, MIN_ZOOM, MAX_ZOOM)
      ) return false
    } else if (key === 'currentItemStrokeColor' || key === 'currentItemBackgroundColor') {
      if (typeof value !== 'string' || value.length > 64) return false
    } else if (key === 'currentItemFillStyle') {
      if (!['hachure', 'cross-hatch', 'solid', 'zigzag'].includes(String(value))) return false
    } else if (key === 'currentItemStrokeStyle') {
      if (!['solid', 'dashed', 'dotted'].includes(String(value))) return false
    } else if (
      key === 'currentItemStrokeWidth'
      || key === 'currentItemRoughness'
      || key === 'currentItemOpacity'
      || key === 'currentItemFontFamily'
      || key === 'currentItemFontSize'
    ) {
      if (key === 'currentItemStrokeWidth' && !finiteBetween(value, 0, MAX_STROKE_WIDTH)) return false
      if (key === 'currentItemRoughness' && !finiteBetween(value, 0, 2)) return false
      if (key === 'currentItemOpacity' && !finiteBetween(value, 0, 100)) return false
      if (key === 'currentItemFontFamily' && !safeInteger(value, 1, 1_000)) return false
      if (key === 'currentItemFontSize' && !finiteBetween(value, 1, MAX_FONT_SIZE)) return false
    } else if (key === 'currentItemTextAlign') {
      if (!['left', 'center', 'right'].includes(String(value))) return false
    } else if (key === 'currentItemStartArrowhead' || key === 'currentItemEndArrowhead') {
      if (!nullOrString(value)) return false
    } else if (key === 'currentItemRoundness') {
      if (!['round', 'sharp'].includes(String(value))) return false
    } else if (key === 'currentItemArrowType') {
      if (!['sharp', 'round', 'elbow'].includes(String(value))) return false
    } else if (key === 'penMode' && typeof value !== 'boolean') {
      return false
    }
  }
  return true
}

/**
 * Content boundary shared by IndexedDB, private Storage, React hosts and Server Actions.
 * It rejects a whole scene; it never drops unsupported content and reports success.
 */
export function validateDrawingScene(
  value: unknown,
  options: DrawingSceneValidationOptions,
): DrawingSceneValidationResult {
  if (!isRecord(value)) return fail('invalid', 'not-an-object')
  if (Object.keys(value).some(key => !SCENE_ENVELOPE_KEYS.has(key))) {
    return fail('invalid', 'invalid-envelope')
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'formatVersion') || !Number.isInteger(value.formatVersion)) {
    return fail('invalid', 'invalid-envelope')
  }
  if (value.formatVersion !== CURRENT_WORK_FORMAT_VERSION) {
    return fail('unsupported', 'unsupported-version')
  }
  if (
    !Array.isArray(value.elements)
    || !isRecord(value.appState)
    || !isRecord(value.files)
    || !BACKGROUNDS.has(value.background as ScratchpadBackground)
  ) {
    return fail('invalid', 'invalid-envelope')
  }
  if (value.elements.length > MAX_WORK_ELEMENTS) return fail('unsupported', 'too-many-elements')
  if (options.mode !== 'live') {
    const size = jsonBytes(value)
    if (size === null) return fail('invalid', 'invalid-envelope')
    if (size > MAX_WORK_SCENE_BYTES) return fail('unsupported', 'scene-too-large')
  }
  if (!validateAppState(value.appState)) return fail('unsupported', 'unsupported-app-state')

  const allowedTypes = options.role === 'teacher' ? TEACHER_ELEMENT_TYPES : COMMON_ELEMENT_TYPES
  const elementIds = new Set<string>()
  const elementsById = new Map<string, Record<string, unknown>>()
  const imageRelations = new Map<string, string[]>()

  for (const candidate of value.elements) {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || !candidate.id) {
      return fail('invalid', 'invalid-element')
    }
    if (elementIds.has(candidate.id)) return fail('invalid', 'invalid-element')
    elementIds.add(candidate.id)
    elementsById.set(candidate.id, candidate)
    if (typeof candidate.type !== 'string' || !allowedTypes.has(candidate.type)) {
      return fail('unsupported', 'unsupported-element')
    }
    if (typeof candidate.link === 'string' && candidate.link !== '') {
      return fail('unsupported', 'element-link')
    }
    if (candidate.link !== null) return fail('invalid', 'invalid-element')
    if (
      candidate.customData !== undefined
      && (!isRecord(candidate.customData) || Object.keys(candidate.customData).length > 0)
    ) {
      return fail('unsupported', 'element-custom-data')
    }
    if (!Array.isArray(candidate.groupIds)) return fail('invalid', 'invalid-element')
    if (candidate.groupIds.length > 0) {
      return fail('unsupported', 'element-group')
    }
    if (typeof candidate.locked !== 'boolean') return fail('invalid', 'invalid-element')
    if (candidate.locked === true) return fail('unsupported', 'element-lock')
    const allowIncomplete = options.mode === 'live'
      && options.transientElementId === candidate.id
      && candidate.isDeleted === false
    if (!validateElementShape(candidate, allowIncomplete)) return fail('invalid', 'invalid-element')
    if (candidate.type === 'image') {
      if (typeof candidate.fileId !== 'string' || !candidate.fileId) {
        return fail('invalid', 'invalid-image-relation')
      }
      const relations = imageRelations.get(candidate.fileId) ?? []
      relations.push(candidate.id)
      imageRelations.set(candidate.fileId, relations)
    }
    if (options.role === 'student' && candidate.frameId != null) {
      return fail('unsupported', 'invalid-frame-relation')
    }
  }

  const textContainerTypes = new Set(['rectangle', 'diamond', 'ellipse', 'arrow'])
  const arrowBindingTypes = new Set(['rectangle', 'diamond', 'ellipse', 'text', 'image', 'frame'])
  for (const candidate of elementsById.values()) {
    // Deleted elements are retained as undo history. Excalidraw deliberately
    // removes the reciprocal edge only from the surviving element, leaving
    // stale bindings/container ids on the deleted node until an undo. Validate
    // the live graph strictly and treat deleted-node relations as inert history.
    if (candidate.isDeleted === true) continue
    if (candidate.type === 'text' && candidate.containerId !== null) {
      const container = elementsById.get(candidate.containerId as string)
      if (
        !container
        || !textContainerTypes.has(String(container.type))
        || (container.isDeleted === false && !hasBoundElement(container, candidate.id as string, 'text'))
      ) return fail('invalid', 'invalid-element-relation')
    }
    if (candidate.type === 'arrow') {
      for (const key of ['startBinding', 'endBinding'] as const) {
        const binding = candidate[key]
        if (binding === null) continue
        if (!isRecord(binding)) return fail('invalid', 'invalid-element-relation')
        const target = elementsById.get(binding.elementId as string)
        if (
          !target
          || !arrowBindingTypes.has(String(target.type))
          || (target.isDeleted === false && !hasBoundElement(target, candidate.id as string, 'arrow'))
        ) return fail('invalid', 'invalid-element-relation')
      }
    }
    if (Array.isArray(candidate.boundElements)) {
      const seen = new Set<string>()
      for (const relation of candidate.boundElements) {
        if (!isRecord(relation)) return fail('invalid', 'invalid-element-relation')
        const key = `${relation.type}:${relation.id}`
        if (seen.has(key)) return fail('invalid', 'invalid-element-relation')
        seen.add(key)
        const bound = elementsById.get(relation.id as string)
        if (relation.type === 'text') {
          if (
            !bound
            || bound.type !== 'text'
            || (bound.isDeleted === false && bound.containerId !== candidate.id)
          ) {
            return fail('invalid', 'invalid-element-relation')
          }
        } else if (
          !bound
          || bound.type !== 'arrow'
          || (bound.isDeleted === false && ![bound.startBinding, bound.endBinding].some(binding => (
            isRecord(binding) && binding.elementId === candidate.id
          )))
        ) return fail('invalid', 'invalid-element-relation')
      }
    }
  }

  if (options.role === 'teacher') {
    for (const candidate of value.elements) {
      const element = candidate as Record<string, unknown>
      if (element.isDeleted === true) continue
      if (element.frameId != null) {
        const frame = typeof element.frameId === 'string' ? elementsById.get(element.frameId) : null
        if (!frame || frame.type !== 'frame') return fail('invalid', 'invalid-frame-relation')
      }
    }
  }

  const fileEntries = Object.entries(value.files)
  if (options.role === 'student' && fileEntries.length > 0) return fail('unsupported', 'student-file')
  if (options.role === 'teacher' && fileEntries.length !== imageRelations.size) {
    return fail('invalid', 'invalid-image-relation')
  }

  for (const [fileId, candidate] of fileEntries) {
    if (
      !isRecord(candidate)
      || !hasOnlyKeys(candidate, FILE_KEYS)
      || candidate.id !== fileId
      || !imageRelations.has(fileId)
    ) {
      return fail('invalid', 'invalid-image-relation')
    }
    if (
      !safeInteger(candidate.created, 0)
      || (candidate.lastRetrieved !== undefined && !safeInteger(candidate.lastRetrieved, 0))
      || (candidate.version !== undefined && !safeInteger(candidate.version, 0))
    ) return fail('invalid', 'invalid-image-file')
    const claim = imageClaim(candidate)
    const claimWasPresent = hasClaimField(candidate)
    if (claimWasPresent && claim === null) return fail('unsupported', 'untrusted-image')
    const decoded = options.mode === 'live'
      && typeof candidate.dataURL === 'string'
      && typeof candidate.mimeType === 'string'
      && APPROVED_IMAGE_MIMES.has(candidate.mimeType)
      && candidate.dataURL.startsWith(`data:${candidate.mimeType};base64,`)
      && candidate.dataURL.length <= MAX_EMBEDDED_IMAGE_BYTES * 2
      ? {
          dataURL: candidate.dataURL,
          mimeType: candidate.mimeType,
          bytes: new Uint8Array(),
        }
      : decodeCanonicalDataURL(candidate.dataURL, candidate.mimeType)
    if (!decoded) return fail('unsupported', 'invalid-image-file')
    const trust = options.verifyTeacherImage?.({
      fileId,
      mimeType: decoded.mimeType,
      dataURL: decoded.dataURL,
      bytes: decoded.bytes,
      claim,
    }) ?? 'invalid'
    const relations = imageRelations.get(fileId) ?? []
    const previousMatch = legacyMatches(
      options.legacyTeacherImages,
      fileId,
      decoded.mimeType,
      decoded.dataURL,
      relations,
      claim,
      claimWasPresent,
    )
    if (trust === 'expired-authentic' && !previousMatch) {
      return fail('unsupported', 'expired-image-claim')
    }
    const trusted = trust === 'valid'
      || (trust === 'expired-authentic' && previousMatch)
      || (trust === 'invalid' && previousMatch)
      || (!claimWasPresent && options.allowUnsignedTeacherImages === true)
    if (!trusted) return fail('unsupported', 'untrusted-image')
  }

  return {
    ok: true,
    scene: {
      formatVersion: CURRENT_WORK_FORMAT_VERSION,
      elements: value.elements,
      appState: value.appState,
      files: value.files,
      background: value.background as ScratchpadBackground,
    },
  }
}

/**
 * Excalidraw intentionally keeps binary files outside its undo history. Keep
 * only files referenced by the current element history before live validation
 * or persistence, so undoing an app-owned image cannot leave an orphan behind.
 */
export function referencedDrawingFiles(
  elements: readonly unknown[],
  files: Record<string, unknown>,
): Record<string, unknown> {
  const referenced = new Set<string>()
  for (const value of elements) {
    if (isRecord(value) && value.type === 'image' && typeof value.fileId === 'string') {
      referenced.add(value.fileId)
    }
  }
  return Object.fromEntries(Object.entries(files).filter(([fileId]) => referenced.has(fileId)))
}

export function createLegacyTeacherImageSnapshot(scene: ScratchpadScene): LegacyTeacherImageSnapshot {
  const files = new Map<string, {
    mimeType: string
    dataURL: string
    claim: string | null
    claimWasPresent: boolean
  }>()
  const relations = new Set<string>()
  for (const [fileId, value] of Object.entries(scene.files)) {
    if (!isRecord(value) || typeof value.mimeType !== 'string' || typeof value.dataURL !== 'string') continue
    files.set(fileId, {
      mimeType: value.mimeType,
      dataURL: value.dataURL,
      claim: imageClaim(value),
      claimWasPresent: hasClaimField(value),
    })
  }
  for (const value of scene.elements) {
    if (!isRecord(value) || value.type !== 'image' || typeof value.id !== 'string' || typeof value.fileId !== 'string') continue
    relations.add(relationKey(value.id, value.fileId))
  }
  return { files, relations }
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return target.matches('input, textarea, [contenteditable="true"], .excalidraw-wysiwyg')
}

/** Pure keyboard policy used by the adapter and regression tests. */
export function shouldBlockDrawingBoardShortcut(input: {
  key: string
  code?: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  textEditing?: boolean
}): boolean {
  const key = input.key.toLowerCase()
  const code = input.code ?? ''
  const physicalKey = /^Key[A-Z]$/.test(code)
    ? code.slice(3).toLowerCase()
    : code === 'Slash'
      ? '/'
      : code === 'BracketLeft'
        ? '['
        : code === 'BracketRight'
          ? ']'
          : code === 'Delete' || code === 'Backspace'
            ? code.toLowerCase()
            : ''
  const matches = (values: readonly string[]) => values.includes(key) || values.includes(physicalKey)
  const modifier = Boolean(input.ctrlKey || input.metaKey)
  // These belong to browser/file UI, not literal text editing, and must stay
  // blocked even while Excalidraw's text editor has focus.
  if (modifier && matches(['s', 'o', 'p'])) return true
  if (input.textEditing) return false
  if (key === '9' || code === 'Digit9' || code === 'Numpad9') return true
  if (matches(['f', 'k', 'q', '?']) || (input.shiftKey && code === 'Slash')) return true
  if (!modifier) return false
  // Paste itself is the single capture-phase boundary. Leaving V alone here
  // lets a literal paste event fire when the app-owned text tool is active.
  if (matches(['c', 'x', 'd', 'g', 'k', '/', '[', ']', 'delete', 'backspace'])) return true
  if (input.shiftKey && matches(['e', 'g', 'p'])) return true
  return false
}

export function shouldBlockDrawingBoardKeyboardEvent(event: KeyboardEvent): boolean {
  return shouldBlockDrawingBoardShortcut({
    key: event.key,
    code: event.code,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    textEditing: isTextEditingTarget(event.target),
  })
}

export function isSerializedDrawingClipboardText(text: string): boolean {
  const trimmed = text.trimStart()
  if (!trimmed.startsWith('{')) return false
  try {
    const value = JSON.parse(trimmed) as unknown
    return isRecord(value) && (
      value.type === 'excalidraw'
      || value.type === 'excalidraw/clipboard'
      || value.type === 'excalidraw-api/clipboard'
      || Array.isArray(value.elements)
    )
  } catch {
    return false
  }
}

export type DrawingBoardPasteDecision = 'blocked' | 'literal-text-editor' | 'literal-canvas-text'

/**
 * One fail-closed paste decision shared by the capture handler and tests.
 *
 * Clipboard files and serialized Excalidraw payloads never reach the editor.
 * Literal text is accepted only while the board can be edited and either its
 * text tool or an existing text editor owns the paste.
 */
export function drawingBoardPasteDecision(input: {
  hasClipboardData: boolean
  fileCount: number
  text: string
  textEditing: boolean
  activeTool: string | null
  viewModeEnabled: boolean
  contentEditingLocked: boolean
}): DrawingBoardPasteDecision {
  if (
    !input.hasClipboardData
    || input.fileCount > 0
    || !input.text
    || isSerializedDrawingClipboardText(input.text)
    || input.viewModeEnabled
    || input.contentEditingLocked
  ) return 'blocked'
  if (input.textEditing) return 'literal-text-editor'
  return input.activeTool === 'text' ? 'literal-canvas-text' : 'blocked'
}

export type DrawingBoardSurfaceEventKind = 'copy' | 'cut' | 'dragover' | 'drop' | 'contextmenu'

/** Runtime event matrix for native ingress/egress paths around the canvas. */
export function shouldBlockDrawingBoardSurfaceEvent(input: {
  kind: DrawingBoardSurfaceEventKind
  textEditing?: boolean
}): boolean {
  if (input.kind === 'copy' || input.kind === 'cut') return !input.textEditing
  return true
}
