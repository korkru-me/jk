'use client'

import {
  emptyScratchpadScene,
  scratchpadStorageKey,
  scratchpadSubmissionKey,
  SCRATCHPAD_TTL_MS,
  type ScratchpadScene,
  type ScratchpadScope,
} from '@/lib/scratchpad'
import { validateDrawingScene, type DrawingSceneIssueCode } from '@/lib/drawing-board-policy'
import type { StudentWorkArtifactView } from '@/lib/math-work'
import {
  initialScratchpadRevision,
  isScratchpadFingerprint,
  scratchpadAttachmentState,
  scratchpadSemanticFingerprint,
  type ScratchpadRecovery,
  type ScratchpadRevisionMetadata,
  type StudentAttachmentState,
} from '@/lib/scratchpad-state'

const DB_NAME = 'korkru-math-work'
const DB_VERSION = 1
const STORE_NAME = 'scratchpads'

interface ScratchpadRecord extends ScratchpadScope {
  key: string
  submissionKey: string
  updatedAt: number
  scene: unknown
  revision?: unknown
}

export type ScratchpadDraftReadResult =
  | { status: 'missing' }
  | { status: 'ready'; scene: ScratchpadScene; revision: ScratchpadRevisionMetadata }
  | { status: 'invalid'; issue: DrawingSceneIssueCode }
  | { status: 'unsupported'; issue: DrawingSceneIssueCode }

export type ScratchpadSceneReadResult =
  | { status: 'missing' }
  | { status: 'ready'; scene: ScratchpadScene }
  | { status: 'invalid'; issue: DrawingSceneIssueCode }
  | { status: 'unsupported'; issue: DrawingSceneIssueCode }

export function classifyStoredScratchpadScene(
  value: unknown,
): Exclude<ScratchpadSceneReadResult, { status: 'missing' }> {
  const validated = validateDrawingScene(value, { role: 'student' })
  if (!validated.ok) return { status: validated.kind, issue: validated.code }
  return { status: 'ready', scene: validated.scene }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function safeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function validAttachment(value: unknown) {
  if (!isRecord(value)) return null
  if (
    typeof value.artifactId !== 'string'
    || value.artifactId.length === 0
    || value.artifactId.length > 200
    || typeof value.artifactUpdatedAt !== 'string'
    || value.artifactUpdatedAt.length === 0
    || value.artifactUpdatedAt.length > 100
    || !safeInteger(value.revision)
    || !isScratchpadFingerprint(value.fingerprint)
  ) return null
  return {
    artifactId: value.artifactId,
    artifactUpdatedAt: value.artifactUpdatedAt,
    revision: value.revision,
    fingerprint: value.fingerprint,
  }
}

function validRecovery(value: unknown): ScratchpadRecovery {
  if (!isRecord(value) || typeof value.state !== 'string') return { state: 'none' }
  if (value.state === 'none') return { state: 'none' }
  if (value.state === 'restored' && safeInteger(value.restoredAt)) {
    return { state: 'restored', restoredAt: value.restoredAt }
  }
  if (
    value.state !== 'available_once'
    || !safeInteger(value.createdAt)
    || !isScratchpadFingerprint(value.fingerprint)
  ) return { state: 'none' }
  const validated = validateDrawingScene(value.scene, { role: 'student' })
  if (!validated.ok) return { state: 'none' }
  if (scratchpadSemanticFingerprint(validated.scene) !== value.fingerprint) return { state: 'none' }
  return {
    state: 'available_once',
    scene: validated.scene,
    fingerprint: value.fingerprint,
    createdAt: value.createdAt,
  }
}

/** Old records contain only `scene`; they remain readable but unverified. */
export function classifyScratchpadRevision(
  value: unknown,
  scene: ScratchpadScene,
): ScratchpadRevisionMetadata {
  const fallback = initialScratchpadRevision(scene)
  if (!isRecord(value)) return fallback
  if (
    !safeInteger(value.editRevision)
    || !safeInteger(value.savedRevision)
    || value.savedRevision > value.editRevision
    || !isScratchpadFingerprint(value.currentFingerprint)
  ) return fallback

  const currentFingerprint = scratchpadSemanticFingerprint(scene)
  const metadataMatchesScene = currentFingerprint === value.currentFingerprint
  const candidateAttachment = validAttachment(value.attachment)
  const attachment = candidateAttachment && candidateAttachment.revision <= value.editRevision
    ? candidateAttachment
    : null
  return {
    editRevision: value.editRevision,
    savedRevision: value.savedRevision,
    currentFingerprint,
    // A partial/corrupt record must never claim that an artifact is current.
    attachment: metadataMatchesScene ? attachment : null,
    recovery: validRecovery(value.recovery),
  }
}

function openScratchpadDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (database.objectStoreNames.contains(STORE_NAME)) return
      const store = database.createObjectStore(STORE_NAME, { keyPath: 'key' })
      store.createIndex('submissionKey', 'submissionKey', { unique: false })
      store.createIndex('updatedAt', 'updatedAt', { unique: false })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked'))
  })
}

export async function readScratchpadDraft(scope: ScratchpadScope): Promise<ScratchpadDraftReadResult> {
  const database = await openScratchpadDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const record = await requestResult(
      transaction.objectStore(STORE_NAME).get(scratchpadStorageKey(scope)),
    ) as ScratchpadRecord | undefined
    if (!record) return { status: 'missing' }
    const classified = classifyStoredScratchpadScene(record.scene)
    if (classified.status !== 'ready') return classified
    return {
      status: 'ready',
      scene: classified.scene,
      revision: classifyScratchpadRevision(record.revision, classified.scene),
    }
  } finally {
    database.close()
  }
}

export async function readScratchpadScene(scope: ScratchpadScope): Promise<ScratchpadSceneReadResult> {
  const result = await readScratchpadDraft(scope)
  if (result.status !== 'ready') return result
  return { status: 'ready', scene: result.scene }
}

/** @deprecated Use readScratchpadScene() so invalid raw data cannot look blank. */
export async function loadScratchpadScene(scope: ScratchpadScope): Promise<ScratchpadScene> {
  const result = await readScratchpadScene(scope)
  return result.status === 'ready' ? result.scene : emptyScratchpadScene()
}

export async function saveScratchpadDraft(
  scope: ScratchpadScope,
  scene: ScratchpadScene,
  revision: ScratchpadRevisionMetadata,
): Promise<void> {
  const validated = validateDrawingScene(scene, { role: 'student' })
  if (!validated.ok) throw new Error('Scratchpad scene exceeds local limits')
  if (
    !safeInteger(revision.editRevision)
    || !safeInteger(revision.savedRevision)
    || revision.savedRevision > revision.editRevision
    || revision.currentFingerprint !== scratchpadSemanticFingerprint(validated.scene)
  ) throw new Error('Scratchpad revision is invalid')
  const attachment = revision.attachment ? validAttachment(revision.attachment) : null
  if (revision.attachment && (!attachment || attachment.revision > revision.editRevision)) {
    throw new Error('Scratchpad attachment revision is invalid')
  }
  const recovery = validRecovery(revision.recovery)
  if (recovery.state !== revision.recovery.state) {
    throw new Error('Scratchpad recovery is invalid')
  }
  const database = await openScratchpadDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const record: ScratchpadRecord = {
      ...scope,
      key: scratchpadStorageKey(scope),
      submissionKey: scratchpadSubmissionKey(scope.ownerId, scope.submissionId),
      updatedAt: Date.now(),
      scene: validated.scene,
      revision: { ...revision, recovery },
    }
    transaction.objectStore(STORE_NAME).put(record)
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function saveScratchpadScene(scope: ScratchpadScope, scene: ScratchpadScene): Promise<void> {
  const revision = initialScratchpadRevision(scene)
  await saveScratchpadDraft(scope, scene, revision)
}

export async function readScratchpadAttachmentState(
  scope: ScratchpadScope,
  artifact: StudentWorkArtifactView | null,
): Promise<StudentAttachmentState> {
  if (!artifact) return 'not_attached'
  const draft = await readScratchpadDraft(scope)
  if (draft.status !== 'ready') return 'attached_unverified'
  return scratchpadAttachmentState({ artifact, metadata: draft.revision })
}

export async function deleteScratchpadScene(scope: ScratchpadScope): Promise<void> {
  const database = await openScratchpadDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(scratchpadStorageKey(scope))
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function deleteScratchpadsForSubmission(ownerId: string, submissionId: string): Promise<void> {
  const database = await openScratchpadDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const index = transaction.objectStore(STORE_NAME).index('submissionKey')
    const request = index.openKeyCursor(IDBKeyRange.only(scratchpadSubmissionKey(ownerId, submissionId)))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      transaction.objectStore(STORE_NAME).delete(cursor.primaryKey)
      cursor.continue()
    }
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function purgeExpiredScratchpads(now = Date.now()): Promise<void> {
  const database = await openScratchpadDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const index = transaction.objectStore(STORE_NAME).index('updatedAt')
    const request = index.openKeyCursor(IDBKeyRange.upperBound(now - SCRATCHPAD_TTL_MS))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      transaction.objectStore(STORE_NAME).delete(cursor.primaryKey)
      cursor.continue()
    }
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}
