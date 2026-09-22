import { describe, expect, it } from 'vitest'
import {
  buildExamAttachmentPath,
  hasExamAttachmentSignature,
  isCurrentAnswerAttachmentPath,
  isLegacyStudentAttachmentPath,
  parseSubmittedFiles,
  storagePathFromPublicUrl,
  validateExamAttachmentFile,
} from '@/lib/exam-attachment'

const STUDENT = '11111111-1111-4111-8111-111111111111'
const SUBMISSION = '22222222-2222-4222-8222-222222222222'
const ANSWER = '33333333-3333-4333-8333-333333333333'
const UPLOAD = '44444444-4444-4444-8444-444444444444'

describe('exam attachment policy', () => {
  it('binds new paths to the exact student, attempt and answer', () => {
    const path = buildExamAttachmentPath({
      studentId: STUDENT,
      submissionId: SUBMISSION,
      submissionAnswerId: ANSWER,
      uploadId: UPLOAD,
      extension: 'png',
    })
    expect(path).toBe(`${STUDENT}/${SUBMISSION}/${ANSWER}/${UPLOAD}.png`)
    expect(isCurrentAnswerAttachmentPath(path, {
      studentId: STUDENT, submissionId: SUBMISSION, submissionAnswerId: ANSWER,
    })).toBe(true)
    expect(isCurrentAnswerAttachmentPath(path, {
      studentId: STUDENT, submissionId: SUBMISSION, submissionAnswerId: UPLOAD,
    })).toBe(false)
  })

  it('accepts only the old two-segment path as legacy compatibility', () => {
    expect(isLegacyStudentAttachmentPath(`${STUDENT}/old.jpg`, STUDENT)).toBe(true)
    expect(isLegacyStudentAttachmentPath(`${STUDENT}/${SUBMISSION}/old.jpg`, STUDENT)).toBe(false)
    expect(isLegacyStudentAttachmentPath(`${STUDENT}/../old.jpg`, STUDENT)).toBe(false)
  })

  it('extracts only a clean public path for the requested bucket', () => {
    const path = `${STUDENT}/${SUBMISSION}/${ANSWER}/${UPLOAD}.pdf`
    expect(storagePathFromPublicUrl(
      `https://project.supabase.co/storage/v1/object/public/submission-files/${path}`,
      'submission-files',
    )).toBe(path)
    expect(storagePathFromPublicUrl(
      `https://project.supabase.co/storage/v1/object/public/work-images/${path}`,
      'submission-files',
    )).toBeNull()
    expect(storagePathFromPublicUrl(
      'https://project.supabase.co/storage/v1/object/public/submission-files/a/%2e%2e/b.pdf',
      'submission-files',
    )).toBeNull()
  })

  it('validates size, type and submitted-file metadata', () => {
    expect(validateExamAttachmentFile({
      kind: 'submission_file', name: 'answer.pdf', mimeType: 'application/pdf', size: 1_024,
    })).toMatchObject({ extension: 'pdf' })
    expect(validateExamAttachmentFile({
      kind: 'work_image', name: 'answer.pdf', mimeType: 'application/pdf', size: 1_024,
    })).toEqual({ error: 'ชนิดไฟล์นี้ไม่รองรับ' })
    expect(parseSubmittedFiles(JSON.stringify([
      { url: 'https://example.test/file.pdf', name: 'คำตอบ.pdf', type: 'application/pdf' },
    ]))).toHaveLength(1)
    expect(parseSubmittedFiles('[{"url":"x","name":"x","type":"text/html"}]')).toBeNull()
  })

  it('checks signatures rather than trusting a client MIME label', () => {
    expect(hasExamAttachmentSignature(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg')).toBe(true)
    expect(hasExamAttachmentSignature(new TextEncoder().encode('%PDF-1.7'), 'application/pdf')).toBe(true)
    expect(hasExamAttachmentSignature(new TextEncoder().encode('<html>'), 'application/pdf')).toBe(false)
  })
})
