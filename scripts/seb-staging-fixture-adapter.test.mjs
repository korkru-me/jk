import { describe, expect, it, vi } from 'vitest'

import { buildSebStagingMockHarnessPlan } from './seb-staging-mock-harness-core.mjs'
import {
  SebStagingFixtureAdapterBlockedError,
  createSebStagingFixtureAdapter,
} from './seb-staging-fixture-adapter.mjs'
import { runSebStagingLiveHarness } from './seb-staging-live-runner.mjs'

const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const ACCOUNT_STEP_IDS = [
  'provision-synthetic-teacher',
  'provision-unrelated-teacher',
  'provision-synthetic-student',
  'provision-secondary-student',
]
const CLEANUP_STEP_ID = 'cleanup-synthetic-fixture'
const AUTHENTICATE_TEACHER_STEP_ID = 'authenticate-teacher'
const ARTIFACT_SHA256 = 'a'.repeat(64)
const BLOCKED_ERROR_PATTERN = /SEB Staging fixture adapter blocked/
let runSequence = 0

function validEnvironment(overrides = {}) {
  return {
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
    NEXT_PUBLIC_SUPABASE_URL: OFFICIAL_STAGING_SUPABASE_ORIGIN,
    EXAM_QA_PRODUCTION_SITE_URL: 'https://www.korkru.com',
    EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://production-project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-long-enough-for-staging',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-long-enough-for-staging',
    EXAM_QA_DATA_POLICY: 'synthetic-only',
    EXAM_QA_COPY_PRODUCTION_DATA: 'false',
    EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
    EXAM_QA_SEB_TIME_CONTROL: 'true',
    ...overrides,
  }
}

function nextRunId(label = 'run') {
  runSequence += 1
  return `seb-s5-${label}-${runSequence}`
}

function uuid(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

function deterministicRandomBytes() {
  let call = 0
  return vi.fn(size => {
    call += 1
    return new Uint8Array(size).fill(call)
  })
}

function adminHarness({
  createOverride,
  getOverride,
  deleteOverride,
  targetOrigin = OFFICIAL_STAGING_SUPABASE_ORIGIN,
} = {}) {
  const createCalls = []
  const getCalls = []
  const deleteCalls = []
  const events = []
  const users = new Map()
  let createIndex = 0

  const client = {
    supabaseUrl: targetOrigin,
    auth: {
      admin: {
        createUser: vi.fn(async attributes => {
          createIndex += 1
          createCalls.push(structuredClone(attributes))
          events.push(`create:${createIndex}`)
          let response = null
          if (createOverride) response = await createOverride({ attributes, createIndex, users })
          if (!response) {
            response = {
              data: {
                user: {
                  id: uuid(createIndex),
                  email: attributes.email,
                  user_metadata: structuredClone(attributes.user_metadata),
                  app_metadata: structuredClone(attributes.app_metadata),
                },
              },
              error: null,
            }
          }
          if (response?.data?.user?.id) {
            users.set(response.data.user.id, structuredClone(response.data.user))
          }
          return response
        }),
        getUserById: vi.fn(async id => {
          getCalls.push(id)
          events.push(`get:${id}`)
          if (getOverride) {
            const response = await getOverride({ id, users })
            if (response) return response
          }
          const user = users.get(id)
          return user
            ? { data: { user: structuredClone(user) }, error: null }
            : { data: { user: null }, error: { code: 'user_not_found' } }
        }),
        deleteUser: vi.fn(async id => {
          deleteCalls.push(id)
          events.push(`delete:${id}`)
          if (deleteOverride) {
            const response = await deleteOverride({ id, users, deleteCalls })
            if (response) return response
          }
          users.delete(id)
          return { data: { user: null }, error: null }
        }),
      },
    },
  }
  const attestation = { targetOrigin, client }
  return {
    attestation,
    client,
    createCalls,
    getCalls,
    deleteCalls,
    events,
    users,
  }
}

function identity(runId) {
  return {
    runId,
    sourceRevision: 'b'.repeat(40),
    deploymentId: `dpl_${'C'.repeat(24)}`,
    releaseId: `asr-${'1'.repeat(32)}-r3-${ARTIFACT_SHA256.slice(0, 16)}`,
    releaseRevision: 3,
    artifactSha256: ARTIFACT_SHA256,
  }
}

function executablePlan(runId) {
  return buildSebStagingMockHarnessPlan({
    environment: validEnvironment(),
    mode: 'execute',
    runId,
    writeConfirmation: 'CONFIRM_SYNTHETIC_SEB_STAGING_WRITE',
  })
}

function stepRequest(stepId, runId) {
  const cleanup = stepId === CLEANUP_STEP_ID
  return {
    schemaVersion: 1,
    stepId,
    phase: cleanup ? 'cleanup' : 'fixture',
    actor: 'fixture-admin',
    mutates: true,
    identity: identity(runId),
  }
}

function authenticationRequest(stepId, runId) {
  const spec = {
    'authenticate-teacher': ['teacher-setup', 'teacher'],
    'authenticate-student-for-enrolment': ['student-enrolment', 'student'],
    'authenticate-secondary-student-for-enrolment': ['student-enrolment', 'student-secondary'],
    'authenticate-teacher-for-assignment': ['teacher-setup', 'teacher'],
    'authenticate-student': ['student-journey', 'student'],
    'authenticate-teacher-for-result': ['teacher-result', 'teacher'],
    'authenticate-secondary-student': ['authorization', 'student-secondary'],
    'authenticate-unrelated-teacher': ['authorization', 'teacher-unrelated'],
  }[stepId]
  return {
    schemaVersion: 1,
    stepId,
    phase: spec?.[0],
    actor: spec?.[1],
    mutates: false,
    identity: identity(runId),
  }
}

function createAdapter({
  environmentState,
  runId,
  harness,
  randomBytes,
  clock,
  factoryOverride,
  browserSessionCapability,
} = {}) {
  const resolvedRunId = runId ?? nextRunId()
  const state = environmentState ?? { current: validEnvironment() }
  const resolvedHarness = harness ?? adminHarness()
  const readEnvironment = vi.fn(() => state.current)
  const adminClientFactory = vi.fn(async request => (
    factoryOverride
      ? factoryOverride({ request, harness: resolvedHarness })
      : resolvedHarness.attestation
  ))
  const adapter = createSebStagingFixtureAdapter({
    readEnvironment,
    runId: resolvedRunId,
    adminClientFactory,
    browserSessionCapability,
    randomBytes: randomBytes ?? deterministicRandomBytes(),
    clock: clock ?? (() => new Date('2026-09-23T06:00:00.000Z')),
  })
  return {
    adapter,
    adminClientFactory,
    environmentState: state,
    harness: resolvedHarness,
    readEnvironment,
    runId: resolvedRunId,
  }
}

async function provisionAll(adapter, runId) {
  const results = []
  for (const stepId of ACCOUNT_STEP_IDS) {
    results.push(await adapter.executeStep(stepRequest(stepId, runId)))
  }
  return results
}

function expectRedactedResult(result, stepId) {
  expect(result).toEqual({ stepId, status: expect.stringMatching(/^(passed|failed)$/) })
  expect(Object.keys(result)).toEqual(['stepId', 'status'])
  expect(JSON.stringify(result)).not.toMatch(/@|https?:|supabase|00000000-|password|token|secret/i)
  expect(Object.isFrozen(result)).toBe(true)
}

function liveCompositeAdapter(fixtureAdapter, calls, failAt = 'authenticate-teacher') {
  return {
    async executeStep(request) {
      calls.push(request.stepId)
      if (request.stepId === 'verify-staging-isolation') {
        return { stepId: request.stepId, status: 'passed' }
      }
      if (ACCOUNT_STEP_IDS.includes(request.stepId) || request.stepId === CLEANUP_STEP_ID) {
        return fixtureAdapter.executeStep(request)
      }
      return {
        stepId: request.stepId,
        status: request.stepId === failAt ? 'failed' : 'passed',
      }
    },
  }
}

describe('SEB Staging synthetic fixture adapter', () => {
  it('blocks non-official targets, unsafe run IDs, and environment-reader exceptions before client construction', () => {
    const environments = [
      validEnvironment({ KORKRU_DEPLOYMENT_ENV: 'production', VERCEL_ENV: 'production' }),
      validEnvironment({ NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com/' }),
      validEnvironment({ NEXT_PUBLIC_SUPABASE_URL: 'https://production-project.supabase.co' }),
      validEnvironment({ EXAM_QA_DATA_POLICY: 'copied-production' }),
      validEnvironment({ EXAM_QA_COPY_PRODUCTION_DATA: 'true' }),
      validEnvironment({ EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'false' }),
    ]

    for (const environment of environments) {
      const adminClientFactory = vi.fn()
      expect(() => createSebStagingFixtureAdapter({
        readEnvironment: () => environment,
        runId: nextRunId('blocked'),
        adminClientFactory,
        randomBytes: deterministicRandomBytes(),
        clock: () => new Date('2026-09-23T06:00:00.000Z'),
      })).toThrow(SebStagingFixtureAdapterBlockedError)
      expect(adminClientFactory).not.toHaveBeenCalled()
    }

    expect(() => createSebStagingFixtureAdapter({
      readEnvironment: () => { throw new Error('ENV_SECRET_SENTINEL') },
      runId: nextRunId('reader'),
      adminClientFactory: vi.fn(),
      randomBytes: deterministicRandomBytes(),
      clock: () => new Date('2026-09-23T06:00:00.000Z'),
    })).toThrow(BLOCKED_ERROR_PATTERN)

    for (const runId of ['seb-s5-preview', 'seb-s5-production-copy', 'seb-s5-real-students']) {
      expect(() => createSebStagingFixtureAdapter({
        readEnvironment: () => validEnvironment(),
        runId,
        adminClientFactory: vi.fn(),
        randomBytes: deterministicRandomBytes(),
        clock: () => new Date('2026-09-23T06:00:00.000Z'),
      })).toThrow(SebStagingFixtureAdapterBlockedError)
    }
  })

  it('creates exactly one account per exact issued step and never returns credentials or IDs', async () => {
    const { adapter, adminClientFactory, harness, runId } = createAdapter()
    const results = await provisionAll(adapter, runId)

    expect(results.map(result => result.status)).toEqual(['passed', 'passed', 'passed', 'passed'])
    expect(adminClientFactory).toHaveBeenCalledTimes(1)
    expect(adminClientFactory).toHaveBeenCalledWith({
      targetOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
    })
    expect(harness.createCalls).toHaveLength(4)
    expect(harness.createCalls.map(value => value.user_metadata.qa_alias)).toEqual([
      'teacher-primary',
      'teacher-unrelated',
      'student-primary',
      'student-secondary',
    ])
    expect(harness.createCalls.map(value => value.user_metadata.role)).toEqual([
      'teacher',
      'teacher',
      'student',
      'student',
    ])
    for (let index = 0; index < results.length; index += 1) {
      expectRedactedResult(results[index], ACCOUNT_STEP_IDS[index])
    }
    const serialized = JSON.stringify({ adapter, results })
    for (const call of harness.createCalls) {
      expect(serialized).not.toContain(call.email)
      expect(serialized).not.toContain(call.password)
      expect(serialized).not.toContain(call.user_metadata.qa_namespace)
    }
  })

  it('authenticates inside the same closure without returning credentials or session details', async () => {
    const capturedPayloads = []
    const browserSessionCapability = {
      authenticate: vi.fn(async payload => {
        capturedPayloads.push(payload)
        expect(payload.credentials.email).toMatch(/^seb-s5-tp-/)
        expect(payload.credentials.password).toMatch(/^Aa1!/)
        return {
          targetOrigin: 'https://staging.korkru.com',
          authenticatedUserId: uuid(1),
          appMetadata: {
            qa_fixture: 'seb-s5',
            qa_namespace: payload.namespace,
            qa_role: payload.role,
            qa_alias: payload.alias,
            qa_schema_version: 1,
          },
          ignoredSecret: 'BROWSER_SESSION_SECRET_SENTINEL',
        }
      }),
      closeAll: vi.fn(async () => {}),
    }
    const { adapter, runId } = createAdapter({ browserSessionCapability })
    await provisionAll(adapter, runId)

    const result = await adapter.executeStep(authenticationRequest(AUTHENTICATE_TEACHER_STEP_ID, runId))
    expectRedactedResult(result, AUTHENTICATE_TEACHER_STEP_ID)
    expect(result.status).toBe('passed')
    expect(browserSessionCapability.authenticate).toHaveBeenCalledTimes(1)
    expect(capturedPayloads[0].credentials).toEqual({ email: '', password: '' })
    expect(JSON.stringify(result)).not.toContain('BROWSER_SESSION_SECRET_SENTINEL')

    expect((await adapter.executeStep(stepRequest(CLEANUP_STEP_ID, runId))).status).toBe('passed')
    expect(browserSessionCapability.closeAll).toHaveBeenCalledTimes(1)
  })

  it('rejects wrong browser identity attestation and never retries that auth step', async () => {
    const browserSessionCapability = {
      authenticate: vi.fn(async payload => ({
        targetOrigin: 'https://staging.korkru.com',
        authenticatedUserId: uuid(2),
        appMetadata: {
          qa_fixture: 'seb-s5',
          qa_namespace: payload.namespace,
          qa_role: payload.role,
          qa_alias: payload.alias,
          qa_schema_version: 1,
        },
      })),
      closeAll: vi.fn(async () => {}),
    }
    const { adapter, runId } = createAdapter({ browserSessionCapability })
    await provisionAll(adapter, runId)

    expect((await adapter.executeStep(authenticationRequest(AUTHENTICATE_TEACHER_STEP_ID, runId))).status).toBe('failed')
    expect((await adapter.executeStep(authenticationRequest(AUTHENTICATE_TEACHER_STEP_ID, runId))).status).toBe('failed')
    expect(browserSessionCapability.authenticate).toHaveBeenCalledTimes(1)
  })

  it('rejects out-of-order, repeated, or wrong-run requests without another mutation', async () => {
    const { adapter, harness, runId } = createAdapter()
    const outOfOrder = await adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[1], runId))
    expect(outOfOrder.status).toBe('failed')
    expect(harness.createCalls).toHaveLength(0)

    // A rejected out-of-order step is not consumed; the exact first step can proceed.
    expect((await adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], runId))).status).toBe('passed')
    expect((await adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], runId))).status).toBe('failed')
    expect((await adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[1], 'seb-s5-wrong-run'))).status).toBe('failed')
    expect(harness.createCalls).toHaveLength(1)
  })

  it('requires an exact attested Staging client target before the first mutation', async () => {
    const harness = adminHarness({ targetOrigin: 'https://production-project.supabase.co' })
    const { adapter, runId } = createAdapter({ harness })
    const result = await adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], runId))

    expect(result.status).toBe('failed')
    expect(harness.createCalls).toEqual([])
    expectRedactedResult(result, ACCOUNT_STEP_IDS[0])
  })

  it('rejects a factory that claims Staging while its client is bound to another origin', async () => {
    const harness = adminHarness()
    harness.client.supabaseUrl = 'https://production-project.supabase.co'
    const { adapter, runId } = createAdapter({ harness })
    const result = await adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], runId))

    expect(result.status).toBe('failed')
    expect(harness.createCalls).toEqual([])
  })

  it('runs the four exact fixture steps through the real live runner and cleans up on the next failure', async () => {
    const runId = nextRunId('integrated')
    const { adapter, harness } = createAdapter({ runId })
    const calls = []
    const output = await runSebStagingLiveHarness({
      plan: executablePlan(runId),
      identity: identity(runId),
      adapter: liveCompositeAdapter(adapter, calls),
    })

    expect(output.status).toBe('failed')
    expect(calls.slice(0, 6)).toEqual([
      'verify-staging-isolation',
      ...ACCOUNT_STEP_IDS,
      'authenticate-teacher',
    ])
    expect(calls.at(-1)).toBe(CLEANUP_STEP_ID)
    for (const stepId of ACCOUNT_STEP_IDS) expect(output.stepEvidence[stepId]).toBe('passed')
    expect(output.stepEvidence[CLEANUP_STEP_ID]).toBe('passed')
    expect(harness.createCalls).toHaveLength(4)
    expect(harness.getCalls).toEqual([uuid(4), uuid(3), uuid(2), uuid(1)])
    expect(harness.deleteCalls).toEqual([uuid(4), uuid(3), uuid(2), uuid(1)])
  })

  it.each([1, 2, 3, 4])(
    'cleans every previously created exact account when provisioning step %i fails',
    async failedCreateIndex => {
      const runId = nextRunId(`partial-${failedCreateIndex}`)
      const harness = adminHarness({
        createOverride: ({ createIndex }) => createIndex === failedCreateIndex
          ? { data: { user: null }, error: new Error('CREATE_SECRET_SENTINEL') }
          : null,
      })
      const { adapter } = createAdapter({ runId, harness })
      const output = await runSebStagingLiveHarness({
        plan: executablePlan(runId),
        identity: identity(runId),
        adapter: liveCompositeAdapter(adapter, []),
      })

      expect(output.status).toBe('failed')
      expect(harness.createCalls).toHaveLength(failedCreateIndex)
      expect(harness.deleteCalls).toEqual(
        Array.from({ length: failedCreateIndex - 1 }, (_, index) => uuid(failedCreateIndex - 1 - index)),
      )
      expect(JSON.stringify(output)).not.toContain('CREATE_SECRET_SENTINEL')
    },
  )

  it('rechecks the environment before every create and permits cleanup after writes are disabled', async () => {
    const state = { current: validEnvironment() }
    const { adapter, harness, runId } = createAdapter({ environmentState: state })
    expect((await adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], runId))).status).toBe('passed')

    state.current = validEnvironment({ EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'false' })
    expect((await adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[1], runId))).status).toBe('failed')
    expect(harness.createCalls).toHaveLength(1)
    expect((await adapter.executeStep(stepRequest(CLEANUP_STEP_ID, runId))).status).toBe('passed')
    expect(harness.deleteCalls).toEqual([uuid(1)])
  })

  it('blocks cleanup if the environment no longer points to exact official Staging', async () => {
    const state = { current: validEnvironment() }
    const { adapter, harness, runId } = createAdapter({ environmentState: state })
    expect((await adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], runId))).status).toBe('passed')

    state.current = validEnvironment({ NEXT_PUBLIC_SUPABASE_URL: 'https://production-project.supabase.co' })
    const cleanup = await adapter.executeStep(stepRequest(CLEANUP_STEP_ID, runId))
    expect(cleanup.status).toBe('failed')
    expect(harness.getCalls).toEqual([])
    expect(harness.deleteCalls).toEqual([])
  })

  it('revalidates exact ID, email, namespace, role, alias, and schema before every delete', async () => {
    const { adapter, harness, runId } = createAdapter()
    await provisionAll(adapter, runId)
    const changed = harness.users.get(uuid(3))
    harness.users.set(uuid(3), {
      ...changed,
      app_metadata: { ...changed.app_metadata, qa_namespace: 'qa:other-run' },
    })

    const cleanup = await adapter.executeStep(stepRequest(CLEANUP_STEP_ID, runId))
    expect(cleanup.status).toBe('failed')
    expect(harness.getCalls).toEqual([uuid(4), uuid(3), uuid(2), uuid(1)])
    expect(harness.deleteCalls).toEqual([uuid(4), uuid(2), uuid(1)])
    expect(harness.users.has(uuid(3))).toBe(true)
  })

  it('performs get-before-delete in exact reverse order and cleanup stays idempotent', async () => {
    const { adapter, harness, runId } = createAdapter()
    await provisionAll(adapter, runId)

    expect((await adapter.executeStep(stepRequest(CLEANUP_STEP_ID, runId))).status).toBe('passed')
    expect(harness.events.slice(-8)).toEqual([
      `get:${uuid(4)}`, `delete:${uuid(4)}`,
      `get:${uuid(3)}`, `delete:${uuid(3)}`,
      `get:${uuid(2)}`, `delete:${uuid(2)}`,
      `get:${uuid(1)}`, `delete:${uuid(1)}`,
    ])
    expect((await adapter.executeStep(stepRequest(CLEANUP_STEP_ID, runId))).status).toBe('passed')
    expect(harness.getCalls).toHaveLength(4)
    expect(harness.deleteCalls).toHaveLength(4)
  })

  it('never resumes creation after cleanup has started', async () => {
    const { adapter, harness, runId } = createAdapter()
    expect((await adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], runId))).status).toBe('passed')
    expect((await adapter.executeStep(stepRequest(CLEANUP_STEP_ID, runId))).status).toBe('passed')

    const resumed = await adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[1], runId))
    expect(resumed.status).toBe('failed')
    expect(harness.createCalls).toHaveLength(1)
  })

  it('fails closed if the captured client attestation changes before cleanup', async () => {
    const harness = adminHarness()
    const { adapter, runId } = createAdapter({ harness })
    expect((await adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], runId))).status).toBe('passed')
    harness.attestation.targetOrigin = 'https://production-project.supabase.co'

    const cleanup = await adapter.executeStep(stepRequest(CLEANUP_STEP_ID, runId))
    expect(cleanup.status).toBe('failed')
    expect(harness.getCalls).toEqual([])
    expect(harness.deleteCalls).toEqual([])
  })

  it('does not report cleanup success after an ambiguous create transport failure', async () => {
    let possiblyCommitted = false
    const harness = adminHarness({
      createOverride: () => {
        possiblyCommitted = true
        throw new Error('AMBIGUOUS_CREATE_SECRET_SENTINEL')
      },
    })
    const { adapter, runId } = createAdapter({ harness })

    expect((await adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], runId))).status).toBe('failed')
    expect(possiblyCommitted).toBe(true)
    expect((await adapter.executeStep(stepRequest(CLEANUP_STEP_ID, runId))).status).toBe('failed')
  })

  it('reacquires the attested client immediately before delete', async () => {
    let originalHarness
    const replacementHarness = adminHarness()
    originalHarness = adminHarness({
      getOverride: ({ id, users }) => {
        const user = users.get(id)
        originalHarness.client.supabaseUrl = 'https://production-project.supabase.co'
        originalHarness.attestation.client = replacementHarness.client
        return { data: { user: structuredClone(user) }, error: null }
      },
    })
    const { adapter, runId } = createAdapter({ harness: originalHarness })
    expect((await adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], runId))).status).toBe('passed')

    expect((await adapter.executeStep(stepRequest(CLEANUP_STEP_ID, runId))).status).toBe('passed')
    expect(originalHarness.deleteCalls).toEqual([])
    expect(replacementHarness.deleteCalls).toEqual([uuid(1)])
  })

  it('confirms exact not-found on retry after an uncertain delete response', async () => {
    let firstDelete = true
    const harness = adminHarness({
      deleteOverride: ({ id, users }) => {
        if (!firstDelete) return null
        firstDelete = false
        users.delete(id)
        return { data: { user: null }, error: new Error('DELETE_TRANSPORT_SENTINEL') }
      },
    })
    const { adapter, runId } = createAdapter({ harness })
    expect((await adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], runId))).status).toBe('passed')

    expect((await adapter.executeStep(stepRequest(CLEANUP_STEP_ID, runId))).status).toBe('failed')
    expect((await adapter.executeStep(stepRequest(CLEANUP_STEP_ID, runId))).status).toBe('passed')
    expect(harness.deleteCalls).toEqual([uuid(1)])
  })

  it('validates the clock and random source without leaking exception details', async () => {
    expect(() => createAdapter({ clock: () => new Date('invalid') })).toThrow(
      SebStagingFixtureAdapterBlockedError,
    )
    expect(() => createAdapter({
      clock: () => { throw new Error('CLOCK_SECRET_SENTINEL') },
    })).toThrow(BLOCKED_ERROR_PATTERN)

    const { adapter, adminClientFactory, runId } = createAdapter({
      randomBytes: () => { throw new Error('RANDOM_SECRET_SENTINEL') },
    })
    const result = await adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], runId))
    expect(result.status).toBe('failed')
    expect(adminClientFactory).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('RANDOM_SECRET_SENTINEL')
  })
})
