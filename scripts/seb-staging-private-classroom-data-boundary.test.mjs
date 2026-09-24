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
const STUDENT_ID = '00000000-0000-4000-8000-000000000005'
const SECONDARY_STUDENT_ID = '00000000-0000-4000-8000-000000000006'
const WRITTEN_QUESTION_ID = '00000000-0000-4000-8000-000000000007'
const UPLOAD_QUESTION_ID = '00000000-0000-4000-8000-000000000008'
const ASSIGNMENT_ID = '00000000-0000-4000-8000-000000000009'
const RELEASE_ID = `asr-${'a'.repeat(32)}-r1-${'b'.repeat(16)}`
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
    ['account-student-primary', snapshot(
      'account-student-primary',
      'account',
      STUDENT_ID,
      null,
      null,
      'student',
    )],
    ['account-student-secondary', snapshot(
      'account-student-secondary',
      'account',
      SECONDARY_STUDENT_ID,
      null,
      null,
      'student',
    )],
    ['classroom-primary', snapshot(
      'classroom-primary',
      'classroom',
      CLASSROOM_ID,
      TEACHER_ID,
      ORGANIZATION_ID,
      'subject',
    )],
    ['question-written', snapshot(
      'question-written',
      'question',
      WRITTEN_QUESTION_ID,
      TEACHER_ID,
      ORGANIZATION_ID,
      'essay',
    )],
    ['question-upload', snapshot(
      'question-upload',
      'question',
      UPLOAD_QUESTION_ID,
      TEACHER_ID,
      ORGANIZATION_ID,
      'file_upload',
    )],
    ['assignment-primary', snapshot(
      'assignment-primary',
      'assignment',
      ASSIGNMENT_ID,
      TEACHER_ID,
      ORGANIZATION_ID,
      'exam',
    )],
    ['release-primary', snapshot(
      'release-primary',
      'release',
      RELEASE_ID,
      TEACHER_ID,
      ORGANIZATION_ID,
      'test_plaintext',
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

function prepareRequest(overrides = {}) {
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
    ...overrides,
  })
}

function operationRequest(target, overrides = {}) {
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
    ...overrides,
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

function questionRow(questionType, overrides = {}) {
  return freeze({
    id: CLASSROOM_ID,
    created_by: TEACHER_ID,
    org_id: ORGANIZATION_ID,
    question_type: questionType,
    title: MARKER,
    question_text: `<p>Synthetic-only SEB Staging fixture ${MARKER}</p>`,
    created_at: NOW,
    ...overrides,
  })
}

function membershipRow(studentId, overrides = {}) {
  return freeze({
    id: MEMBERSHIP_ID,
    classroom_id: CLASSROOM_ID,
    student_id: studentId,
    joined_at: NOW,
    ...overrides,
  })
}

function assignmentRow(overrides = {}) {
  return freeze({
    id: ASSIGNMENT_ID,
    classroom_id: CLASSROOM_ID,
    created_by: TEACHER_ID,
    org_id: ORGANIZATION_ID,
    type: 'exam',
    status: 'draft',
    title: MARKER,
    description: `Synthetic-only SEB Staging fixture ${MARKER}`,
    secure_browser_mode: 'seb_required',
    question_ids: [WRITTEN_QUESTION_ID, UPLOAD_QUESTION_ID],
    created_at: NOW,
    ...overrides,
  })
}

function configRow(overrides = {}) {
  return freeze({
    assignment_id: ASSIGNMENT_ID,
    revision: 1,
    org_id: ORGANIZATION_ID,
    owner_id: TEACHER_ID,
    created_at: NOW,
    ...overrides,
  })
}

function publishedAssignmentRow(overrides = {}) {
  return freeze({
    id: ASSIGNMENT_ID,
    created_by: TEACHER_ID,
    org_id: ORGANIZATION_ID,
    type: 'exam',
    status: 'published',
    secure_browser_mode: 'seb_required',
    ...overrides,
  })
}

function makeHarness({
  enumerateRows = [classroomRow()],
  enumerateResponses,
  closeImplementation,
} = {}) {
  let currentEnvironment = environment()
  let enumerateIndex = 0
  const enumerateDatabase = vi.fn(async () => freeze({
    rows: enumerateResponses
      ? enumerateResponses[Math.min(enumerateIndex++, enumerateResponses.length - 1)]
      : enumerateRows,
  }))
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

async function prepareOperation(harness, stepId) {
  const binding = await harness.boundary.readAccountBinding(bindingRequest(), options())
  const prepared = await harness.boundary.prepareOperation(
    prepareRequest({ stepId }),
    options(),
  )
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

  it.each([
    {
      stepId: 'create-synthetic-written-question',
      targetKey: 'question-written',
      resourceType: 'essay',
      storedType: 'written',
    },
    {
      stepId: 'create-synthetic-upload-question',
      targetKey: 'question-upload',
      resourceType: 'file_upload',
      storedType: 'file_upload',
    },
  ])('attests the exact marker-bound $stepId row', async ({
    stepId,
    targetKey,
    resourceType,
    storedType,
  }) => {
    const harness = makeHarness({ enumerateRows: [questionRow(storedType)] })
    const { target } = await prepareOperation(harness, stepId)
    expect(target).toEqual({
      schemaVersion: 1,
      targetKey,
      kind: 'question',
      ownerId: TEACHER_ID,
      organizationId: ORGANIZATION_ID,
      resourceType,
    })
    const attested = await harness.boundary.attestOperation(
      operationRequest(target, { stepId }),
      options(),
    )
    expect(attested.targets[0]).toMatchObject({
      targetKey,
      kind: 'question',
      matches: [{ resourceType }],
    })
    const request = harness.enumerateDatabase.mock.calls[0][0]
    expect(request.table).toBe('questions')
    expect(request.predicates).toContainEqual({
      column: 'title',
      operator: 'eq',
      value: MARKER,
    })
  })

  it.each([
    [
      'join-synthetic-student-to-classroom',
      'student-primary',
      'membership-primary',
      STUDENT_ID,
    ],
    [
      'join-secondary-student-to-classroom',
      'student-secondary',
      'membership-secondary',
      SECONDARY_STUDENT_ID,
    ],
  ])('attests %s against the committed classroom and student account', async (
    stepId,
    alias,
    targetKey,
    studentId,
  ) => {
    const harness = makeHarness({ enumerateRows: [membershipRow(studentId)] })
    await harness.boundary.readAccountBinding(bindingRequest(), options())
    await harness.boundary.readAccountBinding(freeze({
      ...bindingRequest(),
      alias,
      role: 'student',
    }), options())
    const prepared = await harness.boundary.prepareOperation(
      prepareRequest({
        stepId,
        alias,
        role: 'student',
        expectedUserId: studentId,
      }),
      options(),
    )
    const target = prepared.targets[0]
    expect(target).toMatchObject({
      targetKey,
      kind: 'classroomMembership',
      ownerId: studentId,
      organizationId: ORGANIZATION_ID,
      resourceType: 'student',
    })
    const attested = await harness.boundary.attestOperation(
      operationRequest(target, {
        stepId,
        alias,
        expectedUserId: studentId,
      }),
      options(),
    )
    expect(attested.targets[0].matches[0]).toMatchObject({
      targetId: MEMBERSHIP_ID,
      ownerId: studentId,
      parentId: CLASSROOM_ID,
    })
    expect(harness.enumerateDatabase.mock.calls[0][0]).toMatchObject({
      table: 'classroom_students',
      predicates: expect.arrayContaining([
        { column: 'classroom_id', operator: 'eq', value: CLASSROOM_ID },
        { column: 'student_id', operator: 'eq', value: studentId },
      ]),
    })
  })

  it('attests the draft assignment and its exact SEB config revision as one atomic plan', async () => {
    const harness = makeHarness({
      enumerateResponses: [[assignmentRow()], [configRow()]],
    })
    await harness.boundary.readAccountBinding(bindingRequest(), options())
    const stepId = 'create-seb-assignment-draft-with-quit-password'
    const prepared = await harness.boundary.prepareOperation(
      prepareRequest({ stepId }),
      options(),
    )
    expect(prepared.targets).toHaveLength(2)
    expect(prepared.targets.map(target => target.targetKey)).toEqual([
      'assignment-primary',
      'config-primary',
    ])
    const attested = await harness.boundary.attestOperation(freeze({
      schemaVersion: 1,
      targetOrigin: SITE_ORIGIN,
      namespace: NAMESPACE,
      identity: identity(),
      stepId,
      alias: 'teacher-primary',
      expectedUserId: TEACHER_ID,
      marker: MARKER,
      targets: prepared.targets,
    }), options())
    expect(attested.targets).toEqual([
      {
        targetKey: 'assignment-primary',
        kind: 'assignment',
        matches: [{
          targetId: ASSIGNMENT_ID,
          createdAt: NOW,
          ownerId: TEACHER_ID,
          organizationId: ORGANIZATION_ID,
          resourceType: 'exam',
          parentId: CLASSROOM_ID,
          relatedIds: [WRITTEN_QUESTION_ID, UPLOAD_QUESTION_ID],
        }],
      },
      {
        targetKey: 'config-primary',
        kind: 'configRevision',
        matches: [{
          targetId: `${ASSIGNMENT_ID}:r1`,
          createdAt: NOW,
          ownerId: TEACHER_ID,
          organizationId: ORGANIZATION_ID,
          resourceType: 'seb_required',
          parentId: ASSIGNMENT_ID,
          relatedIds: [],
        }],
      },
    ])
    expect(harness.enumerateDatabase.mock.calls.map(call => call[0].table)).toEqual([
      'assignments',
      'assignment_seb_config_revisions',
    ])
  })

  it('publishes only the committed assignment after a committed release exists', async () => {
    const harness = makeHarness({ enumerateRows: [publishedAssignmentRow()] })
    await harness.boundary.readAccountBinding(bindingRequest(), options())
    const stepId = 'publish-seb-assignment'
    const prepared = await harness.boundary.prepareOperation(
      prepareRequest({ stepId }),
      options(),
    )
    expect(prepared.targets).toEqual([])
    const attested = await harness.boundary.attestOperation(freeze({
      schemaVersion: 1,
      targetOrigin: SITE_ORIGIN,
      namespace: NAMESPACE,
      identity: identity(),
      stepId,
      alias: 'teacher-primary',
      expectedUserId: TEACHER_ID,
      marker: MARKER,
      targets: [],
    }), options())
    expect(attested).toEqual({
      schemaVersion: 1,
      stepId,
      status: 'passed',
      targets: [],
    })
    expect(harness.enumerateDatabase.mock.calls[0][0]).toMatchObject({
      table: 'assignments',
      predicates: expect.arrayContaining([
        { column: 'id', operator: 'eq', value: ASSIGNMENT_ID },
        { column: 'created_by', operator: 'eq', value: TEACHER_ID },
      ]),
    })
  })

  it('attests the exact Windows SEB check-in for the synthetic student', async () => {
    const harness = makeHarness({
      enumerateRows: [freeze({
        assignment_id: ASSIGNMENT_ID,
        student_id: STUDENT_ID,
        org_id: ORGANIZATION_ID,
        platform: 'windows',
        verified_at: NOW,
      })],
    })
    await harness.boundary.readAccountBinding(bindingRequest(), options())
    await harness.boundary.readAccountBinding(freeze({
      ...bindingRequest(), alias: 'student-primary', role: 'student',
    }), options())
    const stepId = 'verify-seb-system-check'
    const prepared = await harness.boundary.prepareOperation(prepareRequest({
      stepId,
      alias: 'student-primary',
      role: 'student',
      expectedUserId: STUDENT_ID,
    }), options())
    const attested = await harness.boundary.attestOperation(operationRequest(
      prepared.targets[0],
      { stepId, alias: 'student-primary', expectedUserId: STUDENT_ID },
    ), options())

    expect(attested.targets[0]).toMatchObject({
      targetKey: 'check-in-primary',
      kind: 'checkIn',
      matches: [{
        targetId: `${ASSIGNMENT_ID}:${STUDENT_ID}`,
        ownerId: STUDENT_ID,
        organizationId: ORGANIZATION_ID,
        resourceType: 'windows',
        parentId: ASSIGNMENT_ID,
      }],
    })
    expect(harness.enumerateDatabase.mock.calls[0][0]).toMatchObject({
      table: 'exam_seb_checkins',
      limit: 2,
    })
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
