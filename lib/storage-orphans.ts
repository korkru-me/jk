/**
 * Finding files in Storage that nothing points at any more.
 *
 * Uploads happen the moment a file is picked, but a URL only becomes real when
 * the form around it is saved. Everything in between leaks: a teacher who
 * attaches a diagram and then closes the tab has already written the file, and
 * nothing will ever reference it. Deleting a โจทย์ leaks the same way from the
 * other end — the row goes, the pictures stay, forever.
 *
 * Both are one question: is this path mentioned anywhere in the database? The
 * answer has to be built defensively, because the cost of the two possible
 * mistakes is wildly different. Keeping a file nobody wants costs a few
 * kilobytes. Deleting one that is still in use puts a hole in a โจทย์ a teacher
 * may not look at again until it is in front of a class. So every rule here
 * leans the same way:
 *
 *   - references are found by scanning whole rows as text, not by listing the
 *     columns images live in. They currently live in `image_urls`,
 *     `solution_image_urls`, `mcq_options[].image_url` and
 *     `extra_data.attachment_urls`, and a column added later would be missed by
 *     any list written today.
 *   - the extractor is greedy on purpose. Matching too much only ever protects
 *     a file; matching too little deletes a live one.
 *   - a file whose age cannot be established is kept, not swept.
 *   - anything uploaded recently is left alone whatever the database says,
 *     because a form open in another tab has not saved its URLs yet.
 */

/** Buckets this understands. Each is public-read with files under `{uid}/`. */
export type CleanableBucket = 'question-images' | 'work-images' | 'submission-files'

/**
 * How long a file is untouchable after upload.
 *
 * A form left open overnight, or over a weekend, must still be able to save
 * the URLs it is holding. Seven days is far longer than any editing session and
 * costs nothing — the files it protects are the few most recent ones.
 */
export const ORPHAN_GRACE_MS = 7 * 24 * 60 * 60 * 1000

export interface StoredFile {
  /** Path within the bucket, e.g. `{uid}/1787899474149_qinmz.webp`. */
  path: string
  size: number
  /** ISO timestamp from Storage. Null when it could not be read. */
  createdAt: string | null
}

export interface OrphanSplit {
  orphans: StoredFile[]
  /** Kept because the database still mentions them. */
  keptInUse: number
  /** Kept because they are inside the grace period, or undatable. */
  keptRecent: number
}

/**
 * Every path under `bucket` mentioned anywhere in `text`.
 *
 * `text` is expected to be a whole row serialised — JSON, HTML and plain
 * columns all at once — so the match stops at any character that could end a
 * string in those: quotes, whitespace, escapes, and closing brackets.
 *
 * Both the raw and percent-decoded forms are collected. Generated names are
 * ASCII, but an imported one need not be, and holding both spellings can only
 * spare a file.
 */
export function extractStoragePaths(text: string, bucket: string): Set<string> {
  const found = new Set<string>()
  if (!text) return found

  const escaped = bucket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`${escaped}/([^"'\\s\\\\)\\]}<>]+)`, 'g')

  for (const match of text.matchAll(pattern)) {
    // A URL may carry a cache-busting query; the object never does.
    const raw = match[1].split('?')[0].split('#')[0]
    if (!raw) continue
    found.add(raw)
    try {
      const decoded = decodeURIComponent(raw)
      if (decoded !== raw) found.add(decoded)
    } catch {
      // Malformed escape — the raw form is already recorded.
    }
  }
  return found
}

/**
 * Splits stored files into what can go and what must stay.
 *
 * `referenced` is the set of paths the database still mentions; anything that
 * could not be scanned must never reach this function, because an incomplete
 * set reads as "unreferenced" for every file it is missing.
 */
export function partitionOrphans(
  files: StoredFile[],
  referenced: Set<string>,
  { now, graceMs = ORPHAN_GRACE_MS }: { now: number; graceMs?: number },
): OrphanSplit {
  const orphans: StoredFile[] = []
  let keptInUse = 0
  let keptRecent = 0

  for (const file of files) {
    if (referenced.has(file.path)) {
      keptInUse++
      continue
    }
    if (!isOlderThan(file.createdAt, now, graceMs)) {
      keptRecent++
      continue
    }
    orphans.push(file)
  }

  return { orphans, keptInUse, keptRecent }
}

/** Whether a file is old enough to sweep. An unreadable or future-dated
 *  timestamp answers "no": age we cannot establish is age we do not act on. */
export function isOlderThan(createdAt: string | null, now: number, graceMs: number): boolean {
  if (!createdAt) return false
  const uploaded = Date.parse(createdAt)
  if (Number.isNaN(uploaded)) return false
  return now - uploaded >= graceMs
}

/** Bytes across a set of files, for the report the sweep prints. */
export function totalBytes(files: StoredFile[]): number {
  return files.reduce((sum, file) => sum + (file.size || 0), 0)
}

/** "1.14 MB" — sizes here are small enough that MB is the only useful unit. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
