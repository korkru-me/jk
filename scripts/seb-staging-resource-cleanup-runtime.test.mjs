import { describe, expect, it, vi } from 'vitest'

import { createSebStagingResourceCleanupTopology } from './seb-staging-resource-cleanup-participants.mjs'
import {
  SebStagingResourceCleanupRuntimeBlockedError,
  createSebStagingResourceCleanupRuntime,
} from './seb-staging-resource-cleanup-runtime.mjs'

const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const SITE_ORIGIN = 'https://staging.korkru.com'
const CREATED_AT = '2026-09-23T10:05:00.000Z'
const SERVICE_ROLE_SENTINEL = 'service-role-SENTINEL-never-return-or-log-1234567890'
const HASHED_QUIT_SENTINEL = 'hashed-quit-SENTINEL-never-select'
const CONFIG_KEY_SENTINEL = 'config-key-SENTINEL-never-select'
const BEK_SENTINEL = 'bek-SENTINEL-never-select'
const IDENTITY = Object.freeze({
  runId: 'seb-s5-cleanup-runtime-1',
  sourceRevision: 'a'.repeat(40),
  deploymentId: 'dpl_1234567890abcdef',
  creationWindow: Object.freeze({
    notBefore: '2026-09-23T10:00:00.000Z',
    notAfter: '2026-09-23T11:00:00.000Z',
  }),
})
const TOPOLOGY = createSebStagingResourceCleanupTopology(IDENTITY)

function uuid(index) {
  return `${String(index).padStart(8, '0')}-0000-4000-8000-${String(index).padStart(12, '0')}`
}

const IDS = Object.freeze({
  teacher: uuid(1),
  teacherUnrelated: uuid(2),
  student: uuid(3),
  studentSecondary: uuid(4),
  teacherOrg: uuid(5),
  teacherOrgMember: uuid(6),
  teacherUnrelatedOrg: uuid(7),
  teacherUnrelatedOrgMember: uuid(8),
  studentOrg: uuid(9),
  studentOrgMember: uuid(10),
  studentSecondaryOrg: uuid(11),
  studentSecondaryOrgMember: uuid(12),
  classroom: uuid(13),
  assignment: uuid(14),
  writtenQuestion: uuid(15),
  uploadQuestion: uuid(16),
  membership: uuid(17),
  membershipSecondary: uuid(18),
  submission: uuid(19),
  writtenAnswer: uuid(20),
  uploadAnswer: uuid(21),
  client: uuid(22),
  upload: uuid(23),
  assignmentClassroom: uuid(24),
})
const ARTIFACT_SHA = 'c'.repeat(64)
const RELEASE_ID = `asr-${IDS.assignment.replaceAll('-', '')}-r1-${ARTIFACT_SHA.slice(0, 16)}`
const ARTIFACT_PATH = `assignments/${IDS.assignment}/r1/${ARTIFACT_SHA}.seb`
const ANSWER_PATH = `${IDS.student}/${IDS.submission}/${IDS.uploadAnswer}/${IDS.upload}.pdf`
const ANSWER_URL = `${SUPABASE_ORIGIN}/storage/v1/object/public/submission-files/${ANSWER_PATH}`

const TARGET_IDS = Object.freeze(new Map([
  ['account-teacher-primary', IDS.teacher],
  ['account-teacher-unrelated', IDS.teacherUnrelated],
  ['account-student-primary', IDS.student],
  ['account-student-secondary', IDS.studentSecondary],
  ['personal-organization-teacher-primary', `${IDS.teacherOrg}:${IDS.teacherOrgMember}`],
  ['personal-organization-teacher-unrelated', `${IDS.teacherUnrelatedOrg}:${IDS.teacherUnrelatedOrgMember}`],
  ['personal-organization-student-primary', `${IDS.studentOrg}:${IDS.studentOrgMember}`],
  ['personal-organization-student-secondary', `${IDS.studentSecondaryOrg}:${IDS.studentSecondaryOrgMember}`],
  ['classroom-primary', IDS.classroom],
  ['assignment-primary', IDS.assignment],
  ['question-written', IDS.writtenQuestion],
  ['question-upload', IDS.uploadQuestion],
  ['membership-primary', IDS.membership],
  ['membership-secondary', IDS.membershipSecondary],
  ['config-primary', `${IDS.assignment}:r1`],
  ['release-primary', RELEASE_ID],
  ['check-in-primary', `${IDS.assignment}:${IDS.student}`],
  ['submission-primary', IDS.submission],
  ['answer-written', IDS.writtenAnswer],
  ['answer-upload', IDS.uploadAnswer],
  ['proctor-connection', `${IDS.submission}:${IDS.client}`],
  ['proctor-event', '9223372036854775806'],
  ['answer-storage', ANSWER_PATH],
  ['assignment-artifact', ARTIFACT_PATH],
]))

function validEnvironment(overrides = {}) {
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

function relationshipId(targetKey) {
  if (targetKey === null) return null
  const id = TARGET_IDS.get(targetKey)
  const node = TOPOLOGY.nodes.find(value => value.targetKey === targetKey)
  return node.kind === 'personalOrganization' ? id.split(':')[0] : id
}

function cleanupInput(targetKey, overrides = {}) {
  const node = TOPOLOGY.nodes.find(value => value.targetKey === targetKey)
  const targetId = TARGET_IDS.get(targetKey)
  let storageBucket = null
  let storagePrefix = null
  if (targetKey === 'answer-storage') {
    storageBucket = 'submission-files'
    storagePrefix = `${IDS.student}/${IDS.submission}/${IDS.uploadAnswer}/`
  } else if (targetKey === 'assignment-artifact') {
    storageBucket = 'assignment-seb-configs'
    storagePrefix = `assignments/${IDS.assignment}/r1/`
  }
  return {
    schemaVersion: 1,
    reference: { schemaVersion: 1, targetKey, kind: node.kind },
    runIdentity: structuredClone(IDENTITY),
    relationship: {
      ownerId: relationshipId(node.ownerKey),
      organizationId: relationshipId(node.organizationKey),
      parentId: relationshipId(node.parentKey),
      relatedId: relationshipId(node.relatedKey),
    },
    storageBucket,
    storagePrefix,
    targetId,
    ...overrides,
  }
}

function rowMap() {
  return new Map([
    ['organizations', [
      { id: IDS.teacherOrg, is_personal: true, subscription_tier: 'free', deleted_at: null, created_at: CREATED_AT },
      { id: IDS.teacherUnrelatedOrg, is_personal: true, subscription_tier: 'free', deleted_at: null, created_at: CREATED_AT },
      { id: IDS.studentOrg, is_personal: true, subscription_tier: 'free', deleted_at: null, created_at: CREATED_AT },
      { id: IDS.studentSecondaryOrg, is_personal: true, subscription_tier: 'free', deleted_at: null, created_at: CREATED_AT },
    ]],
    ['organization_members', [
      { id: IDS.teacherOrgMember, org_id: IDS.teacherOrg, user_id: IDS.teacher, org_role: 'owner', joined_at: CREATED_AT },
      { id: IDS.teacherUnrelatedOrgMember, org_id: IDS.teacherUnrelatedOrg, user_id: IDS.teacherUnrelated, org_role: 'owner', joined_at: CREATED_AT },
      { id: IDS.studentOrgMember, org_id: IDS.studentOrg, user_id: IDS.student, org_role: 'owner', joined_at: CREATED_AT },
      { id: IDS.studentSecondaryOrgMember, org_id: IDS.studentSecondaryOrg, user_id: IDS.studentSecondary, org_role: 'owner', joined_at: CREATED_AT },
    ]],
    ['classrooms', [{
      id: IDS.classroom,
      teacher_id: IDS.teacher,
      org_id: IDS.teacherOrg,
      classroom_type: 'subject',
      created_at: CREATED_AT,
    }]],
    ['assignments', [{
      id: IDS.assignment,
      classroom_id: IDS.classroom,
      created_by: IDS.teacher,
      org_id: IDS.teacherOrg,
      type: 'exam',
      secure_browser_mode: 'seb_required',
      question_ids: [IDS.writtenQuestion, IDS.uploadQuestion],
      created_at: CREATED_AT,
    }]],
    ['questions', [
      { id: IDS.writtenQuestion, created_by: IDS.teacher, org_id: IDS.teacherOrg, question_type: 'written', created_at: CREATED_AT },
      { id: IDS.uploadQuestion, created_by: IDS.teacher, org_id: IDS.teacherOrg, question_type: 'file_upload', created_at: CREATED_AT },
    ]],
    ['classroom_students', [
      { id: IDS.membership, classroom_id: IDS.classroom, student_id: IDS.student, joined_at: CREATED_AT },
      { id: IDS.membershipSecondary, classroom_id: IDS.classroom, student_id: IDS.studentSecondary, joined_at: CREATED_AT },
    ]],
    ['assignment_classrooms', [{
      id: IDS.assignmentClassroom,
      assignment_id: IDS.assignment,
      classroom_id: IDS.classroom,
      created_at: CREATED_AT,
    }]],
    ['assignment_seb_config_revisions', [{
      assignment_id: IDS.assignment,
      revision: 1,
      org_id: IDS.teacherOrg,
      owner_id: IDS.teacher,
      hashed_quit_password: HASHED_QUIT_SENTINEL,
      created_at: CREATED_AT,
    }]],
    ['assignment_seb_config_releases', [{
      assignment_id: IDS.assignment,
      revision: 1,
      org_id: IDS.teacherOrg,
      owner_id: IDS.teacher,
      release_id: RELEASE_ID,
      artifact_storage_path: ARTIFACT_PATH,
      artifact_sha256: ARTIFACT_SHA,
      artifact_size_bytes: 1_024,
      config_key: CONFIG_KEY_SENTINEL,
      browser_exam_keys: [BEK_SENTINEL],
      security_mode: 'test_plaintext',
      created_at: CREATED_AT,
    }]],
    ['exam_seb_checkins', [{
      assignment_id: IDS.assignment,
      student_id: IDS.student,
      org_id: IDS.teacherOrg,
      platform: 'windows',
      verified_at: CREATED_AT,
    }]],
    ['submissions', [{
      id: IDS.submission,
      assignment_id: IDS.assignment,
      student_id: IDS.student,
      org_id: IDS.teacherOrg,
      secure_browser_verified_at: CREATED_AT,
      secure_browser_platform: 'windows',
      seb_config_revision: 1,
      created_at: CREATED_AT,
    }]],
    ['submission_answers', [
      {
        id: IDS.writtenAnswer,
        submission_id: IDS.submission,
        question_id: IDS.writtenQuestion,
        org_id: IDS.teacherOrg,
        student_answer: 'synthetic answer',
        created_at: CREATED_AT,
      },
      {
        id: IDS.uploadAnswer,
        submission_id: IDS.submission,
        question_id: IDS.uploadQuestion,
        org_id: IDS.teacherOrg,
        student_answer: JSON.stringify([{ url: ANSWER_URL, name: 'answer.pdf', type: 'application/pdf' }]),
        created_at: CREATED_AT,
      },
    ]],
    ['exam_proctor_connections', [{
      submission_id: IDS.submission,
      client_instance_id: IDS.client,
      assignment_id: IDS.assignment,
      student_id: IDS.student,
      org_id: IDS.teacherOrg,
      connected_at: CREATED_AT,
    }]],
    ['exam_proctor_events', [{
      id: '9223372036854775806',
      submission_id: IDS.submission,
      assignment_id: IDS.assignment,
      student_id: IDS.student,
      org_id: IDS.teacherOrg,
      event_type: 'monitoring_started',
      created_at: CREATED_AT,
    }]],
    ['exam_proctor_sessions', [{
      submission_id: IDS.submission,
      assignment_id: IDS.assignment,
      student_id: IDS.student,
      org_id: IDS.teacherOrg,
      created_at: CREATED_AT,
    }]],
  ])
}

function objectMap() {
  return new Map([
    ['submission-files', [{
      bucketName: 'submission-files',
      path: ANSWER_PATH,
      ownerId: IDS.student,
      createdAt: CREATED_AT,
      sizeBytes: 2_048,
      mimeType: 'application/pdf',
      sha256: null,
    }]],
    ['assignment-seb-configs', [{
      bucketName: 'assignment-seb-configs',
      path: ARTIFACT_PATH,
      ownerId: null,
      createdAt: CREATED_AT,
      sizeBytes: 1_024,
      mimeType: 'application/seb',
      sha256: ARTIFACT_SHA,
    }]],
  ])
}

function matchesPredicate(row, value) {
  if (value.operator === 'eq') return row[value.column] === value.value
  if (value.operator === 'gte') return row[value.column] >= value.value
  if (value.operator === 'lte') return row[value.column] <= value.value
  if (value.operator === 'is') return row[value.column] === value.value
  if (value.operator === 'contains') {
    return Array.isArray(row[value.column])
      && Array.isArray(value.value)
      && value.value.every(item => row[value.column].includes(item))
  }
  throw new Error('unexpected operator')
}

function createHarness({
  environmentOverrides,
  rawOverrides = {},
  credentialOverrides = {},
  factoryOverrides = {},
  timeout = 100,
} = {}) {
  const environment = { current: validEnvironment(environmentOverrides) }
  const rows = rowMap()
  const objects = objectMap()
  const events = []
  const readEnvironment = vi.fn(() => ({ ...environment.current }))
  const credentialProvider = vi.fn(async request => ({
    schemaVersion: 1,
    targetOrigin: SUPABASE_ORIGIN,
    credentialKind: 'service-role',
    namespace: TOPOLOGY.namespace,
    serviceRoleKey: SERVICE_ROLE_SENTINEL,
    ...credentialOverrides,
  }))

  const raw = {
    supabaseUrl: SUPABASE_ORIGIN,
    credentialKind: 'service-role',
    enumerateDatabase: vi.fn(async (request, { signal }) => {
      if (signal.aborted) throw new Error('aborted')
      events.push({ type: 'enumerateDatabase', request })
      const found = (rows.get(request.table) ?? []).filter(row => (
        request.predicates.every(value => matchesPredicate(row, value))
      )).slice(0, request.limit)
      return {
        rows: found.map(row => Object.fromEntries(request.columns.map(column => [column, row[column]]))),
      }
    }),
    deleteDatabase: vi.fn(async (request, { signal }) => {
      if (signal.aborted) throw new Error('aborted')
      events.push({ type: 'deleteDatabase', request })
      if (request.atomicClosure !== null) {
        const requirements = [
          ...request.atomicClosure.requireAbsent,
          ...request.atomicClosure.requireExact,
        ]
        const closureMatches = requirements.every(requirement => (
          (rows.get(requirement.table) ?? [])
            .filter(row => requirement.predicates.every(value => matchesPredicate(row, value)))
            .length === requirement.expectedCount
        ))
        if (!closureMatches) {
          return { status: 'failed', deletedCount: 0, atomicClosureVerified: false }
        }
      }
      const existing = rows.get(request.table) ?? []
      const removed = existing.filter(row => request.predicates.every(value => matchesPredicate(row, value)))
      rows.set(request.table, existing.filter(row => !removed.includes(row)))
      if (request.table === 'assignments' && removed.length === 1) {
        for (const table of [
          'assignment_classrooms', 'assignment_seb_config_revisions',
          'assignment_seb_config_releases',
        ]) {
          rows.set(table, (rows.get(table) ?? []).filter(row => row.assignment_id !== removed[0].id))
        }
      }
      if (request.table === 'submissions' && removed.length === 1) {
        rows.set(
          'exam_proctor_sessions',
          (rows.get('exam_proctor_sessions') ?? [])
            .filter(row => row.submission_id !== removed[0].id),
        )
      }
      if (request.table === 'organizations' && removed.length === 1) {
        rows.set(
          'organization_members',
          (rows.get('organization_members') ?? []).filter(row => row.org_id !== removed[0].id),
        )
      }
      return request.atomicClosure === null
        ? { status: 'passed', deletedCount: removed.length }
        : { status: 'passed', deletedCount: removed.length, atomicClosureVerified: true }
    }),
    enumerateStorage: vi.fn(async (request, { signal }) => {
      if (signal.aborted) throw new Error('aborted')
      events.push({ type: 'enumerateStorage', request })
      return {
        objects: (objects.get(request.bucketName) ?? [])
          .filter(object => object.path === request.path)
          .slice(0, request.limit)
          .map(object => ({ ...object })),
      }
    }),
    deleteStorage: vi.fn(async (request, { signal }) => {
      if (signal.aborted) throw new Error('aborted')
      events.push({ type: 'deleteStorage', request })
      const existing = objects.get(request.bucketName) ?? []
      const removed = existing.filter(object => object.path === request.path)
      objects.set(request.bucketName, existing.filter(object => object.path !== request.path))
      return { status: 'passed', deletedCount: removed.length }
    }),
    close: vi.fn(async () => ({ status: 'passed' })),
    ...rawOverrides,
  }
  const factory = vi.fn(async request => {
    events.push({ type: 'factory', hasSecret: request.serviceRoleKey === SERVICE_ROLE_SENTINEL })
    return Object.keys(factoryOverrides).length === 0 ? raw : { ...raw, ...factoryOverrides }
  })
  const runtime = createSebStagingResourceCleanupRuntime({
    readEnvironment,
    topology: TOPOLOGY,
    serviceRoleCredentialProvider: credentialProvider,
    createServiceRoleClient: factory,
    boundaryTimeoutMs: timeout,
  })

  const signal = () => new AbortController().signal
  const enumerate = (client, targetKey) => client.client.enumerateExactCleanupTarget(
    cleanupInput(targetKey),
    { signal: signal() },
  )
  const remove = (client, targetKey, input = cleanupInput(targetKey)) => (
    client.client.deleteExactCleanupTarget(input, { signal: signal() })
  )
  return {
    runtime,
    environment,
    rows,
    objects,
    events,
    raw,
    factory,
    credentialProvider,
    enumerate,
    remove,
  }
}

function expectBlocked(promise) {
  return expect(promise).rejects.toBeInstanceOf(SebStagingResourceCleanupRuntimeBlockedError)
}

function clearAssignmentOrdinaryDependencies(harness) {
  for (const table of [
    'submissions', 'exam_seb_checkins', 'exam_proctor_sessions',
    'exam_proctor_connections', 'exam_proctor_events',
  ]) harness.rows.set(table, [])
}

describe('SEB Staging exact resource cleanup runtime', () => {
  it('returns only the four participant clients and one quiescent close capability', () => {
    const { runtime } = createHarness()
    expect(Object.keys(runtime)).toEqual([
      'answerStorageClient',
      'artifactStorageClient',
      'databaseClient',
      'personalOrganizationsClient',
      'closeAll',
    ])
    expect(Object.keys(runtime.databaseClient)).toEqual(['targetOrigin', 'credentialKind', 'client'])
    expect(Object.keys(runtime.databaseClient.client)).toEqual([
      'supabaseUrl', 'enumerateExactCleanupTarget', 'deleteExactCleanupTarget',
    ])
    expect(runtime.databaseClient.targetOrigin).toBe(SUPABASE_ORIGIN)
    expect(JSON.stringify(runtime)).not.toContain(SERVICE_ROLE_SENTINEL)
  })

  it.each([
    ['production deployment', { KORKRU_DEPLOYMENT_ENV: 'production' }],
    ['production-like data', { EXAM_QA_DATA_POLICY: 'copied-production' }],
    ['wrong site', { NEXT_PUBLIC_SITE_URL: 'https://korkru.com' }],
    ['wrong Supabase project', { NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' }],
  ])('blocks construction for %s', (_label, override) => {
    expect(() => createHarness({ environmentOverrides: override }))
      .toThrow(SebStagingResourceCleanupRuntimeBlockedError)
  })

  it('normalizes a throwing environment reader without leaking its message', () => {
    let error
    try {
      createSebStagingResourceCleanupRuntime({
        readEnvironment() { throw new Error(`never leak ${SERVICE_ROLE_SENTINEL}`) },
        topology: TOPOLOGY,
        serviceRoleCredentialProvider: vi.fn(),
        createServiceRoleClient: vi.fn(),
      })
    } catch (value) {
      error = value
    }
    expect(error).toBeInstanceOf(SebStagingResourceCleanupRuntimeBlockedError)
    expect(error.message).not.toContain(SERVICE_ROLE_SENTINEL)
  })

  it('blocks credential origin drift without exposing the credential', async () => {
    const harness = createHarness({ credentialOverrides: { targetOrigin: 'https://other.supabase.co' } })
    const error = await harness.enumerate(harness.runtime.databaseClient, 'classroom-primary').catch(value => value)
    expect(error).toBeInstanceOf(SebStagingResourceCleanupRuntimeBlockedError)
    expect(error.message).not.toContain(SERVICE_ROLE_SENTINEL)
  })

  it('blocks a broad or origin-drifted raw driver', async () => {
    const broad = createHarness({ factoryOverrides: { from: vi.fn() } })
    await expectBlocked(broad.enumerate(broad.runtime.databaseClient, 'classroom-primary'))
    expect(await broad.runtime.closeAll()).toEqual({ status: 'passed' })
    expect(broad.raw.close).toHaveBeenCalledTimes(1)

    const drifted = createHarness({ factoryOverrides: { supabaseUrl: 'https://other.supabase.co' } })
    await expectBlocked(drifted.enumerate(drifted.runtime.databaseClient, 'classroom-primary'))
    expect(await drifted.runtime.closeAll()).toEqual({ status: 'passed' })
    expect(drifted.raw.close).toHaveBeenCalledTimes(1)
  })

  it('never reports quiescence when a malformed privileged factory result has no close capability', async () => {
    const harness = createHarness({ factoryOverrides: { close: null } })
    await expectBlocked(harness.enumerate(harness.runtime.databaseClient, 'classroom-primary'))
    expect(await harness.runtime.closeAll()).toEqual({ status: 'failed' })
  })

  it('attests an exact database target with metadata only and never selects private SEB fields', async () => {
    const harness = createHarness()
    const result = await harness.enumerate(harness.runtime.databaseClient, 'config-primary')
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]).toEqual({
      schemaVersion: 1,
      kind: 'configRevision',
      targetId: `${IDS.assignment}:r1`,
      runId: IDENTITY.runId,
      sourceRevision: IDENTITY.sourceRevision,
      deploymentId: IDENTITY.deploymentId,
      namespace: TOPOLOGY.namespace,
      ownerId: IDS.teacher,
      organizationId: IDS.teacherOrg,
      resourceType: 'seb_required',
      createdAt: CREATED_AT,
      parentId: IDS.assignment,
      relatedId: null,
    })
    const serialized = JSON.stringify({ result, events: harness.events })
    for (const secret of [SERVICE_ROLE_SENTINEL, HASHED_QUIT_SENTINEL, CONFIG_KEY_SENTINEL, BEK_SENTINEL]) {
      expect(serialized).not.toContain(secret)
    }
    expect(harness.events.flatMap(event => event.request?.columns ?? [])).not.toContain('hashed_quit_password')
    expect(harness.events.flatMap(event => event.request?.columns ?? [])).not.toContain('config_key')
    expect(harness.events.flatMap(event => event.request?.columns ?? [])).not.toContain('browser_exam_keys')
  })

  it('invokes every narrow driver method with exactly (request, { signal }) and the raw client receiver', async () => {
    const harness = createHarness()
    await harness.enumerate(harness.runtime.databaseClient, 'config-primary')
    await harness.enumerate(harness.runtime.databaseClient, 'submission-primary')
    await harness.enumerate(harness.runtime.databaseClient, 'proctor-connection')
    await harness.enumerate(harness.runtime.databaseClient, 'proctor-event')
    await harness.remove(harness.runtime.databaseClient, 'proctor-event')
    await harness.enumerate(harness.runtime.answerStorageClient, 'answer-storage')
    await harness.remove(harness.runtime.answerStorageClient, 'answer-storage')

    for (const method of [
      harness.raw.enumerateDatabase,
      harness.raw.deleteDatabase,
      harness.raw.enumerateStorage,
      harness.raw.deleteStorage,
    ]) {
      expect(method).toHaveBeenCalled()
      method.mock.calls.forEach(args => {
        expect(args).toHaveLength(2)
        expect(Object.keys(args[1])).toEqual(['signal'])
        expect(args[1].signal).toBeInstanceOf(AbortSignal)
      })
      method.mock.contexts.forEach(context => expect(context).toBe(harness.raw))
    }
  })

  it('prevents every participant client from deleting a remembered target owned by another client', async () => {
    const artifact = createHarness()
    await artifact.enumerate(artifact.runtime.artifactStorageClient, 'assignment-artifact')
    await expectBlocked(artifact.remove(
      artifact.runtime.answerStorageClient,
      'assignment-artifact',
    ))
    expect(artifact.raw.deleteStorage).not.toHaveBeenCalled()

    const answer = createHarness()
    await answer.enumerate(answer.runtime.answerStorageClient, 'answer-storage')
    await expectBlocked(answer.remove(answer.runtime.artifactStorageClient, 'answer-storage'))
    expect(answer.raw.deleteStorage).not.toHaveBeenCalled()

    const organization = createHarness()
    await organization.enumerate(
      organization.runtime.personalOrganizationsClient,
      'personal-organization-teacher-unrelated',
    )
    await expectBlocked(organization.remove(
      organization.runtime.databaseClient,
      'personal-organization-teacher-unrelated',
    ))
    expect(organization.raw.deleteDatabase).not.toHaveBeenCalled()

    const database = createHarness()
    await database.enumerate(database.runtime.databaseClient, 'classroom-primary')
    await expectBlocked(database.remove(
      database.runtime.personalOrganizationsClient,
      'classroom-primary',
    ))
    expect(database.raw.deleteDatabase).not.toHaveBeenCalled()
  })

  it('rejects config, release, and artifact revisions above the shared signed-int bound', async () => {
    const revision = 2_147_483_647
    const config = createHarness()
    await expectBlocked(config.runtime.databaseClient.client.enumerateExactCleanupTarget(
      cleanupInput('config-primary', { targetId: `${IDS.assignment}:r${revision}` }),
      { signal: new AbortController().signal },
    ))

    const releaseTarget = `asr-${IDS.assignment.replaceAll('-', '')}-r${revision}-${ARTIFACT_SHA.slice(0, 16)}`
    const release = createHarness()
    const releaseInput = cleanupInput('release-primary')
    await expectBlocked(release.runtime.databaseClient.client.enumerateExactCleanupTarget({
      ...releaseInput,
      targetId: releaseTarget,
      relationship: { ...releaseInput.relationship, parentId: `${IDS.assignment}:r${revision}` },
    }, { signal: new AbortController().signal }))

    const artifact = createHarness()
    const artifactInput = cleanupInput('assignment-artifact')
    const artifactPath = `assignments/${IDS.assignment}/r${revision}/${ARTIFACT_SHA}.seb`
    await expectBlocked(artifact.runtime.artifactStorageClient.client.enumerateExactCleanupTarget({
      ...artifactInput,
      targetId: artifactPath,
      storagePrefix: `assignments/${IDS.assignment}/r${revision}/`,
      relationship: { ...artifactInput.relationship, parentId: releaseTarget },
    }, { signal: new AbortController().signal }))
  })

  it('fails on the ninth reconciliation match', async () => {
    const harness = createHarness()
    const row = harness.rows.get('classrooms')[0]
    harness.rows.set('classrooms', Array.from({ length: 9 }, () => ({ ...row })))
    await expectBlocked(harness.enumerate(harness.runtime.databaseClient, 'classroom-primary'))
    const query = harness.events.find(event => event.type === 'enumerateDatabase').request
    expect(query.limit).toBe(9)
  })

  it('fails closed on an extra row field, cross-window row, owner mismatch, and environment drift', async () => {
    const extra = createHarness({
      rawOverrides: {
        enumerateDatabase: vi.fn(async request => ({
          rows: [{
            id: IDS.classroom,
            teacher_id: IDS.teacher,
            org_id: IDS.teacherOrg,
            classroom_type: 'subject',
            created_at: CREATED_AT,
            leaked: 'no',
          }],
        })),
      },
    })
    await expectBlocked(extra.enumerate(extra.runtime.databaseClient, 'classroom-primary'))

    const crossWindow = createHarness()
    crossWindow.rows.get('classrooms')[0].created_at = '2026-09-24T10:05:00.000Z'
    await expectBlocked(crossWindow.enumerate(crossWindow.runtime.databaseClient, 'classroom-primary'))

    const wrongOwner = createHarness()
    wrongOwner.rows.get('classrooms')[0].teacher_id = IDS.teacherUnrelated
    await expectBlocked(wrongOwner.enumerate(wrongOwner.runtime.databaseClient, 'classroom-primary'))

    const drift = createHarness()
    drift.environment.current.NEXT_PUBLIC_SITE_URL = 'https://korkru.com'
    await expectBlocked(drift.enumerate(drift.runtime.databaseClient, 'classroom-primary'))
  })

  it('pins raw method identities before every boundary', async () => {
    const harness = createHarness()
    await harness.enumerate(harness.runtime.databaseClient, 'classroom-primary')
    harness.raw.enumerateDatabase = vi.fn(async () => ({ rows: [] }))
    await expectBlocked(harness.enumerate(harness.runtime.databaseClient, 'classroom-primary'))
  })

  it('attests a teacher/org-owned question before an assignment exists', async () => {
    const harness = createHarness()
    harness.rows.set('assignments', [])
    const passed = await harness.enumerate(harness.runtime.databaseClient, 'question-written')
    expect(passed.matches).toHaveLength(1)
    expect(cleanupInput('question-written').relationship.parentId).toBeNull()
  })

  it('keeps proctor bigint ids as lossless strings and proves submission lineage', async () => {
    const harness = createHarness()
    await harness.enumerate(harness.runtime.databaseClient, 'config-primary')
    await harness.enumerate(harness.runtime.databaseClient, 'submission-primary')
    await harness.enumerate(harness.runtime.databaseClient, 'proctor-connection')
    expect((await harness.enumerate(harness.runtime.databaseClient, 'proctor-event')).matches[0].targetId)
      .toBe('9223372036854775806')

    const numberId = createHarness()
    const defaultEnumerate = numberId.raw.enumerateDatabase
    numberId.raw.enumerateDatabase = vi.fn(async function (request, options) {
      if (request.table === 'exam_proctor_events') {
        return { rows: [{
          ...numberId.rows.get('exam_proctor_events')[0],
          id: 9223372036854776000,
        }] }
      }
      return defaultEnumerate.call(this, request, options)
    })
    await numberId.enumerate(numberId.runtime.databaseClient, 'config-primary')
    await numberId.enumerate(numberId.runtime.databaseClient, 'submission-primary')
    await numberId.enumerate(numberId.runtime.databaseClient, 'proctor-connection')
    await expectBlocked(numberId.enumerate(numberId.runtime.databaseClient, 'proctor-event'))

    const crossSubmission = createHarness()
    crossSubmission.rows.get('exam_proctor_connections')[0].assignment_id = uuid(101)
    await crossSubmission.enumerate(crossSubmission.runtime.databaseClient, 'config-primary')
    await crossSubmission.enumerate(crossSubmission.runtime.databaseClient, 'submission-primary')
    await expectBlocked(crossSubmission.enumerate(crossSubmission.runtime.databaseClient, 'proctor-connection'))
  })

  it('verifies composite check-in and connection deletes without rejecting exact siblings', async () => {
    const checkIn = createHarness()
    checkIn.rows.get('exam_seb_checkins').push({
      ...checkIn.rows.get('exam_seb_checkins')[0],
      student_id: IDS.studentSecondary,
    })
    await checkIn.enumerate(checkIn.runtime.databaseClient, 'check-in-primary')
    expect(await checkIn.remove(checkIn.runtime.databaseClient, 'check-in-primary'))
      .toEqual({ status: 'passed' })
    expect(checkIn.rows.get('exam_seb_checkins')).toEqual([expect.objectContaining({
      student_id: IDS.studentSecondary,
    })])

    const connection = createHarness()
    connection.rows.get('exam_proctor_connections').push({
      ...connection.rows.get('exam_proctor_connections')[0],
      client_instance_id: uuid(93),
    })
    await connection.enumerate(connection.runtime.databaseClient, 'config-primary')
    await connection.enumerate(connection.runtime.databaseClient, 'submission-primary')
    await connection.enumerate(connection.runtime.databaseClient, 'proctor-connection')
    expect(await connection.remove(connection.runtime.databaseClient, 'proctor-connection'))
      .toEqual({ status: 'passed' })
    expect(connection.rows.get('exam_proctor_connections')).toEqual([expect.objectContaining({
      client_instance_id: uuid(93),
    })])
  })

  it('deletes the exact derived proctor session atomically with the submission and verifies both absent', async () => {
    const harness = createHarness()
    await harness.enumerate(harness.runtime.databaseClient, 'config-primary')
    await harness.enumerate(harness.runtime.databaseClient, 'submission-primary')
    await harness.enumerate(harness.runtime.databaseClient, 'proctor-connection')
    await harness.enumerate(harness.runtime.databaseClient, 'proctor-event')
    harness.rows.set('submission_answers', [])
    harness.rows.set('exam_proctor_connections', [])
    harness.rows.set('exam_proctor_events', [])
    expect(await harness.remove(harness.runtime.databaseClient, 'submission-primary'))
      .toEqual({ status: 'passed' })
    const deletes = harness.events
      .filter(event => event.type === 'deleteDatabase')
      .map(event => event.request.table)
    expect(deletes).toEqual(['submissions'])
    const request = harness.events.find(event => (
      event.type === 'deleteDatabase' && event.request.table === 'submissions'
    )).request
    expect(request.atomicClosure.allowedCascadeTables).toEqual(['exam_proctor_sessions'])
    expect(request.atomicClosure.requireExact).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'exam_proctor_sessions', expectedCount: 1 }),
    ]))
    expect(harness.rows.get('exam_proctor_sessions')).toEqual([])
    expect(harness.rows.get('submissions')).toEqual([])
  })

  it('allows a partial-run submission with no proctor lineage and no derived session', async () => {
    const harness = createHarness()
    harness.rows.set('submission_answers', [])
    harness.rows.set('exam_proctor_connections', [])
    harness.rows.set('exam_proctor_events', [])
    harness.rows.set('exam_proctor_sessions', [])
    await harness.enumerate(harness.runtime.databaseClient, 'config-primary')
    await harness.enumerate(harness.runtime.databaseClient, 'submission-primary')
    expect(await harness.remove(harness.runtime.databaseClient, 'submission-primary'))
      .toEqual({ status: 'passed' })
    expect(harness.events
      .filter(event => event.type === 'deleteDatabase')
      .map(event => event.request.table)).toEqual(['submissions'])
  })

  it('requires one exact derived session after proctor lineage and blocks duplicate, partial, or mismatched deletion', async () => {
    for (const mode of ['missing', 'duplicate', 'mismatch', 'partial']) {
      const harness = createHarness()
      await harness.enumerate(harness.runtime.databaseClient, 'config-primary')
      await harness.enumerate(harness.runtime.databaseClient, 'submission-primary')
      await harness.enumerate(harness.runtime.databaseClient, 'proctor-connection')
      await harness.enumerate(harness.runtime.databaseClient, 'proctor-event')
      harness.rows.set('submission_answers', [])
      harness.rows.set('exam_proctor_connections', [])
      harness.rows.set('exam_proctor_events', [])
      if (mode === 'missing') harness.rows.set('exam_proctor_sessions', [])
      if (mode === 'duplicate') harness.rows.get('exam_proctor_sessions').push({ ...harness.rows.get('exam_proctor_sessions')[0] })
      if (mode === 'mismatch') harness.rows.get('exam_proctor_sessions')[0].student_id = IDS.studentSecondary
      if (mode === 'partial') harness.raw.deleteDatabase.mockImplementationOnce(async () => ({ status: 'passed', deletedCount: 0 }))
      await expectBlocked(harness.remove(harness.runtime.databaseClient, 'submission-primary'))
      if (mode === 'partial') {
        expect(harness.rows.get('submissions')).toHaveLength(1)
        expect(harness.rows.get('exam_proctor_sessions')).toHaveLength(1)
      }
    }
  })

  it('allows assignment cascade only after proving exact join/config/release closure', async () => {
    const harness = createHarness()
    clearAssignmentOrdinaryDependencies(harness)
    await harness.enumerate(harness.runtime.databaseClient, 'assignment-primary')
    await harness.enumerate(harness.runtime.databaseClient, 'config-primary')
    await harness.enumerate(harness.runtime.databaseClient, 'release-primary')
    expect(await harness.remove(harness.runtime.databaseClient, 'assignment-primary'))
      .toEqual({ status: 'passed' })
    expect(harness.rows.get('assignment_classrooms')).toEqual([])
    expect(harness.rows.get('assignment_seb_config_revisions')).toEqual([])
    expect(harness.rows.get('assignment_seb_config_releases')).toEqual([])
    expect((await harness.enumerate(harness.runtime.databaseClient, 'config-primary')).matches).toEqual([])
    expect((await harness.enumerate(harness.runtime.databaseClient, 'release-primary')).matches).toEqual([])
  })

  it('blocks assignment deletion on extra joins, missing immutable rows, or any unexpected dependent', async () => {
    for (const mode of ['extra-join', 'missing-config', 'unexpected']) {
      const harness = createHarness()
      clearAssignmentOrdinaryDependencies(harness)
      await harness.enumerate(harness.runtime.databaseClient, 'assignment-primary')
      await harness.enumerate(harness.runtime.databaseClient, 'config-primary')
      await harness.enumerate(harness.runtime.databaseClient, 'release-primary')
      if (mode === 'extra-join') harness.rows.get('assignment_classrooms').push({
        ...harness.rows.get('assignment_classrooms')[0],
        id: uuid(80),
      })
      if (mode === 'missing-config') harness.rows.set('assignment_seb_config_revisions', [])
      if (mode === 'unexpected') harness.rows.set('assignment_extensions', [{ id: uuid(81), assignment_id: IDS.assignment }])
      await expectBlocked(harness.remove(harness.runtime.databaseClient, 'assignment-primary'))
      expect(harness.rows.get('assignments')).toHaveLength(1)
    }
  })

  it('requires the narrow driver to recheck assignment closure atomically before cascading', async () => {
    const harness = createHarness()
    clearAssignmentOrdinaryDependencies(harness)
    await harness.enumerate(harness.runtime.databaseClient, 'assignment-primary')
    await harness.enumerate(harness.runtime.databaseClient, 'config-primary')
    await harness.enumerate(harness.runtime.databaseClient, 'release-primary')
    const baseDelete = harness.raw.deleteDatabase.getMockImplementation()
    harness.raw.deleteDatabase.mockImplementation(async function (request, options) {
      if (request.table === 'assignments') {
        harness.rows.set('assignment_extensions', [{ id: uuid(94), assignment_id: IDS.assignment }])
      }
      return baseDelete.call(this, request, options)
    })
    await expectBlocked(harness.remove(harness.runtime.databaseClient, 'assignment-primary'))
    expect(harness.rows.get('assignments')).toHaveLength(1)
    const deleteRequest = harness.events.find(event => (
      event.type === 'deleteDatabase' && event.request.table === 'assignments'
    )).request
    expect(deleteRequest.atomicClosure).toMatchObject({
      schemaVersion: 1,
      isolation: 'serializable-parent-lock',
      allowedCascadeTables: [
        'assignment_classrooms',
        'assignment_seb_config_revisions',
        'assignment_seb_config_releases',
      ],
    })
  })

  it('blocks an assignment cascade when a late mismatched allowed-cascade row appears', async () => {
    const harness = createHarness()
    clearAssignmentOrdinaryDependencies(harness)
    await harness.enumerate(harness.runtime.databaseClient, 'assignment-primary')
    await harness.enumerate(harness.runtime.databaseClient, 'config-primary')
    await harness.enumerate(harness.runtime.databaseClient, 'release-primary')
    const baseDelete = harness.raw.deleteDatabase.getMockImplementation()
    harness.raw.deleteDatabase.mockImplementation(async function (request, options) {
      if (request.table === 'assignments') {
        harness.rows.get('assignment_classrooms').push({
          id: uuid(96),
          assignment_id: IDS.assignment,
          classroom_id: uuid(97),
          created_at: CREATED_AT,
        })
      }
      return baseDelete.call(this, request, options)
    })
    await expectBlocked(harness.remove(harness.runtime.databaseClient, 'assignment-primary'))
    expect(harness.rows.get('assignments')).toHaveLength(1)
    expect(harness.rows.get('assignment_classrooms')).toHaveLength(2)
  })

  it('never directly deletes immutable config revision or release rows', async () => {
    const harness = createHarness()
    await harness.enumerate(harness.runtime.databaseClient, 'config-primary')
    await expectBlocked(harness.remove(harness.runtime.databaseClient, 'config-primary'))
    await harness.enumerate(harness.runtime.databaseClient, 'release-primary')
    await expectBlocked(harness.remove(harness.runtime.databaseClient, 'release-primary'))
    expect(harness.raw.deleteDatabase).not.toHaveBeenCalled()
  })

  it('blocks question deletion while any non-FK array reference remains', async () => {
    for (const [table, column] of [
      ['assignments', 'question_ids'],
      ['question_sets', 'question_ids'],
      ['education_research_measurements', 'source_question_ids'],
      ['education_research_measurements', 'snapshot_question_ids'],
    ]) {
      const harness = createHarness()
      clearAssignmentOrdinaryDependencies(harness)
      harness.rows.set('submission_answers', [])
      await harness.enumerate(harness.runtime.databaseClient, 'assignment-primary')
      await harness.enumerate(harness.runtime.databaseClient, 'question-written')
      await harness.enumerate(harness.runtime.databaseClient, 'config-primary')
      await harness.enumerate(harness.runtime.databaseClient, 'release-primary')
      expect(await harness.remove(harness.runtime.databaseClient, 'assignment-primary'))
        .toEqual({ status: 'passed' })
      harness.rows.set(table, [{ id: uuid(95), [column]: [IDS.writtenQuestion] }])
      await expectBlocked(harness.remove(harness.runtime.databaseClient, 'question-written'))
      expect(harness.rows.get('questions').some(row => row.id === IDS.writtenQuestion)).toBe(true)
    }
  })

  it('cross-checks answer storage against exact answer URL lineage and deletes one full path only', async () => {
    const harness = createHarness()
    const result = await harness.enumerate(harness.runtime.answerStorageClient, 'answer-storage')
    expect(result.matches).toHaveLength(1)
    expect(await harness.remove(harness.runtime.answerStorageClient, 'answer-storage'))
      .toEqual({ status: 'passed' })
    const deletion = harness.events.find(event => event.type === 'deleteStorage').request
    expect(deletion).toMatchObject({
      bucketName: 'submission-files',
      path: ANSWER_PATH,
      maxObjects: 1,
    })
    expect(deletion.path.endsWith('/')).toBe(false)
  })

  it('deletes an exact preplanned answer object when the answer row was never committed', async () => {
    const harness = createHarness()
    harness.rows.set('submission_answers', [])
    harness.objects.get('submission-files')[0].sha256 = 'd'.repeat(64)

    expect((await harness.enumerate(
      harness.runtime.answerStorageClient,
      'answer-storage',
    )).matches).toHaveLength(1)
    expect(await harness.remove(harness.runtime.answerStorageClient, 'answer-storage'))
      .toEqual({ status: 'passed' })
    expect(harness.objects.get('submission-files')).toEqual([])
  })

  it('blocks an orphan answer object with mismatched owner, window, mime, size, or hash', async () => {
    for (const mode of ['owner', 'window', 'mime', 'size', 'hash']) {
      const harness = createHarness()
      harness.rows.set('submission_answers', [])
      const object = harness.objects.get('submission-files')[0]
      object.sha256 = 'd'.repeat(64)
      if (mode === 'owner') object.ownerId = IDS.studentSecondary
      if (mode === 'window') object.createdAt = '2026-09-24T10:05:00.000Z'
      if (mode === 'mime') object.mimeType = 'image/png'
      if (mode === 'size') object.sizeBytes = 11 * 1024 * 1024
      if (mode === 'hash') object.sha256 = null
      await expectBlocked(harness.enumerate(harness.runtime.answerStorageClient, 'answer-storage'))
    }
  })

  it('cross-checks any surviving submission and assignment lineage for an orphan answer object', async () => {
    for (const mode of ['student', 'submission-window', 'assignment-org', 'assignment-mode']) {
      const harness = createHarness()
      harness.rows.set('submission_answers', [])
      harness.objects.get('submission-files')[0].sha256 = 'd'.repeat(64)
      const submission = harness.rows.get('submissions').find(row => row.id === IDS.submission)
      const assignment = harness.rows.get('assignments').find(row => row.id === IDS.assignment)
      if (mode === 'student') submission.student_id = IDS.studentSecondary
      if (mode === 'submission-window') submission.created_at = '2026-09-24T10:05:00.000Z'
      if (mode === 'assignment-org') assignment.org_id = IDS.studentOrg
      if (mode === 'assignment-mode') assignment.secure_browser_mode = 'off'
      await expectBlocked(harness.enumerate(harness.runtime.answerStorageClient, 'answer-storage'))
    }
  })

  it('blocks answer storage prefix tricks, cross-answer references, wrong owner, mime, and oversize objects', async () => {
    const prefix = createHarness()
    const input = cleanupInput('answer-storage', { targetId: `${ANSWER_PATH}/other` })
    await expectBlocked(prefix.runtime.answerStorageClient.client.enumerateExactCleanupTarget(
      input,
      { signal: new AbortController().signal },
    ))

    for (const mode of ['answer', 'owner', 'mime', 'size']) {
      const harness = createHarness()
      if (mode === 'answer') harness.rows.get('submission_answers').find(row => row.id === IDS.uploadAnswer).submission_id = uuid(90)
      if (mode === 'owner') harness.objects.get('submission-files')[0].ownerId = IDS.studentSecondary
      if (mode === 'mime') harness.objects.get('submission-files')[0].mimeType = 'image/png'
      if (mode === 'size') harness.objects.get('submission-files')[0].sizeBytes = 11 * 1024 * 1024
      await expectBlocked(harness.enumerate(harness.runtime.answerStorageClient, 'answer-storage'))
    }
  })

  it('cross-checks assignment artifact release path, hash, and size before exact deletion', async () => {
    const harness = createHarness()
    expect((await harness.enumerate(harness.runtime.artifactStorageClient, 'assignment-artifact')).matches)
      .toHaveLength(1)
    expect(await harness.remove(harness.runtime.artifactStorageClient, 'assignment-artifact'))
      .toEqual({ status: 'passed' })
    expect(harness.events.find(event => event.type === 'deleteStorage').request.path).toBe(ARTIFACT_PATH)
  })

  it('deletes an exact preplanned artifact when the release row was never committed', async () => {
    const harness = createHarness()
    harness.rows.set('assignment_seb_config_releases', [])

    expect((await harness.enumerate(
      harness.runtime.artifactStorageClient,
      'assignment-artifact',
    )).matches).toHaveLength(1)
    expect(await harness.remove(harness.runtime.artifactStorageClient, 'assignment-artifact'))
      .toEqual({ status: 'passed' })
    expect(harness.objects.get('assignment-seb-configs')).toEqual([])
  })

  it('blocks an orphan artifact with mismatched owner, window, mime, size, or path hash', async () => {
    for (const mode of ['owner', 'window', 'mime', 'size', 'hash']) {
      const harness = createHarness()
      harness.rows.set('assignment_seb_config_releases', [])
      const object = harness.objects.get('assignment-seb-configs')[0]
      if (mode === 'owner') object.ownerId = IDS.teacherUnrelated
      if (mode === 'window') object.createdAt = '2026-09-24T10:05:00.000Z'
      if (mode === 'mime') object.mimeType = 'application/octet-stream'
      if (mode === 'size') object.sizeBytes = 2_097_153
      if (mode === 'hash') object.sha256 = 'd'.repeat(64)
      await expectBlocked(harness.enumerate(harness.runtime.artifactStorageClient, 'assignment-artifact'))
    }
  })

  it('cross-checks any surviving assignment lineage for an orphan artifact', async () => {
    for (const mode of ['owner', 'org', 'window', 'mode']) {
      const harness = createHarness()
      harness.rows.set('assignment_seb_config_releases', [])
      const assignment = harness.rows.get('assignments').find(row => row.id === IDS.assignment)
      if (mode === 'owner') assignment.created_by = IDS.teacherUnrelated
      if (mode === 'org') assignment.org_id = IDS.studentOrg
      if (mode === 'window') assignment.created_at = '2026-09-24T10:05:00.000Z'
      if (mode === 'mode') assignment.secure_browser_mode = 'off'
      await expectBlocked(harness.enumerate(harness.runtime.artifactStorageClient, 'assignment-artifact'))
    }
  })

  it('blocks artifact path, hash, size, release, and partial-delete mismatches', async () => {
    for (const mode of ['hash', 'size', 'release', 'partial']) {
      const harness = createHarness()
      if (mode === 'hash') harness.objects.get('assignment-seb-configs')[0].sha256 = 'd'.repeat(64)
      if (mode === 'size') harness.objects.get('assignment-seb-configs')[0].sizeBytes = 1_025
      if (mode === 'release') harness.rows.get('assignment_seb_config_releases')[0].owner_id = IDS.teacherUnrelated
      if (mode === 'partial') {
        await harness.enumerate(harness.runtime.artifactStorageClient, 'assignment-artifact')
        harness.raw.deleteStorage.mockResolvedValueOnce({ status: 'passed', deletedCount: 0 })
        await expectBlocked(harness.remove(harness.runtime.artifactStorageClient, 'assignment-artifact'))
        continue
      }
      await expectBlocked(harness.enumerate(harness.runtime.artifactStorageClient, 'assignment-artifact'))
    }
  })

  it('proves one exact owner membership and no other children before personal-org deletion', async () => {
    const harness = createHarness()
    const target = 'personal-organization-teacher-unrelated'
    expect((await harness.enumerate(harness.runtime.personalOrganizationsClient, target)).matches)
      .toHaveLength(1)
    expect(await harness.remove(harness.runtime.personalOrganizationsClient, target))
      .toEqual({ status: 'passed' })
    expect(harness.events
      .filter(event => event.type === 'deleteDatabase')
      .map(event => event.request.table)).toEqual(['organizations'])
    expect(harness.rows.get('organizations').some(row => row.id === IDS.teacherUnrelatedOrg)).toBe(false)
    expect(harness.rows.get('organization_members').some(row => row.id === IDS.teacherUnrelatedOrgMember)).toBe(false)
  })

  it('blocks personal-org deletion on another member, wrong owner/org, child rows, partial delete, or missing cascade', async () => {
    for (const mode of ['member', 'owner', 'org', 'child', 'partial', 'missing-cascade']) {
      const harness = createHarness()
      const target = 'personal-organization-teacher-unrelated'
      if (mode === 'member') harness.rows.get('organization_members').push({
        id: uuid(91), org_id: IDS.teacherUnrelatedOrg, user_id: IDS.student, org_role: 'student', joined_at: CREATED_AT,
      })
      if (mode === 'owner') harness.rows.get('organization_members').find(row => row.id === IDS.teacherUnrelatedOrgMember).user_id = IDS.teacher
      if (mode === 'org') harness.rows.get('organizations').find(row => row.id === IDS.teacherUnrelatedOrg).is_personal = false
      if (mode === 'child') harness.rows.set('questions', [{
        ...harness.rows.get('questions')[0], org_id: IDS.teacherUnrelatedOrg,
      }])
      await harness.enumerate(harness.runtime.personalOrganizationsClient, target)
        .catch(() => undefined)
      if (mode === 'partial') harness.raw.deleteDatabase.mockResolvedValueOnce({ status: 'passed', deletedCount: 0 })
      if (mode === 'missing-cascade') {
        harness.raw.deleteDatabase.mockImplementationOnce(async request => {
          harness.rows.set(
            'organizations',
            harness.rows.get('organizations').filter(row => row.id !== IDS.teacherUnrelatedOrg),
          )
          return request.table === 'organizations'
            ? { status: 'passed', deletedCount: 1, atomicClosureVerified: true }
            : { status: 'passed', deletedCount: 0 }
        })
      }
      await expectBlocked(harness.remove(harness.runtime.personalOrganizationsClient, target))
    }
  })

  it('blocks a personal-org cascade when a late second membership appears', async () => {
    const harness = createHarness()
    const target = 'personal-organization-teacher-unrelated'
    await harness.enumerate(harness.runtime.personalOrganizationsClient, target)
    const baseDelete = harness.raw.deleteDatabase.getMockImplementation()
    harness.raw.deleteDatabase.mockImplementation(async function (request, options) {
      if (request.table === 'organizations') {
        harness.rows.get('organization_members').push({
          id: uuid(98),
          org_id: IDS.teacherUnrelatedOrg,
          user_id: IDS.student,
          org_role: 'student',
          joined_at: CREATED_AT,
        })
      }
      return baseDelete.call(this, request, options)
    })
    await expectBlocked(harness.remove(harness.runtime.personalOrganizationsClient, target))
    expect(harness.rows.get('organizations').some(row => row.id === IDS.teacherUnrelatedOrg)).toBe(true)
    expect(harness.rows.get('organization_members').filter(
      row => row.org_id === IDS.teacherUnrelatedOrg,
    )).toHaveLength(2)
  })

  it('requires exact prior enumeration before any delete', async () => {
    const harness = createHarness()
    await expectBlocked(harness.remove(harness.runtime.databaseClient, 'classroom-primary'))
    await expectBlocked(harness.remove(harness.runtime.answerStorageClient, 'answer-storage'))
    expect(harness.raw.deleteDatabase).not.toHaveBeenCalled()
    expect(harness.raw.deleteStorage).not.toHaveBeenCalled()
  })

  it('aborts on timeout but closeAll waits for the late operation to settle before closing', async () => {
    vi.useFakeTimers()
    try {
      let resolveEnumeration
      const enumeration = new Promise(resolve => { resolveEnumeration = resolve })
      const harness = createHarness({
        timeout: 10,
        rawOverrides: {
          enumerateDatabase: vi.fn(async () => enumeration),
        },
      })
      const operation = harness.enumerate(harness.runtime.databaseClient, 'classroom-primary')
      await vi.advanceTimersByTimeAsync(11)
      const close = harness.runtime.closeAll()
      let closeSettled = false
      close.then(() => { closeSettled = true })
      await Promise.resolve()
      expect(closeSettled).toBe(false)
      expect(harness.raw.close).not.toHaveBeenCalled()
      resolveEnumeration({ rows: [] })
      await expectBlocked(operation)
      expect(await close).toEqual({ status: 'passed' })
      expect(harness.raw.close).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retains a late-created client until a failed orphan close is retried successfully', async () => {
    const harness = createHarness()
    let resolveFactory
    let markFactoryEntered
    const factoryEntered = new Promise(resolve => { markFactoryEntered = resolve })
    const lateFactory = new Promise(resolve => { resolveFactory = resolve })
    harness.factory.mockImplementationOnce(async () => {
      markFactoryEntered()
      return lateFactory
    })
    harness.raw.close
      .mockResolvedValueOnce({ status: 'failed' })
      .mockRejectedValueOnce(new Error(`never leak ${SERVICE_ROLE_SENTINEL}`))
      .mockResolvedValueOnce({ status: 'passed' })
    const controller = new AbortController()
    const operation = harness.runtime.databaseClient.client.enumerateExactCleanupTarget(
      cleanupInput('classroom-primary'),
      { signal: controller.signal },
    )
    await factoryEntered
    controller.abort()
    const firstClose = harness.runtime.closeAll()
    resolveFactory(harness.raw)
    await expectBlocked(operation)
    expect(await firstClose).toEqual({ status: 'failed' })
    expect(harness.raw.close).toHaveBeenCalledTimes(2)
    expect(await harness.runtime.closeAll()).toEqual({ status: 'passed' })
    expect(harness.raw.close).toHaveBeenCalledTimes(3)
  })

  it('blocks a second privileged initialization while a failed orphan close is still owned', async () => {
    const harness = createHarness()
    let resolveFactory
    let markFactoryEntered
    const factoryEntered = new Promise(resolve => { markFactoryEntered = resolve })
    const lateFactory = new Promise(resolve => { resolveFactory = resolve })
    harness.factory.mockImplementationOnce(async () => {
      markFactoryEntered()
      return lateFactory
    })
    harness.raw.close
      .mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValueOnce({ status: 'passed' })
    const controller = new AbortController()
    const first = harness.runtime.databaseClient.client.enumerateExactCleanupTarget(
      cleanupInput('classroom-primary'),
      { signal: controller.signal },
    )
    await factoryEntered
    controller.abort()
    resolveFactory(harness.raw)
    await expectBlocked(first)

    await expectBlocked(harness.enumerate(harness.runtime.databaseClient, 'classroom-primary'))
    expect(harness.factory).toHaveBeenCalledTimes(1)
    expect(await harness.runtime.closeAll()).toEqual({ status: 'passed' })
    expect(harness.raw.close).toHaveBeenCalledTimes(2)
  })

  it('keeps close fail-closed on late failure and permits an idempotent retry', async () => {
    const harness = createHarness()
    await harness.enumerate(harness.runtime.databaseClient, 'classroom-primary')
    harness.raw.close
      .mockRejectedValueOnce(new Error(`do not leak ${SERVICE_ROLE_SENTINEL}`))
      .mockResolvedValueOnce({ status: 'passed' })
    expect(await harness.runtime.closeAll()).toEqual({ status: 'failed' })
    expect(await harness.runtime.closeAll()).toEqual({ status: 'passed' })
    expect(JSON.stringify(await harness.runtime.closeAll())).not.toContain(SERVICE_ROLE_SENTINEL)
  })

  it('rejects new work after close and returns an exact idempotent close result', async () => {
    const harness = createHarness()
    expect(await harness.runtime.closeAll()).toEqual({ status: 'passed' })
    expect(await harness.runtime.closeAll()).toEqual({ status: 'passed' })
    await expectBlocked(harness.enumerate(harness.runtime.databaseClient, 'classroom-primary'))
  })
})
