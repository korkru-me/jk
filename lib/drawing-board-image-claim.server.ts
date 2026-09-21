import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import {
  QUESTION_IMAGE_CLAIM_KIND,
  QUESTION_IMAGE_CLAIM_VERSION,
  type QuestionImageClaimPayload,
} from '@/lib/drawing-board-image-claim'
import type { TeacherImageTrustDecision } from '@/lib/drawing-board-policy'

const DOMAIN = 'korkru/drawing-board/question-image/v1'

function encodeBase64Url(value: string | Uint8Array): string {
  return Buffer.from(value).toString('base64url')
}
function claimKey(secret: string): Buffer {
  return createHmac('sha256', secret).update(DOMAIN).digest()
}

function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', claimKey(secret)).update(payload).digest()
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 2_000
}

function parsePayload(value: unknown): QuestionImageClaimPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const payload = value as Record<string, unknown>
  if (
    payload.version !== QUESTION_IMAGE_CLAIM_VERSION
    || payload.kind !== QUESTION_IMAGE_CLAIM_KIND
    || !isString(payload.actorId)
    || !isString(payload.assignmentId)
    || !isString(payload.questionId)
    || !isString(payload.sourcePath)
    || !isString(payload.sourceSha256)
    || !isString(payload.fileId)
    || !isString(payload.mimeType)
    || !isString(payload.dataSha256)
    || typeof payload.issuedAt !== 'number'
    || typeof payload.expiresAt !== 'number'
    || !Number.isSafeInteger(payload.issuedAt)
    || !Number.isSafeInteger(payload.expiresAt)
    || payload.expiresAt <= payload.issuedAt
  ) return null
  return payload as unknown as QuestionImageClaimPayload
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function signQuestionImageClaim(
  payload: QuestionImageClaimPayload,
  secret: string,
): string {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload))
  return `${encodedPayload}.${encodeBase64Url(signature(encodedPayload, secret))}`
}

export interface ExpectedQuestionImageClaim {
  actorId: string
  assignmentId: string
  questionId: string
  fileId: string
  mimeType: string
  dataSha256: string
}

export function verifyQuestionImageClaim(
  token: string | null,
  expected: ExpectedQuestionImageClaim,
  secret: string,
  now = Date.now(),
): TeacherImageTrustDecision {
  if (!token || !secret) return 'invalid'
  const pieces = token.split('.')
  if (pieces.length !== 2 || !pieces[0] || !pieces[1]) return 'invalid'
  let supplied: Buffer
  let payload: QuestionImageClaimPayload | null
  try {
    supplied = Buffer.from(pieces[1], 'base64url')
    payload = parsePayload(JSON.parse(Buffer.from(pieces[0], 'base64url').toString('utf8')))
  } catch {
    return 'invalid'
  }
  const calculated = signature(pieces[0], secret)
  if (supplied.byteLength !== calculated.byteLength || !timingSafeEqual(supplied, calculated)) return 'invalid'
  if (!payload) return 'invalid'
  if (
    payload.actorId !== expected.actorId
    || payload.assignmentId !== expected.assignmentId
    || payload.questionId !== expected.questionId
    || payload.fileId !== expected.fileId
    || payload.mimeType !== expected.mimeType
    || payload.dataSha256 !== expected.dataSha256
  ) return 'invalid'
  return payload.expiresAt < now ? 'expired-authentic' : 'valid'
}
