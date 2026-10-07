const STORAGE_PUBLIC_PATH = '/storage/v1/object/public/question-images/'

export const CLASSROOM_COVER_BUCKET = 'question-images'
export const CLASSROOM_COVER_MAX_BYTES = 5 * 1024 * 1024
export const CLASSROOM_COVER_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

type ClassroomCoverType = (typeof CLASSROOM_COVER_TYPES)[number]

const EXTENSION_BY_TYPE: Record<ClassroomCoverType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export type ClassroomCoverFileCheck =
  | { ok: true; extension: string }
  | { ok: false; message: string }

export function checkClassroomCoverFile(file: { name: string; type: string; size: number }): ClassroomCoverFileCheck {
  const type = file.type.toLowerCase() as ClassroomCoverType
  if (!CLASSROOM_COVER_TYPES.includes(type)) {
    return { ok: false, message: `“${file.name}” ใช้ไม่ได้ — รองรับเฉพาะ PNG, JPG และ WebP` }
  }
  if (file.size > CLASSROOM_COVER_MAX_BYTES) {
    return { ok: false, message: `“${file.name}” ใหญ่เกิน 5 MB — ย่อรูปหรือลดความละเอียดก่อนแล้วลองใหม่` }
  }
  return { ok: true, extension: EXTENSION_BY_TYPE[type] }
}

export function classroomCoverUploadPath(
  userId: string,
  extension: string,
  now = Date.now(),
  random = Math.random(),
): string {
  return `${userId}/classroom-cover_${now}_${random.toString(36).slice(2, 10)}.${extension}`
}

export function isClassroomCoverUrl(
  raw: string,
  {
    ownerId,
    storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL,
    allowBlob = false,
  }: { ownerId?: string; storageOrigin?: string; allowBlob?: boolean } = {},
): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }

  if (url.protocol === 'blob:') return allowBlob
  if (!storageOrigin) return false

  let expectedOrigin: string
  try {
    expectedOrigin = new URL(storageOrigin).origin
  } catch {
    return false
  }

  if (
    url.protocol !== 'https:'
    || url.origin !== expectedOrigin
    || url.username
    || url.password
    || url.search
    || url.hash
    || !url.pathname.startsWith(STORAGE_PUBLIC_PATH)
  ) return false

  const key = url.pathname.slice(STORAGE_PUBLIC_PATH.length)
  if (/%2f|%5c/i.test(key)) return false
  const parts = key.split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) return false
  if (parts.length !== 2 || (ownerId && parts[0] !== ownerId)) return false
  return /^classroom-cover_[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/i.test(parts[1])
}
