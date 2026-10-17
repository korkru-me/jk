import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const RECOVERY_GRANT_SECONDS = 600

export function signRecoveryGrant(secret: string, userId: string, accessToken: string, now = Date.now()) {
  if (secret.length < 32) return null
  const payload = Buffer.from(JSON.stringify({
    userId, tokenHash: createHash('sha256').update(accessToken).digest('hex'),
    issuedAt: now, expiresAt: now + RECOVERY_GRANT_SECONDS * 1000,
  })).toString('base64url')
  return `${payload}.${createHmac('sha256', secret).update(`password-recovery-v1:${payload}`).digest('hex')}`
}

export function verifyRecoveryGrant(secret: string, value: string, userId: string, accessToken: string, now = Date.now()) {
  if (secret.length < 32 || value.length > 2048) return false
  const [payload, signature, extra] = value.split('.')
  if (!payload || !signature || extra !== undefined || !/^[a-f0-9]{64}$/.test(signature)) return false
  const expected = createHmac('sha256', secret).update(`password-recovery-v1:${payload}`).digest()
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return false
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return data.userId === userId
      && data.tokenHash === createHash('sha256').update(accessToken).digest('hex')
      && typeof data.issuedAt === 'number' && data.issuedAt <= now
      && typeof data.expiresAt === 'number' && data.expiresAt > now
      && data.expiresAt - data.issuedAt === RECOVERY_GRANT_SECONDS * 1000
  } catch { return false }
}
