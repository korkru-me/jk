import type { SubmittedFile } from '@/lib/types'

export type ExamAttachmentKind = 'work_image' | 'submission_file'

export interface ExamAttachmentDefinition {
  bucket: 'work-images' | 'submission-files'
  maxBytes: number
  mimeExtensions: Readonly<Record<string, string>>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_FILE_NAME = /^[^\u0000-\u001f\u007f]{1,255}$/u

const DEFINITIONS: Record<ExamAttachmentKind, ExamAttachmentDefinition> = {
  work_image: {
    bucket: 'work-images',
    maxBytes: 5 * 1024 * 1024,
    mimeExtensions: {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
    },
  },
  submission_file: {
    bucket: 'submission-files',
    maxBytes: 10 * 1024 * 1024,
    mimeExtensions: {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    },
  },
}

export function isExamAttachmentKind(value: unknown): value is ExamAttachmentKind {
  return value === 'work_image' || value === 'submission_file'
}

export function examAttachmentDefinition(kind: ExamAttachmentKind): ExamAttachmentDefinition {
  return DEFINITIONS[kind]
}

export function validateExamAttachmentFile(input: {
  kind: ExamAttachmentKind
  name: unknown
  mimeType: unknown
  size: unknown
}): { name: string; mimeType: string; size: number; extension: string } | { error: string } {
  if (typeof input.name !== 'string' || !SAFE_FILE_NAME.test(input.name.trim())) {
    return { error: 'ชื่อไฟล์ไม่ถูกต้อง' }
  }
  if (typeof input.mimeType !== 'string') return { error: 'ชนิดไฟล์ไม่ถูกต้อง' }
  const definition = examAttachmentDefinition(input.kind)
  const extension = definition.mimeExtensions[input.mimeType.toLowerCase()]
  if (!extension) return { error: 'ชนิดไฟล์นี้ไม่รองรับ' }
  if (!Number.isSafeInteger(input.size) || Number(input.size) < 1 || Number(input.size) > definition.maxBytes) {
    return { error: `ไฟล์ต้องมีขนาดไม่เกิน ${definition.maxBytes / 1024 / 1024} MB` }
  }
  return {
    name: input.name.trim(),
    mimeType: input.mimeType.toLowerCase(),
    size: Number(input.size),
    extension,
  }
}

export function buildExamAttachmentPath(input: {
  studentId: string
  submissionId: string
  submissionAnswerId: string
  uploadId: string
  extension: string
}) {
  if (
    !UUID_PATTERN.test(input.studentId)
    || !UUID_PATTERN.test(input.submissionId)
    || !UUID_PATTERN.test(input.submissionAnswerId)
    || !UUID_PATTERN.test(input.uploadId)
    || !/^[a-z0-9]{2,5}$/.test(input.extension)
  ) throw new Error('Invalid exam attachment path input')
  return `${input.studentId}/${input.submissionId}/${input.submissionAnswerId}/${input.uploadId}.${input.extension}`
}

export function storagePathFromPublicUrl(
  url: unknown,
  bucket: string,
  expectedOrigin?: string,
): string | null {
  if (typeof url !== 'string' || url.length < 1 || url.length > 2_000) return null
  // URL parsers normalize encoded dot-segments before exposing pathname. Check
  // the raw input first so `%2e%2e` cannot collapse out of the bucket prefix.
  if (/%2e|%2f|%5c/i.test(url)) return null
  try {
    const parsed = new URL(url)
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || (expectedOrigin && parsed.origin !== expectedOrigin)
    ) return null
    const marker = `/storage/v1/object/public/${bucket}/`
    if (!parsed.pathname.startsWith(marker)) return null
    const encoded = parsed.pathname.slice(marker.length)
    const path = decodeURIComponent(encoded)
    const segments = path.split('/')
    if (
      !path
      || path.includes('\\')
      || /[\u0000-\u001f\u007f]/u.test(path)
      || segments.some(segment => !segment || segment === '.' || segment === '..')
    ) return null
    return path
  } catch {
    return null
  }
}

export function isCurrentAnswerAttachmentPath(path: string, input: {
  studentId: string
  submissionId: string
  submissionAnswerId: string
}) {
  return path.startsWith(`${input.studentId}/${input.submissionId}/${input.submissionAnswerId}/`)
    && path.split('/').length === 4
    && !path.includes('..')
}

/** Compatibility for an in-progress attempt opened before signed uploads ship. */
export function isLegacyStudentAttachmentPath(path: string, studentId: string) {
  const segments = path.split('/')
  return segments.length === 2
    && segments[0] === studentId
    && Boolean(segments[1])
    && !segments[1].includes('..')
}

export function parseSubmittedFiles(value: unknown): SubmittedFile[] | null {
  let parsed = value
  if (typeof value === 'string') {
    try { parsed = value ? JSON.parse(value) : [] } catch { return null }
  }
  if (!Array.isArray(parsed) || parsed.length > 20) return null
  const files: SubmittedFile[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const row = item as Record<string, unknown>
    if (
      typeof row.url !== 'string'
      || typeof row.name !== 'string'
      || typeof row.type !== 'string'
      || row.url.length > 2_000
      || !SAFE_FILE_NAME.test(row.name.trim())
      || !DEFINITIONS.submission_file.mimeExtensions[row.type.toLowerCase()]
    ) return null
    files.push({ url: row.url, name: row.name.trim(), type: row.type.toLowerCase() })
  }
  return files
}

export function hasExamAttachmentSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    return signature.every((value, index) => bytes[index] === value)
  }
  if (mimeType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (mimeType === 'image/webp') {
    return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  }
  if (mimeType === 'application/pdf') {
    return String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-'
  }
  return false
}
