import { describe, it, expect } from 'vitest'
import {
  ORPHAN_GRACE_MS,
  extractStoragePaths,
  formatBytes,
  isOlderThan,
  partitionOrphans,
  totalBytes,
  type StoredFile,
} from './storage-orphans'

const BUCKET = 'question-images'
const UID = '4c1e0f8a-6264-4cdd-a150-b95e6ef8b01b'
const url = (name: string) =>
  `https://x.supabase.co/storage/v1/object/public/${BUCKET}/${UID}/${name}`

function file(path: string, ageDays: number, size = 1024): StoredFile {
  return {
    path,
    size,
    createdAt: new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000).toISOString(),
  }
}

describe('extractStoragePaths', () => {
  it('finds a path in a plain URL column', () => {
    const found = extractStoragePaths(JSON.stringify({ image_urls: [url('a.webp')] }), BUCKET)
    expect(found.has(`${UID}/a.webp`)).toBe(true)
  })

  it('finds paths nested anywhere in jsonb, which is why rows are scanned whole', () => {
    const row = JSON.stringify({
      mcq_options: [{ text: 'ก', image_url: url('opt.png') }],
      extra_data: { attachment_urls: [url('sheet.pdf')] },
      solution_image_urls: [url('sol.jpg')],
    })
    const found = extractStoragePaths(row, BUCKET)
    expect(found.has(`${UID}/opt.png`)).toBe(true)
    expect(found.has(`${UID}/sheet.pdf`)).toBe(true)
    expect(found.has(`${UID}/sol.jpg`)).toBe(true)
  })

  it('finds a path inside an HTML src attribute', () => {
    const found = extractStoragePaths(`<p>ดูรูป <img src="${url('inline.png')}"> ครับ</p>`, BUCKET)
    expect(found.has(`${UID}/inline.png`)).toBe(true)
  })

  it('reaches into a nested folder such as the Moodle import', () => {
    const found = extractStoragePaths(url('moodle-import/abc123.jpg'), BUCKET)
    expect(found.has(`${UID}/moodle-import/abc123.jpg`)).toBe(true)
  })

  it('stops at the quote that ends the string, not at the end of the row', () => {
    const row = `{"a":"${url('one.webp')}","b":"${url('two.webp')}"}`
    const found = extractStoragePaths(row, BUCKET)
    expect(found.has(`${UID}/one.webp`)).toBe(true)
    expect(found.has(`${UID}/two.webp`)).toBe(true)
  })

  it('drops a cache-busting query so the path still matches the stored object', () => {
    const found = extractStoragePaths(`${url('a.webp')}?v=2`, BUCKET)
    expect(found.has(`${UID}/a.webp`)).toBe(true)
  })

  it('keeps both the raw and decoded spellings, because either may be the real key', () => {
    const found = extractStoragePaths(url('%E0%B8%87%E0%B8%B2%E0%B8%99.png'), BUCKET)
    expect(found.has(`${UID}/%E0%B8%87%E0%B8%B2%E0%B8%99.png`)).toBe(true)
    expect(found.has(`${UID}/งาน.png`)).toBe(true)
  })

  it('survives a malformed percent escape instead of throwing', () => {
    expect(() => extractStoragePaths(url('100%bad.png'), BUCKET)).not.toThrow()
  })

  it('ignores paths belonging to a different bucket', () => {
    const other = `https://x.supabase.co/storage/v1/object/public/work-images/${UID}/w.jpg`
    expect(extractStoragePaths(other, BUCKET).size).toBe(0)
  })

  it('returns nothing for empty input', () => {
    expect(extractStoragePaths('', BUCKET).size).toBe(0)
  })
})

describe('isOlderThan', () => {
  const now = Date.parse('2026-08-28T00:00:00Z')

  it('is true once the grace period has fully passed', () => {
    expect(isOlderThan('2026-08-20T00:00:00Z', now, ORPHAN_GRACE_MS)).toBe(true)
  })

  it('is false inside the grace period', () => {
    expect(isOlderThan('2026-08-27T00:00:00Z', now, ORPHAN_GRACE_MS)).toBe(false)
  })

  it('keeps a file whose age cannot be read rather than sweeping it', () => {
    expect(isOlderThan(null, now, ORPHAN_GRACE_MS)).toBe(false)
    expect(isOlderThan('not a date', now, ORPHAN_GRACE_MS)).toBe(false)
  })

  it('keeps a file dated in the future, which is a clock problem, not permission', () => {
    expect(isOlderThan('2027-01-01T00:00:00Z', now, ORPHAN_GRACE_MS)).toBe(false)
  })
})

describe('partitionOrphans', () => {
  const now = Date.now()

  it('sweeps only what is both unreferenced and past the grace period', () => {
    const files = [
      file(`${UID}/used.webp`, 30),
      file(`${UID}/orphan.webp`, 30),
      file(`${UID}/fresh.webp`, 1),
    ]
    const referenced = new Set([`${UID}/used.webp`])
    const result = partitionOrphans(files, referenced, { now })

    expect(result.orphans.map(f => f.path)).toEqual([`${UID}/orphan.webp`])
    expect(result.keptInUse).toBe(1)
    expect(result.keptRecent).toBe(1)
  })

  it('protects a file uploaded minutes ago by a form that has not saved yet', () => {
    const result = partitionOrphans([file(`${UID}/just-picked.webp`, 0)], new Set(), { now })
    expect(result.orphans).toHaveLength(0)
    expect(result.keptRecent).toBe(1)
  })

  it('never sweeps a referenced file however old it is', () => {
    const ancient = file(`${UID}/from-2019.png`, 2500)
    const result = partitionOrphans([ancient], new Set([ancient.path]), { now })
    expect(result.orphans).toHaveLength(0)
  })

  it('sweeps nothing at all when the reference set covers everything', () => {
    const files = [file(`${UID}/a.webp`, 90), file(`${UID}/b.webp`, 90)]
    const result = partitionOrphans(files, new Set(files.map(f => f.path)), { now })
    expect(result.orphans).toHaveLength(0)
    expect(result.keptInUse).toBe(2)
  })
})

describe('reporting helpers', () => {
  it('adds up sizes, tolerating a missing one', () => {
    expect(totalBytes([
      { path: 'a', size: 1000, createdAt: null },
      { path: 'b', size: 0, createdAt: null },
    ])).toBe(1000)
  })

  it('formats at the scale a teacher reads', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1_198_000)).toBe('1.14 MB')
  })
})
