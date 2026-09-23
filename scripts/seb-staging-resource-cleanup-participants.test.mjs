import { describe, expect, it, vi } from 'vitest'

import { createSebStagingPrivateRunLedger } from './seb-staging-private-run-ledger.mjs'
import {
  SEB_STAGING_RESOURCE_CLEANUP_TARGET_KEYS,
  SebStagingResourceCleanupParticipantsBlockedError,
  createSebStagingResourceCleanupParticipants,
  createSebStagingResourceCleanupTopology,
} from './seb-staging-resource-cleanup-participants.mjs'

const RUN_ID = 'seb-s5-cleanup-a1'
const NAMESPACE = `qa:${RUN_ID}`
const CREATED_AT = '2026-09-23T10:05:00.000Z'
const IDENTITY = Object.freeze({
  runId: RUN_ID,
  sourceRevision: 'a'.repeat(40),
  deploymentId: 'dpl_1234567890abcdef',
  creationWindow: Object.freeze({
    notBefore: '2026-09-23T10:00:00.000Z',
    notAfter: '2026-09-23T11:00:00.000Z',
  }),
})
const OFFICIAL_ENVIRONMENT = Object.freeze({
  KORKRU_DEPLOYMENT_ENV: 'staging',
  EXAM_QA_ENVIRONMENT: 'staging',
  VERCEL_ENV: 'preview',
  NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
  NEXT_PUBLIC_SUPABASE_URL: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
  EXAM_QA_DATA_POLICY: 'synthetic-only',
  EXAM_QA_COPY_PRODUCTION_DATA: 'false',
  EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
})

function uuid(index) {
  return `${String(index).padStart(8, '0')}-0000-4000-8000-${String(index).padStart(12, '0')}`
}

const IDS = Object.freeze({
  teacher: uuid(1),
  student: uuid(2),
  teacherUnrelated: uuid(16),
  studentSecondary: uuid(17),
  teacherOrg: uuid(3),
  studentOrg: uuid(4),
  teacherUnrelatedOrg: uuid(18),
  studentSecondaryOrg: uuid(19),
  classroom: uuid(5),
  assignment: uuid(6),
  writtenQuestion: uuid(7),
  uploadQuestion: uuid(8),
  membership: uuid(9),
  submission: uuid(10),
  answer: uuid(11),
  client: uuid(12),
  upload: uuid(13),
  teacherOrgMembership: uuid(14),
  studentOrgMembership: uuid(15),
  teacherUnrelatedOrgMembership: uuid(20),
  studentSecondaryOrgMembership: uuid(21),
  writtenAnswer: uuid(22),
  secondaryMembership: uuid(23),
})
const RELEASE_ID = `asr-${IDS.assignment.replaceAll('-', '')}-r1-${'c'.repeat(16)}`
const ARTIFACT_SHA = 'c'.repeat(64)

function validTopology() {
  return structuredClone(createSebStagingResourceCleanupTopology(IDENTITY))
}

function targetIds() {
  return new Map([
    ['account-teacher-primary', IDS.teacher],
    ['account-teacher-unrelated', IDS.teacherUnrelated],
    ['account-student-primary', IDS.student],
    ['account-student-secondary', IDS.studentSecondary],
    ['personal-organization-teacher-primary', `${IDS.teacherOrg}:${IDS.teacherOrgMembership}`],
    ['personal-organization-teacher-unrelated', `${IDS.teacherUnrelatedOrg}:${IDS.teacherUnrelatedOrgMembership}`],
    ['personal-organization-student-primary', `${IDS.studentOrg}:${IDS.studentOrgMembership}`],
    ['personal-organization-student-secondary', `${IDS.studentSecondaryOrg}:${IDS.studentSecondaryOrgMembership}`],
    ['classroom-primary', IDS.classroom],
    ['assignment-primary', IDS.assignment],
    ['question-written', IDS.writtenQuestion],
    ['question-upload', IDS.uploadQuestion],
    ['membership-primary', IDS.membership],
    ['membership-secondary', IDS.secondaryMembership],
    ['config-primary', `${IDS.assignment}:r1`],
    ['release-primary', RELEASE_ID],
    ['check-in-primary', `${IDS.assignment}:${IDS.student}`],
    ['submission-primary', IDS.submission],
    ['answer-written', IDS.writtenAnswer],
    ['answer-upload', IDS.answer],
    ['proctor-connection', `${IDS.submission}:${IDS.client}`],
    ['proctor-event', '1'],
    ['answer-storage', `${IDS.student}/${IDS.submission}/${IDS.answer}/${IDS.upload}.pdf`],
    ['assignment-artifact', `assignments/${IDS.assignment}/r1/${ARTIFACT_SHA}.seb`],
  ])
}

function reference(nodeValue) {
  return { schemaVersion: 1, targetKey: nodeValue.targetKey, kind: nodeValue.kind }
}

function deferred() {
  let resolve
  const promise = new Promise(next => { resolve = next })
  return { promise, resolve }
}

function createHarness({ timeout = 100, topology = validTopology(), planTargets = true } = {}) {
  const environment = { current: { ...OFFICIAL_ENVIRONMENT } }
  const readEnvironment = vi.fn(() => ({ ...environment.current }))
  const ids = targetIds()
  const nodes = new Map(topology.nodes.map(value => [value.targetKey, value]))
  const reconciliationMatches = new Map()
  const reconciliationLookup = vi.fn(async criteria => ({
    schemaVersion: 1,
    authoritative: true,
    matches: structuredClone(reconciliationMatches.get(criteria.targetKey) ?? []),
  }))
  const ledger = createSebStagingPrivateRunLedger({
    schemaVersion: 1,
    identity: topology.identity,
    namespace: topology.namespace,
    readEnvironment,
    reconciliationClient: {
      targetOrigin: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
      credentialKind: 'service-role',
      client: {
        supabaseUrl: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
        findExactRunTargets: reconciliationLookup,
      },
    },
    reconciliationTimeoutMs: timeout,
    clock: () => new Date(CREATED_AT),
  })

  const scopedId = targetKey => {
    if (targetKey === null) return null
    const targetId = ids.get(targetKey)
    return nodes.get(targetKey)?.kind === 'personalOrganization'
      ? targetId.slice(0, targetId.indexOf(':'))
      : targetId
  }

  if (planTargets) {
    for (const value of topology.nodes) {
      expect(ledger.planTarget({
        schemaVersion: 1,
        targetKey: value.targetKey,
        kind: value.kind,
        identity: topology.identity,
        namespace: topology.namespace,
        ownerId: scopedId(value.ownerKey),
        organizationId: scopedId(value.organizationKey),
        resourceType: value.resourceType,
      })).toEqual({ status: 'passed' })
    }
  }

  const attestationFor = (targetKey, overrides = {}) => {
    const value = nodes.get(targetKey)
    return {
      schemaVersion: 1,
      kind: value.kind,
      targetId: ids.get(targetKey),
      runId: RUN_ID,
      sourceRevision: IDENTITY.sourceRevision,
      deploymentId: IDENTITY.deploymentId,
      namespace: NAMESPACE,
      ownerId: scopedId(value.ownerKey),
      organizationId: scopedId(value.organizationKey),
      resourceType: value.resourceType,
      createdAt: CREATED_AT,
      parentId: scopedId(value.parentKey),
      relatedId: scopedId(value.relatedKey),
      ...overrides,
    }
  }

  const committed = new Set()
  const candidateFor = (targetKey, overrides = {}) => {
    const value = nodes.get(targetKey)
    const attestation = attestationFor(targetKey, overrides)
    return {
      schemaVersion: 1,
      targetKey: value.targetKey,
      kind: value.kind,
      identity: topology.identity,
      targetId: attestation.targetId,
      namespace: attestation.namespace,
      ownerId: attestation.ownerId,
      organizationId: attestation.organizationId,
      resourceType: attestation.resourceType,
      createdAt: attestation.createdAt,
    }
  }
  function commit(targetKey) {
    const value = nodes.get(targetKey)
    expect(ledger.markUncertain(reference(value))).toEqual({ status: 'passed' })
    expect(ledger.commitTarget(reference(value), candidateFor(targetKey)))
      .toEqual({ status: 'passed' })
    committed.add(targetKey)
  }

  const stored = new Map()
  const events = []
  const clientFor = (participantName, bucketName = undefined) => ({
    targetOrigin: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
    credentialKind: 'service-role',
    client: {
      supabaseUrl: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
      ...(bucketName === undefined ? {} : { bucketName }),
      enumerateExactCleanupTarget: vi.fn(async input => ({
        matches: structuredClone((stored.get(input.reference.targetKey) ?? [])
          .filter(match => input.storagePrefix === null
            ? match.targetId === input.targetId
            : match.targetId.startsWith(input.storagePrefix))),
      })),
      deleteExactCleanupTarget: vi.fn(async input => {
        events.push(`${participantName}:${input.reference.targetKey}`)
        const remaining = (stored.get(input.reference.targetKey) ?? [])
          .filter(match => match.targetId !== input.targetId)
        if (remaining.length === 0) stored.delete(input.reference.targetKey)
        else stored.set(input.reference.targetKey, remaining)
        if (participantName === 'database' && input.reference.targetKey === 'assignment-primary') {
          for (const cascadeKey of [
            'config-primary', 'release-primary',
          ]) stored.delete(cascadeKey)
        }
        return { status: 'passed' }
      }),
    },
  })
  const clients = {
    answerStorageClient: clientFor('answer', 'submission-files'),
    artifactStorageClient: clientFor('artifact', 'assignment-seb-configs'),
    databaseClient: clientFor('database'),
    personalOrganizationsClient: clientFor('personal'),
  }

  function materialize(targetKey) {
    commit(targetKey)
    stored.set(targetKey, [attestationFor(targetKey)])
  }

  function makeParticipants(overrides = {}) {
    return createSebStagingResourceCleanupParticipants({
      readEnvironment,
      topology,
      privateRunLedger: ledger,
      ...clients,
      boundaryTimeoutMs: timeout,
      ...overrides,
    })
  }

  return {
    topology,
    environment,
    readEnvironment,
    ledger,
    ids,
    nodes,
    stored,
    events,
    clients,
    reconciliationMatches,
    reconciliationLookup,
    committed,
    attestationFor,
    candidateFor,
    commit,
    materialize,
    makeParticipants,
  }
}

function request(accounts = [], releaseBound = false) {
  const accountIdentity = {
    'teacher-primary': { id: IDS.teacher, role: 'teacher' },
    'teacher-unrelated': { id: IDS.teacherUnrelated, role: 'teacher' },
    'student-primary': { id: IDS.student, role: 'student' },
    'student-secondary': { id: IDS.studentSecondary, role: 'student' },
  }
  const identity = releaseBound
    ? {
        runId: RUN_ID,
        sourceRevision: IDENTITY.sourceRevision,
        deploymentId: IDENTITY.deploymentId,
        releaseId: RELEASE_ID,
        releaseRevision: 1,
        artifactSha256: ARTIFACT_SHA,
      }
    : {
        runId: RUN_ID,
        sourceRevision: IDENTITY.sourceRevision,
        deploymentId: IDENTITY.deploymentId,
      }
  return {
    schemaVersion: 1,
    runId: RUN_ID,
    namespace: NAMESPACE,
    identity,
    accounts: accounts.map(alias => ({
      id: accountIdentity[alias].id,
      alias,
      role: accountIdentity[alias].role,
      namespace: NAMESPACE,
    })),
  }
}

async function cleanupInAggregateOrder(participants, cleanupRequest) {
  return [
    await participants.answerStorage.cleanupRun(cleanupRequest),
    await participants.artifactStorage.cleanupRun(cleanupRequest),
    await participants.databaseFixture.cleanupRun(cleanupRequest),
    await participants.personalOrganizations.cleanupRun(cleanupRequest),
  ]
}

describe('SEB Staging dynamic resource cleanup participants', () => {
  it('builds and freezes the only canonical 24-target topology from exact run identity', () => {
    const topology = createSebStagingResourceCleanupTopology(IDENTITY)

    expect(topology.namespace).toBe(NAMESPACE)
    expect(topology.nodes.map(value => value.targetKey))
      .toEqual(SEB_STAGING_RESOURCE_CLEANUP_TARGET_KEYS)
    expect(topology.nodes).toHaveLength(24)
    expect(topology.nodes
      .filter(value => value.kind === 'account')
      .map(value => [value.alias, value.role]))
      .toEqual([
        ['teacher-primary', 'teacher'],
        ['teacher-unrelated', 'teacher'],
        ['student-primary', 'student'],
        ['student-secondary', 'student'],
      ])
    expect(topology.nodes
      .filter(value => value.kind === 'personalOrganization')
      .map(value => value.ownerKey))
      .toEqual([
        'account-teacher-primary',
        'account-teacher-unrelated',
        'account-student-primary',
        'account-student-secondary',
      ])
    expect(topology.nodes.find(value => value.targetKey === 'question-written')?.resourceType)
      .toBe('essay')
    expect(topology.nodes.find(value => value.targetKey === 'question-upload')?.resourceType)
      .toBe('file_upload')
    expect(topology.nodes.find(value => value.targetKey === 'question-written')?.parentKey)
      .toBeNull()
    expect(topology.nodes.find(value => value.targetKey === 'question-upload')?.parentKey)
      .toBeNull()
    expect(topology.nodes.find(value => value.targetKey === 'answer-written')?.relatedKey)
      .toBe('question-written')
    expect(topology.nodes.find(value => value.targetKey === 'answer-upload')?.relatedKey)
      .toBe('question-upload')
    expect(Object.isFrozen(topology)).toBe(true)
    expect(Object.isFrozen(topology.identity.creationWindow)).toBe(true)
    expect(Object.isFrozen(topology.nodes)).toBe(true)
    expect(topology.nodes.every(Object.isFrozen)).toBe(true)
    expect(() => createSebStagingResourceCleanupTopology({
      ...IDENTITY,
      nodes: [],
    })).toThrow(SebStagingResourceCleanupParticipantsBlockedError)
  })

  it.each([
    ['origin', { targetOrigin: 'https://www.korkru.com' }],
    ['credential', { credentialKind: 'anon' }],
  ])('blocks a privileged cleanup client with the wrong canonical %s attestation', (_label, change) => {
    const harness = createHarness()
    expect(() => harness.makeParticipants({
      databaseClient: { ...harness.clients.databaseClient, ...change },
    })).toThrow(SebStagingResourceCleanupParticipantsBlockedError)
  })

  it('blocks storage clients not pinned to their one exact bucket', () => {
    const harness = createHarness()
    expect(() => harness.makeParticipants({
      answerStorageClient: {
        ...harness.clients.answerStorageClient,
        client: {
          ...harness.clients.answerStorageClient.client,
          bucketName: 'assignment-seb-configs',
        },
      },
    })).toThrow(SebStagingResourceCleanupParticipantsBlockedError)
  })

  it('passes idempotently before the first account exists', async () => {
    const harness = createHarness()
    const participants = harness.makeParticipants()

    expect(await cleanupInAggregateOrder(participants, request())).toEqual([
      { status: 'passed' },
      { status: 'passed' },
      { status: 'passed' },
      { status: 'passed' },
    ])
    for (const client of Object.values(harness.clients)) {
      expect(client.client.enumerateExactCleanupTarget).not.toHaveBeenCalled()
      expect(client.client.deleteExactCleanupTarget).not.toHaveBeenCalled()
    }
  })

  it('accepts only explicit passed/unplanned records as absent without privileged calls', async () => {
    const harness = createHarness({ planTargets: false })
    const explicitUnplannedLedger = {
      readCleanupTarget: referenceValue => {
        const result = harness.ledger.readCleanupTarget(referenceValue)
        return result.status === 'failed'
          ? { status: 'passed', state: 'unplanned', snapshots: [] }
          : result
      },
      reconcileTarget: referenceValue => harness.ledger.reconcileTarget(referenceValue),
      markDeleted: (referenceValue, input) => harness.ledger.markDeleted(referenceValue, input),
    }
    const participants = harness.makeParticipants({ privateRunLedger: explicitUnplannedLedger })

    expect(await cleanupInAggregateOrder(participants, request())).toEqual(
      Array.from({ length: 4 }, () => ({ status: 'passed' })),
    )
    expect(harness.reconciliationLookup).not.toHaveBeenCalled()
    for (const client of Object.values(harness.clients)) {
      expect(client.client.enumerateExactCleanupTarget).not.toHaveBeenCalled()
      expect(client.client.deleteExactCleanupTarget).not.toHaveBeenCalled()
    }
  })

  it('fails closed when a ledger read reports failed instead of explicit unplanned', async () => {
    const harness = createHarness()
    const failedReadLedger = {
      readCleanupTarget: () => ({ status: 'failed' }),
      reconcileTarget: referenceValue => harness.ledger.reconcileTarget(referenceValue),
      markDeleted: (referenceValue, input) => harness.ledger.markDeleted(referenceValue, input),
    }
    const participants = harness.makeParticipants({ privateRunLedger: failedReadLedger })

    expect(await participants.databaseFixture.cleanupRun(request()))
      .toEqual({ status: 'failed' })
    expect(harness.clients.databaseClient.client.enumerateExactCleanupTarget)
      .not.toHaveBeenCalled()
  })

  it.each([
    ['unplanned', 1],
    ['planned', 1],
    ['uncertain', 1],
    ['deleted', 1],
    ['committed', 0],
    ['committed', 2],
  ])('rejects malformed %s state with %i snapshot(s)', async (state, snapshotCount) => {
    const harness = createHarness()
    for (const key of [
      'account-teacher-primary', 'personal-organization-teacher-primary',
      'classroom-primary', 'assignment-primary',
    ]) harness.materialize(key)
    const malformedLedger = {
      readCleanupTarget: referenceValue => referenceValue.targetKey === 'assignment-primary'
        ? {
            status: 'passed',
            state,
            snapshots: Array.from(
              { length: snapshotCount },
              () => harness.candidateFor('assignment-primary'),
            ),
          }
        : harness.ledger.readCleanupTarget(referenceValue),
      reconcileTarget: referenceValue => harness.ledger.reconcileTarget(referenceValue),
      markDeleted: (referenceValue, input) => harness.ledger.markDeleted(referenceValue, input),
    }
    const participants = harness.makeParticipants({ privateRunLedger: malformedLedger })

    expect(await participants.databaseFixture.cleanupRun(request(['teacher-primary'])))
      .toEqual({ status: 'failed' })
    expect(harness.clients.databaseClient.client.enumerateExactCleanupTarget)
      .not.toHaveBeenCalled()
  })

  it.each(['method', 'object'])('fails closed on ledger %s drift during a call', async drift => {
    const harness = createHarness()
    let driftingLedger
    driftingLedger = {
      readCleanupTarget: referenceValue => {
        if (drift === 'method') {
          driftingLedger.markDeleted = () => ({ status: 'passed' })
        } else {
          Object.setPrototypeOf(driftingLedger, { drifted: true })
        }
        return harness.ledger.readCleanupTarget(referenceValue)
      },
      reconcileTarget: referenceValue => harness.ledger.reconcileTarget(referenceValue),
      markDeleted: (referenceValue, input) => harness.ledger.markDeleted(referenceValue, input),
    }
    const participants = harness.makeParticipants({ privateRunLedger: driftingLedger })

    expect(await participants.databaseFixture.cleanupRun(request()))
      .toEqual({ status: 'failed' })
    expect(harness.clients.databaseClient.client.enumerateExactCleanupTarget)
      .not.toHaveBeenCalled()
  })

  it('passes partial provisioning because every untouched canonical target is pre-planned', async () => {
    const harness = createHarness()
    harness.materialize('account-teacher-primary')
    const participants = harness.makeParticipants()

    for (const value of harness.topology.nodes) {
      if (value.targetKey === 'account-teacher-primary') continue
      expect(harness.ledger.readCleanupTarget(reference(value)))
        .toEqual({ status: 'passed', state: 'planned', snapshots: [] })
    }

    expect(await cleanupInAggregateOrder(participants, request(['teacher-primary']))).toEqual([
      { status: 'passed' },
      { status: 'passed' },
      { status: 'passed' },
      { status: 'passed' },
    ])
    expect(harness.stored.has('account-teacher-primary')).toBe(true)
  })

  it('fails before privileged calls when a committed account is omitted or a planned account is supplied', async () => {
    const omitted = createHarness()
    omitted.materialize('account-teacher-primary')
    omitted.materialize('account-student-primary')
    expect(await omitted.makeParticipants().databaseFixture.cleanupRun(
      request(['teacher-primary']),
    )).toEqual({ status: 'failed' })
    expect(omitted.clients.databaseClient.client.enumerateExactCleanupTarget)
      .not.toHaveBeenCalled()

    const extra = createHarness()
    extra.materialize('account-teacher-primary')
    expect(await extra.makeParticipants().databaseFixture.cleanupRun(
      request(['teacher-primary', 'student-primary']),
    )).toEqual({ status: 'failed' })
    expect(extra.clients.databaseClient.client.enumerateExactCleanupTarget)
      .not.toHaveBeenCalled()
  })

  it('reconciles an uncertain account before enforcing the exact request-account bijection', async () => {
    const harness = createHarness()
    const teacher = harness.nodes.get('account-teacher-primary')
    expect(harness.ledger.markUncertain(reference(teacher))).toEqual({ status: 'passed' })
    harness.reconciliationMatches.set(
      'account-teacher-primary',
      [harness.candidateFor('account-teacher-primary')],
    )

    expect(await harness.makeParticipants().databaseFixture.cleanupRun(
      request(['teacher-primary']),
    )).toEqual({ status: 'passed' })
    expect(harness.reconciliationLookup).toHaveBeenCalledTimes(1)
    expect(harness.clients.databaseClient.client.enumerateExactCleanupTarget)
      .not.toHaveBeenCalled()
  })

  it('cleans a partial graph before an artifact release exists', async () => {
    const harness = createHarness()
    for (const key of [
      'account-teacher-primary', 'account-student-primary',
      'personal-organization-teacher-primary', 'personal-organization-student-primary',
      'classroom-primary', 'assignment-primary', 'question-written', 'question-upload',
      'membership-primary', 'config-primary',
    ]) harness.materialize(key)
    const participants = harness.makeParticipants()

    expect(await cleanupInAggregateOrder(
      participants,
      request(['teacher-primary', 'student-primary']),
    )).toEqual([
      { status: 'passed' },
      { status: 'passed' },
      { status: 'passed' },
      { status: 'passed' },
    ])
    expect(harness.clients.artifactStorageClient.client.deleteExactCleanupTarget)
      .not.toHaveBeenCalled()
    const assignmentIndex = harness.events.indexOf('database:assignment-primary')
    const questionIndex = harness.events.indexOf('database:question-upload')
    const classroomIndex = harness.events.indexOf('database:classroom-primary')
    expect(assignmentIndex).toBeGreaterThanOrEqual(0)
    expect(questionIndex).toBeGreaterThan(assignmentIndex)
    expect(classroomIndex).toBeGreaterThan(questionIndex)
  })

  it('reconciles and deletes an answer object created before its answer row', async () => {
    const harness = createHarness()
    for (const key of [
      'account-teacher-primary', 'account-student-primary',
      'personal-organization-teacher-primary',
    ]) harness.materialize(key)
    for (const key of ['answer-upload', 'answer-storage']) {
      expect(harness.ledger.markUncertain(reference(harness.nodes.get(key))))
        .toEqual({ status: 'passed' })
    }
    harness.reconciliationMatches.set('answer-upload', [])
    harness.reconciliationMatches.set(
      'answer-storage',
      [harness.candidateFor('answer-storage')],
    )
    harness.stored.set('answer-storage', [harness.attestationFor('answer-storage')])

    expect(await harness.makeParticipants().answerStorage.cleanupRun(request([
      'teacher-primary', 'student-primary',
    ]))).toEqual({ status: 'passed' })
    expect(harness.events).toContain('answer:answer-storage')
    expect(harness.ledger.readCleanupTarget(reference(harness.nodes.get('answer-upload'))))
      .toEqual({ status: 'passed', state: 'deleted', snapshots: [] })
    expect(harness.ledger.readCleanupTarget(reference(harness.nodes.get('answer-storage'))))
      .toEqual({ status: 'passed', state: 'deleted', snapshots: [] })
  })

  it('reconciles and deletes an artifact created before its release row', async () => {
    const harness = createHarness()
    for (const key of [
      'account-teacher-primary', 'personal-organization-teacher-primary',
    ]) harness.materialize(key)
    for (const key of ['release-primary', 'assignment-artifact']) {
      expect(harness.ledger.markUncertain(reference(harness.nodes.get(key))))
        .toEqual({ status: 'passed' })
    }
    harness.reconciliationMatches.set('release-primary', [])
    harness.reconciliationMatches.set(
      'assignment-artifact',
      [harness.candidateFor('assignment-artifact')],
    )
    harness.stored.set(
      'assignment-artifact',
      [harness.attestationFor('assignment-artifact')],
    )

    expect(await harness.makeParticipants().artifactStorage.cleanupRun(request([
      'teacher-primary',
    ], true))).toEqual({ status: 'passed' })
    expect(harness.events).toContain('artifact:assignment-artifact')
    expect(harness.ledger.readCleanupTarget(reference(harness.nodes.get('release-primary'))))
      .toEqual({ status: 'passed', state: 'deleted', snapshots: [] })
    expect(harness.ledger.readCleanupTarget(reference(harness.nodes.get('assignment-artifact'))))
      .toEqual({ status: 'passed', state: 'deleted', snapshots: [] })
  })

  it('cleans questions created before an assignment exists', async () => {
    const harness = createHarness()
    for (const key of [
      'account-teacher-primary',
      'personal-organization-teacher-primary',
      'classroom-primary',
      'question-written',
      'question-upload',
    ]) harness.materialize(key)

    expect(await cleanupInAggregateOrder(
      harness.makeParticipants(),
      request(['teacher-primary']),
    )).toEqual(Array.from({ length: 4 }, () => ({ status: 'passed' })))
    expect(harness.events).not.toContain('database:assignment-primary')
    expect(harness.events.indexOf('database:question-written')).toBeGreaterThanOrEqual(0)
    expect(harness.events.indexOf('database:question-upload')).toBeGreaterThanOrEqual(0)
    expect(harness.events.indexOf('database:question-upload'))
      .toBeLessThan(harness.events.indexOf('database:classroom-primary'))
  })

  it('attests and deletes the complete graph with run/release/artifact identity bound', async () => {
    const harness = createHarness()
    for (const value of harness.topology.nodes) harness.materialize(value.targetKey)
    const participants = harness.makeParticipants()
    const cleanupRequest = request([
      'teacher-primary', 'teacher-unrelated', 'student-primary', 'student-secondary',
    ], true)

    const results = await cleanupInAggregateOrder(participants, cleanupRequest)

    expect(results).toEqual(Array.from({ length: 4 }, () => ({ status: 'passed' })))
    expect(harness.stored.size).toBe(4)
    expect([...harness.stored.keys()].sort()).toEqual([
      'account-student-primary',
      'account-student-secondary',
      'account-teacher-primary',
      'account-teacher-unrelated',
    ])
    expect(harness.events[0]).toBe('answer:answer-storage')
    expect(harness.events[1]).toBe('artifact:assignment-artifact')
    expect(harness.events.indexOf('database:proctor-event'))
      .toBeLessThan(harness.events.indexOf('database:assignment-primary'))
    expect(harness.events.indexOf('database:proctor-connection'))
      .toBeLessThan(harness.events.indexOf('database:assignment-primary'))
    expect(harness.events.indexOf('database:answer-written'))
      .toBeLessThan(harness.events.indexOf('database:assignment-primary'))
    expect(harness.events.indexOf('database:answer-upload'))
      .toBeLessThan(harness.events.indexOf('database:assignment-primary'))
    expect(harness.events.indexOf('database:check-in-primary'))
      .toBeLessThan(harness.events.indexOf('database:assignment-primary'))
    expect(harness.events.indexOf('database:submission-primary'))
      .toBeLessThan(harness.events.indexOf('database:assignment-primary'))
    expect(harness.events.indexOf('database:assignment-primary'))
      .toBeLessThan(harness.events.indexOf('database:question-written'))
    expect(harness.events.indexOf('database:question-upload'))
      .toBeLessThan(harness.events.indexOf('database:classroom-primary'))
    expect(harness.events.indexOf('database:membership-primary'))
      .toBeLessThan(harness.events.indexOf('database:classroom-primary'))
    expect(harness.events).not.toContain('database:release-primary')
    expect(harness.events).not.toContain('database:config-primary')
    expect(harness.events).toContain('database:submission-primary')
    expect(harness.events.at(-1)).toBe('personal:personal-organization-student-secondary')
    expect(harness.clients.answerStorageClient.client.enumerateExactCleanupTarget)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          storageBucket: 'submission-files',
          storagePrefix: `${IDS.student}/${IDS.submission}/${IDS.answer}/`,
        }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    expect(harness.clients.artifactStorageClient.client.enumerateExactCleanupTarget)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          storageBucket: 'assignment-seb-configs',
          storagePrefix: `assignments/${IDS.assignment}/r1/`,
        }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    for (const result of results) {
      expect(Object.isFrozen(result)).toBe(true)
      expect(Object.keys(result)).toEqual(['status'])
    }
  })

  it.each([
    ['owner', { ownerId: uuid(90) }],
    ['organization', { organizationId: uuid(91) }],
    ['resource type', { resourceType: 'exercise' }],
    ['run', { runId: 'seb-s5-cleanup-wrong' }],
    ['source revision', { sourceRevision: 'f'.repeat(40) }],
    ['deployment', { deploymentId: 'dpl_ffffffffffffffff' }],
    ['tenant namespace', { namespace: 'qa:seb-s5-other-run' }],
    ['creation window', { createdAt: '2026-09-23T11:00:00.001Z' }],
    ['cross-assignment', { parentId: uuid(92) }],
  ])('fails before deletion on wrong %s provenance', async (_label, overrides) => {
    const harness = createHarness()
    for (const key of ['account-teacher-primary', 'personal-organization-teacher-primary', 'classroom-primary', 'assignment-primary']) {
      harness.materialize(key)
    }
    harness.stored.set('assignment-primary', [harness.attestationFor('assignment-primary', overrides)])
    const participants = harness.makeParticipants()

    expect(await participants.databaseFixture.cleanupRun(request(['teacher-primary'])))
      .toEqual({ status: 'failed' })
    expect(harness.clients.databaseClient.client.deleteExactCleanupTarget).not.toHaveBeenCalled()
  })

  it.each([
    [
      'answer-storage prefix',
      'answerStorage',
      'answerStorageClient',
      'answer-storage',
      {
        targetId: `${uuid(90)}/${IDS.submission}/${IDS.answer}/${IDS.upload}.pdf`,
      },
    ],
    [
      'artifact prefix',
      'artifactStorage',
      'artifactStorageClient',
      'assignment-artifact',
      {
        targetId: `assignments/${uuid(91)}/r1/${ARTIFACT_SHA}.seb`,
      },
    ],
    [
      'artifact cross-assignment relation',
      'artifactStorage',
      'artifactStorageClient',
      'assignment-artifact',
      { relatedId: uuid(92) },
    ],
  ])('fails closed when a storage enumerator returns a wrong %s', async (
    _label,
    participantName,
    clientName,
    targetKey,
    overrides,
  ) => {
    const harness = createHarness()
    for (const value of harness.topology.nodes) harness.materialize(value.targetKey)
    const privileged = harness.clients[clientName].client
    privileged.enumerateExactCleanupTarget.mockResolvedValue({
      matches: [harness.attestationFor(targetKey, overrides)],
    })
    const participants = harness.makeParticipants()

    expect(await participants[participantName].cleanupRun(request([
      'teacher-primary', 'teacher-unrelated', 'student-primary', 'student-secondary',
    ]))).toEqual({ status: 'failed' })
    expect(privileged.deleteExactCleanupTarget).not.toHaveBeenCalled()
  })

  it('fails before deletion on duplicate or unknown enumeration results', async () => {
    for (const mode of ['duplicate', 'unknown']) {
      const harness = createHarness()
      for (const key of ['account-teacher-primary', 'personal-organization-teacher-primary', 'classroom-primary', 'assignment-primary']) {
        harness.materialize(key)
      }
      const original = harness.clients.databaseClient.client.enumerateExactCleanupTarget
      harness.clients.databaseClient.client.enumerateExactCleanupTarget = vi.fn(async input => {
        const result = await original(input)
        if (input.reference.targetKey !== 'assignment-primary') return result
        if (mode === 'duplicate') return { matches: [result.matches[0], result.matches[0]] }
        return { matches: [{ ...result.matches[0], targetId: uuid(99) }] }
      })
      const participants = harness.makeParticipants()

      expect(await participants.databaseFixture.cleanupRun(request(['teacher-primary'])))
        .toEqual({ status: 'failed' })
      expect(harness.clients.databaseClient.client.deleteExactCleanupTarget)
        .not.toHaveBeenCalled()
    }
  })

  it('reconciles authoritative zero/one targets and rejects multiple canonical snapshots', async () => {
    for (const mode of ['zero', 'multiple', 'one']) {
      const harness = createHarness()
      harness.materialize('account-teacher-primary')
      harness.materialize('personal-organization-teacher-primary')
      harness.materialize('classroom-primary')
      const assignment = harness.nodes.get('assignment-primary')
      expect(harness.ledger.markUncertain(reference(assignment))).toEqual({ status: 'passed' })
      const secondaryId = uuid(98)
      const candidates = mode === 'zero'
        ? []
        : mode === 'multiple'
          ? [
              harness.candidateFor('assignment-primary'),
              harness.candidateFor('assignment-primary', { targetId: secondaryId }),
            ]
          : [harness.candidateFor('assignment-primary')]
      harness.reconciliationMatches.set('assignment-primary', candidates)
      harness.stored.set('assignment-primary', candidates.map(candidate => (
        harness.attestationFor('assignment-primary', { targetId: candidate.targetId })
      )))
      const participants = harness.makeParticipants()
      const result = await participants.databaseFixture.cleanupRun(request(['teacher-primary']))

      if (mode === 'multiple') {
        expect(result).toEqual({ status: 'failed' })
        expect(harness.ledger.readCleanupTarget(reference(assignment)))
          .toMatchObject({ status: 'passed', state: 'committed' })
        expect(harness.clients.databaseClient.client.deleteExactCleanupTarget)
          .not.toHaveBeenCalled()
      } else {
        expect(result).toEqual({ status: 'passed' })
        expect(harness.ledger.readCleanupTarget(reference(assignment))).toEqual({
          status: 'passed',
          state: 'deleted',
          snapshots: [],
        })
      }
    }
  })

  it('retries a partial deletion and marks the target only after verified absence', async () => {
    const harness = createHarness()
    for (const key of ['account-teacher-primary', 'personal-organization-teacher-primary', 'classroom-primary', 'assignment-primary']) {
      harness.materialize(key)
    }
    let attempt = 0
    harness.clients.databaseClient.client.deleteExactCleanupTarget.mockImplementation(async input => {
      harness.events.push(`database:${input.reference.targetKey}`)
      if (input.reference.targetKey === 'assignment-primary') {
        attempt += 1
        if (attempt === 1) throw new Error('PARTIAL_DELETE_SECRET_SENTINEL')
      }
      harness.stored.delete(input.reference.targetKey)
      return { status: 'passed' }
    })
    const participants = harness.makeParticipants()
    const cleanupRequest = request(['teacher-primary'])

    expect(await participants.databaseFixture.cleanupRun(cleanupRequest)).toEqual({ status: 'failed' })
    expect(harness.ledger.readCleanupTarget(reference(harness.nodes.get('assignment-primary'))))
      .toMatchObject({ status: 'passed', state: 'committed' })
    expect(await participants.databaseFixture.cleanupRun(cleanupRequest)).toEqual({ status: 'passed' })
    expect(attempt).toBe(2)
  })

  it('reconciles a deletion that completed before its boundary returned an error', async () => {
    const harness = createHarness()
    for (const key of [
      'account-teacher-primary', 'personal-organization-teacher-primary',
      'classroom-primary', 'assignment-primary',
    ]) harness.materialize(key)
    let deleteCalls = 0
    harness.clients.databaseClient.client.deleteExactCleanupTarget
      .mockImplementationOnce(async input => {
        deleteCalls += 1
        harness.stored.delete(input.reference.targetKey)
        throw new Error('UNCERTAIN_DELETE_SECRET_SENTINEL')
      })
    const participants = harness.makeParticipants()
    const cleanupRequest = request(['teacher-primary'])

    expect(await participants.databaseFixture.cleanupRun(cleanupRequest))
      .toEqual({ status: 'failed' })
    expect(harness.ledger.readCleanupTarget(reference(harness.nodes.get('assignment-primary'))))
      .toMatchObject({ status: 'passed', state: 'committed' })
    expect(await participants.databaseFixture.cleanupRun(cleanupRequest))
      .toEqual({ status: 'passed' })
    expect(deleteCalls).toBe(1)
    expect(harness.ledger.readCleanupTarget(reference(harness.nodes.get('assignment-primary'))))
      .toEqual({ status: 'passed', state: 'deleted', snapshots: [] })
  })

  it('requires an exact passed acknowledgement from the authorized delete boundary', async () => {
    const harness = createHarness()
    for (const key of [
      'account-teacher-primary', 'personal-organization-teacher-primary',
      'classroom-primary', 'assignment-primary',
    ]) harness.materialize(key)
    harness.clients.databaseClient.client.deleteExactCleanupTarget
      .mockResolvedValueOnce(undefined)
    const participants = harness.makeParticipants()

    expect(await participants.databaseFixture.cleanupRun(request(['teacher-primary'])))
      .toEqual({ status: 'failed' })
    expect(harness.ledger.readCleanupTarget(reference(harness.nodes.get('assignment-primary'))))
      .toMatchObject({ status: 'passed', state: 'committed' })
  })

  it('never directly deletes protected release/revision rows when the assignment cascade is incomplete', async () => {
    const harness = createHarness()
    for (const key of [
      'account-teacher-primary', 'personal-organization-teacher-primary',
      'classroom-primary', 'assignment-primary', 'config-primary', 'release-primary',
    ]) harness.materialize(key)
    harness.clients.databaseClient.client.deleteExactCleanupTarget
      .mockImplementation(async input => {
        harness.events.push(`database:${input.reference.targetKey}`)
        harness.stored.delete(input.reference.targetKey)
        return { status: 'passed' }
      })
    const participants = harness.makeParticipants()

    expect(await participants.databaseFixture.cleanupRun(request(['teacher-primary'])))
      .toEqual({ status: 'failed' })
    expect(harness.events).toContain('database:assignment-primary')
    expect(harness.events).not.toContain('database:release-primary')
    expect(harness.events).not.toContain('database:config-primary')
    expect(harness.ledger.readCleanupTarget(reference(harness.nodes.get('release-primary'))))
      .toMatchObject({ status: 'passed', state: 'committed' })
  })

  it('retains deleted dependency snapshots only inside one cleanup closure', async () => {
    const harness = createHarness()
    for (const value of harness.topology.nodes) harness.materialize(value.targetKey)
    const cleanupRequest = request([
      'teacher-primary', 'teacher-unrelated', 'student-primary', 'student-secondary',
    ], true)
    const originalProcess = harness.makeParticipants()

    expect(await originalProcess.answerStorage.cleanupRun(cleanupRequest))
      .toEqual({ status: 'passed' })
    expect(await originalProcess.artifactStorage.cleanupRun(cleanupRequest))
      .toEqual({ status: 'passed' })
    expect(harness.ledger.readCleanupTarget(reference(harness.nodes.get('assignment-artifact'))))
      .toEqual({ status: 'passed', state: 'deleted', snapshots: [] })

    // A new process has no deleted-target tombstone snapshot in the current
    // ledger API, so release-bound restart recovery deliberately fails closed.
    expect(await harness.makeParticipants().databaseFixture.cleanupRun(cleanupRequest))
      .toEqual({ status: 'failed' })
    // The original closure retained the exact immutable release/artifact
    // snapshots and can safely finish the aggregate cleanup.
    expect(await originalProcess.databaseFixture.cleanupRun(cleanupRequest))
      .toEqual({ status: 'passed' })
  })

  it('requires the database latch before personal organization cleanup', async () => {
    const harness = createHarness()
    harness.materialize('account-teacher-primary')
    harness.materialize('personal-organization-teacher-primary')
    const participants = harness.makeParticipants()
    const cleanupRequest = request(['teacher-primary'])

    expect(await participants.personalOrganizations.cleanupRun(cleanupRequest))
      .toEqual({ status: 'failed' })
    expect(harness.clients.personalOrganizationsClient.client.enumerateExactCleanupTarget)
      .not.toHaveBeenCalled()
    expect(await participants.databaseFixture.cleanupRun(cleanupRequest)).toEqual({ status: 'passed' })
    expect(await participants.personalOrganizations.cleanupRun(cleanupRequest))
      .toEqual({ status: 'passed' })
  })

  it('fails closed if reconciliation finds multiple personal organizations for one fixture account', async () => {
    const harness = createHarness()
    harness.materialize('account-teacher-primary')
    const organization = harness.nodes.get('personal-organization-teacher-primary')
    expect(harness.ledger.markUncertain(reference(organization))).toEqual({ status: 'passed' })
    const secondComposite = `${uuid(96)}:${uuid(97)}`
    harness.reconciliationMatches.set(organization.targetKey, [
      harness.candidateFor(organization.targetKey),
      harness.candidateFor(organization.targetKey, { targetId: secondComposite }),
    ])
    harness.stored.set(organization.targetKey, [
      harness.attestationFor(organization.targetKey),
      harness.attestationFor(organization.targetKey, { targetId: secondComposite }),
    ])
    const participants = harness.makeParticipants()
    const cleanupRequest = request(['teacher-primary'])

    expect(await participants.databaseFixture.cleanupRun(cleanupRequest))
      .toEqual({ status: 'passed' })
    expect(await participants.personalOrganizations.cleanupRun(cleanupRequest))
      .toEqual({ status: 'failed' })
    expect(harness.clients.personalOrganizationsClient.client.deleteExactCleanupTarget)
      .not.toHaveBeenCalled()
  })

  it('aborts and fails a never-settling privileged boundary within the bound', async () => {
    const harness = createHarness({ timeout: 10 })
    for (const key of ['account-teacher-primary', 'personal-organization-teacher-primary', 'classroom-primary', 'assignment-primary']) {
      harness.materialize(key)
    }
    let capturedSignal
    harness.clients.databaseClient.client.enumerateExactCleanupTarget
      .mockImplementation((_input, options) => {
      capturedSignal = options.signal
      return new Promise(() => {})
    })
    const participants = harness.makeParticipants()
    const startedAt = Date.now()

    expect(await participants.databaseFixture.cleanupRun(request(['teacher-primary'])))
      .toEqual({ status: 'failed' })
    expect(Date.now() - startedAt).toBeLessThan(1_000)
    expect(capturedSignal).toBeInstanceOf(AbortSignal)
    expect(capturedSignal.aborted).toBe(true)
    expect(harness.clients.databaseClient.client.deleteExactCleanupTarget).not.toHaveBeenCalled()
  })

  it('blocks retry until an abort-ignoring late enumeration has settled', async () => {
    const harness = createHarness({ timeout: 10 })
    for (const key of ['account-teacher-primary', 'personal-organization-teacher-primary', 'classroom-primary', 'assignment-primary']) {
      harness.materialize(key)
    }
    const gate = deferred()
    const client = harness.clients.databaseClient.client
    const originalEnumerate = client.enumerateExactCleanupTarget
    let capturedSignal
    client.enumerateExactCleanupTarget = vi.fn()
      .mockImplementationOnce(async (input, options) => {
        capturedSignal = options.signal
        await gate.promise
        return originalEnumerate(input, options)
      })
      .mockImplementation((input, options) => originalEnumerate(input, options))
    const participants = harness.makeParticipants()
    const cleanupRequest = request(['teacher-primary'])

    expect(await participants.databaseFixture.cleanupRun(cleanupRequest))
      .toEqual({ status: 'failed' })
    expect(capturedSignal.aborted).toBe(true)
    expect(await participants.databaseFixture.cleanupRun(cleanupRequest))
      .toEqual({ status: 'failed' })
    expect(client.enumerateExactCleanupTarget).toHaveBeenCalledTimes(1)
    expect(client.deleteExactCleanupTarget).not.toHaveBeenCalled()

    gate.resolve()
    await client.enumerateExactCleanupTarget.mock.results[0].value
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(await participants.databaseFixture.cleanupRun(cleanupRequest))
      .toEqual({ status: 'passed' })
  })

  it('cannot pass a retry while an abort-ignoring late delete is still unsettled', async () => {
    const harness = createHarness({ timeout: 10 })
    for (const key of ['account-teacher-primary', 'personal-organization-teacher-primary', 'classroom-primary', 'assignment-primary']) {
      harness.materialize(key)
    }
    const gate = deferred()
    const client = harness.clients.databaseClient.client
    const originalDelete = client.deleteExactCleanupTarget
    let capturedSignal
    client.deleteExactCleanupTarget = vi.fn()
      .mockImplementationOnce(async (input, options) => {
        capturedSignal = options.signal
        const result = await originalDelete(input, options)
        await gate.promise
        return result
      })
      .mockImplementation((input, options) => originalDelete(input, options))
    const participants = harness.makeParticipants()
    const cleanupRequest = request(['teacher-primary'])

    expect(await participants.databaseFixture.cleanupRun(cleanupRequest))
      .toEqual({ status: 'failed' })
    expect(capturedSignal.aborted).toBe(true)
    expect(harness.stored.has('assignment-primary')).toBe(false)
    expect(harness.ledger.readCleanupTarget(reference(harness.nodes.get('assignment-primary'))))
      .toMatchObject({ status: 'passed', state: 'committed' })
    const enumerationsBeforeRetry = client.enumerateExactCleanupTarget.mock.calls.length

    expect(await participants.databaseFixture.cleanupRun(cleanupRequest))
      .toEqual({ status: 'failed' })
    expect(client.enumerateExactCleanupTarget).toHaveBeenCalledTimes(enumerationsBeforeRetry)
    expect(client.deleteExactCleanupTarget).toHaveBeenCalledTimes(1)

    gate.resolve()
    await client.deleteExactCleanupTarget.mock.results[0].value
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(await participants.databaseFixture.cleanupRun(cleanupRequest))
      .toEqual({ status: 'passed' })
    expect(harness.ledger.readCleanupTarget(reference(harness.nodes.get('assignment-primary'))))
      .toEqual({ status: 'passed', state: 'deleted', snapshots: [] })
  })

  it('fails closed on environment drift and keeps errors/results free of secrets', async () => {
    const harness = createHarness()
    for (const key of ['account-teacher-primary', 'personal-organization-teacher-primary', 'classroom-primary', 'assignment-primary']) {
      harness.materialize(key)
    }
    harness.clients.databaseClient.client.enumerateExactCleanupTarget
      .mockImplementationOnce(async input => {
      harness.environment.current = {
        ...OFFICIAL_ENVIRONMENT,
        NEXT_PUBLIC_SITE_URL: 'https://www.korkru.com',
      }
      throw new Error(`DATABASE_SERVICE_ROLE_SECRET:${input.targetId}`)
    })
    const participants = harness.makeParticipants()
    const result = await participants.databaseFixture.cleanupRun(request(['teacher-primary']))

    expect(result).toEqual({ status: 'failed' })
    expect(Object.keys(result)).toEqual(['status'])
    expect(JSON.stringify(result)).not.toMatch(/SECRET|service.role|00000006/i)
    expect(harness.clients.databaseClient.client.deleteExactCleanupTarget).not.toHaveBeenCalled()
  })

  it('fails closed when a privileged client is swapped during a boundary', async () => {
    const harness = createHarness()
    for (const key of [
      'account-teacher-primary', 'personal-organization-teacher-primary',
      'classroom-primary', 'assignment-primary',
    ]) harness.materialize(key)
    const wrapper = harness.clients.databaseClient
    const original = wrapper.client.enumerateExactCleanupTarget
    wrapper.client.enumerateExactCleanupTarget = vi.fn(async (input, options) => {
      const result = await original.call(wrapper.client, input, options)
      wrapper.targetOrigin = 'https://www.korkru.com'
      return result
    })
    const participants = harness.makeParticipants()

    expect(await participants.databaseFixture.cleanupRun(request(['teacher-primary'])))
      .toEqual({ status: 'failed' })
    expect(wrapper.client.deleteExactCleanupTarget).not.toHaveBeenCalled()
  })

  it('blocks malformed graph topology instead of inventing a broad cleanup scope', () => {
    const topology = validTopology()
    topology.nodes.find(value => value.targetKey === 'assignment-primary').ownerKey = 'account-student-primary'
    const environment = () => OFFICIAL_ENVIRONMENT
    const dummy = {
      targetOrigin: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
      credentialKind: 'service-role',
      client: {
        supabaseUrl: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
        enumerateExactCleanupTarget: async () => ({ matches: [] }),
        deleteExactCleanupTarget: async () => ({ status: 'passed' }),
      },
    }
    expect(() => createSebStagingResourceCleanupParticipants({
      readEnvironment: environment,
      topology,
      privateRunLedger: {
        readCleanupTarget: () => ({ status: 'failed' }),
        reconcileTarget: async () => ({ status: 'failed' }),
        markDeleted: () => ({ status: 'failed' }),
      },
      answerStorageClient: {
        ...dummy,
        client: { ...dummy.client, bucketName: 'submission-files' },
      },
      artifactStorageClient: {
        ...dummy,
        client: { ...dummy.client, bucketName: 'assignment-seb-configs' },
      },
      databaseClient: dummy,
      personalOrganizationsClient: dummy,
    })).toThrow(SebStagingResourceCleanupParticipantsBlockedError)
  })
})
