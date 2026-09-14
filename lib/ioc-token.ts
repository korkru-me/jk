/**
 * The link an expert opens, and the rules that decide whether it still works.
 *
 * The token lives in the URL the teacher sends and nowhere else: the database
 * keeps only its SHA-256, so a copy of the table is not a set of working links.
 * Lookup hashes what the visitor presents and compares hashes.
 *
 * A link therefore cannot be recovered after it is issued — regenerating is the
 * way back, and doing so invalidates the old one, which is also how a teacher
 * takes a link away from someone.
 */

import { createHash, randomBytes } from 'node:crypto'

/** 32 bytes of randomness, base64url so it survives a URL and a LINE message. */
const IOC_TOKEN_BYTES = 32

export const IOC_DEFAULT_LINK_DAYS = 30
export const IOC_MAX_LINK_DAYS = 180

export function generateIocToken(): string {
  return randomBytes(IOC_TOKEN_BYTES).toString('base64url')
}

/** Lowercase hex, matching the `^[0-9a-f]{64}$` check on the column. */
export function hashIocToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex')
}

/** Shape a token has to have before it is worth a database round trip. */
export function looksLikeIocToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{20,120}$/.test(token.trim())
}

export function iocLinkPath(token: string): string {
  return `/ioc/${token}`
}

export function iocLinkExpiry(from: Date, days: number): Date {
  const expires = new Date(from)
  expires.setDate(expires.getDate() + days)
  return expires
}

export interface IocLinkState {
  token_hash: string | null
  token_expires_at: string | null
  revoked_at: string | null
  status: 'invited' | 'opened' | 'submitted'
}

export type IocLinkUsability =
  | { usable: true; alreadySubmitted: boolean }
  | { usable: false; reason: 'no_link' | 'revoked' | 'expired' }

/**
 * Why a link does not work is deliberately not told to the visitor — the page
 * says the same thing for all three — but the teacher's dashboard needs the
 * difference, and so does the decision to record an open.
 *
 * A submitted expert keeps a working link on purpose: they can read back what
 * they sent and download their own copy until it expires.
 */
export function iocLinkUsability(link: IocLinkState, now: Date = new Date()): IocLinkUsability {
  if (!link.token_hash || !link.token_expires_at) return { usable: false, reason: 'no_link' }
  if (link.revoked_at) return { usable: false, reason: 'revoked' }
  if (new Date(link.token_expires_at).getTime() <= now.getTime()) {
    return { usable: false, reason: 'expired' }
  }
  return { usable: true, alreadySubmitted: link.status === 'submitted' }
}

/** Days left before a link stops working, floored at 0 and never negative. */
export function iocLinkDaysLeft(expiresAt: string | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null
  const ms = new Date(expiresAt).getTime() - now.getTime()
  if (Number.isNaN(ms)) return null
  return Math.max(0, Math.ceil(ms / 86_400_000))
}
