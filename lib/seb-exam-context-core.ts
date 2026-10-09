import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SEB_EXAM_CONTEXT_TTL_MS = 12 * 60 * 60 * 1000
export const SEB_EXAM_START_INTENT_TTL_MS = 5 * 60 * 1000
export const SEB_EXAM_CONTEXT_COOKIE_NAME = 'korkru-seb-exam-context'

export interface SebExamScope {
  assignmentId: string
  revision: number
  releaseId: string
}

/** Navigation scope only: never proof of authentication, SEB, or submission. */
export interface SebExamContextClaims extends SebExamScope {
  kind: 'seb_exam_context'
  schemaVersion: 1
  contextId: string
  userId: string | null
  issuedAt: number
  expiresAt: number
}

export interface SebExamStartPredecessor {
  submissionId: string | null
  attemptNumber: number
}

/** A signed generation expectation, not a receipt that an attempt was started. */
export interface SebExamStartIntentClaims extends SebExamScope {
  kind: 'seb_exam_start_intent'
  schemaVersion: 1
  contextId: string
  userId: string
  intentId: string
  predecessorSubmissionId: string | null
  predecessorAttemptNumber: number
  issuedAt: number
  expiresAt: number
}

export interface SebExamContextExpected extends Partial<SebExamScope> {
  contextId?: string
  userId?: string | null
}

interface CreationOptions {
  now?: number
  ttlMs?: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const NONCE = /^[0-9a-f]{32}$/
const BASE64URL = /^[A-Za-z0-9_-]+$/
const MAX_REVISION = 2_147_483_646
const MAX_TOKEN_LENGTH = 2048
const CLOCK_SKEW_MS = 60_000
const CONTEXT_KEYS = [
  'kind', 'schemaVersion', 'assignmentId', 'revision', 'releaseId',
  'contextId', 'userId', 'issuedAt', 'expiresAt',
] as const
const INTENT_KEYS = [
  'kind', 'schemaVersion', 'assignmentId', 'revision', 'releaseId',
  'contextId', 'userId', 'intentId', 'predecessorSubmissionId',
  'predecessorAttemptNumber', 'issuedAt', 'expiresAt',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key))
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && value.length === 36 && UUID.test(value)
}

function isNonce(value: unknown): value is string {
  return typeof value === 'string' && value.length === 32 && NONCE.test(value)
}

function isRevision(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number'
    && value >= 1 && value <= MAX_REVISION
}

export function isSebExamScope(value: unknown): value is SebExamScope {
  if (!isRecord(value) || !isUuid(value.assignmentId) || !isRevision(value.revision)) return false
  const prefix = `asr-${value.assignmentId.replaceAll('-', '')}-r${value.revision}-`
  return typeof value.releaseId === 'string'
    && value.releaseId.startsWith(prefix)
    && value.releaseId.length === prefix.length + 16
    && /^[0-9a-f]{16}$/.test(value.releaseId.slice(prefix.length))
}

function validTimes(value: Record<string, unknown>, maximumTtl: number) {
  return typeof value.issuedAt === 'number' && Number.isSafeInteger(value.issuedAt)
    && value.issuedAt >= 0
    && typeof value.expiresAt === 'number' && Number.isSafeInteger(value.expiresAt)
    && value.expiresAt > value.issuedAt
    && value.expiresAt - value.issuedAt <= maximumTtl
}

export function isSebExamContextClaims(value: unknown): value is SebExamContextClaims {
  return isRecord(value) && hasExactKeys(value, CONTEXT_KEYS)
    && value.kind === 'seb_exam_context' && value.schemaVersion === 1
    && isSebExamScope(value) && isNonce(value.contextId)
    && (value.userId === null || isUuid(value.userId))
    && validTimes(value, SEB_EXAM_CONTEXT_TTL_MS)
}

function isStartIntentClaims(value: unknown): value is SebExamStartIntentClaims {
  if (!isRecord(value) || !hasExactKeys(value, INTENT_KEYS)
    || value.kind !== 'seb_exam_start_intent' || value.schemaVersion !== 1
    || !isSebExamScope(value) || !isNonce(value.contextId) || !isUuid(value.userId)
    || !isNonce(value.intentId) || !validTimes(value, SEB_EXAM_START_INTENT_TTL_MS)) return false
  return isValidPredecessor({
    submissionId: value.predecessorSubmissionId,
    attemptNumber: value.predecessorAttemptNumber,
  })
}

function isValidPredecessor(value: unknown): value is SebExamStartPredecessor {
  if (!isRecord(value) || !Number.isInteger(value.attemptNumber)
    || typeof value.attemptNumber !== 'number'
    || value.attemptNumber < 0 || value.attemptNumber >= MAX_REVISION) return false
  return value.submissionId === null ? value.attemptNumber === 0
    : isUuid(value.submissionId) && value.attemptNumber > 0
}

function requireSecret(secret: string) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('SEB exam signing is unavailable')
}

function creationTimes(options: CreationOptions, maximumTtl: number) {
  const now = options.now ?? Date.now()
  const ttl = options.ttlMs ?? maximumTtl
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(ttl)
    || ttl <= 0 || ttl > maximumTtl || !Number.isSafeInteger(now + ttl)) {
    throw new Error('Invalid SEB exam lifetime')
  }
  return { issuedAt: now, expiresAt: now + ttl }
}

export function createSebExamContextClaims(
  scope: SebExamScope,
  options: CreationOptions & { userId?: string | null; contextId?: string } = {},
): SebExamContextClaims {
  const claims: SebExamContextClaims = {
    kind: 'seb_exam_context', schemaVersion: 1,
    assignmentId: scope.assignmentId, revision: scope.revision, releaseId: scope.releaseId,
    contextId: options.contextId ?? randomBytes(16).toString('hex'),
    userId: options.userId ?? null,
    ...creationTimes(options, SEB_EXAM_CONTEXT_TTL_MS),
  }
  if (!isSebExamContextClaims(claims)) throw new Error('Invalid SEB exam context')
  return claims
}

function isLive(claims: { issuedAt: number; expiresAt: number }, now: number) {
  return Number.isSafeInteger(now) && now >= 0
    && claims.issuedAt <= now + CLOCK_SKEW_MS && claims.expiresAt > now
}

export function bindSebExamContextUserClaims(
  context: SebExamContextClaims,
  userId: string,
  now = Date.now(),
): SebExamContextClaims {
  if (!isSebExamContextClaims(context) || !isLive(context, now) || !isUuid(userId)
    || (context.userId !== null && context.userId !== userId)) {
    throw new Error('SEB exam context cannot bind this account')
  }
  return { ...context, userId }
}

function signature(payload: string, purpose: string, secret: string) {
  return createHmac('sha256', secret).update(`korkru:seb-exam:${purpose}:v1\0${payload}`).digest()
}

function sign(claims: object, purpose: string, secret: string) {
  requireSecret(secret)
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
  return `${payload}.${signature(payload, purpose, secret).toString('base64url')}`
}

function verify(token: string, purpose: string, secret: string): unknown {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH
    || typeof secret !== 'string' || secret.length < 32) return null
  const parts = token.split('.')
  if (parts.length !== 2 || !BASE64URL.test(parts[0]) || !BASE64URL.test(parts[1])
    || parts[1].length !== 43) return null
  try {
    const payload = Buffer.from(parts[0], 'base64url')
    const supplied = Buffer.from(parts[1], 'base64url')
    if (payload.toString('base64url') !== parts[0] || supplied.toString('base64url') !== parts[1]
      || supplied.length !== 32 || !timingSafeEqual(supplied, signature(parts[0], purpose, secret))) return null
    // Decode only after authentication. Invalid UTF-8 cannot create a canonical signed payload.
    const decoded = payload.toString('utf8')
    if (!Buffer.from(decoded, 'utf8').equals(payload)) return null
    return JSON.parse(decoded) as unknown
  } catch {
    return null
  }
}

export function signSebExamContextClaims(claims: SebExamContextClaims, secret: string) {
  if (!isSebExamContextClaims(claims)) throw new Error('Invalid SEB exam context')
  return sign(claims, 'context', secret)
}

export function verifySebExamContextClaims(
  token: string,
  secret: string,
  now = Date.now(),
  expected: SebExamContextExpected = {},
): SebExamContextClaims | null {
  const claims = verify(token, 'context', secret)
  if (!isSebExamContextClaims(claims) || !isLive(claims, now)) return null
  for (const key of ['assignmentId', 'revision', 'releaseId', 'contextId', 'userId'] as const) {
    if (Object.hasOwn(expected, key) && expected[key] !== claims[key]) return null
  }
  return claims
}

export function createSebExamStartIntentClaims(
  context: SebExamContextClaims,
  predecessor: SebExamStartPredecessor,
  options: CreationOptions & { intentId?: string } = {},
): SebExamStartIntentClaims {
  const now = options.now ?? Date.now()
  if (!isSebExamContextClaims(context) || !isLive(context, now)
    || context.userId === null || !isValidPredecessor(predecessor)) {
    throw new Error('Invalid SEB exam start context')
  }
  const times = creationTimes(options, SEB_EXAM_START_INTENT_TTL_MS)
  const claims: SebExamStartIntentClaims = {
    kind: 'seb_exam_start_intent', schemaVersion: 1,
    assignmentId: context.assignmentId, revision: context.revision, releaseId: context.releaseId,
    contextId: context.contextId, userId: context.userId,
    intentId: options.intentId ?? randomBytes(16).toString('hex'),
    predecessorSubmissionId: predecessor.submissionId,
    predecessorAttemptNumber: predecessor.attemptNumber,
    issuedAt: times.issuedAt, expiresAt: Math.min(times.expiresAt, context.expiresAt),
  }
  if (!isStartIntentClaims(claims)) throw new Error('Invalid SEB exam start intent')
  return claims
}

export function signSebExamStartIntentClaims(claims: SebExamStartIntentClaims, secret: string) {
  if (!isStartIntentClaims(claims)) throw new Error('Invalid SEB exam start intent')
  return sign(claims, 'start-intent', secret)
}

export function verifySebExamStartIntentClaims(
  token: string,
  secret: string,
  context: SebExamContextClaims,
  now = Date.now(),
): SebExamStartIntentClaims | null {
  const claims = verify(token, 'start-intent', secret)
  if (!isSebExamContextClaims(context) || !isLive(context, now) || context.userId === null
    || !isStartIntentClaims(claims) || !isLive(claims, now)
    || claims.contextId !== context.contextId || claims.userId !== context.userId
    || claims.assignmentId !== context.assignmentId || claims.revision !== context.revision
    || claims.releaseId !== context.releaseId || claims.expiresAt > context.expiresAt) return null
  return claims
}

/** Only the atomic start transaction decides whether to create or return a successor. */
export function sebExamStartPredecessorMatches(
  intent: SebExamStartIntentClaims,
  latest: SebExamStartPredecessor,
) {
  return isStartIntentClaims(intent) && isValidPredecessor(latest)
    && intent.predecessorSubmissionId === latest.submissionId
    && intent.predecessorAttemptNumber === latest.attemptNumber
}

export function createSebExamCsrfToken(context: SebExamContextClaims, secret: string) {
  requireSecret(secret)
  if (!isSebExamContextClaims(context)) throw new Error('Invalid SEB exam context')
  return signature(csrfPayload(context), 'csrf', secret).toString('base64url')
}

function csrfPayload(context: SebExamContextClaims) {
  return JSON.stringify([
    context.contextId, context.assignmentId, context.revision, context.releaseId,
    context.userId, context.issuedAt, context.expiresAt,
  ])
}

export function validateSebExamCsrfToken(
  token: string | undefined,
  context: SebExamContextClaims,
  secret: string,
  now = Date.now(),
) {
  if (!isSebExamContextClaims(context) || !isLive(context, now) || !token
    || !BASE64URL.test(token) || token.length !== 43
    || typeof secret !== 'string' || secret.length < 32) return false
  const supplied = Buffer.from(token, 'base64url')
  return supplied.length === 32 && supplied.toString('base64url') === token
    && timingSafeEqual(supplied, signature(csrfPayload(context), 'csrf', secret))
}
