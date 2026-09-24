import { describe, expect, it, vi } from 'vitest'

import {
  SebStagingPrivateBrowserDataStackBlockedError,
  createSebStagingPrivateBrowserDataStack,
} from './seb-staging-private-browser-data-stack.mjs'

const SITE_ORIGIN = 'https://staging.korkru.com'
const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const RUN_ID = 'seb-s5-stack-1'
const NAMESPACE = `qa:${RUN_ID}`

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze))
  if (value === null || typeof value !== 'object') return value
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, freeze(child)]),
  ))
}

function passed() {
  return Object.freeze({ status: 'passed' })
}

function environment() {
  return {
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: SITE_ORIGIN,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_ORIGIN,
    EXAM_QA_DATA_POLICY: 'synthetic-only',
    EXAM_QA_COPY_PRODUCTION_DATA: 'false',
    EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
  }
}

function ledger() {
  return Object.freeze(Object.fromEntries([
    'planTarget',
    'adoptDerivedTarget',
    'markUncertain',
    'commitTarget',
    'reconcileTarget',
    'readCleanupTarget',
    'markDeleted',
  ].map(method => [method, vi.fn(() => passed())])))
}

function makeHarness({ dataClose, materialClose } = {}) {
  const events = []
  const privateDataBoundary = Object.freeze({
    readAccountBinding: vi.fn(),
    prepareOperation: vi.fn(),
    attestOperation: vi.fn(),
    abortOperation: vi.fn(),
    closeAll: dataClose ?? vi.fn(async () => {
      events.push('data')
      return passed()
    }),
  })
  const privateMaterialCapability = Object.freeze({
    applySecretInputs: vi.fn(),
    applySyntheticUpload: vi.fn(),
    closeAll: materialClose ?? vi.fn(async () => {
      events.push('material')
      return passed()
    }),
  })
  const secretProvider = vi.fn()
  const userScopedReadProbe = vi.fn()
  const chromium = Object.freeze({
    name: () => 'chromium',
    launch: vi.fn(),
  })
  const stack = createSebStagingPrivateBrowserDataStack({
    runIdentity: freeze({
      runId: RUN_ID,
      sourceRevision: 'a'.repeat(40),
      deploymentId: `dpl_${'A'.repeat(24)}`,
      creationWindow: {
        notBefore: '2026-09-24T02:00:00.000Z',
        notAfter: '2026-09-24T04:00:00.000Z',
      },
    }),
    readEnvironment: () => environment(),
    privateRunLedger: ledger(),
    privateDataBoundary,
    privateMaterialCapability,
    clock: () => new Date('2026-09-24T03:00:00.000Z'),
    secretProvider,
    userScopedReadProbe,
    chromium,
    createServerClient: vi.fn(),
  })
  return {
    stack,
    events,
    privateDataBoundary,
    privateMaterialCapability,
    secretProvider,
    chromium,
  }
}

describe('SEB Staging private browser data stack', () => {
  it('exposes only a redacted browser-data facade and one cleanup capability', async () => {
    const harness = makeHarness()
    expect(Object.isFrozen(harness.stack)).toBe(true)
    expect(Object.keys(harness.stack).sort()).toEqual(['browserDataCapability', 'closeAll'])
    expect(Object.keys(harness.stack.browserDataCapability)).toEqual(['executeStep'])
    expect(JSON.stringify(harness.stack)).not.toContain('privateDataBoundary')
    expect(JSON.stringify(harness.stack)).not.toContain('secretProvider')

    expect(await harness.stack.closeAll()).toEqual({ status: 'passed' })
    expect(await harness.stack.closeAll()).toEqual({ status: 'passed' })
    expect(harness.events).toEqual(['material', 'data'])
    expect(harness.chromium.launch).not.toHaveBeenCalled()
    expect(harness.secretProvider).not.toHaveBeenCalled()
  })

  it('blocks execution as soon as cleanup begins', async () => {
    const harness = makeHarness()
    await harness.stack.closeAll()
    const result = await harness.stack.browserDataCapability.executeStep(
      Object.freeze({ stepId: 'create-subject-classroom' }),
    )
    expect(result).toEqual({ stepId: 'create-subject-classroom', status: 'failed' })
  })

  it('keeps cleanup retryable when a private child initially fails', async () => {
    let attempts = 0
    const dataClose = vi.fn(async () => {
      attempts += 1
      return Object.freeze({ status: attempts === 1 ? 'failed' : 'passed' })
    })
    const harness = makeHarness({ dataClose })
    expect(await harness.stack.closeAll()).toEqual({ status: 'failed' })
    expect(await harness.stack.closeAll()).toEqual({ status: 'passed' })
    expect(dataClose).toHaveBeenCalledTimes(2)
  })

  it('rejects expanded options before constructing any runtime', () => {
    const harness = makeHarness()
    expect(() => createSebStagingPrivateBrowserDataStack({
      runIdentity: freeze({
        runId: RUN_ID,
        sourceRevision: 'a'.repeat(40),
        deploymentId: `dpl_${'A'.repeat(24)}`,
        creationWindow: {
          notBefore: '2026-09-24T02:00:00.000Z',
          notAfter: '2026-09-24T04:00:00.000Z',
        },
      }),
      readEnvironment: () => environment(),
      privateRunLedger: ledger(),
      privateDataBoundary: harness.privateDataBoundary,
      privateMaterialCapability: harness.privateMaterialCapability,
      clock: () => new Date('2026-09-24T03:00:00.000Z'),
      secretProvider: vi.fn(),
      userScopedReadProbe: vi.fn(),
      unexpected: true,
    })).toThrow(SebStagingPrivateBrowserDataStackBlockedError)
  })
})
