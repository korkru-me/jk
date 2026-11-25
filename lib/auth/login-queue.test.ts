import { describe, expect, it } from 'vitest'
import { LOGIN_QUEUE_MAX_MS, canRetryLogin, isInvalidCredentials, nextLoginRetryDelayMs } from './login-queue'

describe('login busy queue', () => {
  it('backs off from 8 s and caps at 30 s before jitter', () => {
    const none = () => 0
    expect([0, 1, 2, 3, 4, 9].map(n => nextLoginRetryDelayMs(n, none))).toEqual([8000, 12000, 18000, 27000, 30000, 30000])
  })
  it('spreads a room of retries with up to 7 s of jitter', () => {
    expect(nextLoginRetryDelayMs(0, () => 0.999)).toBe(14993)
    expect(nextLoginRetryDelayMs(-3, () => 0)).toBe(8000)
  })
  it('stops queueing once the next retry would pass three minutes', () => {
    expect(canRetryLogin(0, 150_000, 30_000)).toBe(true)
    expect(canRetryLogin(0, 150_001, 30_000)).toBe(false)
    expect(LOGIN_QUEUE_MAX_MS).toBe(180_000)
  })
  it('recognises a wrong password by code or by the legacy message only', () => {
    expect(isInvalidCredentials({ code: 'invalid_credentials' })).toBe(true)
    expect(isInvalidCredentials({ message: 'Invalid login credentials' })).toBe(true)
    expect(isInvalidCredentials({ code: 'email_not_confirmed', message: 'Email not confirmed' })).toBe(false)
    expect(isInvalidCredentials(null)).toBe(false)
  })
})
