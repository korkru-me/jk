'use server'

import { createClient } from '@/lib/supabase/server'
import {
  ORPHAN_GRACE_MS,
  partitionOrphans,
  totalBytes,
  type CleanableBucket,
  type StoredFile,
} from '@/lib/storage-orphans'

/**
 * Sweeping files nothing points at any more, out of a teacher's own folder.
 *
 * Two steps on purpose. `findOrphanFiles` only looks, and `deleteOrphanFiles`
 * only removes what it is handed — and re-checks every path against the
 * database before removing it, because the report a teacher is looking at may
 * be minutes old and a โจทย์ may have been saved in between.
 *
 * Everything is scoped to `{uid}/`. Storage's own policies enforce that for
 * `work-images` and `submission-files`; `question-images` has no such policy,
 * so the prefix is applied here and re-applied by the RPC, which refuses paths
 * outside the caller's folder outright.
 */

/** The three buckets, with what a teacher would call them. */
const BUCKET_LABELS: Record<CleanableBucket, string> = {
  'question-images': 'รูปและไฟล์ของโจทย์',
  'work-images': 'รูปวิธีทำของนักเรียน',
  'submission-files': 'ไฟล์คำตอบของนักเรียน',
}

export interface OrphanReport {
  bucket: CleanableBucket
  label: string
  orphans: { path: string; size: number; createdAt: string | null }[]
  orphanBytes: number
  keptInUse: number
  keptRecent: number
}

export type FindOrphansResult = { error: string } | { reports: OrphanReport[]; graceDays: number }

/** Storage lists one page at a time; a folder can hold more than one page. */
async function listFolder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucket: string,
  folder: string,
): Promise<StoredFile[]> {
  const out: StoredFile[] = []
  const pageSize = 100
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder, { limit: pageSize, offset })
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break

    for (const entry of data) {
      const path = folder ? `${folder}/${entry.name}` : entry.name
      // A row with no id is a folder, not an object — walk into it. The Moodle
      // import puts its images one level down.
      if (entry.id === null) {
        out.push(...await listFolder(supabase, bucket, path))
      } else {
        out.push({
          path,
          size: entry.metadata?.size ?? 0,
          createdAt: entry.created_at ?? entry.updated_at ?? null,
        })
      }
    }
    if (data.length < pageSize) break
  }
  return out
}

/**
 * Which of `paths` the database still mentions.
 *
 * Throws rather than returning a partial answer: a half-built reference set
 * reads as "unreferenced" for everything missing from it, which is the one
 * mistake this whole module is arranged to avoid.
 */
async function stillReferenced(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paths: string[],
): Promise<Set<string>> {
  const referenced = new Set<string>()
  const batchSize = 200
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize)
    const { data, error } = await supabase.rpc('storage_paths_still_referenced', { paths: batch })
    if (error) throw new Error(error.message)
    for (const path of (data ?? []) as string[]) referenced.add(path)
  }
  return referenced
}

export async function findOrphanFiles(): Promise<FindOrphansResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const buckets = Object.keys(BUCKET_LABELS) as CleanableBucket[]
  const reports: OrphanReport[] = []

  try {
    for (const bucket of buckets) {
      const files = await listFolder(supabase, bucket, user.id)
      if (files.length === 0) {
        reports.push({
          bucket, label: BUCKET_LABELS[bucket],
          orphans: [], orphanBytes: 0, keptInUse: 0, keptRecent: 0,
        })
        continue
      }

      const referenced = await stillReferenced(supabase, files.map(f => f.path))
      const split = partitionOrphans(files, referenced, { now: Date.now() })
      reports.push({
        bucket,
        label: BUCKET_LABELS[bucket],
        orphans: split.orphans,
        orphanBytes: totalBytes(split.orphans),
        keptInUse: split.keptInUse,
        keptRecent: split.keptRecent,
      })
    }
  } catch (e) {
    // Reading failed somewhere, so the picture is incomplete — say so instead
    // of showing a list that would delete live files if acted on.
    return { error: `ตรวจสอบไฟล์ไม่สำเร็จ จึงยังไม่แสดงรายการ: ${(e as Error).message}` }
  }

  return { reports, graceDays: Math.round(ORPHAN_GRACE_MS / 86_400_000) }
}

export type DeleteOrphansResult =
  | { error: string }
  | { deleted: number; skipped: number; freedBytes: number }

export async function deleteOrphanFiles(
  bucket: CleanableBucket,
  paths: string[],
): Promise<DeleteOrphansResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!(bucket in BUCKET_LABELS)) return { error: 'ไม่รู้จักที่เก็บไฟล์นี้' }

  const prefix = `${user.id}/`
  const own = [...new Set(paths)].filter(p => p.startsWith(prefix))
  if (own.length === 0) return { error: 'ไม่มีไฟล์ให้ลบ' }

  let freedBytes = 0
  let stillUsed: Set<string>
  let onDisk: StoredFile[]
  try {
    // Re-checked at the moment of deletion, not trusted from the report: the
    // teacher may have saved a โจทย์ using one of these files since they
    // pressed ตรวจสอบ.
    onDisk = await listFolder(supabase, bucket, user.id)
    stillUsed = await stillReferenced(supabase, own)
  } catch (e) {
    return { error: `ตรวจสอบก่อนลบไม่สำเร็จ จึงไม่ได้ลบอะไรเลย: ${(e as Error).message}` }
  }

  const sizes = new Map(onDisk.map(f => [f.path, f.size]))
  const { orphans } = partitionOrphans(
    own.map(path => ({
      path,
      size: sizes.get(path) ?? 0,
      createdAt: onDisk.find(f => f.path === path)?.createdAt ?? null,
    })),
    stillUsed,
    { now: Date.now() },
  )

  const skipped = own.length - orphans.length
  if (orphans.length === 0) return { deleted: 0, skipped, freedBytes: 0 }

  const { error } = await supabase.storage.from(bucket).remove(orphans.map(f => f.path))
  if (error) return { error: `ลบไฟล์ไม่สำเร็จ: ${error.message}` }

  freedBytes = totalBytes(orphans)
  return { deleted: orphans.length, skipped, freedBytes }
}
