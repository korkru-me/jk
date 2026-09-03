import { createHash, timingSafeEqual } from 'node:crypto'

export const MIN_CRON_SECRET_LENGTH = 32

/** Constant-time comparison for Vercel Cron's `Authorization: Bearer …`. */
export function isCronAuthorizationValid(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH || !header?.startsWith('Bearer ')) return false
  const provided = header.slice('Bearer '.length)
  if (!provided) return false
  const expectedHash = createHash('sha256').update(secret).digest()
  const providedHash = createHash('sha256').update(provided).digest()
  return timingSafeEqual(expectedHash, providedHash)
}
