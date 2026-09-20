import { describe, expect, it, vi } from 'vitest'
import {
  iocLinkDaysLeft,
  iocLinkExpiry,
  iocLinkPath,
  iocLinkUsability,
  looksLikeIocToken,
  type IocLinkState,
} from '@/lib/ioc-token'
import { generateIocToken, hashIocToken } from '@/lib/ioc-token-server'

vi.mock('server-only', () => ({}))

function link(overrides: Partial<IocLinkState> = {}): IocLinkState {
  return {
    token_hash: 'a'.repeat(64),
    token_expires_at: '2026-10-13T00:00:00.000Z',
    revoked_at: null,
    status: 'invited',
    ...overrides,
  }
}

const NOW = new Date('2026-09-13T00:00:00.000Z')

describe('token generation', () => {
  it('produces a URL-safe token that is different every time', () => {
    const first = generateIocToken()
    const second = generateIocToken()
    expect(first).not.toBe(second)
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(first.length).toBeGreaterThanOrEqual(40)
    expect(looksLikeIocToken(first)).toBe(true)
  })

  it('hashes to the lowercase hex the column accepts', () => {
    const token = generateIocToken()
    const hash = hashIocToken(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashIocToken(token)).toBe(hash)
    expect(hashIocToken(generateIocToken())).not.toBe(hash)
  })

  it('ignores whitespace a pasted link picked up', () => {
    const token = generateIocToken()
    expect(hashIocToken(` ${token}\n`)).toBe(hashIocToken(token))
  })

  it('rejects shapes that cannot be a token before hitting the database', () => {
    expect(looksLikeIocToken('')).toBe(false)
    expect(looksLikeIocToken('short')).toBe(false)
    expect(looksLikeIocToken('has space '.repeat(4))).toBe(false)
    expect(looksLikeIocToken("'; drop table ioc_forms; --")).toBe(false)
  })

  it('builds the path the teacher sends', () => {
    expect(iocLinkPath('abc123')).toBe('/ioc/abc123')
  })
})

describe('iocLinkExpiry', () => {
  it('counts days forward from the moment it was issued', () => {
    expect(iocLinkExpiry(NOW, 30).toISOString()).toBe('2026-10-13T00:00:00.000Z')
    expect(iocLinkExpiry(NOW, 1).toISOString()).toBe('2026-09-14T00:00:00.000Z')
  })
})

describe('iocLinkUsability', () => {
  it('accepts a live link', () => {
    expect(iocLinkUsability(link(), NOW)).toEqual({ usable: true, alreadySubmitted: false })
  })

  it('keeps working after submission so the expert can read back what they sent', () => {
    expect(iocLinkUsability(link({ status: 'submitted' }), NOW)).toEqual({
      usable: true,
      alreadySubmitted: true,
    })
  })

  it('refuses a link that was never issued', () => {
    expect(iocLinkUsability(link({ token_hash: null, token_expires_at: null }), NOW))
      .toEqual({ usable: false, reason: 'no_link' })
    expect(iocLinkUsability(link({ token_expires_at: null }), NOW))
      .toEqual({ usable: false, reason: 'no_link' })
  })

  it('puts revocation ahead of expiry, because it is the deliberate one', () => {
    const revokedAndExpired = link({
      revoked_at: '2026-09-12T00:00:00.000Z',
      token_expires_at: '2026-09-01T00:00:00.000Z',
    })
    expect(iocLinkUsability(revokedAndExpired, NOW)).toEqual({ usable: false, reason: 'revoked' })
  })

  it('treats the expiry moment itself as over', () => {
    const expiresNow = link({ token_expires_at: NOW.toISOString() })
    expect(iocLinkUsability(expiresNow, NOW)).toEqual({ usable: false, reason: 'expired' })
  })
})

describe('iocLinkDaysLeft', () => {
  it('counts whole days and never goes below zero', () => {
    expect(iocLinkDaysLeft('2026-10-13T00:00:00.000Z', NOW)).toBe(30)
    expect(iocLinkDaysLeft('2026-09-13T06:00:00.000Z', NOW)).toBe(1)
    expect(iocLinkDaysLeft('2026-09-01T00:00:00.000Z', NOW)).toBe(0)
    expect(iocLinkDaysLeft(null, NOW)).toBeNull()
  })
})
