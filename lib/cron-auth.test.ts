import { describe, expect, it } from 'vitest'
import { isCronAuthorizationValid } from '@/lib/cron-auth'

const secret = '0123456789abcdef0123456789abcdef'

describe('cron authorization', () => {
  it('accepts only the exact bearer secret', () => {
    expect(isCronAuthorizationValid(`Bearer ${secret}`, secret)).toBe(true)
    expect(isCronAuthorizationValid(`Bearer ${secret}x`, secret)).toBe(false)
    expect(isCronAuthorizationValid(secret, secret)).toBe(false)
  })

  it('fails closed when the server secret is missing or too short', () => {
    expect(isCronAuthorizationValid(`Bearer ${secret}`, undefined)).toBe(false)
    expect(isCronAuthorizationValid('Bearer short', 'short')).toBe(false)
    expect(isCronAuthorizationValid(null, secret)).toBe(false)
  })
})
