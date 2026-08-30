import { createHmac, timingSafeEqual } from 'node:crypto'

export type AndroidExamMode = 'blocked' | 'monitored'
export type AndroidApprovalStatus = 'pending' | 'approved' | 'denied'

export interface AndroidExamSessionClaims {
  kind: 'android_exam_session'
  userId: string
  assignmentId: string
  approvedBy: string
  approvedAt: number
  issuedAt: number
  expiresAt: number
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function signature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(`android-exam:${payload}`, 'utf8').digest('base64url')
}

export function signAndroidExamSession(claims: AndroidExamSessionClaims, secret: string) {
  if (secret.trim().length < 32) throw new Error('Exam session secret is too short')
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
  return `${payload}.${signature(payload, secret)}`
}

export function verifyAndroidExamSession(
  token: string,
  secret: string,
  now = Date.now(),
): AndroidExamSessionClaims | null {
  if (secret.trim().length < 32 || token.length > 2_000) return null
  const [payload, receivedSignature, extra] = token.split('.')
  if (!payload || !receivedSignature || extra) return null
  if (!safeEqual(receivedSignature, signature(payload, secret))) return null

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<AndroidExamSessionClaims>
    if (
      claims.kind !== 'android_exam_session'
      || !UUID_PATTERN.test(claims.userId ?? '')
      || !UUID_PATTERN.test(claims.assignmentId ?? '')
      || !UUID_PATTERN.test(claims.approvedBy ?? '')
      || !Number.isInteger(claims.approvedAt)
      || !Number.isInteger(claims.issuedAt)
      || !Number.isInteger(claims.expiresAt)
      || (claims.approvedAt as number) > (claims.issuedAt as number)
      || (claims.issuedAt as number) > now + 60_000
      || (claims.expiresAt as number) <= now
      || (claims.expiresAt as number) <= (claims.issuedAt as number)
      || (claims.expiresAt as number) - (claims.issuedAt as number) > 12 * 60 * 60_000
    ) return null
    return claims as AndroidExamSessionClaims
  } catch {
    return null
  }
}

/**
 * A user agent is only a routing hint. It is deliberately never treated as
 * proof of Android; the physical teacher approval is the actual control.
 */
export function isLikelyAndroidUserAgent(userAgent: string | null | undefined) {
  return typeof userAgent === 'string' && /\bAndroid\b/i.test(userAgent)
}

export function createAndroidExamSessionClaims(input: {
  userId: string
  assignmentId: string
  approvedBy: string
  approvedAt: number
  approvalExpiresAt: number
  now?: number
}): AndroidExamSessionClaims {
  const now = input.now ?? Date.now()
  return {
    kind: 'android_exam_session',
    userId: input.userId,
    assignmentId: input.assignmentId,
    approvedBy: input.approvedBy,
    approvedAt: input.approvedAt,
    issuedAt: now,
    expiresAt: Math.min(input.approvalExpiresAt, now + 12 * 60 * 60_000),
  }
}
