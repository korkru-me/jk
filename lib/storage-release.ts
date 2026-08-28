import type { createClient } from '@/lib/supabase/server'
import { extractStoragePaths } from '@/lib/storage-orphans'

/**
 * Removes the files a just-deleted โจทย์ was the last owner of.
 *
 * Called after the row is gone, so the โจทย์ itself no longer counts as a
 * reference. A file another row still points at — the usual case being a
 * duplicate, which copies `image_urls` verbatim — is left alone.
 *
 * Never throws and never reports: the โจทย์ is already deleted by the time this
 * runs, and failing to tidy up is not something to fail a deletion over. What
 * it misses, the sweep in ตั้งค่า finds later.
 */
export async function releaseQuestionFiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  rows: unknown[],
): Promise<void> {
  try {
    const prefix = `${userId}/`
    const candidates = new Set<string>()
    for (const row of rows) {
      for (const path of extractStoragePaths(JSON.stringify(row) ?? '', 'question-images')) {
        if (path.startsWith(prefix)) candidates.add(path)
      }
    }
    if (candidates.size === 0) return

    const paths = [...candidates]
    const { data, error } = await supabase.rpc('storage_paths_still_referenced', { paths })
    if (error) return // cannot prove they are unused — leave them for the sweep

    const used = new Set((data ?? []) as string[])
    const removable = paths.filter(p => !used.has(p))
    if (removable.length > 0) await supabase.storage.from('question-images').remove(removable)
  } catch {
    // Tidying is best-effort by design; the โจทย์ is already gone.
  }
}
