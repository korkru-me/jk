import type { StudentWorkArtifactView } from '@/lib/math-work'
import type { ScratchpadScene } from '@/lib/scratchpad'

export type StudentDraftState =
  | 'loading'
  | 'empty'
  | 'dirty_local'
  | 'saving_local'
  | 'saved_local'
  | 'save_failed'
  | 'limit_exceeded'
  | 'load_failed'
  | 'unsupported_read_only'

export type StudentAttachmentState =
  | 'not_attached'
  | 'attaching'
  | 'attached_current'
  | 'attached_stale'
  | 'attached_unverified'
  | 'attach_failed'

export type OneStepRecoveryState = 'none' | 'available_once' | 'restored'

export interface ScratchpadAttachmentRevision {
  artifactId: string
  artifactUpdatedAt: string
  revision: number
  fingerprint: string
}

export type ScratchpadRecovery =
  | { state: 'none' }
  | {
      state: 'available_once'
      scene: ScratchpadScene
      fingerprint: string
      createdAt: number
    }
  | { state: 'restored'; restoredAt: number }

/**
 * Local revision metadata stored beside the existing scene in the same
 * IndexedDB record. It is recovery/UI evidence only, never trusted server
 * state and never sent with an answer or artifact request.
 */
export interface ScratchpadRevisionMetadata {
  editRevision: number
  savedRevision: number
  currentFingerprint: string
  attachment: ScratchpadAttachmentRevision | null
  recovery: ScratchpadRecovery
}

const FINGERPRINT_PATTERN = /^scratch-v1:[0-9a-f]{16}:[0-9]+$/
const NON_SEMANTIC_ELEMENT_KEYS = new Set(['version', 'versionNonce', 'updated'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  )
}

function visibleElement(value: unknown): unknown | null {
  if (!isRecord(value) || value.isDeleted === true) return null
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !NON_SEMANTIC_ELEMENT_KEYS.has(key) && key !== 'isDeleted')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  )
}

/** A compact deterministic hash; it is a change detector, not a security token. */
function compactFingerprint(value: string): string {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  const hex = (part: number) => (part >>> 0).toString(16).padStart(8, '0')
  return `scratch-v1:${hex(first)}${hex(second)}:${value.length}`
}

/**
 * Fingerprint only visible content, referenced file payloads, and paper
 * background. Tool choice, selection, pan, zoom, and revision timestamps are
 * deliberately excluded so navigation never marks a draft dirty.
 */
export function scratchpadSemanticFingerprint(scene: ScratchpadScene): string {
  const elements = scene.elements
    .map(visibleElement)
    .filter((element): element is Exclude<typeof element, null> => element !== null)
  const referencedFileIds = new Set(
    elements.flatMap(element => (
      isRecord(element) && element.type === 'image' && typeof element.fileId === 'string'
        ? [element.fileId]
        : []
    )),
  )
  const files = Object.fromEntries(
    Object.entries(scene.files)
      .filter(([fileId]) => referencedFileIds.has(fileId))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([fileId, file]) => [fileId, canonical(file)]),
  )
  return compactFingerprint(JSON.stringify({ background: scene.background, elements, files }))
}

export function isScratchpadFingerprint(value: unknown): value is string {
  return typeof value === 'string' && FINGERPRINT_PATTERN.test(value)
}

export function initialScratchpadRevision(scene: ScratchpadScene): ScratchpadRevisionMetadata {
  return {
    editRevision: 0,
    savedRevision: 0,
    currentFingerprint: scratchpadSemanticFingerprint(scene),
    attachment: null,
    recovery: { state: 'none' },
  }
}

export function reviseScratchpad(
  metadata: ScratchpadRevisionMetadata,
  scene: ScratchpadScene,
): ScratchpadRevisionMetadata {
  const currentFingerprint = scratchpadSemanticFingerprint(scene)
  if (currentFingerprint === metadata.currentFingerprint) return metadata
  return {
    ...metadata,
    editRevision: metadata.editRevision + 1,
    currentFingerprint,
  }
}

export function scratchpadAttachmentState(input: {
  artifact: StudentWorkArtifactView | null
  metadata: ScratchpadRevisionMetadata
}): StudentAttachmentState {
  const { artifact, metadata } = input
  if (!artifact) return 'not_attached'
  if (artifact.sourceType !== 'scratchpad') return 'attached_unverified'
  const attached = metadata.attachment
  if (
    !attached
    || attached.artifactId !== artifact.id
    || attached.artifactUpdatedAt !== artifact.updatedAt
  ) return 'attached_unverified'
  return attached.fingerprint === metadata.currentFingerprint
    ? 'attached_current'
    : 'attached_stale'
}

export function markScratchpadAttached(
  metadata: ScratchpadRevisionMetadata,
  artifact: StudentWorkArtifactView,
  attachedRevision = metadata.editRevision,
  fingerprint = metadata.currentFingerprint,
): ScratchpadRevisionMetadata {
  return {
    ...metadata,
    attachment: {
      artifactId: artifact.id,
      artifactUpdatedAt: artifact.updatedAt,
      revision: attachedRevision,
      fingerprint,
    },
  }
}

export function scratchpadHasMeaningfulDraft(scene: ScratchpadScene): boolean {
  return scene.background !== 'lined'
    || scene.elements.some(element => isRecord(element) && element.isDeleted !== true)
}
