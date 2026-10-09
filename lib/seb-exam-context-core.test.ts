import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SEB_EXAM_CONTEXT_TTL_MS,
  SEB_EXAM_START_INTENT_TTL_MS,
  bindSebExamContextUserClaims,
  createSebExamContextClaims,
  createSebExamCsrfToken,
  createSebExamStartIntentClaims,
  isSebExamContextClaims,
  isSebExamScope,
  sebExamStartPredecessorMatches,
  signSebExamContextClaims,
  signSebExamStartIntentClaims,
  validateSebExamCsrfToken,
  verifySebExamContextClaims,
  verifySebExamStartIntentClaims,
  type SebExamContextClaims,
} from './seb-exam-context-core'

const assignmentId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const otherUserId = '33333333-3333-4333-8333-333333333333'
const submissionId = '44444444-4444-4444-8444-444444444444'
const nextSubmissionId = '55555555-5555-4555-8555-555555555555'
const scope = {
  assignmentId, revision: 7,
  releaseId: 'asr-11111111111141118111111111111111-r7-abcdef0123456789',
}
const now = 1_800_000_000_000
const secret = 'test-only-exam-context-secret-32-characters'
const context = createSebExamContextClaims(scope, { now, userId, contextId: 'a'.repeat(32) })

const cookieMocks = vi.hoisted(() => ({
  jar: {
    getAll: vi.fn<() => { name: string; value: string }[]>(),
    set: vi.fn(),
  },
  readSecret: vi.fn<() => string | null>(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => cookieMocks.jar }))
vi.mock('@/lib/seb', () => ({ readSebSessionSecret: cookieMocks.readSecret }))

function tokenForUnknown(claims: unknown, purpose = 'context') {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = createHmac('sha256', secret)
    .update(`korkru:seb-exam:${purpose}:v1\0${payload}`).digest('base64url')
  return `${payload}.${signature}`
}

describe('signed exam-only context', () => {
  it('round trips a pending scope without asserting SEB or submitted authority', () => {
    const pending = createSebExamContextClaims(scope, { now })
    expect(pending.userId).toBeNull()
    expect(pending.contextId).toMatch(/^[0-9a-f]{32}$/)
    expect(pending.expiresAt).toBe(now + SEB_EXAM_CONTEXT_TTL_MS)
    const decoded = verifySebExamContextClaims(signSebExamContextClaims(pending, secret), secret, now)
    expect(decoded).toEqual(pending)
    expect(JSON.stringify(decoded)).not.toMatch(/submitted|password|configKey|browserExamKey/)
  })

  it('binds once to a verified account without extending the expiry', () => {
    const pending = createSebExamContextClaims(scope, { now })
    const bound = bindSebExamContextUserClaims(pending, userId, now + 10)
    expect(bound).toEqual({ ...pending, userId })
    expect(bindSebExamContextUserClaims(bound, userId, now + 20)).toEqual(bound)
    expect(() => bindSebExamContextUserClaims(bound, otherUserId, now + 20)).toThrow()
    expect(() => bindSebExamContextUserClaims(pending, userId, pending.expiresAt)).toThrow()
  })

  it('requires exact user, release, revision, assignment and context when expected', () => {
    const token = signSebExamContextClaims(context, secret)
    expect(verifySebExamContextClaims(token, secret, now, { ...scope, userId, contextId: context.contextId })).toEqual(context)
    for (const expected of [
      { assignmentId: otherUserId }, { revision: 8 }, { releaseId: `${scope.releaseId}0` },
      { userId: otherUserId }, { userId: null }, { contextId: 'b'.repeat(32) },
    ]) expect(verifySebExamContextClaims(token, secret, now, expected)).toBeNull()
  })

  it('rejects tampering, wrong keys, expiry and excessively future issue time', () => {
    const token = signSebExamContextClaims(context, secret)
    expect(verifySebExamContextClaims(token.replace(token[0], token[0] === 'a' ? 'b' : 'a'), secret, now)).toBeNull()
    expect(verifySebExamContextClaims(token, `${secret}wrong`, now)).toBeNull()
    expect(verifySebExamContextClaims(token, secret, context.expiresAt)).toBeNull()
    expect(verifySebExamContextClaims(token, secret, now - 60_001)).toBeNull()
    expect(verifySebExamContextClaims(token, secret, now - 60_000)).toEqual(context)
  })

  it.each(['', 'x', 'a.b.c', 'a.'.repeat(1500), 'e30=.a', 'e30.a\n'])('fails closed for malformed token %j', token => {
    expect(verifySebExamContextClaims(token, secret, now)).toBeNull()
  })

  it('rejects noncanonical base64url aliases', () => {
    const token = signSebExamContextClaims(context, secret)
    const [payload, sig] = token.split('.')
    expect(verifySebExamContextClaims(`${payload}=.${sig}`, secret, now)).toBeNull()
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    const tail = alphabet.indexOf(sig.at(-1)!)
    const alias = `${sig.slice(0, -1)}${alphabet[(tail & ~3) | 1]}`
    expect(alias).not.toBe(sig)
    expect(verifySebExamContextClaims(`${payload}.${alias}`, secret, now)).toBeNull()
  })

  it.each([
    { ...context, submitted: true }, { ...context, kind: 'seb_session' },
    { ...context, schemaVersion: 2 }, { ...context, contextId: 'z'.repeat(32) },
    { ...context, userId: 'not-a-user' }, { ...context, userId: `${userId}\n` },
    { ...context, revision: 0 }, { ...context, revision: 2.5 },
    { ...context, revision: 2_147_483_647 },
    { ...context, releaseId: scope.releaseId.replace('-r7-', '-r8-') },
    { ...context, releaseId: scope.releaseId.replace('11111111', '99999999') },
    { ...context, releaseId: `${scope.releaseId}\n` },
    { ...context, expiresAt: context.issuedAt },
    { ...context, expiresAt: context.expiresAt + 1 },
    { ...context, issuedAt: -1 }, { ...context, expiresAt: Number.POSITIVE_INFINITY },
  ])('rejects unsupported signed claim shape %#', claims => {
    expect(isSebExamContextClaims(claims)).toBe(false)
    expect(verifySebExamContextClaims(tokenForUnknown(claims), secret, now)).toBeNull()
    expect(() => signSebExamContextClaims(claims as SebExamContextClaims, secret)).toThrow()
  })

  it('validates scope and creation lifetime before issuing a token', () => {
    expect(isSebExamScope(scope)).toBe(true)
    expect(isSebExamScope({ ...scope, assignmentId: `${assignmentId}\n` })).toBe(false)
    expect(() => createSebExamContextClaims(scope, { now, ttlMs: SEB_EXAM_CONTEXT_TTL_MS + 1 })).toThrow()
    expect(() => createSebExamContextClaims(scope, { now, ttlMs: 0 })).toThrow()
    expect(() => createSebExamContextClaims(scope, { now: NaN })).toThrow()
    expect(() => signSebExamContextClaims(context, 'short')).toThrow()
    expect(verifySebExamContextClaims(signSebExamContextClaims(context, secret), 'short', now)).toBeNull()
  })
})

describe('signed first-start generation intent', () => {
  const predecessor = { submissionId, attemptNumber: 2 }
  const intent = createSebExamStartIntentClaims(context, predecessor, { now, intentId: 'c'.repeat(32) })
  const token = signSebExamStartIntentClaims(intent, secret)

  it('binds exact predecessor and expected generation to the context', () => {
    expect(verifySebExamStartIntentClaims(token, secret, context, now)).toEqual(intent)
    expect(intent.expiresAt).toBe(now + SEB_EXAM_START_INTENT_TTL_MS)
    expect(sebExamStartPredecessorMatches(intent, predecessor)).toBe(true)
    expect(sebExamStartPredecessorMatches(intent, { submissionId, attemptNumber: 3 })).toBe(false)
    expect(sebExamStartPredecessorMatches(intent, { submissionId: nextSubmissionId, attemptNumber: 3 })).toBe(false)
    // A valid replay is still verifiable: only the atomic RPC can return its same committed successor.
    expect(verifySebExamStartIntentClaims(token, secret, context, now + 10)).toEqual(intent)
  })

  it('supports the first attempt only with a null / zero predecessor', () => {
    const first = createSebExamStartIntentClaims(context, { submissionId: null, attemptNumber: 0 }, { now })
    expect(sebExamStartPredecessorMatches(first, { submissionId: null, attemptNumber: 0 })).toBe(true)
    expect(() => createSebExamStartIntentClaims(context, { submissionId: null, attemptNumber: 1 }, { now })).toThrow()
    expect(() => createSebExamStartIntentClaims(context, { submissionId, attemptNumber: 0 }, { now })).toThrow()
    expect(() => createSebExamStartIntentClaims(context, { submissionId, attemptNumber: -1 }, { now })).toThrow()
  })

  it('rejects intent substitution across context, account, scope, purpose and expiry', () => {
    for (const changed of [
      { ...context, contextId: 'b'.repeat(32) }, { ...context, userId: otherUserId },
      createSebExamContextClaims({ ...scope, revision: 8, releaseId: scope.releaseId.replace('-r7-', '-r8-') }, { now, userId }),
    ]) expect(verifySebExamStartIntentClaims(token, secret, changed, now)).toBeNull()
    expect(verifySebExamStartIntentClaims(token, secret, context, intent.expiresAt)).toBeNull()
    expect(verifySebExamContextClaims(token, secret, now)).toBeNull()
    expect(verifySebExamStartIntentClaims(signSebExamContextClaims(context, secret), secret, context, now)).toBeNull()
    expect(verifySebExamStartIntentClaims(tokenForUnknown({ ...intent, predecessorAttemptNumber: 0 }, 'start-intent'), secret, context, now)).toBeNull()
  })

  it('cannot issue a start intent while unauthenticated and caps expiry to context', () => {
    const pending = createSebExamContextClaims(scope, { now })
    expect(() => createSebExamStartIntentClaims(pending, predecessor, { now })).toThrow()
    const short = createSebExamContextClaims(scope, { now, ttlMs: 60_000, userId })
    expect(createSebExamStartIntentClaims(short, predecessor, { now }).expiresAt).toBe(short.expiresAt)
    expect(() => createSebExamStartIntentClaims(context, predecessor, { now, ttlMs: SEB_EXAM_START_INTENT_TTL_MS + 1 })).toThrow()
  })
})

describe('context-bound CSRF', () => {
  it('binds pending or logged-in navigation scope but grants no attempt authority', () => {
    const csrf = createSebExamCsrfToken(context, secret)
    expect(validateSebExamCsrfToken(csrf, context, secret, now)).toBe(true)
    expect(validateSebExamCsrfToken(csrf, { ...context, userId: otherUserId }, secret, now)).toBe(false)
    expect(validateSebExamCsrfToken(csrf, { ...context, contextId: 'b'.repeat(32) }, secret, now)).toBe(false)
    expect(validateSebExamCsrfToken(csrf, context, `${secret}wrong`, now)).toBe(false)
    expect(validateSebExamCsrfToken(csrf, context, secret, context.expiresAt)).toBe(false)
    expect(validateSebExamCsrfToken(undefined, context, secret, now)).toBe(false)
    expect(validateSebExamCsrfToken('x'.repeat(43), context, secret, now)).toBe(false)
    expect(validateSebExamCsrfToken(signSebExamContextClaims(context, secret), context, secret, now)).toBe(false)
    expect(verifySebExamContextClaims(csrf, secret, now)).toBeNull()
    expect(validateSebExamCsrfToken(csrf, { ...context }, secret, now)).toBe(true)
  })
})

describe('server context cookie boundary (mocked request cookies)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    cookieMocks.jar.getAll.mockReturnValue([])
    cookieMocks.readSecret.mockReturnValue(secret)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('distinguishes absent, malformed, duplicate and verified markers', async () => {
    const { readSebExamContext } = await import('./seb-exam-context.server')
    expect(await readSebExamContext()).toEqual({ status: 'absent' })
    cookieMocks.jar.getAll.mockReturnValue([{ name: 'korkru-seb-exam-context', value: '' }])
    expect(await readSebExamContext()).toEqual({ status: 'invalid' })
    const marker = { name: 'korkru-seb-exam-context', value: signSebExamContextClaims(context, secret) }
    cookieMocks.jar.getAll.mockReturnValue([marker, marker])
    expect(await readSebExamContext()).toEqual({ status: 'invalid' })
    cookieMocks.jar.getAll.mockReturnValue([marker])
    expect(await readSebExamContext()).toEqual({ status: 'valid', claims: context })
    expect(await readSebExamContext({ userId: otherUserId })).toEqual({ status: 'invalid' })
    cookieMocks.readSecret.mockReturnValue(null)
    expect(await readSebExamContext()).toEqual({ status: 'invalid' })
  })

  it('sets an expiry-bounded secure host-only HttpOnly Lax cookie', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { setSebExamContext } = await import('./seb-exam-context.server')
    await setSebExamContext(context)
    const [name, token, options] = cookieMocks.jar.set.mock.calls[0]
    expect(name).toBe('korkru-seb-exam-context')
    expect(verifySebExamContextClaims(token as string, secret, now)).toEqual(context)
    expect(options).toEqual({
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', priority: 'high',
      expires: new Date(context.expiresAt), maxAge: SEB_EXAM_CONTEXT_TTL_MS / 1000,
    })
    expect(options).not.toHaveProperty('domain')
  })

  it('does not write an expired context or swallow cookie write failure', async () => {
    const { setSebExamContext } = await import('./seb-exam-context.server')
    vi.mocked(Date.now).mockReturnValue(context.expiresAt)
    await expect(setSebExamContext(context)).rejects.toThrow()
    expect(cookieMocks.jar.set).not.toHaveBeenCalled()
    vi.mocked(Date.now).mockReturnValue(now)
    cookieMocks.jar.set.mockImplementationOnce(() => { throw new Error('write failure') })
    await expect(setSebExamContext(context)).rejects.toThrow('write failure')
  })

  it('binds pending context without replacing identity or extending lifetime', async () => {
    const { bindSebExamContextUser } = await import('./seb-exam-context.server')
    const pending = { ...context, userId: null }
    cookieMocks.jar.getAll.mockReturnValue([{ name: 'korkru-seb-exam-context', value: signSebExamContextClaims(pending, secret) }])
    expect(await bindSebExamContextUser(userId)).toEqual(context)
    cookieMocks.jar.getAll.mockReturnValue([{ name: 'korkru-seb-exam-context', value: signSebExamContextClaims(context, secret) }])
    await expect(bindSebExamContextUser(otherUserId)).rejects.toThrow()
    expect(cookieMocks.jar.set).toHaveBeenCalledTimes(1)
  })

  it('uses the same verified context for signed intent and CSRF wrappers', async () => {
    const {
      createSebExamStartIntent, validateSebExamStartIntent,
      getSebExamCsrfToken, validateSebExamContextCsrf,
    } = await import('./seb-exam-context.server')
    const token = createSebExamStartIntent(context, { submissionId: null, attemptNumber: 0 })
    expect(token).not.toBeNull()
    expect(validateSebExamStartIntent(token!, context)?.predecessorAttemptNumber).toBe(0)
    const csrf = getSebExamCsrfToken(context)
    expect(validateSebExamContextCsrf(csrf!, context)).toBe(true)
    cookieMocks.readSecret.mockReturnValue(null)
    expect(createSebExamStartIntent(context, { submissionId: null, attemptNumber: 0 })).toBeNull()
    expect(validateSebExamStartIntent(token!, context)).toBeNull()
    expect(getSebExamCsrfToken(context)).toBeNull()
    expect(validateSebExamContextCsrf(csrf!, context)).toBe(false)
  })
})
