/**
 * The files a โจทย์'s เฉลย can carry: pictures, PDFs, and pictures drawn on
 * the กระดานเขียนเฉลย.
 *
 * They all live in `questions.solution_image_urls`. The column is older than
 * PDFs and boards, but a second column would have to be threaded through
 * every question form, the save actions, duplication and the portable export
 * for nothing — `file_upload`'s `attachment_urls` already keeps pictures and
 * PDFs in one list the same way. So a file's kind is read off its URL: a PDF
 * by its extension, a board picture by the name it was uploaded under.
 */

/**
 * A PDF is stored as picked — nothing in the browser can shrink one. 5 MB
 * holds dozens of typed pages or ten-odd scanned ones, and is still quick to
 * open for a student on mobile data. The bucket's own ceiling (10 MB) stays
 * behind it as the backstop.
 */
export const SOLUTION_PDF_MAX_BYTES = 5 * 1024 * 1024

/**
 * What a picture may still weigh after `downscaleImage` has had it. A phone
 * photo comes out of that at a few hundred KB; what reaches this limit is
 * what the shrinker leaves alone — an animated GIF, or an image it could not
 * decode.
 */
export const SOLUTION_IMAGE_MAX_BYTES = 2 * 1024 * 1024

/** Board pictures are uploaded under names starting with this. */
export const SOLUTION_BOARD_FILE_PREFIX = 'solution-board_'

/** Exactly what the `question-images` bucket accepts (its limits migration). */
export const SOLUTION_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
] as const

export type SolutionAttachmentKind = 'image' | 'pdf' | 'board'

// Matched against the whole URL rather than a parsed path, the way
// `file_upload`'s own PDF check is, so a name carried after a `#` counts too.
const PDF_URL = /\.pdf(?:[?#]|$)/i
const BOARD_URL = new RegExp(`/${SOLUTION_BOARD_FILE_PREFIX}[^/?#]*\\.png(?:[?#]|$)`, 'i')

export function solutionAttachmentKind(url: string): SolutionAttachmentKind {
  if (PDF_URL.test(url)) return 'pdf'
  if (BOARD_URL.test(url)) return 'board'
  return 'image'
}

/** PDFs apart from everything that shows as a picture, board pictures included. */
export function splitSolutionAttachments(urls: readonly string[]): { images: string[]; pdfs: string[] } {
  const images: string[] = []
  const pdfs: string[] = []
  for (const url of urls) (solutionAttachmentKind(url) === 'pdf' ? pdfs : images).push(url)
  return { images, pdfs }
}

/** A Storage key for a new เฉลย file, under the uploader's own folder. */
export function solutionUploadPath(
  userId: string,
  kind: 'board' | 'file',
  extension: string,
  now = Date.now(),
  random = Math.random(),
): string {
  const stem = kind === 'board' ? SOLUTION_BOARD_FILE_PREFIX : 'solution_'
  return `${userId}/${stem}${now}_${random.toString(36).slice(2, 10)}.${extension}`
}

const EXTENSIONS: Record<(typeof SOLUTION_FILE_TYPES)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
}

function megabytes(bytes: number): string {
  return `${bytes / (1024 * 1024)} MB`
}

export type SolutionFileCheck =
  | { ok: true; kind: 'image' | 'pdf'; extension: string }
  | { ok: false; message: string }

/**
 * Whether a file picked for the เฉลย may go up, and what to say when it may
 * not. Pictures are checked after shrinking, so the limit is on what would
 * actually be stored.
 */
export function checkSolutionFile(file: { name: string; type: string; size: number }): SolutionFileCheck {
  const type = file.type.toLowerCase() as (typeof SOLUTION_FILE_TYPES)[number]
  const named = `“${file.name}”`
  if (!SOLUTION_FILE_TYPES.includes(type)) {
    return { ok: false, message: `${named} แนบไม่ได้ — ใช้ได้เฉพาะรูป JPG, PNG, WebP, GIF หรือไฟล์ PDF` }
  }
  if (type === 'application/pdf') {
    return file.size > SOLUTION_PDF_MAX_BYTES
      ? { ok: false, message: `${named} ใหญ่เกิน ${megabytes(SOLUTION_PDF_MAX_BYTES)} — ลดขนาด PDF หรือแยกเป็นหลายไฟล์ก่อนแนบ` }
      : { ok: true, kind: 'pdf', extension: EXTENSIONS[type] }
  }
  return file.size > SOLUTION_IMAGE_MAX_BYTES
    ? { ok: false, message: `${named} ยังใหญ่เกิน ${megabytes(SOLUTION_IMAGE_MAX_BYTES)} แม้ย่อแล้ว — ลองบันทึกเป็น JPG หรือลดขนาดรูปก่อน` }
    : { ok: true, kind: 'image', extension: EXTENSIONS[type] }
}
