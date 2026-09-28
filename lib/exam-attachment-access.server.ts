import 'server-only'

import {
  examAttachmentDefinition,
  isCurrentAnswerAttachmentPath,
  isLegacyStudentAttachmentPath,
  storagePathFromPublicUrl,
  type ExamAttachmentKind,
} from '@/lib/exam-attachment'
import { inspectStoredExamAttachment } from '@/lib/exam-attachment-storage.server'
import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

function storageOrigin(): string | null {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin } catch { return null }
}

export async function validateStoredExamAttachmentUrl(
  admin: AdminClient,
  input: {
    kind: ExamAttachmentKind
    url: string
    studentId: string
    submissionId: string
    submissionAnswerId: string
    expectedMimeType?: string
    allowLegacy: boolean
  },
): Promise<{ path: string; mimeType: string; size: number } | { error: string }> {
  const origin = storageOrigin()
  if (!origin) return { error: 'ระบบจัดเก็บไฟล์ยังตั้งค่าไม่ครบ กรุณาแจ้งครูผู้สอน' }
  const definition = examAttachmentDefinition(input.kind)
  const path = storagePathFromPublicUrl(input.url, definition.bucket, origin)
  if (!path) return { error: 'ที่อยู่ไฟล์แนบไม่ถูกต้อง กรุณาแนบใหม่' }
  const exact = isCurrentAnswerAttachmentPath(path, input)
  const legacy = input.allowLegacy && isLegacyStudentAttachmentPath(path, input.studentId)
  if (!exact && !legacy) return { error: 'ไฟล์แนบไม่ตรงกับคำตอบนี้ กรุณาแนบใหม่' }
  const inspected = await inspectStoredExamAttachment(admin, {
    kind: input.kind,
    path,
    expectedMimeType: input.expectedMimeType,
  })
  return 'error' in inspected ? inspected : { path, ...inspected }
}
