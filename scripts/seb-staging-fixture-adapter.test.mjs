import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildSebStagingMockHarnessPlan } from './seb-staging-mock-harness-core.mjs'
import {
  SebStagingFixtureAdapterBlockedError,
  createSebStagingFixtureAdapter,
} from './seb-staging-fixture-adapter.mjs'
import { runSebStagingLiveHarness } from './seb-staging-live-runner.mjs'
import { createSebStagingPrivateRunLedger } from './seb-staging-private-run-ledger.mjs'

const SITE_ORIGIN = 'https://staging.korkru.com'
const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const NOW = '2026-09-23T06:00:00.000Z'
const NOT_BEFORE = '2026-09-23T05:00:00.000Z'
const NOT_AFTER = '2026-09-23T07:00:00.000Z'
const SOURCE_REVISION = 'b'.repeat(40)
const DEPLOYMENT_ID = `dpl_${'C'.repeat(24)}`
const ARTIFACT_SHA256 = 'a'.repeat(64)
const ACCOUNT_STEP_IDS = [
  'provision-synthetic-teacher',
  'provision-unrelated-teacher',
  'provision-synthetic-student',
  'provision-secondary-student',
]
const ALIASES = [
  'teacher-primary',
  'teacher-unrelated',
  'student-primary',
  'student-secondary',
]
const CLEANUP_STEP_ID = 'cleanup-synthetic-fixture'
const DEFAULT_ADMIN_RESPONSE = Symbol('default-admin-response')
let runSequence = 0

afterEach(() => {
  vi.useRealTimers()
})

function validEnvironment(overrides = {}) {
  return {
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: SITE_ORIGIN,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_ORIGIN,
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
  return `${String(index).padStart(8, '0')}-0000-4000-8000-${String(index).padStart(12, '0')}`
}

function runIdentity(runId, overrides = {}) {
  return {
    runId,
    sourceRevision: SOURCE_REVISION,
    deploymentId: DEPLOYMENT_ID,
    creationWindow: {
      notBefore: NOT_BEFORE,
      notAfter: NOT_AFTER,
    },
    ...overrides,
  }
}

function requestIdentity(runId) {
  return {
    runId,
    sourceRevision: SOURCE_REVISION,
    deploymentId: DEPLOYMENT_ID,
    releaseId: `asr-${'1'.repeat(32)}-r3-${ARTIFACT_SHA256.slice(0, 16)}`,
    releaseRevision: 3,
    artifactSha256: ARTIFACT_SHA256,
  }
}

function stepRequest(stepId, runId) {
  const cleanup = stepId === CLEANUP_STEP_ID
  return {
    schemaVersion: 1,
    stepId,
    phase: cleanup ? 'cleanup' : 'fixture',
    actor: 'fixture-admin',
    mutates: true,
    identity: requestIdentity(runId),
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
    identity: requestIdentity(runId),
  }
}

function deterministicRandomBytes() {
  let call = 0
  return vi.fn(size => new Uint8Array(size).fill(++call))
}

function authoritative(matches) {
  return { schemaVersion: 1, authoritative: true, matches }
}

function ledgerCandidate(criteria, targetId, createdAt = NOW) {
  return {
    schemaVersion: 1,
    targetKey: criteria.targetKey,
    kind: criteria.kind,
    identity: structuredClone(criteria.identity),
    targetId,
    namespace: criteria.namespace,
    ownerId: criteria.ownerId,
    organizationId: criteria.organizationId,
    resourceType: criteria.resourceType,
    createdAt,
  }
}

function userFromAttributes(id, attributes, createdAt = NOW) {
  return {
    id,
    email: attributes.email,
    created_at: createdAt,
    user_metadata: structuredClone(attributes.user_metadata),
    app_metadata: structuredClone(attributes.app_metadata),
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function adminHarness({
  createOverride,
  listOverride,
  getOverride,
  deleteOverride,
  organizationMode = 'one',
  targetOrigin = SUPABASE_ORIGIN,
} = {}) {
  const users = new Map()
  const organizations = new Map()
  const createCalls = []
  const listCalls = []
  const getCalls = []
  const deleteCalls = []
  const signals = []
  const events = []
  let createIndex = 0

  function commitUser(attributes, id = uuid(createIndex), createdAt = NOW) {
    const user = userFromAttributes(id, attributes, createdAt)
    users.set(id, structuredClone(user))
    if (organizationMode !== 'missing') {
      const count = organizationMode === 'multiple' ? 2 : 1
      organizations.set(id, Array.from({ length: count }, (_, offset) => ({
        organizationId: uuid(100 + createIndex * 10 + offset),
        membershipId: uuid(200 + createIndex * 10 + offset),
        createdAt,
      })))
    }
    return user
  }

  const admin = {
    createUser: vi.fn(async (attributes, options) => {
      createIndex += 1
      createCalls.push(structuredClone(attributes))
      signals.push(options?.signal)
      events.push(`create:${createIndex}`)
      if (createOverride) {
        const overridden = await createOverride({
          attributes,
          createIndex,
          users,
          organizations,
          commitUser,
          signal: options?.signal,
        })
        if (overridden !== undefined) return overridden
      }
      const user = commitUser(attributes)
      return { data: { user: structuredClone(user) }, error: null }
    }),
    listUsers: vi.fn(async (params, options) => {
      listCalls.push(structuredClone(params))
      signals.push(options?.signal)
      events.push(`list:${params?.page}`)
      if (listOverride) {
        const overridden = await listOverride({ params, users, signal: options?.signal })
        if (overridden !== undefined) return overridden
      }
      const page = params?.page ?? 1
      const perPage = params?.perPage ?? 50
      const values = [...users.values()]
      const start = (page - 1) * perPage
      return {
        data: {
          users: structuredClone(values.slice(start, start + perPage)),
          total: values.length,
          nextPage: start + perPage < values.length ? page + 1 : null,
          lastPage: Math.max(1, Math.ceil(values.length / perPage)),
        },
        error: null,
      }
    }),
    getUserById: vi.fn(async (id, options) => {
      getCalls.push(id)
      signals.push(options?.signal)
      events.push(`get:${id}`)
      if (getOverride) {
        const overridden = await getOverride({ id, users, signal: options?.signal })
        if (overridden !== undefined) return overridden
      }
      const user = users.get(id)
      return user
        ? { data: { user: structuredClone(user) }, error: null }
        : { data: { user: null }, error: { code: 'user_not_found' } }
    }),
    deleteUser: vi.fn(async (id, shouldSoftDelete, options) => {
      deleteCalls.push(id)
      signals.push(options?.signal)
      events.push(`delete:${id}`)
      if (deleteOverride) {
        const overridden = await deleteOverride({
          id,
          users,
          shouldSoftDelete,
          signal: options?.signal,
        })
        if (overridden !== DEFAULT_ADMIN_RESPONSE) return overridden
      }
      users.delete(id)
      return { data: { user: null }, error: null }
    }),
  }
  const client = { supabaseUrl: targetOrigin, auth: { admin } }
  const attestation = {
    targetOrigin,
    credentialKind: 'service-role',
    client,
  }
  return {
    admin,
    attestation,
    client,
    users,
    organizations,
    createCalls,
    listCalls,
    getCalls,
    deleteCalls,
    signals,
    events,
    commitUser,
  }
}

function defaultReconciliationLookup(harness) {
  return vi.fn(async (criteria, options) => {
    if (options?.signal?.aborted) throw new Error('aborted')
    if (criteria.kind === 'account') {
      const alias = criteria.targetKey.replace(/^account-/, '')
      const matches = [...harness.users.values()]
        .filter(user => user.app_metadata?.qa_namespace === criteria.namespace
          && user.app_metadata?.qa_alias === alias
          && user.app_metadata?.qa_role === criteria.resourceType)
        .map(user => ledgerCandidate(criteria, user.id, user.created_at))
      return authoritative(matches)
    }
    if (criteria.kind === 'personalOrganization') {
      const organizations = harness.organizations.get(criteria.ownerId) ?? []
      return authoritative(organizations.map(value => ledgerCandidate(
        criteria,
        `${value.organizationId}:${value.membershipId}`,
        value.createdAt,
      )))
    }
    return authoritative([])
  })
}

function createPrivateLedger({
  identity,
  readEnvironment,
  harness,
  reconciliationLookup,
  ledgerClock = () => new Date(NOW),
} = {}) {
  const lookup = reconciliationLookup ?? defaultReconciliationLookup(harness)
  const ledger = createSebStagingPrivateRunLedger({
    schemaVersion: 1,
    identity,
    namespace: `qa:${identity.runId}`,
    readEnvironment,
    reconciliationClient: {
      targetOrigin: SUPABASE_ORIGIN,
      credentialKind: 'service-role',
      client: {
        supabaseUrl: SUPABASE_ORIGIN,
        findExactRunTargets: lookup,
      },
    },
    reconciliationTimeoutMs: 100,
    clock: ledgerClock,
  })
  return { ledger, reconciliationLookup: lookup }
}

function createAdapter({
  environmentState,
  runId,
  identity: identityOverride,
  harness,
  randomBytes,
  clock = () => new Date(NOW),
  ledgerClock,
  privateRunLedger,
  reconciliationLookup,
  factoryOverride,
  browserSessionCapability,
  browserDataLifecycleCapability,
  resourceCleanupCapability,
  authBoundaryTimeoutMs = 50,
} = {}) {
  const resolvedRunId = runId ?? nextRunId()
  const state = environmentState ?? { current: validEnvironment() }
  const resolvedIdentity = identityOverride ?? runIdentity(resolvedRunId)
  const resolvedHarness = harness ?? adminHarness()
  const readEnvironment = vi.fn(() => state.current)
  const ledgerHarness = privateRunLedger
    ? { ledger: privateRunLedger, reconciliationLookup }
    : createPrivateLedger({
        identity: resolvedIdentity,
        readEnvironment,
        harness: resolvedHarness,
        reconciliationLookup,
        ledgerClock,
      })
  const factoryCalls = []
  const adminClientFactory = vi.fn(async request => {
    factoryCalls.push(request)
    return factoryOverride
      ? factoryOverride({ request, harness: resolvedHarness })
      : resolvedHarness.attestation
  })
  const cleanupCapability = resourceCleanupCapability ?? {
    cleanupRun: vi.fn(async () => Object.freeze({ status: 'passed' })),
  }
  const browserDataLifecycle = browserDataLifecycleCapability ?? Object.freeze({
    executeStep: vi.fn(),
    closeAll: vi.fn(async () => Object.freeze({ status: 'passed' })),
  })
  const adapter = createSebStagingFixtureAdapter({
    readEnvironment,
    runId: resolvedRunId,
    runIdentity: resolvedIdentity,
    privateRunLedger: ledgerHarness.ledger,
    adminClientFactory,
    browserSessionCapability,
    browserDataLifecycleCapability: browserDataLifecycle,
    resourceCleanupCapability: cleanupCapability,
    randomBytes: randomBytes ?? deterministicRandomBytes(),
    clock,
    authBoundaryTimeoutMs,
  })
  return {
    adapter,
    adminClientFactory,
    factoryCalls,
    environmentState: state,
    harness: resolvedHarness,
    identity: resolvedIdentity,
    privateRunLedger: ledgerHarness.ledger,
    reconciliationLookup: ledgerHarness.reconciliationLookup,
    readEnvironment,
    browserDataLifecycleCapability: browserDataLifecycle,
    resourceCleanupCapability: cleanupCapability,
    runId: resolvedRunId,
  }
}

async function provisionAll(adapter, runId) {
  const output = []
  for (const stepId of ACCOUNT_STEP_IDS) {
    output.push(await adapter.executeStep(stepRequest(stepId, runId)))
  }
  return output
}

function expectRedacted(result, stepId, status = 'passed') {
  expect(result).toEqual({ stepId, status })
  expect(Object.keys(result)).toEqual(['stepId', 'status'])
  expect(Object.isFrozen(result)).toBe(true)
  expect(JSON.stringify(result)).not.toMatch(/@|https?:|supabase|00000000-|password|token|secret/i)
}

function executablePlan(runId) {
  return buildSebStagingMockHarnessPlan({
    environment: validEnvironment(),
    mode: 'execute',
    runId,
    writeConfirmation: 'CONFIRM_SYNTHETIC_SEB_STAGING_WRITE',
  })
}

function liveCompositeAdapter(fixtureAdapter, calls, failAt = 'authenticate-teacher') {
  return {
    async executeStep(request) {
      calls.push(request.stepId)
      if (request.stepId === 'verify-staging-isolation'
        || request.stepId === 'reserve-unique-run-id') {
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
  it('provisions the four exact accounts and personal organizations without exposing private material', async () => {
    const fixture = createAdapter()
    const results = await provisionAll(fixture.adapter, fixture.runId)

    expect(results.map(result => result.status)).toEqual(['passed', 'passed', 'passed', 'passed'])
    expect(fixture.harness.createCalls).toHaveLength(4)
    expect(fixture.reconciliationLookup).toHaveBeenCalledTimes(4)
    expect(fixture.reconciliationLookup.mock.calls.map(call => call[0].targetKey)).toEqual(
      ALIASES.map(alias => `personal-organization-${alias}`),
    )
    expect(fixture.factoryCalls).toHaveLength(1)
    expect(fixture.factoryCalls[0].targetOrigin).toBe(SUPABASE_ORIGIN)
    expect(fixture.factoryCalls[0].credentialKind).toBe('service-role')
    expect(fixture.factoryCalls[0].signal).toBeInstanceOf(AbortSignal)
    expect(fixture.harness.signals.every(signal => signal instanceof AbortSignal)).toBe(true)
    results.forEach((result, index) => expectRedacted(result, ACCOUNT_STEP_IDS[index]))
    for (const alias of ALIASES) {
      expect(fixture.privateRunLedger.readCleanupTarget({
        schemaVersion: 1,
        targetKey: `account-${alias}`,
        kind: 'account',
      })).toMatchObject({ status: 'passed', state: 'committed', snapshots: [{
        targetKey: `account-${alias}`,
      }] })
      expect(fixture.privateRunLedger.readCleanupTarget({
        schemaVersion: 1,
        targetKey: `personal-organization-${alias}`,
        kind: 'personalOrganization',
      })).toMatchObject({ status: 'passed', state: 'committed', snapshots: [{
        targetKey: `personal-organization-${alias}`,
      }] })
    }
    const serialized = JSON.stringify({ adapter: fixture.adapter, results })
    expect(serialized).not.toMatch(/@qa\.staging\.korkru\.com|Aa1!|00000000-/)
  })

  it('runs the fixture slice through the real live runner and cleans up on the next failure', async () => {
    const runId = nextRunId('integrated')
    const fixture = createAdapter({ runId })
    const calls = []
    const output = await runSebStagingLiveHarness({
      plan: executablePlan(runId),
      identity: requestIdentity(runId),
      adapter: liveCompositeAdapter(fixture.adapter, calls),
    })

    expect(output.status).toBe('failed')
    expect(calls.slice(0, 7)).toEqual([
      'verify-staging-isolation',
      'reserve-unique-run-id',
      ...ACCOUNT_STEP_IDS,
      'authenticate-teacher',
    ])
    expect(calls.at(-1)).toBe(CLEANUP_STEP_ID)
    expect(output.stepEvidence[CLEANUP_STEP_ID]).toBe('passed')
    expect(fixture.harness.deleteCalls).toEqual([uuid(4), uuid(3), uuid(2), uuid(1)])
  })

  it('keeps browser authentication closure-private and rejects the wrong identity', async () => {
    const captured = []
    const browserSessionCapability = {
      authenticate: vi.fn(async payload => {
        captured.push(payload)
        return {
          targetOrigin: SITE_ORIGIN,
          authenticatedUserId: uuid(1),
          appMetadata: {
            role: payload.role,
            qa_fixture: 'seb-s5',
            qa_namespace: payload.namespace,
            qa_role: payload.role,
            qa_alias: payload.alias,
            qa_schema_version: 1,
          },
        }
      }),
      closeAll: vi.fn(async () => Object.freeze({ status: 'passed' })),
    }
    const fixture = createAdapter({ browserSessionCapability })
    expect((await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId))).status)
      .toBe('passed')
    expectRedacted(
      await fixture.adapter.executeStep(authenticationRequest('authenticate-teacher', fixture.runId)),
      'authenticate-teacher',
    )
    expect(captured[0].credentials).toEqual({ email: '', password: '' })
  })

  it.each(['missing', 'multiple'])(
    'fails provisioning when the trigger-created personal organization is %s',
    async organizationMode => {
      const fixture = createAdapter({ harness: adminHarness({ organizationMode }) })
      const result = await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId))

      expectRedacted(result, ACCOUNT_STEP_IDS[0], 'failed')
      expect(fixture.harness.createCalls).toHaveLength(1)
      if (organizationMode === 'missing') {
        expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
          .toBe('passed')
        expect(fixture.harness.deleteCalls).toEqual([uuid(1)])
      } else {
        expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
          .toBe('failed')
        expect(fixture.harness.deleteCalls).toEqual([])
      }
    },
  )

  it('leaves an ambiguous create uncertain, then reconciles its exact account and organization during cleanup', async () => {
    const committedId = uuid(701)
    const harness = adminHarness({
      createOverride: ({ attributes, commitUser }) => {
        commitUser(attributes, committedId)
        throw new Error('AMBIGUOUS_CREATE_SECRET_SENTINEL')
      },
    })
    const fixture = createAdapter({ harness })

    expectRedacted(
      await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId)),
      ACCOUNT_STEP_IDS[0],
      'failed',
    )
    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('passed')
    expect(fixture.reconciliationLookup.mock.calls.map(call => call[0].kind))
      .toEqual(['account', 'personalOrganization'])
    expect(harness.listCalls).toEqual([{ page: 1, perPage: 100 }])
    expect(harness.deleteCalls).toEqual([committedId])
  })

  it.each(['none', 'multiple', 'metadata-mismatch'])(
    'fails cleanup when ambiguous create reconciliation is %s',
    async scenario => {
      const reconciliationLookup = vi.fn(async criteria => {
        if (criteria.kind !== 'account') return authoritative([])
        if (scenario === 'none') return authoritative([])
        if (scenario === 'multiple') {
          return authoritative([
            ledgerCandidate(criteria, uuid(710)),
            ledgerCandidate(criteria, uuid(711)),
          ])
        }
        return authoritative([{
          ...ledgerCandidate(criteria, uuid(712)),
          resourceType: 'student',
        }])
      })
      const harness = adminHarness({
        createOverride: () => { throw new Error('AMBIGUOUS_SECRET_SENTINEL') },
      })
      const fixture = createAdapter({ harness, reconciliationLookup })
      expect((await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId))).status)
        .toBe('failed')
      const cleanup = await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))

      if (scenario === 'none') {
        expect(cleanup.status).toBe('passed')
      } else {
        expect(cleanup.status).toBe('failed')
      }
      expect(harness.deleteCalls).toEqual([])
      expect(JSON.stringify(cleanup)).not.toContain('AMBIGUOUS_SECRET_SENTINEL')
    },
  )

  it('rejects an account created outside the exact run creation window', async () => {
    const harness = adminHarness({
      createOverride: ({ attributes, commitUser }) => ({
        data: { user: commitUser(attributes, uuid(801), '2026-09-23T07:00:00.001Z') },
        error: null,
      }),
    })
    const fixture = createAdapter({ harness })
    expectRedacted(
      await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId)),
      ACCOUNT_STEP_IDS[0],
      'failed',
    )
    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('failed')
    expect(harness.deleteCalls).toEqual([])
  })

  it('rejects mismatched or overlong run identities before constructing an Auth client', () => {
    const runId = nextRunId('identity')
    const base = runIdentity(runId)
    const cases = [
      { ...base, runId: nextRunId('other') },
      { ...base, sourceRevision: 'C'.repeat(40) },
      {
        ...base,
        creationWindow: {
          notBefore: NOT_BEFORE,
          notAfter: '2026-09-24T05:00:00.001Z',
        },
      },
    ]
    for (const identity of cases) {
      const harness = adminHarness()
      const readEnvironment = () => validEnvironment()
      const { ledger } = createPrivateLedger({
        identity: base,
        readEnvironment,
        harness,
      })
      const factory = vi.fn()
      expect(() => createSebStagingFixtureAdapter({
        readEnvironment,
        runId,
        runIdentity: identity,
        privateRunLedger: ledger,
        adminClientFactory: factory,
        resourceCleanupCapability: { cleanupRun: vi.fn() },
        randomBytes: deterministicRandomBytes(),
        clock: () => new Date(NOW),
        authBoundaryTimeoutMs: 50,
      })).toThrow(SebStagingFixtureAdapterBlockedError)
      expect(factory).not.toHaveBeenCalled()
    }
  })

  it('fails before Auth mutation when any required ledger transition fails', async () => {
    const harness = adminHarness()
    const runId = nextRunId('ledgerfail')
    const identity = runIdentity(runId)
    const readEnvironment = () => validEnvironment()
    const { ledger } = createPrivateLedger({ identity, readEnvironment, harness })
    const brokenLedger = Object.freeze({
      planTarget: vi.fn(() => ({ status: 'failed' })),
      adoptDerivedTarget: ledger.adoptDerivedTarget,
      markUncertain: ledger.markUncertain,
      commitTarget: ledger.commitTarget,
      reconcileTarget: ledger.reconcileTarget,
      readCleanupTarget: ledger.readCleanupTarget,
      markDeleted: ledger.markDeleted,
    })
    const fixture = createAdapter({ runId, identity, harness, privateRunLedger: brokenLedger })
    expect((await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], runId))).status)
      .toBe('failed')
    expect(harness.createCalls).toEqual([])
  })

  it('leaves an exact returned account uncertain when ledger commit fails and reconciles it only in cleanup', async () => {
    const harness = adminHarness()
    const runId = nextRunId('commitfail')
    const identity = runIdentity(runId)
    const readEnvironment = () => validEnvironment()
    const { ledger } = createPrivateLedger({ identity, readEnvironment, harness })
    let firstCommit = true
    const guardedLedger = Object.freeze({
      planTarget: ledger.planTarget,
      adoptDerivedTarget: ledger.adoptDerivedTarget,
      markUncertain: ledger.markUncertain,
      commitTarget: vi.fn((...args) => {
        if (firstCommit) {
          firstCommit = false
          return { status: 'failed' }
        }
        return ledger.commitTarget(...args)
      }),
      reconcileTarget: ledger.reconcileTarget,
      readCleanupTarget: ledger.readCleanupTarget,
      markDeleted: ledger.markDeleted,
    })
    const fixture = createAdapter({ runId, identity, harness, privateRunLedger: guardedLedger })

    expect((await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], runId))).status)
      .toBe('failed')
    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, runId))).status)
      .toBe('passed')
    expect(harness.listCalls).toEqual([{ page: 1, perPage: 100 }])
    expect(harness.deleteCalls).toEqual([uuid(1)])
  })

  it.each([
    ['wrong target', () => adminHarness({ targetOrigin: 'https://production.supabase.co' })],
    ['wrong credential', () => {
      const harness = adminHarness()
      harness.attestation.credentialKind = 'anon'
      return harness
    }],
    ['extra attestation field', () => {
      const harness = adminHarness()
      harness.attestation.secret = 'ATTESTATION_SECRET_SENTINEL'
      return harness
    }],
  ])('requires an exact service-role Staging attestation: %s', async (_label, makeHarness) => {
    const fixture = createAdapter({ harness: makeHarness() })
    const result = await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId))
    expectRedacted(result, ACCOUNT_STEP_IDS[0], 'failed')
    expect(fixture.harness.createCalls).toEqual([])
  })

  it('fails closed when the attested client or method drifts during a boundary', async () => {
    let harness
    harness = adminHarness({
      createOverride: ({ attributes, commitUser }) => {
        const user = commitUser(attributes)
        harness.client.auth.admin.listUsers = vi.fn()
        return { data: { user }, error: null }
      },
    })
    const fixture = createAdapter({ harness })
    expect((await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId))).status)
      .toBe('failed')
    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('failed')
    expect(harness.deleteCalls).toEqual([])
  })

  it('adopts the trigger-derived organization when an Auth create settles after the creation window', async () => {
    vi.useFakeTimers()
    const late = deferred()
    let logicalNow = NOW
    let pendingAttributes
    let capturedSignal
    const harness = adminHarness({
      createOverride: ({ attributes, signal }) => {
        pendingAttributes = attributes
        capturedSignal = signal
        return late.promise
      },
    })
    const logicalClock = () => new Date(logicalNow)
    const fixture = createAdapter({
      harness,
      clock: logicalClock,
      ledgerClock: logicalClock,
      authBoundaryTimeoutMs: 20,
    })

    const creationPromise = fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId))
    await vi.advanceTimersByTimeAsync(21)
    expectRedacted(await creationPromise, ACCOUNT_STEP_IDS[0], 'failed')
    expect(capturedSignal.aborted).toBe(true)
    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('failed')
    expect(fixture.resourceCleanupCapability.cleanupRun).not.toHaveBeenCalled()

    logicalNow = '2026-09-23T07:00:00.001Z'
    const user = harness.commitUser(pendingAttributes, uuid(901), NOW)
    late.resolve({ data: { user }, error: null })
    await vi.advanceTimersByTimeAsync(0)

    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('passed')
    expect(harness.deleteCalls).toEqual([uuid(901)])
    expect(fixture.privateRunLedger.readCleanupTarget({
      schemaVersion: 1,
      targetKey: 'personal-organization-teacher-primary',
      kind: 'personalOrganization',
    }).state).toBe('committed')
  })

  it('tracks a timed-out client factory until it settles before cleanup can pass', async () => {
    vi.useFakeTimers()
    const lateFactory = deferred()
    let factorySignal
    const fixture = createAdapter({
      factoryOverride: ({ request }) => {
        factorySignal = request.signal
        return lateFactory.promise
      },
      authBoundaryTimeoutMs: 20,
    })
    const creationPromise = fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId))
    await vi.advanceTimersByTimeAsync(21)
    expect((await creationPromise).status).toBe('failed')
    expect(factorySignal.aborted).toBe(true)
    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('failed')

    lateFactory.resolve(fixture.harness.attestation)
    await vi.advanceTimersByTimeAsync(0)
    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('passed')
    expect(fixture.harness.createCalls).toEqual([])
    expect(fixture.harness.deleteCalls).toEqual([])
  })

  it('stops a four-account reverse-delete pass at a timed-out delete until its late mutation settles', async () => {
    vi.useFakeTimers()
    const late = deferred()
    let deleteAttempt = 0
    let capturedSignal
    const harness = adminHarness({
      deleteOverride: ({ id, users, signal }) => {
        deleteAttempt += 1
        if (deleteAttempt !== 1) return DEFAULT_ADMIN_RESPONSE
        capturedSignal = signal
        return late.promise.then(result => {
          users.delete(id)
          return result
        })
      },
    })
    const fixture = createAdapter({ harness, authBoundaryTimeoutMs: 20 })
    expect((await provisionAll(fixture.adapter, fixture.runId)).map(result => result.status))
      .toEqual(['passed', 'passed', 'passed', 'passed'])

    const cleanupPromise = fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))
    await vi.advanceTimersByTimeAsync(21)
    expect((await cleanupPromise).status).toBe('failed')
    expect(capturedSignal.aborted).toBe(true)
    expect(harness.getCalls).toEqual([uuid(4)])
    expect(harness.deleteCalls).toEqual([uuid(4)])
    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('failed')
    expect(harness.getCalls).toEqual([uuid(4)])
    expect(harness.deleteCalls).toEqual([uuid(4)])

    late.resolve({ data: { user: null }, error: null })
    await vi.advanceTimersByTimeAsync(0)
    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('passed')
    expect(harness.deleteCalls).toEqual([uuid(4), uuid(3), uuid(2), uuid(1)])
  })

  it('stops a four-account reverse-delete pass at a timed-out get until the read settles', async () => {
    vi.useFakeTimers()
    const late = deferred()
    let getAttempt = 0
    let capturedSignal
    const harness = adminHarness({
      getOverride: ({ id, users, signal }) => {
        getAttempt += 1
        if (getAttempt !== 1) return undefined
        capturedSignal = signal
        return late.promise.then(() => ({
          data: { user: structuredClone(users.get(id)) },
          error: null,
        }))
      },
    })
    const fixture = createAdapter({ harness, authBoundaryTimeoutMs: 20 })
    expect((await provisionAll(fixture.adapter, fixture.runId)).map(result => result.status))
      .toEqual(['passed', 'passed', 'passed', 'passed'])

    const cleanupPromise = fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))
    await vi.advanceTimersByTimeAsync(21)
    expect((await cleanupPromise).status).toBe('failed')
    expect(capturedSignal.aborted).toBe(true)
    expect(harness.getCalls).toEqual([uuid(4)])
    expect(harness.deleteCalls).toEqual([])

    late.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('passed')
    expect(harness.deleteCalls).toEqual([uuid(4), uuid(3), uuid(2), uuid(1)])
  })

  it('keeps account ledger targets committed until resource cleanup passes', async () => {
    let attempt = 0
    const captured = []
    const resourceCleanupCapability = {
      cleanupRun: vi.fn(async request => {
        captured.push(request)
        attempt += 1
        return Object.freeze({ status: attempt === 1 ? 'failed' : 'passed' })
      }),
    }
    const fixture = createAdapter({ resourceCleanupCapability })
    expect((await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId))).status)
      .toBe('passed')

    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('failed')
    const accountState = fixture.privateRunLedger.readCleanupTarget({
      schemaVersion: 1,
      targetKey: 'account-teacher-primary',
      kind: 'account',
    })
    expect(accountState.state).toBe('committed')
    expect(fixture.harness.deleteCalls).toEqual([])

    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('passed')
    expect(captured).toHaveLength(2)
    expect(captured[1]).toBe(captured[0])
    expect(captured[0].accounts).toEqual([{
      id: uuid(1),
      alias: 'teacher-primary',
      role: 'teacher',
      namespace: `qa:${fixture.runId}`,
    }])
    expect(fixture.privateRunLedger.readCleanupTarget({
      schemaVersion: 1,
      targetKey: 'account-teacher-primary',
      kind: 'account',
    }).state).toBe('deleted')
  })

  it('does exact get-before-delete in reverse order and confirms ambiguous delete by readback', async () => {
    let first = true
    const harness = adminHarness({
      deleteOverride: ({ id, users }) => {
        if (!first) return DEFAULT_ADMIN_RESPONSE
        first = false
        users.delete(id)
        return { data: { user: null }, error: new Error('DELETE_SECRET_SENTINEL') }
      },
    })
    const fixture = createAdapter({ harness })
    await provisionAll(fixture.adapter, fixture.runId)

    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('failed')
    expect(harness.deleteCalls[0]).toBe(uuid(4))
    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('passed')
    expect(harness.deleteCalls).toEqual([uuid(4), uuid(3), uuid(2), uuid(1)])
    expect(JSON.stringify(await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))))
      .not.toContain('DELETE_SECRET_SENTINEL')
  })

  it.each([
    ['undefined', undefined],
    ['extra response field', { data: { user: null }, error: null, extra: true }],
    ['extra data field', { data: { user: null, secret: true }, error: null }],
    ['non-null error', { data: { user: null }, error: { code: 'transport_error' } }],
  ])('keeps the account committed when delete resolves with %s', async (_name, deletion) => {
    const harness = adminHarness({ deleteOverride: () => deletion })
    const fixture = createAdapter({ harness })
    expect((await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId))).status)
      .toBe('passed')

    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('failed')
    expect(harness.users.has(uuid(1))).toBe(true)
    expect(fixture.privateRunLedger.readCleanupTarget({
      schemaVersion: 1,
      targetKey: 'account-teacher-primary',
      kind: 'account',
    }).state).toBe('committed')
  })

  it('requires authoritative post-delete absence before marking the ledger target deleted', async () => {
    let deleteAttempt = 0
    const harness = adminHarness({
      deleteOverride: () => {
        deleteAttempt += 1
        return deleteAttempt === 1
          ? { data: { user: null }, error: null }
          : DEFAULT_ADMIN_RESPONSE
      },
    })
    const fixture = createAdapter({ harness })
    expect((await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId))).status)
      .toBe('passed')

    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('failed')
    expect(harness.users.has(uuid(1))).toBe(true)
    expect(harness.getCalls).toEqual([uuid(1), uuid(1)])
    expect(fixture.privateRunLedger.readCleanupTarget({
      schemaVersion: 1,
      targetKey: 'account-teacher-primary',
      kind: 'account',
    }).state).toBe('committed')

    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('passed')
    expect(harness.getCalls).toEqual([uuid(1), uuid(1), uuid(1), uuid(1)])
    expect(fixture.privateRunLedger.readCleanupTarget({
      schemaVersion: 1,
      targetKey: 'account-teacher-primary',
      kind: 'account',
    }).state).toBe('deleted')
  })

  it('refuses deletion if authoritative account metadata changed', async () => {
    const fixture = createAdapter()
    expect((await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId))).status)
      .toBe('passed')
    const user = fixture.harness.users.get(uuid(1))
    user.app_metadata.qa_namespace = 'qa:other-run'

    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('failed')
    expect(fixture.harness.deleteCalls).toEqual([])
  })

  it('closes browser sessions and browser-data planning before resources and Auth', async () => {
    const events = []
    let closeAttempt = 0
    const browserSessionCapability = {
      authenticate: vi.fn(),
      closeAll: vi.fn(async () => {
        events.push('close')
        closeAttempt += 1
        if (closeAttempt === 1) throw new Error('CLOSE_SECRET_SENTINEL')
        return Object.freeze({ status: 'passed' })
      }),
    }
    const resourceCleanupCapability = {
      cleanupRun: vi.fn(async () => {
        events.push('resources')
        return Object.freeze({ status: 'passed' })
      }),
    }
    const browserDataLifecycleCapability = Object.freeze({
      executeStep: vi.fn(),
      closeAll: vi.fn(async () => {
        events.push('browser-data')
        return Object.freeze({ status: 'passed' })
      }),
    })
    const harness = adminHarness()
    harness.events = events
    const fixture = createAdapter({
      harness,
      browserSessionCapability,
      browserDataLifecycleCapability,
      resourceCleanupCapability,
    })
    expect((await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId))).status)
      .toBe('passed')

    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('failed')
    expect(resourceCleanupCapability.cleanupRun).not.toHaveBeenCalled()
    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('passed')
    expect(events.slice(0, 4)).toEqual(['close', 'close', 'browser-data', 'resources'])
  })

  it('blocks resource cleanup until browser-data planning is quiescent and retries close', async () => {
    const events = []
    let closeAttempt = 0
    const browserSessionCapability = {
      authenticate: vi.fn(),
      closeAll: vi.fn(async () => {
        events.push('sessions')
        return Object.freeze({ status: 'passed' })
      }),
    }
    const browserDataLifecycleCapability = Object.freeze({
      executeStep: vi.fn(),
      closeAll: vi.fn(async () => {
        events.push('browser-data')
        closeAttempt += 1
        return Object.freeze({ status: closeAttempt === 1 ? 'failed' : 'passed' })
      }),
    })
    const resourceCleanupCapability = {
      cleanupRun: vi.fn(async () => {
        events.push('resources')
        return Object.freeze({ status: 'passed' })
      }),
    }
    const fixture = createAdapter({
      browserSessionCapability,
      browserDataLifecycleCapability,
      resourceCleanupCapability,
    })
    expect((await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId))).status)
      .toBe('passed')

    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('failed')
    expect(events).toEqual(['sessions', 'browser-data'])
    expect(resourceCleanupCapability.cleanupRun).not.toHaveBeenCalled()

    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('passed')
    expect(events).toEqual(['sessions', 'browser-data', 'browser-data', 'resources'])
    expect(browserSessionCapability.closeAll).toHaveBeenCalledTimes(1)
  })

  it('requires the exact frozen browser-data execute/close capability', () => {
    const executeStep = vi.fn()
    const closeAll = vi.fn()
    for (const browserDataLifecycleCapability of [
      { executeStep, closeAll },
      Object.freeze({ closeAll }),
      Object.freeze({ executeStep, closeAll, secret: 'CAPABILITY_SECRET_SENTINEL' }),
    ]) {
      expect(() => createAdapter({ browserDataLifecycleCapability }))
        .toThrow(SebStagingFixtureAdapterBlockedError)
    }
  })

  it.each([
    undefined,
    { status: 'failed' },
    { status: 'passed', extra: 'CLOSE_SECRET_SENTINEL' },
    Object.freeze({ status: 'failed' }),
  ])('requires an exact frozen passed result before treating browser sessions as closed', async closeResult => {
    const resourceCleanupCapability = {
      cleanupRun: vi.fn(async () => Object.freeze({ status: 'passed' })),
    }
    const browserSessionCapability = {
      authenticate: vi.fn(),
      closeAll: vi.fn(async () => closeResult),
    }
    const fixture = createAdapter({ browserSessionCapability, resourceCleanupCapability })
    expect((await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId))).status)
      .toBe('passed')

    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('failed')
    expect(resourceCleanupCapability.cleanupRun).not.toHaveBeenCalled()
    expect(fixture.harness.deleteCalls).toEqual([])
  })

  it.each([
    undefined,
    { status: 'passed' },
    Object.freeze({ status: 'failed' }),
    Object.freeze({ status: 'passed', extra: 'PLANNER_SECRET_SENTINEL' }),
  ])('requires an exact frozen passed result before treating browser-data planning as closed', async closeResult => {
    const browserDataLifecycleCapability = Object.freeze({
      executeStep: vi.fn(),
      closeAll: vi.fn(async () => closeResult),
    })
    const resourceCleanupCapability = {
      cleanupRun: vi.fn(async () => Object.freeze({ status: 'passed' })),
    }
    const fixture = createAdapter({ browserDataLifecycleCapability, resourceCleanupCapability })
    expect((await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId))).status)
      .toBe('passed')

    expect((await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))).status)
      .toBe('failed')
    expect(resourceCleanupCapability.cleanupRun).not.toHaveBeenCalled()
    expect(fixture.harness.deleteCalls).toEqual([])
  })

  it.each([
    undefined,
    { status: 'passed' },
    Object.freeze({ status: 'failed' }),
    Object.freeze({ status: 'passed', extra: 'RESOURCE_SECRET_SENTINEL' }),
  ])('requires an exact frozen passed result before treating resource cleanup as complete', async cleanupResult => {
    const resourceCleanupCapability = {
      cleanupRun: vi.fn(async () => cleanupResult),
    }
    const fixture = createAdapter({ resourceCleanupCapability })
    expect((await fixture.adapter.executeStep(stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId))).status)
      .toBe('passed')

    const result = await fixture.adapter.executeStep(stepRequest(CLEANUP_STEP_ID, fixture.runId))
    expectRedacted(result, CLEANUP_STEP_ID, 'failed')
    expect(fixture.harness.deleteCalls).toEqual([])
    expect(fixture.privateRunLedger.readCleanupTarget({
      schemaVersion: 1,
      targetKey: 'account-teacher-primary',
      kind: 'account',
    }).state).toBe('committed')
  })

  it('blocks an unsafe environment and malformed request without constructing or leaking a client', async () => {
    const runId = nextRunId('blocked')
    const identity = runIdentity(runId)
    const harness = adminHarness()
    const ledgerReadEnvironment = () => validEnvironment()
    const { ledger } = createPrivateLedger({
      identity,
      readEnvironment: ledgerReadEnvironment,
      harness,
    })
    const factory = vi.fn()
    expect(() => createSebStagingFixtureAdapter({
      readEnvironment: () => validEnvironment({ NEXT_PUBLIC_SITE_URL: 'https://www.korkru.com' }),
      runId,
      runIdentity: identity,
      privateRunLedger: ledger,
      adminClientFactory: factory,
      resourceCleanupCapability: { cleanupRun: vi.fn() },
      randomBytes: deterministicRandomBytes(),
      clock: () => new Date(NOW),
      authBoundaryTimeoutMs: 50,
    })).toThrow(SebStagingFixtureAdapterBlockedError)
    expect(factory).not.toHaveBeenCalled()

    const fixture = createAdapter()
    const malformed = stepRequest(ACCOUNT_STEP_IDS[0], fixture.runId)
    malformed.identity.secret = 'IDENTITY_SECRET_SENTINEL'
    const result = await fixture.adapter.executeStep(malformed)
    expectRedacted(result, ACCOUNT_STEP_IDS[0], 'failed')
    expect(fixture.harness.createCalls).toEqual([])
  })
})
