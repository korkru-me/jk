import { describe, expect, it } from 'vitest'
import { signRecoveryGrant, verifyRecoveryGrant } from './recovery-grant'

const secret = 'synthetic-flow-secret-at-least-32-characters'
const now = 1_700_000_000_000

describe('short-lived password recovery grants', () => {
  it('binds the signed grant to the verified user and exact exchanged session', () => {
    const grant = signRecoveryGrant(secret, 'user-a', 'session-a', now)!
    expect(verifyRecoveryGrant(secret, grant, 'user-a', 'session-a', now + 1)).toBe(true)
    expect(verifyRecoveryGrant(secret, grant, 'user-b', 'session-a', now + 1)).toBe(false)
    expect(verifyRecoveryGrant(secret, grant, 'user-a', 'session-b', now + 1)).toBe(false)
    expect(grant).not.toContain('session-a')
  })
  it('expires after ten minutes and rejects future grants', () => {
    const grant = signRecoveryGrant(secret, 'user-a', 'session-a', now)!
    expect(verifyRecoveryGrant(secret, grant, 'user-a', 'session-a', now + 600000)).toBe(false)
    expect(verifyRecoveryGrant(secret, grant, 'user-a', 'session-a', now - 1)).toBe(false)
  })
  it('rejects tampering, another secret and malformed inputs without throwing', () => {
    const grant = signRecoveryGrant(secret, 'user-a', 'session-a', now)!
    for (const value of ['', grant + '.extra', 'x'.repeat(2049), grant.replace(/^./, 'z'), grant.split('.')[0] + '.bad']) {
      expect(verifyRecoveryGrant(secret, value, 'user-a', 'session-a', now)).toBe(false)
    }
    expect(verifyRecoveryGrant('another-long-synthetic-secret-123456', grant, 'user-a', 'session-a', now)).toBe(false)
    expect(signRecoveryGrant('short', 'user-a', 'session-a', now)).toBeNull()
  })
})
