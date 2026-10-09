import 'server-only'

import { cookies } from 'next/headers'
import { readSebSessionSecret } from '@/lib/seb'
import {
  SEB_EXAM_CONTEXT_COOKIE_NAME,
  bindSebExamContextUserClaims,
  createSebExamCsrfToken,
  createSebExamStartIntentClaims,
  signSebExamContextClaims,
  signSebExamStartIntentClaims,
  validateSebExamCsrfToken,
  verifySebExamContextClaims,
  verifySebExamStartIntentClaims,
  type SebExamContextClaims,
  type SebExamContextExpected,
  type SebExamStartPredecessor,
} from '@/lib/seb-exam-context-core'

export type SebExamContextCookieState =
  | { status: 'absent' }
  | { status: 'invalid' }
  | { status: 'valid'; claims: SebExamContextClaims }

/** Presence of an invalid marker must not silently fall back to ordinary mode. */
export async function readSebExamContext(
  expected: SebExamContextExpected = {},
): Promise<SebExamContextCookieState> {
  const jar = await cookies()
  const markers = jar.getAll(SEB_EXAM_CONTEXT_COOKIE_NAME)
  if (markers.length === 0) return { status: 'absent' }
  if (markers.length !== 1) return { status: 'invalid' }
  const secret = readSebSessionSecret()
  const claims = secret ? verifySebExamContextClaims(markers[0].value, secret, Date.now(), expected) : null
  return claims ? { status: 'valid', claims } : { status: 'invalid' }
}

export async function getSebExamContext(expected: SebExamContextExpected = {}) {
  const state = await readSebExamContext(expected)
  return state.status === 'valid' ? state.claims : null
}

/** Call only after independently authorizing bootstrap or the authenticated handoff. */
export async function setSebExamContext(claims: SebExamContextClaims) {
  const secret = readSebSessionSecret()
  const token = secret ? signSebExamContextClaims(claims, secret) : null
  if (!secret || !token || !verifySebExamContextClaims(token, secret)) {
    throw new Error('SEB exam context is unavailable')
  }
  const jar = await cookies()
  jar.set(SEB_EXAM_CONTEXT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // OAuth/Magic Link top-level return must retain the signed scope.
    path: '/',
    priority: 'high',
    expires: new Date(claims.expiresAt),
    maxAge: Math.max(1, Math.floor((claims.expiresAt - Date.now()) / 1000)),
    // Deliberately no Domain: this is a host-only marker.
  })
}

export async function bindSebExamContextUser(userId: string) {
  const context = await getSebExamContext()
  if (!context) throw new Error('SEB exam context is unavailable')
  const bound = bindSebExamContextUserClaims(context, userId)
  await setSebExamContext(bound)
  return bound
}

export function createSebExamStartIntent(
  context: SebExamContextClaims,
  predecessor: SebExamStartPredecessor,
) {
  const secret = readSebSessionSecret()
  return secret ? signSebExamStartIntentClaims(createSebExamStartIntentClaims(context, predecessor), secret) : null
}

export function validateSebExamStartIntent(token: string | undefined, context: SebExamContextClaims) {
  const secret = readSebSessionSecret()
  return secret && token ? verifySebExamStartIntentClaims(token, secret, context) : null
}

export function getSebExamCsrfToken(context: SebExamContextClaims) {
  const secret = readSebSessionSecret()
  return secret ? createSebExamCsrfToken(context, secret) : null
}

export function validateSebExamContextCsrf(token: string | undefined, context: SebExamContextClaims) {
  const secret = readSebSessionSecret()
  return secret ? validateSebExamCsrfToken(token, context, secret) : false
}
