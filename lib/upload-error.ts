/**
 * Turning a Storage rejection into something a teacher or student can act on.
 *
 * Every upload widget used to test `if (!error)` and do nothing at all when the
 * upload failed: the spinner stopped, no image appeared, and nothing said why.
 * That was survivable while the buckets accepted anything — a failure meant the
 * network had dropped. It stops being survivable once the buckets enforce a
 * size and a type, because then refusal is a normal outcome with a specific
 * cause, and "nothing happened" is the worst way to report it.
 *
 * The two causes worth naming are the two the buckets check. Anything else is
 * reported as itself rather than guessed at.
 */

/** What most buckets allow. `submission-files` is the exception at 10 MB, so
 *  the number is a parameter rather than a constant in the copy — a message
 *  naming the wrong limit sends someone off to shrink a file that was already
 *  small enough. */
export const DEFAULT_MAX_UPLOAD_MB = 5

export function uploadErrorMessage(
  raw: string,
  fileName?: string,
  maxMb: number = DEFAULT_MAX_UPLOAD_MB,
): string {
  const message = raw.toLowerCase()
  const named = fileName ? `“${fileName}” ` : ''

  // Supabase answers an over-size upload with 413 and wording that has changed
  // between versions, so match on the idea rather than one exact string.
  if (
    message.includes('exceeded the maximum allowed size') ||
    message.includes('payload too large') ||
    message.includes('entity too large') ||
    message.includes('maximum allowed size')
  ) {
    return `${named}ไฟล์ใหญ่เกิน ${maxMb} MB — ย่อรูปหรือลดความละเอียดก่อนแล้วลองใหม่`
  }

  if (message.includes('mime type') || message.includes('invalid_mime_type')) {
    return `${named}เป็นชนิดไฟล์ที่อัปโหลดไม่ได้ — รองรับ JPG, PNG, WebP, GIF และ PDF`
  }

  return `${named}อัปโหลดไม่สำเร็จ: ${raw}`
}
