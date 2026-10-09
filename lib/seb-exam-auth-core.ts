import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  isSebExamContextClaims,
  isSebExamScope,
  type SebExamContextClaims,
  type SebExamScope,
} from '@/lib/seb-exam-context-core'

export const WAITING_AUTH_HANDOFF_QUERY = 'exam_handoff'
export const WAITING_AUTH_NONCE_COOKIE = 'korkru-seb-exam-auth-nonce'
export const WAITING_AUTH_HANDOFF_TTL_MS = 10 * 60 * 1000
export type WaitingAuthMethod = 'google' | 'magic_link'

export interface WaitingAuthHandoffClaims extends SebExamScope {
  kind: 'seb_exam_auth_handoff'
  schemaVersion: 1
  contextId: string
  userId: string | null
  method: WaitingAuthMethod
  nonce: string
  issuedAt: number
  expiresAt: number
}

const BASE64URL = /^[A-Za-z0-9_-]+$/
const NONCE = /^[0-9a-f]{32}$/
const CLAIM_KEYS = [
  'kind', 'schemaVersion', 'assignmentId', 'revision', 'releaseId',
  'contextId', 'userId', 'method', 'nonce', 'issuedAt', 'expiresAt',
] as const

function isLive(value: { issuedAt: number; expiresAt: number }, now: number) {
  return Number.isSafeInteger(now) && now >= 0
    && value.issuedAt <= now + 60_000 && value.expiresAt > now
}

function isNonce(value: unknown): value is string {
  return typeof value === 'string' && value.length === 32 && NONCE.test(value)
}

function validClaims(value: unknown): value is WaitingAuthHandoffClaims {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const claims = value as Record<string, unknown>
  if (Object.keys(claims).length !== CLAIM_KEYS.length
    || !CLAIM_KEYS.every(key => Object.hasOwn(claims, key))
    || claims.kind !== 'seb_exam_auth_handoff' || claims.schemaVersion !== 1
    || (claims.method !== 'google' && claims.method !== 'magic_link')
    || !isNonce(claims.nonce) || !isSebExamScope(claims)) return false
  return isSebExamContextClaims({
    kind: 'seb_exam_context', schemaVersion: 1,
    assignmentId: claims.assignmentId, revision: claims.revision, releaseId: claims.releaseId,
    contextId: claims.contextId, userId: claims.userId,
    issuedAt: claims.issuedAt, expiresAt: claims.expiresAt,
  }) && typeof claims.expiresAt === 'number' && typeof claims.issuedAt === 'number'
    && claims.expiresAt - claims.issuedAt <= WAITING_AUTH_HANDOFF_TTL_MS
}

export function createWaitingAuthHandoffClaims(
  context: SebExamContextClaims,
  method: WaitingAuthMethod,
  options: { now?: number; ttlMs?: number; nonce?: string } = {},
): WaitingAuthHandoffClaims {
  const now = options.now ?? Date.now()
  const ttlMs = options.ttlMs ?? WAITING_AUTH_HANDOFF_TTL_MS
  if (!isSebExamContextClaims(context) || !isLive(context, now)
    || !Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > WAITING_AUTH_HANDOFF_TTL_MS
    || !Number.isSafeInteger(now + ttlMs)) throw new Error('Invalid waiting auth context')
  const claims: WaitingAuthHandoffClaims = {
    kind: 'seb_exam_auth_handoff', schemaVersion: 1,
    assignmentId: context.assignmentId, revision: context.revision, releaseId: context.releaseId,
    contextId: context.contextId, userId: context.userId, method,
    nonce: options.nonce ?? randomBytes(16).toString('hex'),
    issuedAt: now, expiresAt: Math.min(now + ttlMs, context.expiresAt),
  }
  if (!validClaims(claims)) throw new Error('Invalid waiting auth handoff')
  return claims
}

function signature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(`korkru:seb-exam:auth-handoff:v1\0${payload}`).digest()
}

export function signWaitingAuthHandoffClaims(claims: WaitingAuthHandoffClaims, secret: string) {
  if (!validClaims(claims) || typeof secret !== 'string' || secret.length < 32) {
    throw new Error('Waiting auth signing is unavailable')
  }
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
  return `${payload}.${signature(payload, secret).toString('base64url')}`
}

export function verifyWaitingAuthHandoffClaims(
  token: string,
  secret: string,
  context: SebExamContextClaims,
  nonce: string | null,
  now = Date.now(),
): WaitingAuthHandoffClaims | null {
  if (typeof token !== 'string' || token.length > 2048 || typeof secret !== 'string' || secret.length < 32
    || !isSebExamContextClaims(context) || !isLive(context, now) || !isNonce(nonce)) return null
  const parts = token.split('.')
  if (parts.length !== 2 || !BASE64URL.test(parts[0]) || !BASE64URL.test(parts[1]) || parts[1].length !== 43) return null
  try {
    const payload = Buffer.from(parts[0], 'base64url')
    const supplied = Buffer.from(parts[1], 'base64url')
    if (payload.toString('base64url') !== parts[0] || supplied.toString('base64url') !== parts[1]
      || supplied.length !== 32 || !timingSafeEqual(supplied, signature(parts[0], secret))) return null
    const decoded = payload.toString('utf8')
    if (!Buffer.from(decoded, 'utf8').equals(payload)) return null
    const claims: unknown = JSON.parse(decoded)
    if (!validClaims(claims) || !isLive(claims, now)
      || claims.contextId !== context.contextId || claims.userId !== context.userId
      || claims.assignmentId !== context.assignmentId || claims.revision !== context.revision
      || claims.releaseId !== context.releaseId || claims.expiresAt > context.expiresAt
      || !timingSafeEqual(Buffer.from(claims.nonce), Buffer.from(nonce))) return null
    return claims
  } catch { return null }
}

/** Raw-header parsing avoids RequestCookies collapsing duplicate nonce cookies. */
export function readWaitingAuthNonceCookie(cookieHeader: string | null) {
  if (cookieHeader && /[\r\n\0]/.test(cookieHeader)) return null
  const markers = (cookieHeader ?? '').split(';').map(part => part.trim())
    .filter(part => part.split('=', 1)[0].trim() === WAITING_AUTH_NONCE_COOKIE)
  if (markers.length !== 1) return null
  const separator = markers[0].indexOf('=')
  const nonce = separator < 0 ? null : markers[0].slice(separator + 1)
  return isNonce(nonce) ? nonce : null
}
