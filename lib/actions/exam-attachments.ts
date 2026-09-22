'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getWritableStudentAnswer } from '@/lib/exam-write-access'
import {
  buildExamAttachmentPath,
  examAttachmentDefinition,
  isCurrentAnswerAttachmentPath,
  isExamAttachmentKind,
  isLegacyStudentAttachmentPath,
  parseSubmittedFiles,
  storagePathFromPublicUrl,
  validateExamAttachmentFile,
  type ExamAttachmentKind,
} from '@/lib/exam-attachment'
import { inspectStoredExamAttachment } from '@/lib/exam-attachment-storage.server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

function attachmentContextError(
  kind: ExamAttachmentKind,
  writable: Awaited<ReturnType<typeof getWritableStudentAnswer>>,
  partIndex: unknown,
  { deleting = false }: { deleting?: boolean } = {},
): string | null {
  if ('error' in writable) return writable.error
  if (writable.assignment?.mode !== 'online') return 'งานแบบพิมพ์ไม่รองรับการแนบไฟล์ออนไลน์'
  const question = relationOne(writable.answer.questions)
  if (kind === 'submission_file') {
    return question?.question_type === 'file_upload' ? null : 'ช่องคำตอบนี้ไม่ได้รองรับการแนบไฟล์'
  }
  if (question?.question_type !== 'written') return 'ช่องคำตอบนี้ไม่ได้รองรับรูปวิธีทำ'
  if (!Number.isInteger(partIndex) || Number(partIndex) < 0 || Number(partIndex) > 50) {
    return 'ตำแหน่งรูปไม่ถูกต้อง'
  }
  const parts = Array.isArray(question.answer_parts) ? question.answer_parts : []
  const partCount = Math.max(1, parts.length)
  if (Number(partIndex) >= partCount) return 'ตำแหน่งรูปไม่ตรงกับช่องคำตอบ'
  if (
    !deleting
    && writable.assignment.require_work_image !== true
    && writable.assignment.scratchpad_enabled !== true
  ) return 'งานนี้ไม่ได้เปิดให้แนบวิธีทำ'
  return null
}

function configuredStorageOrigin(): string | null {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin } catch { return null }
}

export async function prepareExamAttachmentUpload(input: {
  submissionAnswerId: string
  kind: string
  partIndex?: number
  name: string
  mimeType: string
  size: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!UUID_PATTERN.test(input.submissionAnswerId)) return { error: 'คำตอบไม่ถูกต้อง' }
  if (!isExamAttachmentKind(input.kind)) return { error: 'ประเภทไฟล์ไม่ถูกต้อง' }
  const kind = input.kind
  const file = validateExamAttachmentFile({ ...input, kind })
  if ('error' in file) return file

  const admin = createAdminClient()
  const writable = await getWritableStudentAnswer(admin, input.submissionAnswerId, user.id)
  if ('error' in writable) return { error: writable.error }
  const contextError = attachmentContextError(kind, writable, input.partIndex)
  if (contextError) return { error: contextError }

  const uploadId = crypto.randomUUID()
  const path = buildExamAttachmentPath({
    studentId: user.id,
    submissionId: writable.submission.id,
    submissionAnswerId: writable.answer.id,
    uploadId,
    extension: file.extension,
  })
  const definition = examAttachmentDefinition(kind)
  const target = await admin.storage.from(definition.bucket).createSignedUploadUrl(path)
  if (target.error) return { error: 'เตรียมพื้นที่อัปโหลดไม่สำเร็จ กรุณาลองใหม่' }

  return {
    success: true as const,
    uploadId,
    path,
    token: target.data.token,
    bucket: definition.bucket,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
  }
}

export async function completeExamAttachmentUpload(input: {
  submissionAnswerId: string
  kind: string
  partIndex?: number
  uploadId: string
  name: string
  mimeType: string
  size: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!UUID_PATTERN.test(input.submissionAnswerId) || !UUID_PATTERN.test(input.uploadId)) {
    return { error: 'ไฟล์อัปโหลดไม่ถูกต้อง' }
  }
  if (!isExamAttachmentKind(input.kind)) return { error: 'ประเภทไฟล์ไม่ถูกต้อง' }
  const kind = input.kind
  const file = validateExamAttachmentFile({ ...input, kind })
  if ('error' in file) return file

  const admin = createAdminClient()
  const writable = await getWritableStudentAnswer(admin, input.submissionAnswerId, user.id)
  if ('error' in writable) return { error: writable.error }
  const contextError = attachmentContextError(kind, writable, input.partIndex)
  if (contextError) return { error: contextError }

  const path = buildExamAttachmentPath({
    studentId: user.id,
    submissionId: writable.submission.id,
    submissionAnswerId: writable.answer.id,
    uploadId: input.uploadId,
    extension: file.extension,
  })
  const inspected = await inspectStoredExamAttachment(admin, {
    kind,
    path,
    expectedMimeType: file.mimeType,
    expectedSize: file.size,
  })
  const definition = examAttachmentDefinition(kind)
  if ('error' in inspected) {
    await admin.storage.from(definition.bucket).remove([path])
    return inspected
  }
  const { data: { publicUrl } } = admin.storage.from(definition.bucket).getPublicUrl(path)
  return {
    success: true as const,
    file: { url: publicUrl, name: file.name, type: inspected.mimeType },
  }
}

export async function deleteExamAttachment(input: {
  submissionAnswerId: string
  kind: string
  partIndex?: number
  url: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!UUID_PATTERN.test(input.submissionAnswerId)) return { error: 'คำตอบไม่ถูกต้อง' }
  if (!isExamAttachmentKind(input.kind)) return { error: 'ประเภทไฟล์ไม่ถูกต้อง' }
  const kind = input.kind

  const admin = createAdminClient()
  const writable = await getWritableStudentAnswer(admin, input.submissionAnswerId, user.id)
  if ('error' in writable) return { error: writable.error }
  const contextError = attachmentContextError(kind, writable, input.partIndex, { deleting: true })
  if (contextError) return { error: contextError }

  const definition = examAttachmentDefinition(kind)
  const storageOrigin = configuredStorageOrigin()
  if (!storageOrigin) return { error: 'ระบบจัดเก็บไฟล์ยังตั้งค่าไม่ครบ กรุณาแจ้งครูผู้สอน' }
  const path = storagePathFromPublicUrl(input.url, definition.bucket, storageOrigin)
  if (!path) return { error: 'ที่อยู่ไฟล์ไม่ถูกต้อง' }
  const currentPath = isCurrentAnswerAttachmentPath(path, {
    studentId: user.id,
    submissionId: writable.submission.id,
    submissionAnswerId: writable.answer.id,
  })
  const legacyPath = isLegacyStudentAttachmentPath(path, user.id)
  const currentlyReferenced = kind === 'work_image'
    ? (Array.isArray(writable.answer.work_images) ? writable.answer.work_images : []).includes(input.url)
    : (parseSubmittedFiles(writable.answer.student_answer) ?? []).some(file => file.url === input.url)
  if (!currentPath && !(legacyPath && currentlyReferenced)) return { error: 'ไม่มีสิทธิ์ลบไฟล์นี้' }

  const removed = await admin.storage.from(definition.bucket).remove([path])
  if (removed.error) return { error: 'ลบไฟล์ไม่สำเร็จ กรุณาลองใหม่' }
  return { success: true as const }
}
