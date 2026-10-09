import { createHmac, timingSafeEqual } from 'node:crypto'
import { isSebExamContextClaims, type SebExamContextClaims } from '@/lib/seb-exam-context-core'
import { examAttachmentDefinition } from '@/lib/exam-attachment'
import { MAX_WORK_PREVIEW_BYTES, MATH_WORK_BUCKET } from '@/lib/math-work'

export const WAITING_EXAM_UPLOAD_RECEIPT_TTL_MS = 10 * 60 * 1000
const DOMAIN = 'korkru/seb-exam/upload-receipt/v1'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const UUID_PATTERN = new RegExp(`^${UUID}$`)
const BASE64URL = /^[A-Za-z0-9_-]+$/

export type WaitingExamUploadTarget = Readonly<{
  submissionId: string
  answerId: string
  bucket: 'work-images' | 'submission-files' | typeof MATH_WORK_BUCKET
  path: string
  mimeType: string
  maxBytes: number
  exactSize: number | null
}>

export type WaitingExamUploadReceipt = WaitingExamUploadTarget & Readonly<{
  version: 1
  kind: 'seb_exam_upload'
  assignmentId: string
  revision: number
  releaseId: string
  contextId: string
  userId: string
  contextIssuedAt: number
  contextExpiresAt: number
  issuedAt: number
  expiresAt: number
}>

const KEYS = [
  'version', 'kind', 'assignmentId', 'revision', 'releaseId', 'contextId', 'userId',
  'contextIssuedAt', 'contextExpiresAt', 'issuedAt', 'expiresAt',
  'submissionId', 'answerId', 'bucket', 'path', 'mimeType', 'maxBytes', 'exactSize',
] as const

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

function liveContext(context: SebExamContextClaims, now: number) {
  return isSebExamContextClaims(context) && context.userId !== null
    && Number.isSafeInteger(now) && now >= 0 && context.issuedAt <= now + 60_000 && context.expiresAt > now
}

function signature(encoded: string, secret: string) {
  return createHmac('sha256', secret).update(`${DOMAIN}\0${encoded}`).digest()
}

/** Only deterministic current student/attempt/answer paths can be signed. */
export function validWaitingExamUploadTarget(target: unknown, userId: string): target is WaitingExamUploadTarget {
  if (!record(target) || !UUID_PATTERN.test(userId)
    || typeof target.submissionId !== 'string' || !UUID_PATTERN.test(target.submissionId)
    || typeof target.answerId !== 'string' || !UUID_PATTERN.test(target.answerId)
    || typeof target.path !== 'string' || target.path.length > 500
    || typeof target.mimeType !== 'string' || typeof target.maxBytes !== 'number'
    || !Number.isSafeInteger(target.maxBytes) || target.maxBytes < 1
    || (target.exactSize !== null && (typeof target.exactSize !== 'number'
      || !Number.isSafeInteger(target.exactSize) || target.exactSize < 1 || target.exactSize > target.maxBytes))) return false
  const prefix = `${userId}/${target.submissionId}/${target.answerId}`
  if (target.bucket === MATH_WORK_BUCKET) {
    const extension = target.mimeType === 'image/png' ? 'png' : target.mimeType === 'image/webp' ? 'webp' : null
    return extension !== null && target.maxBytes === MAX_WORK_PREVIEW_BYTES && target.exactSize === null
      && new RegExp(`^students/${prefix}/${UUID}/preview\\.${extension}$`).test(target.path)
  }
  const kind = target.bucket === 'work-images' ? 'work_image' : target.bucket === 'submission-files' ? 'submission_file' : null
  if (!kind) return false
  const definition = examAttachmentDefinition(kind)
  if (!Object.hasOwn(definition.mimeExtensions, target.mimeType)) return false
  const extension = definition.mimeExtensions[target.mimeType]
  return !!extension && target.maxBytes === definition.maxBytes && target.exactSize !== null
    && new RegExp(`^${prefix}/${UUID}\\.${extension}$`).test(target.path)
}

export function signWaitingExamUploadReceipt(
  context: SebExamContextClaims,
  target: WaitingExamUploadTarget,
  secret: string,
  now = Date.now(),
): string | null {
  if (typeof secret !== 'string' || secret.length < 32 || !liveContext(context, now)
    || !validWaitingExamUploadTarget(target, context.userId!)) return null
  const payload: WaitingExamUploadReceipt = {
    version: 1, kind: 'seb_exam_upload',
    assignmentId: context.assignmentId, revision: context.revision, releaseId: context.releaseId,
    contextId: context.contextId, userId: context.userId!,
    contextIssuedAt: context.issuedAt, contextExpiresAt: context.expiresAt,
    issuedAt: now, expiresAt: Math.min(context.expiresAt, now + WAITING_EXAM_UPLOAD_RECEIPT_TTL_MS),
    // Explicit fields: additional caller properties never enter the token.
    submissionId: target.submissionId, answerId: target.answerId,
    bucket: target.bucket, path: target.path, mimeType: target.mimeType,
    maxBytes: target.maxBytes, exactSize: target.exactSize,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signature(encoded, secret).toString('base64url')}`
}

export function verifyWaitingExamUploadReceipt(
  token: unknown,
  context: SebExamContextClaims,
  secret: string,
  now = Date.now(),
): WaitingExamUploadReceipt | null {
  if (typeof token !== 'string' || token.length > 4096 || typeof secret !== 'string' || secret.length < 32
    || !liveContext(context, now)) return null
  const pieces = token.split('.')
  if (pieces.length !== 2 || !BASE64URL.test(pieces[0]) || !BASE64URL.test(pieces[1]) || pieces[1].length !== 43) return null
  try {
    const encoded = Buffer.from(pieces[0], 'base64url')
    const supplied = Buffer.from(pieces[1], 'base64url')
    if (encoded.toString('base64url') !== pieces[0] || supplied.toString('base64url') !== pieces[1]
      || supplied.length !== 32 || !timingSafeEqual(supplied, signature(pieces[0], secret))) return null
    const text = encoded.toString('utf8')
    if (!Buffer.from(text).equals(encoded)) return null
    const payload: unknown = JSON.parse(text)
    if (!record(payload) || Reflect.ownKeys(payload).length !== KEYS.length
      || !KEYS.every(key => Object.hasOwn(payload, key))
      || payload.version !== 1 || payload.kind !== 'seb_exam_upload'
      || payload.assignmentId !== context.assignmentId || payload.revision !== context.revision
      || payload.releaseId !== context.releaseId || payload.contextId !== context.contextId
      || payload.userId !== context.userId || payload.contextIssuedAt !== context.issuedAt
      || payload.contextExpiresAt !== context.expiresAt
      || typeof payload.issuedAt !== 'number' || !Number.isSafeInteger(payload.issuedAt)
      || payload.issuedAt < 0 || payload.issuedAt > now + 60_000
      || typeof payload.expiresAt !== 'number' || !Number.isSafeInteger(payload.expiresAt)
      || payload.expiresAt <= now || payload.expiresAt <= payload.issuedAt
      || payload.expiresAt > context.expiresAt
      || payload.expiresAt - payload.issuedAt > WAITING_EXAM_UPLOAD_RECEIPT_TTL_MS
      || !validWaitingExamUploadTarget(payload, context.userId!)) return null
    return Object.freeze(payload as unknown as WaitingExamUploadReceipt)
  } catch { return null }
}
