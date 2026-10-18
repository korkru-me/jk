import { createHmac, timingSafeEqual } from 'node:crypto'

const TTL = 15 * 60 * 1000
const DOMAIN = 'korkru-question-regrading-v1\0'

export interface RegradingConfirmation {
  actorId: string
  questionId: string
  revision: string
  change: string
  scope: string
}

/** The receipt contains only a keyed binding, never answers or learner IDs. */
export function createRegradingConfirmation(claims: RegradingConfirmation, secret: string, now = Date.now()): string {
  if (secret.length < 32) throw new Error('Regrading signing secret is unavailable')
  const expires = now + TTL
  const body = `${expires}.${createHmac('sha256', secret).update(DOMAIN).update(JSON.stringify(claims)).digest('base64url')}`
  return `${body}.${createHmac('sha256', secret).update(DOMAIN).update(body).digest('base64url')}`
}

export function verifyRegradingConfirmation(token: unknown, claims: RegradingConfirmation, secret: string, now = Date.now()): boolean {
  if (typeof token !== 'string' || token.length > 256 || secret.length < 32) return false
  const [expires, binding, signature, extra] = token.split('.')
  const expiry = Number(expires)
  if (extra || !binding || !signature || !Number.isSafeInteger(expiry) || expiry <= now || expiry > now + TTL) return false
  const expectedBinding = createHmac('sha256', secret).update(DOMAIN).update(JSON.stringify(claims)).digest('base64url')
  const expectedSignature = createHmac('sha256', secret).update(DOMAIN).update(`${expires}.${binding}`).digest('base64url')
  const equal = (a: string, b: string) => {
    const left = Buffer.from(a)
    const right = Buffer.from(b)
    return left.byteLength === right.byteLength && timingSafeEqual(left, right)
  }
  return equal(binding, expectedBinding) && equal(signature, expectedSignature)
}
