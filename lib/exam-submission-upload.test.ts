import { describe, expect, it, vi } from 'vitest'
import {
  mergeSubmittedFiles,
  uploadSubmissionCandidate,
  type SubmissionUploadCandidate,
} from './exam-submission-upload'

const ANSWER_ID = '33333333-3333-4333-8333-333333333333'
const UPLOAD_ID = '44444444-4444-4444-8444-444444444444'
const candidate: SubmissionUploadCandidate<string> = {
  uploadId: UPLOAD_ID,
  file: 'pdf-bytes',
  name: 'answer.pdf',
  mimeType: 'application/pdf',
  size: 128,
}
const submitted = {
  url: `https://project.supabase.co/storage/v1/object/public/submission-files/${UPLOAD_ID}.pdf`,
  name: 'answer.pdf',
  type: 'application/pdf',
}

function dependencies() {
  return {
    prepare: vi.fn().mockResolvedValue({
      success: true as const,
      reused: false as const,
      uploadId: UPLOAD_ID,
      path: `${UPLOAD_ID}.pdf`,
      token: 'signed-token',
      bucket: 'submission-files',
    }),
    upload: vi.fn().mockResolvedValue({ error: null }),
    complete: vi.fn().mockResolvedValue({ success: true as const, file: submitted }),
  }
}

describe('submission attachment upload retry', () => {
  it('keeps the client-generated upload id through prepare and completion', async () => {
    const deps = dependencies()

    await expect(uploadSubmissionCandidate({
      submissionAnswerId: ANSWER_ID,
      candidate,
      retry: false,
    }, deps)).resolves.toEqual(submitted)

    expect(deps.prepare).toHaveBeenCalledWith(expect.objectContaining({
      uploadId: UPLOAD_ID,
      retry: false,
    }))
    expect(deps.complete).toHaveBeenCalledWith(expect.objectContaining({
      uploadId: UPLOAD_ID,
    }))
  })

  it('reuses an already committed object on retry without uploading it again', async () => {
    const deps = dependencies()
    deps.prepare.mockResolvedValue({
      success: true,
      reused: true,
      uploadId: UPLOAD_ID,
      file: submitted,
    })

    await expect(uploadSubmissionCandidate({
      submissionAnswerId: ANSWER_ID,
      candidate,
      retry: true,
    }, deps)).resolves.toEqual(submitted)

    expect(deps.prepare).toHaveBeenCalledWith(expect.objectContaining({
      uploadId: UPLOAD_ID,
      retry: true,
    }))
    expect(deps.upload).not.toHaveBeenCalled()
    expect(deps.complete).not.toHaveBeenCalled()
  })

  it('keeps the failed candidate retryable when storage rejects the upload', async () => {
    const deps = dependencies()
    deps.upload.mockResolvedValue({ error: new Error('temporary storage failure') })

    await expect(uploadSubmissionCandidate({
      submissionAnswerId: ANSWER_ID,
      candidate,
      retry: true,
    }, deps)).rejects.toThrow('temporary storage failure')

    expect(deps.complete).not.toHaveBeenCalled()
  })

  it('deduplicates one immutable object reference without dropping other files', () => {
    const other = { ...submitted, url: `${submitted.url}?other=1`, name: 'other.pdf' }
    expect(mergeSubmittedFiles([submitted], [submitted, other])).toEqual([submitted, other])
  })
})
