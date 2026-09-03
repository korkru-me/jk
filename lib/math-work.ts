export const MATH_WORK_BUCKET = 'math-work-artifacts'
export const MATH_WORK_PREVIEW_MIME = 'image/webp'
export const MATH_WORK_SCENE_MIME = 'application/json'
export const MAX_WORK_PREVIEW_BYTES = 5 * 1024 * 1024
export const MAX_WORK_SCENE_BYTES = 2 * 1024 * 1024
export const MAX_WORK_ELEMENTS = 10_000
export const CURRENT_WORK_FORMAT_VERSION = 1

export type WorkArtifactSource = 'scratchpad' | 'photo'

export interface WorkUploadPaths {
  previewPath: string
  scenePath: string | null
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PART_KEY_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,99}$/

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export function isWorkPartKey(value: string): boolean {
  return PART_KEY_PATTERN.test(value)
}

export function isWorkArtifactSource(value: string): value is WorkArtifactSource {
  return value === 'scratchpad' || value === 'photo'
}

export function isSupportedWorkFormatVersion(value: number): boolean {
  return Number.isInteger(value) && value === CURRENT_WORK_FORMAT_VERSION
}

function assertUuid(label: string, value: string) {
  if (!isUuid(value)) throw new Error(`${label} must be a UUID`)
}

export function buildStudentWorkUploadPaths(input: {
  studentId: string
  submissionId: string
  submissionAnswerId: string
  uploadId: string
  includeScene: boolean
}): WorkUploadPaths {
  assertUuid('studentId', input.studentId)
  assertUuid('submissionId', input.submissionId)
  assertUuid('submissionAnswerId', input.submissionAnswerId)
  assertUuid('uploadId', input.uploadId)

  const prefix = [
    'students',
    input.studentId,
    input.submissionId,
    input.submissionAnswerId,
    input.uploadId,
  ].join('/')

  return {
    previewPath: `${prefix}/preview.webp`,
    scenePath: input.includeScene ? `${prefix}/scene.json` : null,
  }
}

export function buildTeachingBoardUploadPaths(input: {
  teacherId: string
  assignmentId: string
  questionId: string
  slot: number
  uploadId: string
}): WorkUploadPaths {
  assertUuid('teacherId', input.teacherId)
  assertUuid('assignmentId', input.assignmentId)
  assertUuid('questionId', input.questionId)
  assertUuid('uploadId', input.uploadId)
  if (!Number.isInteger(input.slot) || input.slot < 1 || input.slot > 5) {
    throw new Error('slot must be an integer from 1 to 5')
  }

  const prefix = [
    'teachers',
    input.teacherId,
    input.assignmentId,
    input.questionId,
    String(input.slot),
    input.uploadId,
  ].join('/')

  return {
    previewPath: `${prefix}/preview.webp`,
    scenePath: `${prefix}/scene.json`,
  }
}

export function readSceneElementCount(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const scene = value as Record<string, unknown>
  if (scene.formatVersion !== CURRENT_WORK_FORMAT_VERSION) return null
  if (!Array.isArray(scene.elements) || scene.elements.length > MAX_WORK_ELEMENTS) return null
  return scene.elements.length
}

export function hasWebpSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false
  return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
}

export function validateStoredWorkFile(input: {
  size: number | undefined
  contentType: string | undefined
  kind: 'preview' | 'scene'
}): { ok: true; size: number } | { ok: false; error: string } {
  const expectedType = input.kind === 'preview' ? MATH_WORK_PREVIEW_MIME : MATH_WORK_SCENE_MIME
  const maxSize = input.kind === 'preview' ? MAX_WORK_PREVIEW_BYTES : MAX_WORK_SCENE_BYTES

  if (input.contentType !== expectedType) {
    return { ok: false, error: input.kind === 'preview' ? 'ไฟล์ตัวอย่างต้องเป็น WebP' : 'ไฟล์ต้นฉบับต้องเป็น JSON' }
  }
  if (!Number.isInteger(input.size) || !input.size || input.size < 1 || input.size > maxSize) {
    return { ok: false, error: input.kind === 'preview' ? 'ไฟล์ตัวอย่างมีขนาดไม่ถูกต้อง' : 'ไฟล์ต้นฉบับมีขนาดไม่ถูกต้อง' }
  }
  return { ok: true, size: input.size }
}
