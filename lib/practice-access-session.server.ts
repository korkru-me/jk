import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { isUuid } from '@/lib/practice-library-contracts'
import { practiceVariantSecret } from '@/lib/practice-variant.server'

const SESSION_TTL_MS = 8 * 60 * 60 * 1000

type PracticeAccessClaims = {
  version: 1
  userId: string
  libraryId: string
  expiresAt: number
}

export function practiceAccessCookieName(libraryId: string) {
  return `korkru-practice-access-${libraryId}`
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret)
    .update('practice-access-session\0')
    .update(body)
    .digest('base64url')
}

function encodeClaims(claims: PracticeAccessClaims, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${body}.${sign(body, secret)}`
}

function decodeClaims(token: string, secret: string): PracticeAccessClaims | null {
  const [body, supplied, extra] = token.split('.')
  if (!body || !supplied || extra) return null
  const expected = sign(body, secret)
  const left = Buffer.from(supplied)
  const right = Buffer.from(expected)
  if (left.byteLength !== right.byteLength || !timingSafeEqual(left, right)) return null
  try {
    const value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>
    if (value.version !== 1
      || !isUuid(value.userId)
      || !isUuid(value.libraryId)
      || !Number.isSafeInteger(value.expiresAt)
      || Number(value.expiresAt) <= Date.now()) return null
    return value as PracticeAccessClaims
  } catch {
    return null
  }
}

export async function grantPracticeAccessSession(userId: string, libraryId: string): Promise<boolean> {
  const secret = practiceVariantSecret(process.env)
  if (!secret || !isUuid(userId) || !isUuid(libraryId)) return false
  const claims: PracticeAccessClaims = {
    version: 1,
    userId,
    libraryId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  }
  ;(await cookies()).set(practiceAccessCookieName(libraryId), encodeClaims(claims, secret), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    priority: 'high',
  })
  return true
}

export async function hasPracticeAccessSession(userId: string, libraryId: string): Promise<boolean> {
  const secret = practiceVariantSecret(process.env)
  if (!secret || !isUuid(userId) || !isUuid(libraryId)) return false
  const token = (await cookies()).get(practiceAccessCookieName(libraryId))?.value
  if (!token) return false
  const claims = decodeClaims(token, secret)
  return claims?.userId === userId && claims.libraryId === libraryId
}
