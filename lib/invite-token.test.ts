import { describe, expect, it } from 'vitest'
import { isInviteToken } from './invite-token'

describe('isInviteToken', () => {
  it('accepts the 64 lowercase hex characters the column default produces', () => {
    expect(isInviteToken('0123456789abcdef'.repeat(4))).toBe(true)
  })

  it('rejects anything else before it reaches the database', () => {
    for (const value of [
      undefined,
      null,
      42,
      ['a'.repeat(64)],
      '',
      'a'.repeat(63),
      'a'.repeat(65),
      'A'.repeat(64),
      `${'a'.repeat(63)}%`,
      `${'a'.repeat(64)}\n`,
    ]) {
      expect(isInviteToken(value)).toBe(false)
    }
  })
})
