import { describe, expect, it, vi } from 'vitest'

import {
  SebStagingPrivateExpiryControlBlockedError,
  createSebStagingPrivateExpiryControl,
} from './seb-staging-private-expiry-control.mjs'

const IDS = Object.freeze({
  student: '11111111-1111-4111-8111-111111111111',
  assignment: '22222222-2222-4222-8222-222222222222',
})
const identity = Object.freeze({
  runId: 'seb-s5-expiry-a1',
  sourceRevision: 'a'.repeat(40),
  deploymentId: 'dpl_1234567890abcdef',
  creationWindow: Object.freeze({
    notBefore: '2026-09-24T00:00:00.000Z',
    notAfter: '2026-09-25T00:00:00.000Z',
  }),
})
const releaseIdentity = Object.freeze({
  runId: identity.runId,
  sourceRevision: identity.sourceRevision,
  deploymentId: identity.deploymentId,
  releaseId: `asr-${'b'.repeat(32)}-r1-${'c'.repeat(16)}`,
  releaseRevision: 1,
  artifactSha256: `${'c'.repeat(16)}${'d'.repeat(48)}`,
})

function environment(overrides = {}) {
  return Object.freeze({
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
    EXAM_QA_DATA_POLICY: 'synthetic-only',
    EXAM_QA_COPY_PRODUCTION_DATA: 'false',
    EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
    EXAM_QA_SEB_TIME_CONTROL: 'true',
    ...overrides,
  })
}

function snapshot(targetKey, kind, targetId) {
  return Object.freeze({ targetKey, kind, targetId })
}

function ledger() {
  const methods = {
    planTarget: vi.fn(),
    adoptDerivedTarget: vi.fn(),
    markUncertain: vi.fn(),
    commitTarget: vi.fn(),
    reconcileTarget: vi.fn(),
    readCleanupTarget: vi.fn(reference => {
      const value = reference.targetKey === 'assignment-primary'
        ? snapshot('assignment-primary', 'assignment', IDS.assignment)
        : reference.targetKey === 'account-student-primary'
          ? snapshot('account-student-primary', 'account', IDS.student)
          : null
      return value
        ? Object.freeze({ status: 'passed', state: 'committed', snapshots: Object.freeze([value]) })
        : Object.freeze({ status: 'passed', state: 'unplanned', snapshots: Object.freeze([]) })
    }),
    markDeleted: vi.fn(),
  }
  return Object.freeze(methods)
}

function request(stepId) {
  return Object.freeze({
    schemaVersion: 1,
    stepId,
    phase: 'negative-session',
    actor: 'staging-qa-control',
    mutates: false,
    identity: releaseIdentity,
  })
}

function harness(overrides = {}) {
  return createSebStagingPrivateExpiryControl({
    runIdentity: identity,
    readEnvironment: () => environment(),
    privateRunLedger: ledger(),
    sessionSecretProvider: Object.freeze({
      readSessionSecret: vi.fn(async () => 's'.repeat(64)),
    }),
    clock: () => new Date('2026-09-24T12:00:00.000Z'),
    ...overrides,
  })
}

describe('SEB Staging private expiry control', () => {
  it.each([
    'reject-expired-seb-challenge',
    'reject-expired-seb-session',
  ])('proves %s against the shared production verifier', async stepId => {
    await expect(harness().executeStep(request(stepId))).resolves.toEqual({
      stepId,
      status: 'passed',
    })
  })

  it('is one-shot and rejects malformed or unbound release requests', async () => {
    const capability = harness()
    await expect(capability.executeStep(request('reject-expired-seb-challenge')))
      .resolves.toMatchObject({ status: 'passed' })
    await expect(capability.executeStep(request('reject-expired-seb-challenge')))
      .resolves.toMatchObject({ status: 'failed' })
    await expect(capability.executeStep(Object.freeze({})))
      .resolves.toEqual({ stepId: 'invalid-step', status: 'failed' })
  })

  it('fails closed when the shared secret is unavailable', async () => {
    const capability = harness({
      sessionSecretProvider: Object.freeze({ readSessionSecret: vi.fn(async () => 'short') }),
    })
    await expect(capability.executeStep(request('reject-expired-seb-session')))
      .resolves.toMatchObject({ status: 'failed' })
  })

  it.each([
    { EXAM_QA_SEB_TIME_CONTROL: 'false' },
    { KORKRU_DEPLOYMENT_ENV: 'production' },
    { VERCEL_ENV: 'production' },
  ])('blocks construction outside the exact isolated QA seam', bad => {
    expect(() => harness({ readEnvironment: () => environment(bad) }))
      .toThrow(SebStagingPrivateExpiryControlBlockedError)
  })
})
