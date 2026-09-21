import { describe, expect, it } from 'vitest'
import {
  signWorkUploadReceipt,
  verifyWorkUploadReceipt,
  type WorkUploadReceiptContext,
} from '@/lib/math-work-upload-receipt.server'

const secret = 'receipt-secret-used-only-for-unit-tests'
const now = 1_900_000_000_000

function student(overrides: Partial<WorkUploadReceiptContext> = {}): WorkUploadReceiptContext {
  return {
    target: 'student',
    actorId: 'student-1',
    submissionAnswerId: 'answer-1',
    partKey: 'part:0',
    sourceType: 'scratchpad',
    includeScene: true,
    uploadId: 'upload-1',
    previewFormat: 'webp',
    ...overrides,
  } as WorkUploadReceiptContext
}

describe('math-work upload receipts', () => {
  it('binds a student prepare to the exact answer part and upload shape', () => {
    const context = student()
    const token = signWorkUploadReceipt(context, secret, now)
    expect(verifyWorkUploadReceipt(token, context, secret, now + 1)).toBe(true)
    expect(verifyWorkUploadReceipt(token, student({ partKey: 'part:1' }), secret, now + 1)).toBe(false)
    expect(verifyWorkUploadReceipt(token, student({ uploadId: 'upload-2' }), secret, now + 1)).toBe(false)
    expect(verifyWorkUploadReceipt(token, student({ previewFormat: 'png' }), secret, now + 1)).toBe(false)
  })

  it('binds teacher receipts to assignment, question and slot', () => {
    const context: WorkUploadReceiptContext = {
      target: 'teacher', actorId: 'teacher-1', assignmentId: 'assignment-1',
      questionId: 'question-1', slot: 3, uploadId: 'upload-1', previewFormat: 'png',
    }
    const token = signWorkUploadReceipt(context, secret, now)
    expect(verifyWorkUploadReceipt(token, context, secret, now)).toBe(true)
    expect(verifyWorkUploadReceipt(token, { ...context, slot: 4 }, secret, now)).toBe(false)
  })

  it('rejects expired, tampered and differently signed receipts', () => {
    const context = student()
    const token = signWorkUploadReceipt(context, secret, now)
    expect(verifyWorkUploadReceipt(token, context, secret, now + 2 * 60 * 60 * 1_000 + 1)).toBe(false)
    expect(verifyWorkUploadReceipt(`${token.slice(0, -1)}x`, context, secret, now)).toBe(false)
    expect(verifyWorkUploadReceipt(token, context, 'another-secret', now)).toBe(false)
  })
})
