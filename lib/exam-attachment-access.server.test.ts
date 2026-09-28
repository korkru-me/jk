import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ inspectStoredExamAttachment: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/exam-attachment-storage.server', () => ({
  inspectStoredExamAttachment: mocks.inspectStoredExamAttachment,
}))

import { validateStoredExamAttachmentUrl } from '@/lib/exam-attachment-access.server'

const STUDENT = '11111111-1111-4111-8111-111111111111'
const SUBMISSION = '22222222-2222-4222-8222-222222222222'
const ANSWER = '33333333-3333-4333-8333-333333333333'
const UPLOAD = '44444444-4444-4444-8444-444444444444'
const originalStorageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

describe('stored exam attachment access', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    mocks.inspectStoredExamAttachment.mockReset().mockResolvedValue({
      size: 128,
      mimeType: 'application/pdf',
    })
  })

  afterEach(() => {
    if (originalStorageUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalStorageUrl
  })

  it('accepts only a stored object bound to the exact answer', async () => {
    const path = `${STUDENT}/${SUBMISSION}/${ANSWER}/${UPLOAD}.pdf`
    await expect(validateStoredExamAttachmentUrl({} as never, {
      kind: 'submission_file',
      url: `https://project.supabase.co/storage/v1/object/public/submission-files/${path}`,
      studentId: STUDENT,
      submissionId: SUBMISSION,
      submissionAnswerId: ANSWER,
      expectedMimeType: 'application/pdf',
      allowLegacy: false,
    })).resolves.toEqual({ path, size: 128, mimeType: 'application/pdf' })
    expect(mocks.inspectStoredExamAttachment).toHaveBeenCalledWith({}, {
      kind: 'submission_file',
      path,
      expectedMimeType: 'application/pdf',
    })
  })

  it('rejects a foreign origin or another answer before reading Storage', async () => {
    const otherAnswer = '55555555-5555-4555-8555-555555555555'
    for (const url of [
      `https://evil.example/storage/v1/object/public/submission-files/${STUDENT}/${SUBMISSION}/${ANSWER}/${UPLOAD}.pdf`,
      `https://project.supabase.co/storage/v1/object/public/submission-files/${STUDENT}/${SUBMISSION}/${otherAnswer}/${UPLOAD}.pdf`,
    ]) {
      await expect(validateStoredExamAttachmentUrl({} as never, {
        kind: 'submission_file',
        url,
        studentId: STUDENT,
        submissionId: SUBMISSION,
        submissionAnswerId: ANSWER,
        allowLegacy: false,
      })).resolves.toHaveProperty('error')
    }
    expect(mocks.inspectStoredExamAttachment).not.toHaveBeenCalled()
  })

  it('allows a legacy student path only when compatibility is explicit', async () => {
    const url = `https://project.supabase.co/storage/v1/object/public/submission-files/${STUDENT}/old.pdf`
    const input = {
      kind: 'submission_file' as const,
      url,
      studentId: STUDENT,
      submissionId: SUBMISSION,
      submissionAnswerId: ANSWER,
    }
    await expect(validateStoredExamAttachmentUrl({} as never, {
      ...input,
      allowLegacy: false,
    })).resolves.toHaveProperty('error')
    await expect(validateStoredExamAttachmentUrl({} as never, {
      ...input,
      allowLegacy: true,
    })).resolves.toMatchObject({ path: `${STUDENT}/old.pdf` })
  })
})
