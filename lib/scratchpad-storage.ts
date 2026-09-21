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

const DB_NAME = 'korkru-math-work'
const DB_VERSION = 1
const STORE_NAME = 'scratchpads'

interface ScratchpadRecord extends ScratchpadScope {
  key: string
  submissionKey: string
  updatedAt: number
  scene: unknown
}

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

export async function readScratchpadScene(scope: ScratchpadScope): Promise<ScratchpadSceneReadResult> {
  const database = await openScratchpadDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const record = await requestResult(
      transaction.objectStore(STORE_NAME).get(scratchpadStorageKey(scope)),
    ) as ScratchpadRecord | undefined
    if (!record) return { status: 'missing' }
    return classifyStoredScratchpadScene(record.scene)
  } finally {
    database.close()
  }
}

/** @deprecated Use readScratchpadScene() so invalid raw data cannot look blank. */
export async function loadScratchpadScene(scope: ScratchpadScope): Promise<ScratchpadScene> {
  const result = await readScratchpadScene(scope)
  return result.status === 'ready' ? result.scene : emptyScratchpadScene()
}

export async function saveScratchpadScene(scope: ScratchpadScope, scene: ScratchpadScene): Promise<void> {
  const validated = validateDrawingScene(scene, { role: 'student' })
  if (!validated.ok) {
    throw new Error('Scratchpad scene exceeds local limits')
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
    }
    transaction.objectStore(STORE_NAME).put(record)
    await transactionDone(transaction)
  } finally {
    database.close()
  }
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
