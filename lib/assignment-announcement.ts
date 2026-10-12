import { isRichTextImageSrc } from '@/lib/rich-text-sanitize'

/** Pictures placed inside an assignment's waiting-room announcement. */
export const ASSIGNMENT_ANNOUNCEMENT_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

/** Matches the practical limit used by other rich-text pictures in question-images. */
export const ASSIGNMENT_ANNOUNCEMENT_IMAGE_MAX_BYTES = 2 * 1024 * 1024

const EXTENSIONS: Record<(typeof ASSIGNMENT_ANNOUNCEMENT_IMAGE_TYPES)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export type AssignmentAnnouncementImageCheck =
  | { ok: true; extension: string }
  | { ok: false; message: string }

export function checkAssignmentAnnouncementImage(file: {
  name: string
  type: string
  size: number
}): AssignmentAnnouncementImageCheck {
  const type = file.type.toLowerCase() as (typeof ASSIGNMENT_ANNOUNCEMENT_IMAGE_TYPES)[number]
  const named = `“${file.name}”`
  if (!ASSIGNMENT_ANNOUNCEMENT_IMAGE_TYPES.includes(type)) {
    return { ok: false, message: `${named} แนบไม่ได้ — ใช้ได้เฉพาะรูป JPG, PNG, WebP หรือ GIF` }
  }
  if (file.size > ASSIGNMENT_ANNOUNCEMENT_IMAGE_MAX_BYTES) {
    return { ok: false, message: `${named} ยังใหญ่เกิน 2 MB แม้ย่อแล้ว — ลองบันทึกเป็น JPG หรือลดขนาดรูปก่อน` }
  }
  return { ok: true, extension: EXTENSIONS[type] }
}

/** A unique Storage key under the teacher's own question-images folder. */
export function assignmentAnnouncementImagePath(
  userId: string,
  extension: string,
  now = Date.now(),
  random = Math.random(),
): string {
  return `${userId}/assignment-announcement_${now}_${random.toString(36).slice(2, 10)}.${extension}`
}

/** Keep the editor and the server-side rich-text sanitizer on the same image policy. */
export function isAssignmentAnnouncementImageSrc(src: string): boolean {
  return isRichTextImageSrc(src)
}
