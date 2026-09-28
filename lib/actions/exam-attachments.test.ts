import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getWritableStudentAnswer: vi.fn(),
  inspectStoredExamAttachment: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/exam-write-access', () => ({
  getWritableStudentAnswer: mocks.getWritableStudentAnswer,
}))
vi.mock('@/lib/exam-attachment-storage.server', () => ({
  inspectStoredExamAttachment: mocks.inspectStoredExamAttachment,
}))

import {
  completeExamAttachmentUpload,
  deleteExamAttachment,
  prepareExamAttachmentUpload,
} from '@/lib/actions/exam-attachments'

const STUDENT = '11111111-1111-4111-8111-111111111111'
const SUBMISSION = '22222222-2222-4222-8222-222222222222'
const ANSWER = '33333333-3333-4333-8333-333333333333'
const UPLOAD = '44444444-4444-4444-8444-444444444444'
const originalStorageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

function writable(questionType: 'written' | 'file_upload') {
  return {
    answer: {
      id: ANSWER,
      submission_id: SUBMISSION,
      student_answer: '',
      work_images: [],
      carried_over: false,
      check_count: 0,
      questions: { question_type: questionType, answer_parts: [] },
      submissions: null,
    },
    submission: {
      id: SUBMISSION,
      student_id: STUDENT,
      status: 'in_progress',
      started_at: new Date().toISOString(),
      assignment_id: '55555555-5555-4555-8555-555555555555',
      current_streak: 0,
      best_streak: 0,
      streak_reached: false,
      assignments: null,
    },
    assignment: {
      id: '55555555-5555-4555-8555-555555555555',
      duration_minutes: 60,
      end_at: null,
      secure_browser_mode: 'seb_required',
      android_exam_mode: 'blocked',
      type: 'exam',
      mode: 'online',
      instant_check: false,
      instant_check_answer_key: false,
      completion_rule: 'fixed',
      streak_target: null,
      streak_question_cap: null,
      streak_recycle_pool: false,
      require_work_image: true,
      scratchpad_enabled: false,
    },
    question: { question_type: questionType, answer_parts: [] },
  }
}

describe('exam attachment Server Actions', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    mocks.createClient.mockReset().mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: STUDENT } } }) },
    })
    mocks.createSignedUploadUrl.mockReset().mockResolvedValue({
      data: { token: 'signed-upload-token' },
      error: null,
    })
    mocks.remove.mockReset().mockResolvedValue({ error: null })
    mocks.inspectStoredExamAttachment.mockReset().mockResolvedValue({
      size: 128,
      mimeType: 'application/pdf',
    })
    mocks.createAdminClient.mockReset().mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUploadUrl: mocks.createSignedUploadUrl,
          remove: mocks.remove,
          getPublicUrl: vi.fn().mockReturnValue({
            data: { publicUrl: 'https://project.supabase.co/storage/v1/object/public/submission-files/file.pdf' },
          }),
        }),
      },
    })
    mocks.getWritableStudentAnswer.mockReset().mockResolvedValue(writable('file_upload'))
  })

  afterEach(() => {
    if (originalStorageUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalStorageUrl
  })

  it('does not issue a signed target when the attempt gate rejects the write', async () => {
    mocks.getWritableStudentAnswer.mockResolvedValue({ error: 'เซสชันเข้าสอบหมดอายุ' })
    await expect(prepareExamAttachmentUpload({
      submissionAnswerId: ANSWER,
      kind: 'submission_file',
      name: 'answer.pdf',
      mimeType: 'application/pdf',
      size: 128,
    })).resolves.toEqual({ error: 'เซสชันเข้าสอบหมดอายุ' })
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('binds a signed upload target to the exact student, submission and answer', async () => {
    const result = await prepareExamAttachmentUpload({
      submissionAnswerId: ANSWER,
      kind: 'submission_file',
      name: 'answer.pdf',
      mimeType: 'application/pdf',
      size: 128,
    })
    expect(result).toMatchObject({
      success: true,
      bucket: 'submission-files',
      token: 'signed-upload-token',
    })
    expect(mocks.createSignedUploadUrl).toHaveBeenCalledWith(expect.stringMatching(
      new RegExp(`^${STUDENT}/${SUBMISSION}/${ANSWER}/[0-9a-f-]+\\.pdf$`, 'i'),
    ))
  })

  it('binds a client retry id to the same exact answer path', async () => {
    const result = await prepareExamAttachmentUpload({
      submissionAnswerId: ANSWER,
      kind: 'submission_file',
      uploadId: UPLOAD,
      retry: false,
      name: 'answer.pdf',
      mimeType: 'application/pdf',
      size: 128,
    })
    expect(result).toMatchObject({ success: true, reused: false, uploadId: UPLOAD })
    expect(mocks.createSignedUploadUrl).toHaveBeenCalledWith(
      `${STUDENT}/${SUBMISSION}/${ANSWER}/${UPLOAD}.pdf`,
    )
  })

  it('reuses the same valid storage object when a retry lost the prior response', async () => {
    const result = await prepareExamAttachmentUpload({
      submissionAnswerId: ANSWER,
      kind: 'submission_file',
      uploadId: UPLOAD,
      retry: true,
      name: 'answer.pdf',
      mimeType: 'application/pdf',
      size: 128,
    })
    expect(result).toMatchObject({
      success: true,
      reused: true,
      uploadId: UPLOAD,
      file: { name: 'answer.pdf', type: 'application/pdf' },
    })
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('clears a partial retry object before issuing a target for the same path', async () => {
    mocks.inspectStoredExamAttachment.mockResolvedValue({ error: 'ไม่พบไฟล์ที่อัปโหลด กรุณาแนบใหม่' })
    const result = await prepareExamAttachmentUpload({
      submissionAnswerId: ANSWER,
      kind: 'submission_file',
      uploadId: UPLOAD,
      retry: true,
      name: 'answer.pdf',
      mimeType: 'application/pdf',
      size: 128,
    })
    const path = `${STUDENT}/${SUBMISSION}/${ANSWER}/${UPLOAD}.pdf`
    expect(result).toMatchObject({ success: true, reused: false, uploadId: UPLOAD, path })
    expect(mocks.remove).toHaveBeenCalledWith([path])
    expect(mocks.createSignedUploadUrl).toHaveBeenCalledWith(path)
  })

  it('rejects a malformed retry id before issuing a signed target', async () => {
    await expect(prepareExamAttachmentUpload({
      submissionAnswerId: ANSWER,
      kind: 'submission_file',
      uploadId: '../another-object',
      retry: true,
      name: 'answer.pdf',
      mimeType: 'application/pdf',
      size: 128,
    })).resolves.toEqual({ error: 'ไฟล์อัปโหลดไม่ถูกต้อง' })
    expect(mocks.getWritableStudentAnswer).not.toHaveBeenCalled()
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('removes an uploaded object when server-side inspection rejects it', async () => {
    mocks.inspectStoredExamAttachment.mockResolvedValue({ error: 'เนื้อหาไฟล์ไม่ตรงกับชนิดไฟล์' })
    await expect(completeExamAttachmentUpload({
      submissionAnswerId: ANSWER,
      kind: 'submission_file',
      uploadId: UPLOAD,
      name: 'answer.pdf',
      mimeType: 'application/pdf',
      size: 128,
    })).resolves.toEqual({ error: 'เนื้อหาไฟล์ไม่ตรงกับชนิดไฟล์' })
    expect(mocks.remove).toHaveBeenCalledWith([
      `${STUDENT}/${SUBMISSION}/${ANSWER}/${UPLOAD}.pdf`,
    ])
  })

  it('rejects delete URLs from another origin before calling Storage', async () => {
    await expect(deleteExamAttachment({
      submissionAnswerId: ANSWER,
      kind: 'submission_file',
      url: `https://evil.example/storage/v1/object/public/submission-files/${STUDENT}/${SUBMISSION}/${ANSWER}/${UPLOAD}.pdf`,
    })).resolves.toEqual({ error: 'ที่อยู่ไฟล์ไม่ถูกต้อง' })
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})
