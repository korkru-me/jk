import { describe, expect, it, vi } from 'vitest'

import { buildSebStagingMockHarnessPlan } from './seb-staging-mock-harness-core.mjs'
import { runSebStagingLiveHarness } from './seb-staging-live-runner.mjs'
import {
  SebStagingCompositeAdapterBlockedError,
  createSebStagingCompositeAdapter,
  listSebStagingCompositeStepContracts,
} from './seb-staging-composite-adapter.mjs'

const SOURCE_REVISION = 'b'.repeat(40)
const DEPLOYMENT_ID = `dpl_${'C'.repeat(24)}`
const ARTIFACT_SHA256 = 'a'.repeat(64)
const RELEASE_IDENTITY = Object.freeze({
  releaseId: `asr-${'1'.repeat(32)}-r3-${ARTIFACT_SHA256.slice(0, 16)}`,
  releaseRevision: 3,
  artifactSha256: ARTIFACT_SHA256,
})
let sequence = 0

function validEnvironment() {
  return {
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
    EXAM_QA_PRODUCTION_SITE_URL: 'https://www.korkru.com',
    EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://production-project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-long-enough-for-staging',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-long-enough-for-staging',
    EXAM_QA_DATA_POLICY: 'synthetic-only',
    EXAM_QA_COPY_PRODUCTION_DATA: 'false',
    EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
    EXAM_QA_SEB_TIME_CONTROL: 'true',
  }
}

function plan(runId) {
  return buildSebStagingMockHarnessPlan({
    environment: validEnvironment(),
    mode: 'execute',
    runId,
    writeConfirmation: 'CONFIRM_SYNTHETIC_SEB_STAGING_WRITE',
  })
}

function nextRunId() {
  sequence += 1
  return `seb-s5-composite-${sequence}`
}

function identity(runId, releaseIdentity = null) {
  return {
    runId,
    sourceRevision: SOURCE_REVISION,
    deploymentId: DEPLOYMENT_ID,
    ...(releaseIdentity ?? {}),
  }
}

function request(step, runId, releaseIdentity = null) {
  return Object.freeze({
    schemaVersion: 1,
    stepId: step.id,
    phase: step.phase,
    actor: step.actor,
    mutates: step.mutates,
    identity: Object.freeze(identity(runId, releaseIdentity)),
  })
}

function attestation(overrides = {}) {
  return {
    siteOrigin: 'https://staging.korkru.com',
    supabaseOrigin: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
    sourceRevision: SOURCE_REVISION,
    deploymentId: DEPLOYMENT_ID,
    branchRef: 'staging',
    readyState: 'READY',
    ...overrides,
  }
}

function harness({
  preflightOverride,
  fixtureOverride,
  browserOverride,
  nativeOverride,
  expiryOverride,
  reservationOverride,
} = {}) {
  const calls = {
    preflight: [],
    fixture: [],
    browser: [],
    native: [],
    expiry: [],
    reservation: [],
  }
  const capability = (route, override) => ({
    executeStep: vi.fn(async value => {
      calls[route].push(value.stepId)
      return override
        ? override(value)
        : { stepId: value.stepId, status: 'passed' }
    }),
  })
  const preflightCapability = {
    attest: vi.fn(async value => {
      calls.preflight.push(value.stepId)
      return preflightOverride ? preflightOverride(value) : attestation()
    }),
  }
  const adapter = createSebStagingCompositeAdapter({
    preflightCapability,
    fixtureAdapter: capability('fixture', fixtureOverride),
    browserDataCapability: capability('browser', browserOverride),
    nativeOperatorCapability: capability('native', nativeOverride ?? (() => ({
      stepId: 'register-assignment-seb-release',
      status: 'passed',
      releaseIdentity: RELEASE_IDENTITY,
    }))),
    expiryControlCapability: capability('expiry', expiryOverride),
    runReservationCapability: capability('reservation', reservationOverride),
  })
  return { adapter, calls, preflightCapability }
}

describe('SEB Staging composite adapter', () => {
  it('covers every canonical plan step with an exact immutable route contract', () => {
    const runId = nextRunId()
    const canonical = plan(runId).steps
    const contracts = listSebStagingCompositeStepContracts()

    expect(contracts.map(value => value.stepId)).toEqual(canonical.map(value => value.id))
    for (let index = 0; index < contracts.length; index += 1) {
      expect(contracts[index]).toMatchObject({
        stepId: canonical[index].id,
        phase: canonical[index].phase,
        actor: canonical[index].actor,
        mutates: canonical[index].mutates,
      })
      expect(Object.isFrozen(contracts[index])).toBe(true)
    }
  })

  it('routes the full canonical plan and binds the release only after native registration', async () => {
    const runId = nextRunId()
    const issued = plan(runId)
    const { adapter, calls } = harness()
    let releaseIdentity = null

    for (const step of issued.steps) {
      const result = await adapter.executeStep(request(step, runId, releaseIdentity))
      expect(result.status).toBe('passed')
      if (step.id === 'register-assignment-seb-release') {
        expect(result.releaseIdentity).toEqual(RELEASE_IDENTITY)
        releaseIdentity = result.releaseIdentity
      } else {
        expect(Object.keys(result)).toEqual(['stepId', 'status'])
      }
    }

    expect(calls.preflight).toEqual(['verify-staging-isolation'])
    expect(calls.reservation).toEqual(['reserve-unique-run-id'])
    expect(calls.native).toEqual(['register-assignment-seb-release'])
    expect(calls.expiry).toEqual([
      'reject-expired-seb-challenge',
      'reject-expired-seb-session',
    ])
    expect(calls.fixture).toContain('provision-synthetic-teacher')
    expect(calls.fixture.at(-1)).toBe('cleanup-synthetic-fixture')
    expect(calls.browser).toContain('submit-attempt')
  })

  it('completes through the real live runner with one attested dynamic release binding', async () => {
    const runId = nextRunId()
    const issued = plan(runId)
    const { adapter } = harness()

    const output = await runSebStagingLiveHarness({
      plan: issued,
      identity: identity(runId),
      adapter,
    })

    expect(output.status).toBe('complete')
    expect(output.identity).toEqual(identity(runId, RELEASE_IDENTITY))
    expect(Object.values(output.stepEvidence).every(value => value === 'passed')).toBe(true)
    expect(output.bindingSha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it.each([
    ['siteOrigin', 'https://www.korkru.com'],
    ['supabaseOrigin', 'https://production-project.supabase.co'],
    ['sourceRevision', 'c'.repeat(40)],
    ['deploymentId', `dpl_${'D'.repeat(24)}`],
    ['branchRef', 'codex/seb-completion'],
    ['readyState', 'BUILDING'],
  ])('fails preflight on mismatched %s before any delegated mutation', async (field, value) => {
    const runId = nextRunId()
    const issued = plan(runId)
    const { adapter, calls } = harness({
      preflightOverride: () => attestation({ [field]: value }),
    })

    expect((await adapter.executeStep(request(issued.steps[0], runId))).status).toBe('failed')
    expect((await adapter.executeStep(request(issued.steps[1], runId))).status).toBe('failed')
    expect(calls.fixture).toEqual([])
    expect(calls.browser).toEqual([])
    expect(calls.native).toEqual([])
    expect(calls.expiry).toEqual([])
    expect(calls.reservation).toEqual([])
  })

  it('rejects wrong request shape, role, mutation bit, unknown steps, and cross-run identity', async () => {
    const runId = nextRunId()
    const issued = plan(runId)
    const { adapter, calls } = harness()
    const preflight = issued.steps[0]
    expect((await adapter.executeStep(request(preflight, runId))).status).toBe('passed')

    const provision = issued.steps.find(step => step.id === 'provision-synthetic-teacher')
    expect((await adapter.executeStep({
      ...request(provision, runId),
      actor: 'teacher',
    })).status).toBe('failed')
    expect((await adapter.executeStep({
      ...request(provision, runId),
      mutates: false,
    })).status).toBe('failed')
    expect(await adapter.executeStep({
      schemaVersion: 1,
      stepId: 'SECRET_UNKNOWN_STEP',
      phase: 'fixture',
      actor: 'fixture-admin',
      mutates: true,
      identity: identity(runId),
    })).toEqual({ stepId: 'invalid-step', status: 'failed' })
    expect((await adapter.executeStep(request(provision, `${runId}-other`))).status).toBe('failed')
    expect(calls.fixture).toEqual([])
    expect(calls.reservation).toEqual([])
  })

  it('requires the exact canonical order and never lets callers bypass run reservation', async () => {
    const runId = nextRunId()
    const issued = plan(runId)
    const { adapter, calls } = harness()
    expect((await adapter.executeStep(request(issued.steps[0], runId))).status).toBe('passed')

    const provision = issued.steps.find(step => step.id === 'provision-synthetic-teacher')
    expect((await adapter.executeStep(request(provision, runId))).status).toBe('failed')
    expect(calls.fixture).toEqual([])

    const reservation = issued.steps.find(step => step.id === 'reserve-unique-run-id')
    expect((await adapter.executeStep(request(reservation, runId))).status).toBe('passed')
    expect((await adapter.executeStep(request(provision, runId))).status).toBe('passed')
  })

  it('halts the journey after a delegated failure but still permits exact cleanup retry', async () => {
    const runId = nextRunId()
    const issued = plan(runId)
    const failingStep = 'provision-synthetic-teacher'
    const { adapter, calls } = harness({
      fixtureOverride: value => ({
        stepId: value.stepId,
        status: value.stepId === failingStep ? 'failed' : 'passed',
      }),
    })

    for (const step of issued.steps.slice(0, 3)) {
      const output = await adapter.executeStep(request(step, runId))
      expect(output.status).toBe(step.id === failingStep ? 'failed' : 'passed')
    }
    const nextStep = issued.steps[3]
    expect((await adapter.executeStep(request(nextStep, runId))).status).toBe('failed')
    expect(calls.fixture).toEqual([failingStep])

    const cleanup = issued.steps.at(-1)
    expect((await adapter.executeStep(request(cleanup, runId))).status).toBe('passed')
    expect(calls.fixture).toEqual([failingStep, 'cleanup-synthetic-fixture'])
  })

  it('accepts only exact redacted child results and never forwards extra payloads', async () => {
    const runId = nextRunId()
    const issued = plan(runId)
    const { adapter } = harness({
      fixtureOverride: value => ({
        stepId: value.stepId,
        status: 'passed',
        secret: 'CHILD_SECRET_SENTINEL',
      }),
    })
    expect((await adapter.executeStep(request(issued.steps[0], runId))).status).toBe('passed')
    const reservation = issued.steps.find(step => step.id === 'reserve-unique-run-id')
    const provision = issued.steps.find(step => step.id === 'provision-synthetic-teacher')
    expect((await adapter.executeStep(request(reservation, runId))).status).toBe('passed')
    const output = await adapter.executeStep(request(provision, runId))

    expect(output).toEqual({ stepId: provision.id, status: 'failed' })
    expect(JSON.stringify(output)).not.toContain('CHILD_SECRET_SENTINEL')
  })

  it('rejects a native release mismatch when the run declared a binding up front', async () => {
    const runId = nextRunId()
    const issued = plan(runId)
    const declared = {
      releaseId: `asr-${'2'.repeat(32)}-r4-${'d'.repeat(16)}`,
      releaseRevision: 4,
      artifactSha256: 'd'.repeat(64),
    }
    const { adapter } = harness()
    const nativeIndex = issued.steps.findIndex(step => step.id === 'register-assignment-seb-release')

    for (let index = 0; index <= nativeIndex; index += 1) {
      const output = await adapter.executeStep(request(issued.steps[index], runId, declared))
      if (index === nativeIndex) expect(output.status).toBe('failed')
      else expect(output.status).toBe('passed')
    }
  })

  it('allows idempotent cleanup retry but blocks all journey steps after cleanup starts', async () => {
    const runId = nextRunId()
    const issued = plan(runId)
    let cleanupAttempt = 0
    const { adapter, calls } = harness({
      fixtureOverride: value => {
        if (value.stepId !== 'cleanup-synthetic-fixture') {
          return { stepId: value.stepId, status: 'passed' }
        }
        cleanupAttempt += 1
        return {
          stepId: value.stepId,
          status: cleanupAttempt === 1 ? 'failed' : 'passed',
        }
      },
    })
    expect((await adapter.executeStep(request(issued.steps[0], runId))).status).toBe('passed')
    const cleanup = issued.steps.at(-1)
    expect((await adapter.executeStep(request(cleanup, runId))).status).toBe('failed')
    expect((await adapter.executeStep(request(cleanup, runId))).status).toBe('passed')
    expect((await adapter.executeStep(request(issued.steps[1], runId))).status).toBe('failed')
    expect(calls.fixture).toEqual(['cleanup-synthetic-fixture', 'cleanup-synthetic-fixture'])
  })

  it('serializes capability execution so concurrent requests cannot cross the trust boundary', async () => {
    const runId = nextRunId()
    const issued = plan(runId)
    let releaseAttestation
    const pendingAttestation = new Promise(resolve => { releaseAttestation = resolve })
    const { adapter, preflightCapability } = harness({
      preflightOverride: () => pendingAttestation,
    })

    const first = adapter.executeStep(request(issued.steps[0], runId))
    const concurrent = await adapter.executeStep(request(issued.steps[0], runId))
    expect(concurrent).toEqual({ stepId: 'verify-staging-isolation', status: 'failed' })
    expect(preflightCapability.attest).toHaveBeenCalledTimes(1)

    releaseAttestation(attestation())
    expect((await first).status).toBe('passed')
  })

  it('collapses malicious proxy/accessor payloads to coarse failures', async () => {
    const runId = nextRunId()
    const issued = plan(runId)
    const proxySentinel = 'PROXY_SECRET_SENTINEL'
    const { adapter: proxyAdapter } = harness({
      preflightOverride: () => new Proxy({}, {
        getPrototypeOf() {
          throw new Error(proxySentinel)
        },
      }),
    })
    await expect(proxyAdapter.executeStep(request(issued.steps[0], runId))).resolves.toEqual({
      stepId: 'verify-staging-isolation',
      status: 'failed',
    })

    const { adapter: accessorAdapter } = harness({
      reservationOverride: () => Object.defineProperty({}, 'stepId', {
        enumerable: true,
        get() {
          throw new Error('ACCESSOR_SECRET_SENTINEL')
        },
      }),
    })
    expect((await accessorAdapter.executeStep(request(issued.steps[0], runId))).status).toBe('passed')
    await expect(accessorAdapter.executeStep(request(issued.steps[1], runId))).resolves.toEqual({
      stepId: 'reserve-unique-run-id',
      status: 'failed',
    })

    const hostileRequest = new Proxy({}, {
      get(_target, property) {
        if (property === 'stepId') throw new Error('REQUEST_SECRET_SENTINEL')
        return undefined
      },
    })
    await expect(accessorAdapter.executeStep(hostileRequest)).resolves.toEqual({
      stepId: 'invalid-step',
      status: 'failed',
    })
  })

  it('blocks construction unless every trust-boundary capability is present', () => {
    expect(() => createSebStagingCompositeAdapter({})).toThrow(
      SebStagingCompositeAdapterBlockedError,
    )
  })
})
