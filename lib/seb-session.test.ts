import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { createSebChallengeClaims, signSebClaims } from '@/lib/seb'
import { validateSebChallenge } from '@/lib/seb-session'

const SECRET = 'phase-one-seb-session-secret-for-tests'
const USER = '11111111-1111-4111-8111-111111111111'
const OTHER_USER = '22222222-2222-4222-8222-222222222222'
const ASSIGNMENT = '33333333-3333-4333-8333-333333333333'
const OTHER_ASSIGNMENT = '44444444-4444-4444-8444-444444444444'
const CONFIG_REVISION = 'korkru-production-v1-ce946d68df1f9a127b63a8cd16ad3f04a1d93c5e2c82c3b77b09174ae6e14cec'
const originalEnvironment = { ...process.env }

describe('SEB challenge context boundary', () => {
  beforeEach(() => {
    process.env.SEB_SESSION_SECRET = SECRET
    process.env.SEB_CONFIG_KEY = 'a'.repeat(64)
    process.env.SEB_CONFIG_REVISION = CONFIG_REVISION
    process.env.SEB_BROWSER_EXAM_KEY_REGISTRY = JSON.stringify({
      schemaVersion: 1,
      configRevision: CONFIG_REVISION,
      entries: [{
        platform: 'windows',
        versionString: '3.10.2',
        buildNumber: '920',
        key: 'b'.repeat(64),
      }],
    })
  })

  afterEach(() => {
    process.env = { ...originalEnvironment }
  })

  it('accepts only the exact user, assignment and purpose', () => {
    const token = signSebClaims(
      createSebChallengeClaims(USER, ASSIGNMENT, 'system_check'),
      SECRET,
    )
    expect(validateSebChallenge(token, USER, ASSIGNMENT, 'system_check')).not.toBeNull()
    expect(validateSebChallenge(token, OTHER_USER, ASSIGNMENT, 'system_check')).toBeNull()
    expect(validateSebChallenge(token, USER, OTHER_ASSIGNMENT, 'system_check')).toBeNull()
    expect(validateSebChallenge(token, USER, ASSIGNMENT, 'take')).toBeNull()
  })

  it('rejects missing, expired and tampered tokens', () => {
    expect(validateSebChallenge(undefined, USER, ASSIGNMENT)).toBeNull()
    const expired = signSebClaims(
      createSebChallengeClaims(USER, ASSIGNMENT, 'take', 1_000),
      SECRET,
    )
    expect(validateSebChallenge(expired, USER, ASSIGNMENT)).toBeNull()
    const live = signSebClaims(createSebChallengeClaims(USER, ASSIGNMENT), SECRET)
    expect(validateSebChallenge(`${live}x`, USER, ASSIGNMENT)).toBeNull()
  })
})
