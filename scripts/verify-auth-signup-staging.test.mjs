import { describe, expect, it } from 'vitest'
import { createBudget, signupReceipt, validateCohort, REF, SITE } from './verify-auth-signup-staging.mjs'

describe('bounded new-user signup check', () => {
  it('stops before a request beyond the budget', () => {
    const budget = createBudget(2, 10)
    budget.request(); budget.request()
    expect(() => budget.request()).toThrow('Request budget exceeded')
    budget.read(10)
    expect(() => budget.read(1)).toThrow('Transfer budget exceeded')
  })
  it('requires success, the exact recipient, a signed-in session and a Staging cookie', () => {
    const email = 'synthetic@example.test'
    const body = '1:' + JSON.stringify({ success: true, signedIn: true, email })
    expect(signupReceipt(body, email, [`sb-${REF}-auth-token.0=synthetic`]).success).toBe(true)
    expect(() => signupReceipt(body, 'other@example.test', [`sb-${REF}-auth-token=synthetic`])).toThrow()
    expect(() => signupReceipt(body, email, ['sb-libsutfinswqkruihwdx-auth-token=synthetic'])).toThrow()
    expect(() => signupReceipt(body.replace('"signedIn":true', '"signedIn":false'), email, [])).toThrow()
    expect(() => signupReceipt('1:{"error":"rate limit"}', email, [])).toThrow('rate limit')
  })
  it('accepts only 80 distinct run-owned users on the fixed Staging project', () => {
    const run = '247298e6-d6be-445b-b9a6-ddb6b008e76e'
    const accounts = Array.from({ length: 80 }, (_, index) => {
      const label = `student${String(index + 1).padStart(2, '0')}`
      return { label, email: `auth80-${run}-${label}@qa.staging.korkru.com`, cookies: [] }
    })
    const state = { site: SITE, projectRef: REF, run, accounts }
    expect(() => validateCohort(state)).not.toThrow()
    expect(() => validateCohort({ ...state, site: 'https://www.korkru.com' })).toThrow()
    expect(() => validateCohort({ ...state, accounts: accounts.slice(1) })).toThrow()
    expect(() => validateCohort({ ...state, accounts: accounts.map(() => accounts[0]) })).toThrow()
  })
})
