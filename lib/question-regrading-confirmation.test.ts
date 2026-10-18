import { describe, expect, it } from 'vitest'
import { createRegradingConfirmation, verifyRegradingConfirmation } from './question-regrading-confirmation'

const secret = 'local-test-secret-'.repeat(4)
const claims = { actorId: 'teacher', questionId: 'question', revision: 'old', change: 'new', scope: 'scope' }

describe('regrading acknowledgement receipt', () => {
  it('binds the exact teacher, question, edit and reviewed scope', () => {
    const token = createRegradingConfirmation(claims, secret, 1000)
    expect(verifyRegradingConfirmation(token, claims, secret, 1001)).toBe(true)
    for (const field of Object.keys(claims) as Array<keyof typeof claims>) {
      expect(verifyRegradingConfirmation(token, { ...claims, [field]: 'changed' }, secret, 1001)).toBe(false)
    }
    expect(token).not.toContain('teacher')
    expect(verifyRegradingConfirmation(token, claims, `${secret}other`, 1001)).toBe(false)
  })
  it('rejects expiration, future replay, malformed or forged receipts', () => {
    const token = createRegradingConfirmation(claims, secret, 1000)
    expect(verifyRegradingConfirmation(token, claims, secret, 901001)).toBe(false)
    expect(verifyRegradingConfirmation(token, claims, secret, 0)).toBe(false)
    for (const value of [null, '', 'garbage', `${token}.extra`, token.replace(/^\d+/, '99999999'), `${token.slice(0,-1)}!`, `901000.${'ก'.repeat(43)}.${'ข'.repeat(43)}`]) {
      expect(verifyRegradingConfirmation(value, claims, secret, 1001)).toBe(false)
    }
  })
})
