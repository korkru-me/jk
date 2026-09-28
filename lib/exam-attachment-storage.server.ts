import 'server-only'

import {
  examAttachmentDefinition,
  hasExamAttachmentSignature,
  type ExamAttachmentKind,
} from '@/lib/exam-attachment'
import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

function storageMetadata(value: unknown): { size: number | null; contentType: string | null } {
  if (!value || typeof value !== 'object') return { size: null, contentType: null }
  const row = value as Record<string, unknown>
  const metadata = row.metadata && typeof row.metadata === 'object'
    ? row.metadata as Record<string, unknown>
    : {}
  return {
    size: typeof row.size === 'number'
      ? row.size
      : typeof metadata.size === 'number' ? metadata.size : null,
    contentType: typeof row.contentType === 'string'
      ? row.contentType.toLowerCase()
      : typeof metadata.mimetype === 'string' ? metadata.mimetype.toLowerCase() : null,
  }
}

export async function inspectStoredExamAttachment(
  admin: AdminClient,
  input: {
    kind: ExamAttachmentKind
    path: string
    expectedMimeType?: string
    expectedSize?: number
  },
): Promise<{ size: number; mimeType: string } | { error: string }> {
  const definition = examAttachmentDefinition(input.kind)
  const bucket = admin.storage.from(definition.bucket)
  const info = await bucket.info(input.path)
  if (info.error) return { error: 'ไม่พบไฟล์ที่อัปโหลด กรุณาแนบใหม่' }

  const metadata = storageMetadata(info.data)
  if (
    metadata.size === null
    || metadata.size < 1
    || metadata.size > definition.maxBytes
    || !metadata.contentType
    || !definition.mimeExtensions[metadata.contentType]
    || (input.expectedSize !== undefined && metadata.size !== input.expectedSize)
    || (input.expectedMimeType !== undefined && metadata.contentType !== input.expectedMimeType)
  ) return { error: 'ชนิดหรือขนาดไฟล์ที่อัปโหลดไม่ตรงกับที่แจ้งไว้' }

  const downloaded = await bucket.download(input.path)
  if (downloaded.error) return { error: 'ตรวจสอบไฟล์ที่อัปโหลดไม่สำเร็จ กรุณาลองใหม่' }
  const header = new Uint8Array((await downloaded.data.arrayBuffer()).slice(0, 16))
  if (!hasExamAttachmentSignature(header, metadata.contentType)) {
    return { error: 'เนื้อหาไฟล์ไม่ตรงกับชนิดไฟล์ที่แจ้งไว้' }
  }
  return { size: metadata.size, mimeType: metadata.contentType }
}
