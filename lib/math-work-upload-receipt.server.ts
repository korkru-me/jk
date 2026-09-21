import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WorkArtifactSource, WorkPreviewFormat } from '@/lib/math-work'

const RECEIPT_VERSION = 1 as const
const RECEIPT_KIND = 'korkru-math-work-upload' as const
const DOMAIN = 'korkru/math-work/upload-receipt/v1'
const MAX_RECEIPT_LIFETIME_MS = 2 * 60 * 60 * 1_000

interface ReceiptBase {
  version: typeof RECEIPT_VERSION
  kind: typeof RECEIPT_KIND
  actorId: string
  uploadId: string
  previewFormat: WorkPreviewFormat
  issuedAt: number
  expiresAt: number
}

export type WorkUploadReceiptContext = (
  | {
      target: 'student'
      submissionAnswerId: string
      partKey: string
      sourceType: WorkArtifactSource
      includeScene: boolean
    }
  | {
      target: 'teacher'
      assignmentId: string
      questionId: string
      slot: number
    }
) & {
  actorId: string
  uploadId: string
  previewFormat: WorkPreviewFormat
}

type WorkUploadReceiptPayload = ReceiptBase & (
  | Extract<WorkUploadReceiptContext, { target: 'student' }>
  | Extract<WorkUploadReceiptContext, { target: 'teacher' }>
)

function key(secret: string): Buffer {
  return createHmac('sha256', secret).update(DOMAIN).digest()
}

function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', key(secret)).update(payload).digest()
}

function boundedString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 500
}

function parsePayload(value: unknown): WorkUploadReceiptPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const payload = value as Record<string, unknown>
  if (
    payload.version !== RECEIPT_VERSION
    || payload.kind !== RECEIPT_KIND
    || !boundedString(payload.actorId)
    || !boundedString(payload.uploadId)
    || (payload.previewFormat !== 'webp' && payload.previewFormat !== 'png')
    || !Number.isSafeInteger(payload.issuedAt)
    || !Number.isSafeInteger(payload.expiresAt)
    || (payload.expiresAt as number) <= (payload.issuedAt as number)
    || (payload.expiresAt as number) - (payload.issuedAt as number) > MAX_RECEIPT_LIFETIME_MS
  ) return null
  if (payload.target === 'student') {
    if (
      !boundedString(payload.submissionAnswerId)
      || !boundedString(payload.partKey)
      || (payload.sourceType !== 'scratchpad' && payload.sourceType !== 'photo')
      || typeof payload.includeScene !== 'boolean'
    ) return null
  } else if (payload.target === 'teacher') {
    if (
      !boundedString(payload.assignmentId)
      || !boundedString(payload.questionId)
      || !Number.isInteger(payload.slot)
      || (payload.slot as number) < 1
      || (payload.slot as number) > 5
    ) return null
  } else {
    return null
  }
  return payload as unknown as WorkUploadReceiptPayload
}

function sameContext(payload: WorkUploadReceiptPayload, expected: WorkUploadReceiptContext): boolean {
  if (
    payload.target !== expected.target
    || payload.actorId !== expected.actorId
    || payload.uploadId !== expected.uploadId
    || payload.previewFormat !== expected.previewFormat
  ) return false
  if (payload.target === 'student' && expected.target === 'student') {
    return payload.submissionAnswerId === expected.submissionAnswerId
      && payload.partKey === expected.partKey
      && payload.sourceType === expected.sourceType
      && payload.includeScene === expected.includeScene
  }
  return payload.target === 'teacher' && expected.target === 'teacher'
    && payload.assignmentId === expected.assignmentId
    && payload.questionId === expected.questionId
    && payload.slot === expected.slot
}

export function signWorkUploadReceipt(
  context: WorkUploadReceiptContext,
  secret: string,
  now = Date.now(),
): string {
  const payload: WorkUploadReceiptPayload = {
    version: RECEIPT_VERSION,
    kind: RECEIPT_KIND,
    ...context,
    issuedAt: now,
    expiresAt: now + MAX_RECEIPT_LIFETIME_MS,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signature(encoded, secret).toString('base64url')}`
}

export function verifyWorkUploadReceipt(
  token: string,
  expected: WorkUploadReceiptContext,
  secret: string,
  now = Date.now(),
): boolean {
  if (!token || token.length > 4_096 || !secret) return false
  const pieces = token.split('.')
  if (pieces.length !== 2 || !pieces[0] || !pieces[1]) return false
  let supplied: Buffer
  let payload: WorkUploadReceiptPayload | null
  try {
    supplied = Buffer.from(pieces[1], 'base64url')
    payload = parsePayload(JSON.parse(Buffer.from(pieces[0], 'base64url').toString('utf8')))
  } catch {
    return false
  }
  const calculated = signature(pieces[0], secret)
  if (supplied.byteLength !== calculated.byteLength || !timingSafeEqual(supplied, calculated)) return false
  return Boolean(payload && payload.expiresAt >= now && sameContext(payload, expected))
}
