import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const identity = {
  actorId: '11111111-1111-4111-8111-111111111111',
  libraryId: '22222222-2222-4222-8222-222222222222',
  questionId: '33333333-3333-4333-8333-333333333333',
  questionRevision: 'a'.repeat(64),
}
const secret = 'test-only-practice-secret-with-32-characters'

let signPracticeVariantReceipt: typeof import('./practice-variant.server').signPracticeVariantReceipt
let verifyPracticeVariantReceipt: typeof import('./practice-variant.server').verifyPracticeVariantReceipt
let createPracticeVariantNonce: typeof import('./practice-variant.server').createPracticeVariantNonce
let derivePracticeVariantSeed: typeof import('./practice-variant.server').derivePracticeVariantSeed

beforeAll(async () => {
  ;({
    signPracticeVariantReceipt,
    verifyPracticeVariantReceipt,
    createPracticeVariantNonce,
    derivePracticeVariantSeed,
  } = await import('./practice-variant.server'))
})

const nonce = 'AAAAAAAAAAAAAAAAAAAAAA'

describe('practice variant receipts', () => {
  it('round-trips only for the bound student, library, and question', () => {
    const receipt = signPracticeVariantReceipt(identity, nonce, secret, 1_000_000)
    expect(verifyPracticeVariantReceipt(receipt, identity, secret, 1_000_001)?.seed)
      .toBe(derivePracticeVariantSeed(identity, nonce, secret))
    expect(verifyPracticeVariantReceipt(receipt, {
      ...identity,
      questionId: '44444444-4444-4444-8444-444444444444',
    }, secret, 1_000_001)).toBeNull()
    expect(verifyPracticeVariantReceipt(receipt, {
      ...identity,
      questionRevision: 'b'.repeat(64),
    }, secret, 1_000_001)).toBeNull()
  })

  it('rejects tampering and expiry', () => {
    const receipt = signPracticeVariantReceipt(identity, nonce, secret, 1_000_000)
    const tampered = `${receipt.slice(0, -1)}${receipt.endsWith('a') ? 'b' : 'a'}`
    expect(verifyPracticeVariantReceipt(tampered, identity, secret, 1_000_001)).toBeNull()
    expect(verifyPracticeVariantReceipt(receipt, identity, secret, 1_000_000 + 4 * 60 * 60 * 1000 + 1)).toBeNull()
  })

  it('contains an opaque binding and nonce but exposes neither seed nor raw revision', () => {
    const receipt = signPracticeVariantReceipt(identity, nonce, secret, 1_000_000)
    const body = Buffer.from(receipt.split('.')[0], 'base64url').toString('utf8')
    const payload = JSON.parse(body)
    expect(payload).toHaveProperty('binding')
    expect(body).toContain('nonce')
    expect(payload).not.toHaveProperty('seed')
    expect(body).not.toContain(identity.questionRevision)
    expect(body).not.toContain(identity.actorId)
    expect(body).not.toContain(identity.libraryId)
    expect(body).not.toContain(identity.questionId)
    expect(body).not.toMatch(/correct|answer|score|solution/i)
  })

  it('creates unpredictable browser-safe nonces', () => {
    const first = createPracticeVariantNonce()
    const second = createPracticeVariantNonce()
    expect(first).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(second).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(first).not.toBe(second)
  })
})
