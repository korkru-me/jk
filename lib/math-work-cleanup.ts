import { isOlderThan, ORPHAN_GRACE_MS, totalBytes, type StoredFile } from '@/lib/storage-orphans'

export const MATH_WORK_ORPHAN_GRACE_MS = ORPHAN_GRACE_MS

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const PREVIEW = 'preview\\.(?:webp|png)'
const STUDENT_OBJECT = new RegExp(`^students/${UUID}/${UUID}/${UUID}/${UUID}/(?:${PREVIEW}|scene\\.json)$`, 'i')
const TEACHER_OBJECT = new RegExp(`^teachers/${UUID}/${UUID}/${UUID}/[1-5]/${UUID}/(?:${PREVIEW}|scene\\.json)$`, 'i')

/** Only paths produced by the signed-upload builders are eligible for deletion. */
export function isManagedMathWorkPath(path: string): boolean {
  return STUDENT_OBJECT.test(path) || TEACHER_OBJECT.test(path)
}

export interface MathWorkCleanupPlan {
  deletable: StoredFile[]
  keptReferenced: number
  keptRecent: number
  keptUnmanaged: number
  deletableBytes: number
}

/**
 * Plans a fail-closed sweep. Unknown namespaces, malformed paths and objects
 * without a trustworthy timestamp are retained even when unreferenced.
 */
export function planMathWorkCleanup(
  files: StoredFile[],
  referenced: ReadonlySet<string>,
  now: number,
): MathWorkCleanupPlan {
  const deletable: StoredFile[] = []
  let keptReferenced = 0
  let keptRecent = 0
  let keptUnmanaged = 0

  for (const file of files) {
    if (!isManagedMathWorkPath(file.path)) {
      keptUnmanaged++
      continue
    }
    if (referenced.has(file.path)) {
      keptReferenced++
      continue
    }
    if (!isOlderThan(file.createdAt, now, MATH_WORK_ORPHAN_GRACE_MS)) {
      keptRecent++
      continue
    }
    deletable.push(file)
  }

  return {
    deletable,
    keptReferenced,
    keptRecent,
    keptUnmanaged,
    deletableBytes: totalBytes(deletable),
  }
}
