import { storagePathFromPublicUrl } from './exam-attachment'

export const QUESTION_FILE_MAX_BYTES = 10 * 1024 * 1024
export const QUESTION_FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'] as const
export const INSTRUCTION_DOCUMENT_TYPES = {
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', csv: 'text/csv', zip: 'application/zip',
} as const

export function instructionFileMime(file: Pick<File, 'name' | 'type'>): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type.toLowerCase()
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return INSTRUCTION_DOCUMENT_TYPES[extension as keyof typeof INSTRUCTION_DOCUMENT_TYPES] ?? file.type
}

/** Document uploads reuse the existing owner-scoped classroom document bucket. */
export function fileAssignmentInstructionStoragePath(url: unknown, origin: string): string | null {
  for (const bucket of ['question-images', 'classroom-post-files']) {
    const path = storagePathFromPublicUrl(url, bucket, origin)
    if (path && (bucket === 'question-images' || path.split('/')[1] === 'file-assignment-instructions')) return path
  }
  return null
}

export function instructionAttachmentName(url: string): string {
  try {
    const name = url.startsWith('blob:') ? url.split('#')[1] : url.split(/[?#]/)[0].split('/').pop()
    return name ? decodeURIComponent(name) : 'เอกสารประกอบ'
  } catch { return 'เอกสารประกอบ' }
}

/** Validate the files after the existing image downscaler has processed them. */
export function questionFileSelectionError(files: readonly Pick<File, 'name' | 'type' | 'size'>[], currentCount: number, maxFiles?: number, allowDocuments = false): string | null {
  if (maxFiles !== undefined && currentCount + files.length > maxFiles) return `แนบเอกสารประกอบได้ไม่เกิน ${maxFiles} ไฟล์`
  for (const file of files) {
    const mime = allowDocuments ? instructionFileMime(file) : file.type.toLowerCase()
    const allowed: readonly string[] = allowDocuments ? [...QUESTION_FILE_TYPES, ...Object.values(INSTRUCTION_DOCUMENT_TYPES), 'application/x-zip-compressed'] : QUESTION_FILE_TYPES
    if (!allowed.includes(mime)) return `“${file.name}” ใช้ไม่ได้ กรุณาเลือก${allowDocuments ? 'รูปภาพ, PDF, Word, Excel, PowerPoint, TXT, CSV หรือ ZIP' : ' PNG, JPG, WEBP, GIF หรือ PDF'}`
    if (file.size > QUESTION_FILE_MAX_BYTES) return `“${file.name}” มีขนาดเกิน 10 MB กรุณาลดขนาดไฟล์ก่อนแนบ`
  }
  return null
}
