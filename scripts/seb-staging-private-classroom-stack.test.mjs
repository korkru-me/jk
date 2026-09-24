import { describe, expect, it, vi } from 'vitest'

import {
  SebStagingPrivateClassroomStackBlockedError,
  createSebStagingPrivateClassroomStack,
} from './seb-staging-private-classroom-stack.mjs'

const SITE_ORIGIN = 'https://staging.korkru.com'
const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const RUN_ID = 'seb-s5-classroom-stack-1'

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze))
  if (value === null || typeof value !== 'object') return value
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, freeze(child)]),
  ))
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
  ].map(method => [method, vi.fn()])))
}

function options(overrides = {}) {
  return {
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
    serviceRoleCredentialProvider: vi.fn(),
    secretProvider: vi.fn(),
    userScopedReadProbe: vi.fn(),
    clock: () => new Date('2026-09-24T03:00:00.000Z'),
    fetchImplementation: vi.fn(),
    chromium: Object.freeze({ name: () => 'chromium', launch: vi.fn() }),
    createServerClient: vi.fn(),
    ...overrides,
  }
}

describe('SEB Staging private classroom stack', () => {
  it('retains both credential providers and the raw driver behind two coarse methods', async () => {
    const input = options()
    const stack = await createSebStagingPrivateClassroomStack(input)
    expect(Object.isFrozen(stack)).toBe(true)
    expect(Object.keys(stack).sort()).toEqual([
      'browserDataCapability',
      'browserDataLifecycleCapability',
      'browserSessionCapability',
      'closeAll',
    ])
    expect(Object.keys(stack.browserDataCapability)).toEqual(['executeStep'])
    expect(JSON.stringify(stack)).not.toContain('serviceRoleCredentialProvider')
    expect(JSON.stringify(stack)).not.toContain('secretProvider')
    expect(await stack.closeAll()).toEqual({ status: 'passed' })
    expect(input.serviceRoleCredentialProvider).not.toHaveBeenCalled()
    expect(input.secretProvider).not.toHaveBeenCalled()
    expect(input.chromium.launch).not.toHaveBeenCalled()
  })

  it('rejects option expansion before acquiring any private resource', async () => {
    const input = options({ unexpected: true })
    await expect(createSebStagingPrivateClassroomStack(input))
      .rejects.toBeInstanceOf(SebStagingPrivateClassroomStackBlockedError)
    expect(input.serviceRoleCredentialProvider).not.toHaveBeenCalled()
  })

  it('closes its dedicated driver if a later runtime constructor fails', async () => {
    const input = options({
      chromium: Object.freeze({ name: () => 'firefox', launch: vi.fn() }),
    })
    await expect(createSebStagingPrivateClassroomStack(input))
      .rejects.toBeInstanceOf(SebStagingPrivateClassroomStackBlockedError)
    expect(input.serviceRoleCredentialProvider).not.toHaveBeenCalled()
  })
})
