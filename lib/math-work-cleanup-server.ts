import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { MATH_WORK_BUCKET } from '@/lib/math-work'
import { planMathWorkCleanup } from '@/lib/math-work-cleanup'
import type { StoredFile } from '@/lib/storage-orphans'

const LIST_PAGE_SIZE = 1_000
const REFERENCE_BATCH_SIZE = 100
const DELETE_BATCH_SIZE = 100
const MAX_OBJECTS_PER_RUN = 100_000
const MAX_FOLDERS_PER_RUN = 100_000
const MAX_FOLDER_DEPTH = 7

type AdminClient = ReturnType<typeof createAdminClient>
type CleanupFailureCode =
  | 'storage_scan_failed'
  | 'scan_limit_exceeded'
  | 'reference_scan_failed'
  | 'storage_delete_failed'

export class MathWorkCleanupFailure extends Error {
  constructor(readonly code: CleanupFailureCode) {
    super(code)
    this.name = 'MathWorkCleanupFailure'
  }
}

export interface MathWorkCleanupResult {
  dryRun: boolean
  scannedObjects: number
  eligibleAfterGrace: number
  keptReferenced: number
  keptRecent: number
  keptUnmanaged: number
  skippedAfterRecheck: number
  deleted: number
  deletedBytes: number
}

function safeSize(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

async function listManagedObjects(admin: AdminClient): Promise<StoredFile[]> {
  const bucket = admin.storage.from(MATH_WORK_BUCKET)
  const queue = ['students', 'teachers']
  const seenFolders = new Set<string>()
  const objects = new Map<string, StoredFile>()

  while (queue.length > 0) {
    const folder = queue.shift()!
    if (seenFolders.has(folder)) continue
    seenFolders.add(folder)
    if (seenFolders.size > MAX_FOLDERS_PER_RUN) throw new MathWorkCleanupFailure('scan_limit_exceeded')

    for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
      const { data, error } = await bucket.list(folder, {
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw new MathWorkCleanupFailure('storage_scan_failed')
      if (!data || data.length === 0) break

      for (const entry of data) {
        const path = `${folder}/${entry.name}`
        if (entry.id === null) {
          if (path.split('/').length > MAX_FOLDER_DEPTH) throw new MathWorkCleanupFailure('scan_limit_exceeded')
          queue.push(path)
          continue
        }
        objects.set(path, {
          path,
          size: safeSize(entry.metadata?.size),
          createdAt: entry.created_at ?? entry.updated_at ?? null,
        })
        if (objects.size > MAX_OBJECTS_PER_RUN) throw new MathWorkCleanupFailure('scan_limit_exceeded')
      }

      if (data.length < LIST_PAGE_SIZE) break
    }
  }

  return [...objects.values()]
}

async function readReferencedCandidates(admin: AdminClient, paths: string[]): Promise<Set<string>> {
  const referenced = new Set<string>()
  const uniquePaths = [...new Set(paths)]
  const targets = [
    ['student_work_artifacts', 'preview_path'],
    ['student_work_artifacts', 'scene_path'],
    ['teaching_boards', 'preview_path'],
    ['teaching_boards', 'scene_path'],
  ] as const

  try {
    for (let offset = 0; offset < uniquePaths.length; offset += REFERENCE_BATCH_SIZE) {
      const batch = uniquePaths.slice(offset, offset + REFERENCE_BATCH_SIZE)
      for (const [table, column] of targets) {
        const { data, error } = await admin.from(table).select(column).in(column, batch)
        if (error) throw error
        for (const row of data ?? []) {
          const value = (row as Record<string, unknown>)[column]
          if (typeof value === 'string') referenced.add(value)
        }
      }
    }
  } catch {
    throw new MathWorkCleanupFailure('reference_scan_failed')
  }

  return referenced
}

export async function runMathWorkOrphanCleanup({
  dryRun = false,
  now = Date.now(),
}: {
  dryRun?: boolean
  now?: number
} = {}): Promise<MathWorkCleanupResult> {
  const admin = createAdminClient()
  const files = await listManagedObjects(admin)
  const agePlan = planMathWorkCleanup(files, new Set(), now)
  const agedPaths = agePlan.deletable.map(file => file.path)
  const initialReferences = await readReferencedCandidates(admin, agedPaths)
  const initialPlan = planMathWorkCleanup(files, initialReferences, now)

  const result: MathWorkCleanupResult = {
    dryRun,
    scannedObjects: files.length,
    eligibleAfterGrace: initialPlan.deletable.length,
    keptReferenced: initialPlan.keptReferenced,
    keptRecent: initialPlan.keptRecent,
    keptUnmanaged: initialPlan.keptUnmanaged,
    skippedAfterRecheck: 0,
    deleted: 0,
    deletedBytes: 0,
  }
  if (dryRun || initialPlan.deletable.length === 0) return result

  // Complete a second reference scan for the whole candidate set before the
  // first delete. A stale report must never remove an object that gained a
  // database reference during listing, and a partial recheck deletes nothing.
  const referencesNow = await readReferencedCandidates(admin, initialPlan.deletable.map(file => file.path))
  const finalCandidates = initialPlan.deletable.filter(file => !referencesNow.has(file.path))
  result.skippedAfterRecheck = initialPlan.deletable.length - finalCandidates.length
  for (let offset = 0; offset < finalCandidates.length; offset += DELETE_BATCH_SIZE) {
    const safeBatch = finalCandidates.slice(offset, offset + DELETE_BATCH_SIZE)

    const { error } = await admin.storage.from(MATH_WORK_BUCKET).remove(safeBatch.map(file => file.path))
    if (error) throw new MathWorkCleanupFailure('storage_delete_failed')
    result.deleted += safeBatch.length
    result.deletedBytes += safeBatch.reduce((sum, file) => sum + file.size, 0)
  }

  return result
}
