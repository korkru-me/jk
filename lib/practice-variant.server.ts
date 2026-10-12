import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { isUuid } from '@/lib/practice-library-contracts'
import { SHARED_RANDOM_SEED_MAX, isSharedRandomSeed } from '@/lib/math/shared-random'

const RECEIPT_VERSION = 1
const RECEIPT_KIND = 'practice-question-variant'
const RECEIPT_TTL_MS = 4 * 60 * 60 * 1000
const MIN_SECRET_LENGTH = 32

export interface PracticeVariantIdentity {
  actorId: string
  libraryId: string
  questionId: string
  questionRevision: string
}

export interface PracticeVariantReceiptPayload {
  version: typeof RECEIPT_VERSION
  kind: typeof RECEIPT_KIND
  /** Keyed identity/revision binding; the raw revision is an answer-key oracle. */
  binding: string
  nonce: string
  issuedAt: number
  expiresAt: number
}

export interface VerifiedPracticeVariantReceipt extends PracticeVariantReceiptPayload {
  /** Derived only after signature verification; never serialized for the browser. */
  seed: number
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url')
}

function decode(value: string): string | null {
  try {
    return Buffer.from(value, 'base64url').toString('utf8')
  } catch {
    return null
  }
}

function signature(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest()
}

function identityBinding(identity: PracticeVariantIdentity, secret: string): string {
  return createHmac('sha256', secret)
    .update('practice-variant-identity\0')
    .update(identity.actorId)
    .update('\0')
    .update(identity.libraryId)
    .update('\0')
    .update(identity.questionId)
    .update('\0')
    .update(identity.questionRevision)
    .digest('base64url')
}

function isIdentity(value: PracticeVariantIdentity): boolean {
  return isUuid(value.actorId)
    && isUuid(value.libraryId)
    && isUuid(value.questionId)
    && /^[0-9a-f]{64}$/.test(value.questionRevision)
}

function parsePayload(value: unknown): PracticeVariantReceiptPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const expectedKeys = [
    'binding', 'expiresAt', 'issuedAt', 'kind', 'nonce', 'version',
  ]
  const keys = Object.keys(row).sort()
  if (keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])) return null

  if (row.version !== RECEIPT_VERSION || row.kind !== RECEIPT_KIND) return null
  if (typeof row.binding !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(row.binding)) return null
  if (typeof row.nonce !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(row.nonce)) return null
  if (!Number.isSafeInteger(row.issuedAt) || !Number.isSafeInteger(row.expiresAt)) return null
  if ((row.expiresAt as number) <= (row.issuedAt as number)
    || (row.expiresAt as number) - (row.issuedAt as number) > RECEIPT_TTL_MS) return null

  return row as unknown as PracticeVariantReceiptPayload
}

/** Returns null unless the deployment configured a server-only signing key. */
export function practiceVariantSecret(
  environment: NodeJS.ProcessEnv | { PRACTICE_VARIANT_SECRET?: string },
): string | null {
  const secret = 'PRACTICE_VARIANT_SECRET' in environment
    ? environment.PRACTICE_VARIANT_SECRET
    : undefined
  return typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH
    ? secret
    : null
}

/** A public, single-use identifier. It carries no seed or answer-key data. */
export function createPracticeVariantNonce(): string {
  return randomBytes(16).toString('base64url')
}

/**
 * Derives the deterministic renderer seed with a server-only key. The nonce
 * may travel to the browser, but it is computationally useless for recovering
 * the shuffle without PRACTICE_VARIANT_SECRET.
 */
export function derivePracticeVariantSeed(
  identity: PracticeVariantIdentity,
  nonce: string,
  secret: string,
): number {
  if (!isIdentity(identity)) throw new Error('invalid practice variant identity')
  if (!/^[A-Za-z0-9_-]{22}$/.test(nonce)) throw new Error('invalid practice variant nonce')
  if (secret.length < MIN_SECRET_LENGTH) throw new Error('practice variant secret is unavailable')
  const digest = createHmac('sha256', secret)
    .update('practice-variant-seed\0')
    .update(identity.actorId)
    .update('\0')
    .update(identity.libraryId)
    .update('\0')
    .update(identity.questionId)
    .update('\0')
    .update(identity.questionRevision)
    .update('\0')
    .update(nonce)
    .digest()
  return (digest.readUInt32BE(0) % SHARED_RANDOM_SEED_MAX) + 1
}

export function signPracticeVariantReceipt(
  identity: PracticeVariantIdentity,
  nonce: string,
  secret: string,
  now = Date.now(),
): string {
  if (!isIdentity(identity)) throw new Error('invalid practice variant identity')
  if (!/^[A-Za-z0-9_-]{22}$/.test(nonce)) throw new Error('invalid practice variant nonce')
  if (secret.length < MIN_SECRET_LENGTH) throw new Error('practice variant secret is unavailable')
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('invalid practice variant time')

  const payload: PracticeVariantReceiptPayload = {
    version: RECEIPT_VERSION,
    kind: RECEIPT_KIND,
    binding: identityBinding(identity, secret),
    nonce,
    issuedAt: now,
    expiresAt: now + RECEIPT_TTL_MS,
  }
  const body = encode(JSON.stringify(payload))
  return `${body}.${encode(signature(body, secret))}`
}

/**
 * Authenticates a browser-carried nonce and binds it to the current session,
 * library, and question. The shuffle seed is derived only after verification
 * and is never serialized into the receipt.
 */
export function verifyPracticeVariantReceipt(
  receipt: string,
  expected: PracticeVariantIdentity,
  secret: string,
  now = Date.now(),
): VerifiedPracticeVariantReceipt | null {
  if (!isIdentity(expected) || secret.length < MIN_SECRET_LENGTH
    || typeof receipt !== 'string' || receipt.length > 4096) return null
  const parts = receipt.split('.')
  if (parts.length !== 2) return null
  const [body, providedText] = parts
  let provided: Buffer
  try {
    provided = Buffer.from(providedText, 'base64url')
  } catch {
    return null
  }
  const expectedSignature = signature(body, secret)
  if (provided.length !== expectedSignature.length
    || !timingSafeEqual(provided, expectedSignature)) return null

  const json = decode(body)
  if (!json) return null
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  const payload = parsePayload(raw)
  if (!payload
    || now < payload.issuedAt - 60_000
    || now > payload.expiresAt) return null
  const providedBinding = Buffer.from(payload.binding, 'base64url')
  const expectedBinding = Buffer.from(identityBinding(expected, secret), 'base64url')
  if (providedBinding.length !== expectedBinding.length
    || !timingSafeEqual(providedBinding, expectedBinding)) return null
  const seed = derivePracticeVariantSeed(expected, payload.nonce, secret)
  if (!isSharedRandomSeed(seed)) return null
  return { ...payload, seed }
}
