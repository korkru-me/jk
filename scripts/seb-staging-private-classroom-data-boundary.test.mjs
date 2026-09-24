import { describe, expect, it, vi } from 'vitest'

import {
  SebStagingPrivateClassroomDataBoundaryBlockedError,
  createSebStagingPrivateClassroomDataBoundary,
} from './seb-staging-private-classroom-data-boundary.mjs'

const SITE_ORIGIN = 'https://staging.korkru.com'
const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const RUN_ID = 'seb-s5-data-1'
const NAMESPACE = `qa:${RUN_ID}`
const TEACHER_ID = '00000000-0000-4000-8000-000000000001'
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000002'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000003'
const CLASSROOM_ID = '00000000-0000-4000-8000-000000000004'
const MARKER = `SEB S5 ${RUN_ID} ${'a'.repeat(24)}`
const NOW = '2026-09-24T03:00:00.000Z'

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

function environment(overrides = {}) {
  return {
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: SITE_ORIGIN,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_ORIGIN,
    EXAM_QA_DATA_POLICY: 'synthetic-only',
    EXAM_QA_COPY_PRODUCTION_DATA: 'false',
    EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
    ...overrides,
  }
}

function identity() {
  return freeze({
    runId: RUN_ID,
    sourceRevision: 'a'.repeat(40),
    deploymentId: `dpl_${'A'.repeat(24)}`,
    creationWindow: {
      notBefore: '2026-09-24T02:00:00.000Z',
      notAfter: '2026-09-24T04:00:00.000Z',
    },
  })
}

function snapshot(targetKey, kind, targetId, ownerId, organizationId, resourceType) {
  return freeze({
    schemaVersion: 1,
    targetKey,
    kind,
    identity: identity(),
    targetId,
    namespace: NAMESPACE,
    ownerId,
    organizationId,
    resourceType,
    createdAt: NOW,
  })
}

function makeLedger() {
  const records = new Map([
    ['account-teacher-primary', snapshot(
      'account-teacher-primary',
      'account',
      TEACHER_ID,
      null,
      null,
      'teacher',
    )],
    ['personal-organization-teacher-primary', snapshot(
      'personal-organization-teacher-primary',
      'personalOrganization',
      `${ORGANIZATION_ID}:${MEMBERSHIP_ID}`,
      TEACHER_ID,
      null,
      'personal',
    )],
  ])
  const readCleanupTarget = vi.fn(reference => {
    const value = records.get(reference.targetKey)
    return value
      ? freeze({ status: 'passed', state: 'committed', snapshots: [value] })
      : freeze({ status: 'passed', state: 'unplanned', snapshots: [] })
  })
  return Object.freeze({
    planTarget: vi.fn(),
    adoptDerivedTarget: vi.fn(),
    markUncertain: vi.fn(),
    commitTarget: vi.fn(),
    reconcileTarget: vi.fn(),
    readCleanupTarget,
    markDeleted: vi.fn(),
  })
}

function bindingRequest() {
  return freeze({
    schemaVersion: 1,
    targetOrigin: SITE_ORIGIN,
    namespace: NAMESPACE,
    alias: 'teacher-primary',
    role: 'teacher',
  })
}

function prepareRequest() {
  return freeze({
    schemaVersion: 1,
    targetOrigin: SITE_ORIGIN,
    namespace: NAMESPACE,
    identity: identity(),
    stepId: 'create-subject-classroom',
    alias: 'teacher-primary',
    role: 'teacher',
    expectedUserId: TEACHER_ID,
    marker: MARKER,
  })
}

function operationRequest(target) {
  return freeze({
    schemaVersion: 1,
    targetOrigin: SITE_ORIGIN,
    namespace: NAMESPACE,
    identity: identity(),
    stepId: 'create-subject-classroom',
    alias: 'teacher-primary',
    expectedUserId: TEACHER_ID,
    marker: MARKER,
    target,
  })
}

function options(controller = new AbortController()) {
  return Object.freeze({ signal: controller.signal })
}

function classroomRow(overrides = {}) {
  return freeze({
    id: CLASSROOM_ID,
    teacher_id: TEACHER_ID,
    org_id: ORGANIZATION_ID,
    classroom_type: 'subject',
    name: MARKER,
    description: `Synthetic-only SEB Staging fixture ${MARKER}`,
    created_at: NOW,
    ...overrides,
  })
}

function makeHarness({ enumerateRows = [classroomRow()], closeImplementation } = {}) {
  let currentEnvironment = environment()
  const enumerateDatabase = vi.fn(async () => freeze({ rows: enumerateRows }))
  const close = closeImplementation ?? vi.fn(async () => passed())
  const driver = Object.freeze({
    supabaseUrl: SUPABASE_ORIGIN,
    credentialKind: 'service-role',
    enumerateDatabase,
    deleteDatabase: vi.fn(),
    enumerateStorage: vi.fn(),
    deleteStorage: vi.fn(),
    close,
  })
  const privateRunLedger = makeLedger()
  const boundary = createSebStagingPrivateClassroomDataBoundary({
    namespace: NAMESPACE,
    identity: identity(),
    readEnvironment: () => currentEnvironment,
    privateRunLedger,
    supabaseDriver: driver,
  })
  return {
    boundary,
    driver,
    privateRunLedger,
    enumerateDatabase,
    close,
    setEnvironment(value) {
      currentEnvironment = value
    },
  }
}

async function prepare(harness) {
  const binding = await harness.boundary.readAccountBinding(bindingRequest(), options())
  const prepared = await harness.boundary.prepareOperation(prepareRequest(), options())
  return { binding, prepared, target: prepared.targets[0] }
}

async function expectBlocked(task) {
  let captured = null
  try { await task() } catch (error) { captured = error }
  expect(captured).toBeInstanceOf(SebStagingPrivateClassroomDataBoundaryBlockedError)
}

describe('SEB Staging private classroom data boundary', () => {
  it('derives owner and organization from committed private ledger snapshots', async () => {
    const harness = makeHarness()
    const { binding, prepared, target } = await prepare(harness)
    expect(binding).toEqual({
      schemaVersion: 1,
      targetOrigin: SITE_ORIGIN,
      namespace: NAMESPACE,
      alias: 'teacher-primary',
      role: 'teacher',
      expectedUserId: TEACHER_ID,
    })
    expect(target).toEqual({
      schemaVersion: 1,
      targetKey: 'classroom-primary',
      kind: 'classroom',
      ownerId: TEACHER_ID,
      organizationId: ORGANIZATION_ID,
      resourceType: 'subject',
    })
    expect(JSON.stringify(prepared)).not.toContain(MARKER)
  })

  it('attests exactly one marker-bound classroom and returns its lineage', async () => {
    const harness = makeHarness()
    const { target } = await prepare(harness)
    const attested = await harness.boundary.attestOperation(operationRequest(target), options())
    expect(attested).toEqual({
      schemaVersion: 1,
      stepId: 'create-subject-classroom',
      status: 'passed',
      targets: [{
        targetKey: 'classroom-primary',
        kind: 'classroom',
        matches: [{
          targetId: CLASSROOM_ID,
          createdAt: NOW,
          ownerId: TEACHER_ID,
          organizationId: ORGANIZATION_ID,
          resourceType: 'subject',
          parentId: null,
          relatedIds: [],
        }],
      }],
    })
    const request = harness.enumerateDatabase.mock.calls[0][0]
    expect(Object.isFrozen(request)).toBe(true)
    expect(request.predicates).toContainEqual({
      column: 'name',
      operator: 'eq',
      value: MARKER,
    })
    expect(request.limit).toBe(2)
  })

  it('allows abort reconciliation for zero or one match but blocks ambiguity', async () => {
    const empty = makeHarness({ enumerateRows: [] })
    const { target: emptyTarget } = await prepare(empty)
    expect(await empty.boundary.abortOperation(
      operationRequest(emptyTarget),
      options(),
    )).toEqual({ status: 'passed' })

    const duplicate = makeHarness({
      enumerateRows: [classroomRow(), classroomRow({ id: '00000000-0000-4000-8000-000000000005' })],
    })
    const { target } = await prepare(duplicate)
    await expectBlocked(() => duplicate.boundary.abortOperation(
      operationRequest(target),
      options(),
    ))
  })

  it('rejects a row whose marker, relationship or creation window drifts', async () => {
    for (const row of [
      classroomRow({ name: 'wrong' }),
      classroomRow({ teacher_id: '00000000-0000-4000-8000-000000000009' }),
      classroomRow({ created_at: '2026-09-24T05:00:00.000Z' }),
    ]) {
      const harness = makeHarness({ enumerateRows: [row] })
      const { target } = await prepare(harness)
      await expectBlocked(() => harness.boundary.attestOperation(
        operationRequest(target),
        options(),
      ))
    }
  })

  it('permits cleanup after the write gate closes and closes its dedicated driver', async () => {
    const harness = makeHarness()
    const { target } = await prepare(harness)
    harness.setEnvironment(environment({ EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'false' }))
    expect(await harness.boundary.abortOperation(
      operationRequest(target),
      options(),
    )).toEqual({ status: 'passed' })
    expect(await harness.boundary.closeAll()).toEqual({ status: 'passed' })
    expect(harness.close).toHaveBeenCalledTimes(1)
  })

  it('keeps close retryable when the driver initially refuses to close', async () => {
    let attempts = 0
    const close = vi.fn(async () => {
      attempts += 1
      return freeze({ status: attempts === 1 ? 'failed' : 'passed' })
    })
    const harness = makeHarness({ closeImplementation: close })
    expect(await harness.boundary.closeAll()).toEqual({ status: 'failed' })
    expect(await harness.boundary.closeAll()).toEqual({ status: 'passed' })
    expect(close).toHaveBeenCalledTimes(2)
  })

  it('rejects expanded raw drivers before reading the ledger', () => {
    const harness = makeHarness()
    expect(() => createSebStagingPrivateClassroomDataBoundary({
      namespace: NAMESPACE,
      identity: identity(),
      readEnvironment: () => environment(),
      privateRunLedger: makeLedger(),
      supabaseDriver: Object.freeze({ ...harness.driver, leak: vi.fn() }),
    })).toThrow(SebStagingPrivateClassroomDataBoundaryBlockedError)
  })
})
