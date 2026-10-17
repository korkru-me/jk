import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { emailSchema } from './validation'

export const RECOVERY_INTENT_SECONDS = 3600
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/
const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/

export function createRecoveryNonce() {
  return randomBytes(32).toString('base64url')
}

export function signRecoveryIntent(secret: string, email: string, nonce: string, now = Date.now(), expectedUserId?: string) {
  const recipient = emailSchema.safeParse(email)
  if (secret.length < 32 || !recipient.success || !NONCE_PATTERN.test(nonce) || !Number.isFinite(now)
    || (expectedUserId !== undefined && (typeof expectedUserId !== 'string' || expectedUserId.length < 1 || expectedUserId.length > 128))) return null
  const payload = Buffer.from(JSON.stringify({
    recipient: recipient.data,
    ...(expectedUserId === undefined ? {} : { expectedUserId }),
    nonceHash: createHash('sha256').update(nonce).digest('hex'),
    issuedAt: now,
    expiresAt: now + RECOVERY_INTENT_SECONDS * 1000,
  })).toString('base64url')
  return `${payload}.${createHmac('sha256', secret).update(`password-recovery-intent-v1:${payload}`).digest('hex')}`
}

/** Reads the recipient only after validating the signed browser intent and
 * the secret nonce delivered in the recovery email. Cookie contents alone do
 * not reveal that nonce or authorize password recovery.
 */
function readRecoveryIntent(secret: string, value: string, nonce: string, now = Date.now()): { recipient: string; expectedUserId?: string } | null {
  if (secret.length < 32 || value.length > 2048 || !NONCE_PATTERN.test(nonce) || !Number.isFinite(now)) return null
  const [payload, signature, extra] = value.split('.')
  if (!payload || !signature || extra !== undefined || !SIGNATURE_PATTERN.test(signature)) return null
  const expected = createHmac('sha256', secret).update(`password-recovery-intent-v1:${payload}`).digest()
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return null
  try {
    const data: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (!data || typeof data !== 'object') return null
    const intent = data as Record<string, unknown>
    const recipient = emailSchema.safeParse(intent.recipient)
    if (!recipient.success || recipient.data !== intent.recipient
      || (intent.expectedUserId !== undefined && (typeof intent.expectedUserId !== 'string' || intent.expectedUserId.length < 1 || intent.expectedUserId.length > 128))
      || typeof intent.nonceHash !== 'string' || !SIGNATURE_PATTERN.test(intent.nonceHash)
      || typeof intent.issuedAt !== 'number' || !Number.isFinite(intent.issuedAt) || intent.issuedAt > now
      || typeof intent.expiresAt !== 'number' || !Number.isFinite(intent.expiresAt) || intent.expiresAt <= now
      || intent.expiresAt - intent.issuedAt !== RECOVERY_INTENT_SECONDS * 1000) return null
    const nonceHash = createHash('sha256').update(nonce).digest()
    if (!timingSafeEqual(nonceHash, Buffer.from(intent.nonceHash, 'hex'))) return null
    return { recipient: recipient.data, ...(typeof intent.expectedUserId === 'string' ? { expectedUserId: intent.expectedUserId } : {}) }
  } catch {
    return null
  }
}

export function recoveryIntentRecipient(secret: string, value: string, nonce: string, now = Date.now()): string | null {
  return readRecoveryIntent(secret, value, nonce, now)?.recipient ?? null
}

export function verifyRecoveryIntent(secret: string, value: string, nonce: string, email: string, now = Date.now(), verifiedUserId?: string) {
  const recipient = emailSchema.safeParse(email)
  const intent = readRecoveryIntent(secret, value, nonce, now)
  return recipient.success && intent !== null && intent.recipient === recipient.data
    && (intent.expectedUserId === undefined || intent.expectedUserId === verifiedUserId)
}
