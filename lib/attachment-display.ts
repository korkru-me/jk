/**
 * How an announcement attachment is described to a human.
 *
 * A stored attachment is a URL, a name, a MIME type and a size. What a teacher
 * or student needs to see is "ใบงานที่ 3.pdf · PDF · 1.2 MB" — and whether it
 * is a picture, which is the one type that belongs inline in the announcement
 * rather than behind a file chip.
 */

export interface PostAttachment {
  url: string
  /** The name as picked, kept because the stored path is randomised. */
  name: string
  mime: string
  /** Bytes. */
  size: number
}

export function isImageAttachment(mime: string): boolean {
  return mime.startsWith('image/')
}

/** Short, human label for the kind of file — not the raw MIME string. */
export function attachmentKindLabel(mime: string, name = ''): string {
  if (isImageAttachment(mime)) return 'รูปภาพ'
  if (mime === 'application/pdf') return 'PDF'
  if (mime.includes('wordprocessingml') || mime === 'application/msword') return 'Word'
  if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel') return 'Excel'
  if (mime.includes('presentationml') || mime === 'application/vnd.ms-powerpoint') return 'PowerPoint'
  if (mime === 'text/csv') return 'CSV'
  if (mime === 'text/plain') return 'ข้อความ'
  if (mime.includes('zip')) return 'ไฟล์บีบอัด'
  // Unknown type: the extension is what the person picking the file saw.
  const ext = name.includes('.') ? name.split('.').pop()! : ''
  return ext ? ext.toUpperCase() : 'ไฟล์'
}

/** "820 KB", "1.2 MB" — one decimal only where it says something. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/**
 * A long file name has to shrink somewhere, and the extension is the half that
 * says what the thing is — so the middle goes, never the tail.
 */
export function shortenFileName(name: string, max = 32): string {
  if (name.length <= max) return name
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot) : ''
  const stem = dot > 0 ? name.slice(0, dot) : name
  const keep = Math.max(4, max - ext.length - 1)
  return `${stem.slice(0, keep)}…${ext}`
}

/** Where an announcement attachment must live to be trusted. */
export const POST_FILE_PREFIX = '/storage/v1/object/public/classroom-post-files/'

/** Attachments per announcement. The composer stops here too. */
export const MAX_POST_ATTACHMENTS = 6

/**
 * Whether a URL really points at this project's announcement bucket.
 *
 * Checking for the path alone is not enough: `https://evil.example/storage/v1/
 * object/public/classroom-post-files/x.png` contains that path too, and an
 * announcement is rendered as `<img src>` and a download link in front of a
 * whole class. The origin has to match the project's own Storage host, so the
 * base URL is passed in rather than read here — this module stays pure and the
 * rule stays testable.
 */
export function isPostFileUrl(url: unknown, baseUrl: string | undefined): url is string {
  if (typeof url !== 'string' || !baseUrl) return false
  return url.startsWith(`${baseUrl.replace(/\/$/, '')}${POST_FILE_PREFIX}`)
}

/**
 * Cleans the attachment list a browser sent before it is stored.
 *
 * Everything here arrives as an argument, so nothing is trusted: URLs must be
 * in this project's bucket, the count is capped, and `name` — the one free-text
 * field — is length-capped and stripped of the path separators that would make
 * a filename read as a path on the way back out.
 */
export function sanitizeAttachments(
  input: unknown,
  baseUrl: string | undefined,
): PostAttachment[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((a): a is PostAttachment => !!a && isPostFileUrl(a.url, baseUrl))
    .slice(0, MAX_POST_ATTACHMENTS)
    .map(a => ({
      url: a.url,
      name: String(a.name ?? 'ไฟล์แนบ').replace(/[/\\]/g, '_').slice(0, 120),
      mime: String(a.mime ?? '').slice(0, 100),
      size: Number.isFinite(a.size) ? Math.max(0, Math.round(a.size)) : 0,
    }))
}

/** Storage paths for a set of attachments, for deleting them. */
export function attachmentPaths(attachments: PostAttachment[]): string[] {
  return attachments
    .map(a => a.url.split(POST_FILE_PREFIX)[1])
    .filter((path): path is string => !!path)
    .map(path => decodeURIComponent(path))
}
