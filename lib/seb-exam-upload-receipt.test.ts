import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createSebExamContextClaims } from '@/lib/seb-exam-context-core'
import {
  WAITING_EXAM_UPLOAD_RECEIPT_TTL_MS,
  signWaitingExamUploadReceipt,
  validWaitingExamUploadTarget,
  verifyWaitingExamUploadReceipt,
  type WaitingExamUploadTarget,
} from '@/lib/seb-exam-upload-receipt'
import { MAX_WORK_PREVIEW_BYTES } from '@/lib/math-work'

const USER = '10000000-0000-4000-8000-000000000001'
const ASSIGNMENT = '30000000-0000-4000-8000-000000000003'
const SUBMISSION = '40000000-0000-4000-8000-000000000004'
const ANSWER = '50000000-0000-4000-8000-000000000005'
const UPLOAD = '60000000-0000-4000-8000-000000000006'
const SECRET = 'synthetic-receipt-secret-fixture-not-real'
const NOW = 1_000_000
const context = createSebExamContextClaims({
  assignmentId: ASSIGNMENT, revision: 3,
  releaseId: `asr-${ASSIGNMENT.replaceAll('-', '')}-r3-${'a'.repeat(16)}`,
}, { userId: USER, contextId: 'd'.repeat(32), now: NOW })
const attachment: WaitingExamUploadTarget = {
  submissionId: SUBMISSION, answerId: ANSWER, bucket: 'work-images',
  path: `${USER}/${SUBMISSION}/${ANSWER}/${UPLOAD}.png`,
  mimeType: 'image/png', maxBytes: 5 * 1024 * 1024, exactSize: 64,
}
const preview: WaitingExamUploadTarget = {
  submissionId: SUBMISSION, answerId: ANSWER, bucket: 'math-work-artifacts',
  path: `students/${USER}/${SUBMISSION}/${ANSWER}/${UPLOAD}/preview.webp`,
  mimeType: 'image/webp', maxBytes: MAX_WORK_PREVIEW_BYTES, exactSize: null,
}

function forge(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', SECRET).update(`korkru/seb-exam/upload-receipt/v1\0${encoded}`).digest('base64url')
  return `${encoded}.${signature}`
}

describe('bounded waiting exam upload receipts', () => {
  it.each([attachment, preview])('signs only an exact prepared student/attempt/answer target', target => {
    const token = signWaitingExamUploadReceipt(context, target, SECRET, NOW)!
    const result = verifyWaitingExamUploadReceipt(token, context, SECRET, NOW)!
    expect(result).toMatchObject(target)
    expect(result).toMatchObject({ contextId: context.contextId, userId: USER, assignmentId: ASSIGNMENT,
      revision: 3, releaseId: context.releaseId, issuedAt: NOW, expiresAt: NOW + WAITING_EXAM_UPLOAD_RECEIPT_TTL_MS })
    expect(Object.isFrozen(result)).toBe(true)
    expect(token).not.toContain(SECRET)
    expect(JSON.stringify(result)).not.toMatch(/configKey|browserExamKey|hashed.*Password|uploadToken/)
  })

  it('accepts only canonical MIME-matched bounded file paths', () => {
    expect(validWaitingExamUploadTarget(attachment, USER)).toBe(true)
    expect(validWaitingExamUploadTarget(preview, USER)).toBe(true)
    expect(validWaitingExamUploadTarget({ ...attachment, bucket: 'submission-files', maxBytes: 10 * 1024 * 1024 }, USER)).toBe(true)
    for (const override of [
      { bucket: 'question-images' }, { path: `${USER}/${SUBMISSION}/${ANSWER}/../${UPLOAD}.png` },
      { path: `${USER}/${SUBMISSION}/other/${UPLOAD}.png` }, { path: `${USER}/${SUBMISSION}/${ANSWER}/${UPLOAD}.svg` },
      { mimeType: 'image/svg+xml' }, { mimeType: 'image/jpeg' }, { mimeType: 'toString' }, { mimeType: '__proto__' }, { maxBytes: 10 * 1024 * 1024 },
      { exactSize: null }, { exactSize: 0 }, { exactSize: 5 * 1024 * 1024 + 1 }, { exactSize: 1.5 },
      { answerId: 'invalid' }, { submissionId: 'invalid' },
    ]) expect(validWaitingExamUploadTarget({ ...attachment, ...override }, USER)).toBe(false)
    for (const override of [
      { path: preview.path.replace('students/', 'teachers/') }, { path: preview.path.replace('/preview.webp', '/scene.json') },
      { mimeType: 'image/png' }, { exactSize: 100 }, { maxBytes: MAX_WORK_PREVIEW_BYTES + 1 },
    ]) expect(validWaitingExamUploadTarget({ ...preview, ...override }, USER)).toBe(false)
  })

  it('fails closed on missing/short secret, unbound context, expired context, and wrong caller-owned path', () => {
    expect(signWaitingExamUploadReceipt(context, attachment, '', NOW)).toBeNull()
    expect(signWaitingExamUploadReceipt(context, attachment, 'short', NOW)).toBeNull()
    expect(signWaitingExamUploadReceipt({ ...context, userId: null }, attachment, SECRET, NOW)).toBeNull()
    expect(signWaitingExamUploadReceipt(context, attachment, SECRET, context.expiresAt)).toBeNull()
    expect(signWaitingExamUploadReceipt(context, { ...attachment, path: attachment.path.replace(USER, ASSIGNMENT) }, SECRET, NOW)).toBeNull()
  })

  it('binds context/account/scope generation and rejects expiry, tamper, noncanonical encoding and wrong secret', () => {
    const token = signWaitingExamUploadReceipt(context, attachment, SECRET, NOW)!
    expect(verifyWaitingExamUploadReceipt(token, context, SECRET, NOW + WAITING_EXAM_UPLOAD_RECEIPT_TTL_MS)).toBeNull()
    for (const changed of [
      { ...context, contextId: 'e'.repeat(32) }, { ...context, userId: ASSIGNMENT },
      { ...context, expiresAt: context.expiresAt + 1 }, { ...context, issuedAt: context.issuedAt + 1 },
      { ...context, revision: 4, releaseId: context.releaseId.replace('-r3-', '-r4-') },
    ]) expect(verifyWaitingExamUploadReceipt(token, changed, SECRET, NOW)).toBeNull()
    for (const bad of [token + '.', token.replace(/^./, 'x'), token.replace('.', '=.'), 'a.b', '', 'x'.repeat(4097)]) {
      expect(verifyWaitingExamUploadReceipt(bad, context, SECRET, NOW)).toBeNull()
    }
    expect(verifyWaitingExamUploadReceipt(token, context, SECRET + 'other', NOW)).toBeNull()
  })

  it('strictly rejects malformed signed payloads, unknown fields, long lifetimes and future receipts', () => {
    const token = signWaitingExamUploadReceipt(context, attachment, SECRET, NOW)!
    const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()) as Record<string, unknown>
    for (const override of [
      { extra: true }, { version: 2 }, { kind: 'other' }, { expiresAt: NOW },
      { expiresAt: NOW + WAITING_EXAM_UPLOAD_RECEIPT_TTL_MS + 1 },
      { issuedAt: NOW + 60_001 }, { contextExpiresAt: context.expiresAt - 1 },
      { path: preview.path }, { userId: null }, { exactSize: null },
    ]) expect(verifyWaitingExamUploadReceipt(forge({ ...payload, ...override }), context, SECRET, NOW)).toBeNull()
    const { path: _path, ...missing } = payload
    expect(verifyWaitingExamUploadReceipt(forge(missing), context, SECRET, NOW)).toBeNull()
  })

  it('never serializes extra prepared fields and caps expiry at the current context', () => {
    const shortContext = { ...context, expiresAt: NOW + 1000 }
    const token = signWaitingExamUploadReceipt(shortContext, { ...attachment, configKey: 'not-copied' } as WaitingExamUploadTarget, SECRET, NOW)!
    const payload = verifyWaitingExamUploadReceipt(token, shortContext, SECRET, NOW)!
    expect(payload.expiresAt).toBe(shortContext.expiresAt)
    expect(payload).not.toHaveProperty('configKey')
  })
})
