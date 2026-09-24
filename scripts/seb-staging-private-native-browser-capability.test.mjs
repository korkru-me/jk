import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import {
  SebStagingPrivateNativeBrowserCapabilityBlockedError,
  createSebStagingPrivateNativeBrowserCapability,
} from './seb-staging-private-native-browser-capability.mjs'

const IDS = Object.freeze({
  student: '11111111-1111-4111-8111-111111111111',
  assignment: '22222222-2222-4222-8222-222222222222',
})
const CK = 'a'.repeat(64)
const BEK = 'b'.repeat(64)
const SHA = 'c'.repeat(64)
const RELEASE = `asr-${'d'.repeat(32)}-r1-${SHA.slice(0, 16)}`
const identity = Object.freeze({
  runId: 'seb-s5-native-a1',
  sourceRevision: 'e'.repeat(40),
  deploymentId: 'dpl_1234567890abcdef',
  creationWindow: Object.freeze({
    notBefore: '2026-09-24T00:00:00.000Z',
    notAfter: '2026-09-25T00:00:00.000Z',
  }),
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
    ...overrides,
  })
}

function ledger() {
  const targets = new Map([
    ['account-student-primary', ['account', IDS.student]],
    ['assignment-primary', ['assignment', IDS.assignment]],
    ['release-primary', ['release', RELEASE]],
  ])
  return Object.freeze({
    planTarget: vi.fn(), adoptDerivedTarget: vi.fn(), markUncertain: vi.fn(),
    commitTarget: vi.fn(), reconcileTarget: vi.fn(), markDeleted: vi.fn(),
    readCleanupTarget: vi.fn(reference => {
      const target = targets.get(reference.targetKey)
      if (!target || target[0] !== reference.kind) {
        return Object.freeze({ status: 'passed', state: 'unplanned', snapshots: Object.freeze([]) })
      }
      return Object.freeze({
        status: 'passed',
        state: 'committed',
        snapshots: Object.freeze([Object.freeze({
          targetKey: reference.targetKey,
          kind: reference.kind,
          targetId: target[1],
        })]),
      })
    }),
  })
}

function page() {
  const exposed = new Map()
  const scripts = []
  const clearCookies = vi.fn(async () => undefined)
  return {
    exposed,
    scripts,
    clearCookies,
    exposeFunction: vi.fn(async (name, callback) => exposed.set(name, callback)),
    addInitScript: vi.fn(async (callback, argument) => scripts.push({ callback, argument })),
    context: vi.fn(() => ({ clearCookies })),
  }
}

function provider() {
  return Object.freeze({
    readReleaseMaterial: vi.fn(async () => Object.freeze({
      releaseId: RELEASE,
      releaseRevision: 1,
      configKey: CK,
      browserExamKey: BEK,
      version: 'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser',
    })),
  })
}

function harness(overrides = {}) {
  return createSebStagingPrivateNativeBrowserCapability({
    runIdentity: identity,
    readEnvironment: () => environment(),
    privateRunLedger: ledger(),
    releaseMaterialProvider: provider(),
    ...overrides,
  })
}

function request(operationId, targetPage = page()) {
  return Object.freeze({
    targetOrigin: 'https://staging.korkru.com',
    namespace: `qa:${identity.runId}`,
    alias: 'student-primary',
    expectedUserId: IDS.student,
    operationId,
    page: targetPage,
    signal: new AbortController().signal,
  })
}

describe('SEB Staging private native browser capability', () => {
  it('returns only exact URL hashes and never browser-visible raw keys', async () => {
    const targetPage = page()
    await expect(harness().executeNativeOperation(request('verify-seb-system-check', targetPage)))
      .resolves.toEqual({ status: 'passed' })
    const binding = targetPage.exposed.get('__korkruSebS5SecurityHashes')
    const url = `https://staging.korkru.com/assignments/${IDS.assignment}/system-check?sebChallenge=x`
    const hashes = await binding(url)
    expect(hashes).toEqual({
      configKey: createHash('sha256').update(`${url}${CK}`).digest('hex'),
      browserExamKey: createHash('sha256').update(`${url}${BEK}`).digest('hex'),
    })
    expect(JSON.stringify(hashes)).not.toContain(CK)
    expect(JSON.stringify(hashes)).not.toContain(BEK)
  })

  it('installs invalid hashes for negative challenge cases', async () => {
    const targetPage = page()
    await expect(harness().executeNativeOperation(request('reject-invalid-seb-challenge', targetPage)))
      .resolves.toMatchObject({ status: 'passed' })
    const binding = targetPage.exposed.get('__korkruSebS5SecurityHashes')
    const url = `https://staging.korkru.com/assignments/${IDS.assignment}/system-check?sebChallenge=x`
    const hashes = await binding(url)
    const validConfig = createHash('sha256').update(`${url}${CK}`).digest('hex')
    expect(hashes.configKey).not.toBe(validConfig)
    expect(hashes.configKey).toMatch(/^[a-f0-9]{64}$/)
  })

  it('clears only the exact assignment SEB cookie before a negative session navigation', async () => {
    const targetPage = page()
    await expect(harness().executeNativeOperation(request('reject-invalid-seb-session', targetPage)))
      .resolves.toMatchObject({ status: 'passed' })
    expect(targetPage.clearCookies).toHaveBeenCalledWith({
      name: `korkru-seb-${IDS.assignment}`,
    })
  })

  it('is one-shot per operation and fails closed for a foreign origin', async () => {
    const capability = harness()
    await expect(capability.executeNativeOperation(request('verify-seb-system-check')))
      .resolves.toMatchObject({ status: 'passed' })
    await expect(capability.executeNativeOperation(request('verify-seb-system-check')))
      .resolves.toMatchObject({ status: 'failed' })
    const foreign = { ...request('reject-invalid-seb-challenge'), targetOrigin: 'https://example.com' }
    await expect(capability.executeNativeOperation(Object.freeze(foreign)))
      .resolves.toMatchObject({ status: 'failed' })
  })

  it.each([
    { KORKRU_DEPLOYMENT_ENV: 'production' },
    { VERCEL_ENV: 'production' },
    { EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'false' },
  ])('blocks construction outside isolated Staging', bad => {
    expect(() => harness({ readEnvironment: () => environment(bad) }))
      .toThrow(SebStagingPrivateNativeBrowserCapabilityBlockedError)
  })
})
