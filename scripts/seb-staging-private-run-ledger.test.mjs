import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  SEB_STAGING_LEDGER_TARGET_KINDS,
  SebStagingPrivateRunLedgerBlockedError,
  createSebStagingPrivateRunLedger,
} from './seb-staging-private-run-ledger.mjs'

const RUN_ID = 'seb-s5-ledger-a1'
const NAMESPACE = `qa:${RUN_ID}`
const SOURCE_REVISION = 'a'.repeat(40)
const DEPLOYMENT_ID = 'dpl_1234567890abcdef'
const NOT_BEFORE = '2026-09-23T10:00:00.000Z'
const NOT_AFTER = '2026-09-23T11:00:00.000Z'
const CREATED_AT = '2026-09-23T10:05:00.000Z'
const NOW = '2026-09-23T10:30:00.000Z'
const RECONCILIATION_TIMEOUT_MS = 50
const OWNER_ID = uuid(1)
const ORG_ID = uuid(2)
const MEMBERSHIP_ID = uuid(20)
const STUDENT_ID = uuid(3)
const ASSIGNMENT_ID = uuid(4)
const SUBMISSION_ID = uuid(5)
const ANSWER_ID = uuid(6)
const UPLOAD_ID = uuid(7)
const CLIENT_INSTANCE_ID = uuid(8)
const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'

const IDENTITY = Object.freeze({
  runId: RUN_ID,
  sourceRevision: SOURCE_REVISION,
  deploymentId: DEPLOYMENT_ID,
  creationWindow: Object.freeze({
    notBefore: NOT_BEFORE,
    notAfter: NOT_AFTER,
  }),
})

const OFFICIAL_ENVIRONMENT = Object.freeze({
  KORKRU_DEPLOYMENT_ENV: 'staging',
  EXAM_QA_ENVIRONMENT: 'staging',
  VERCEL_ENV: 'preview',
  NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_ORIGIN,
  EXAM_QA_DATA_POLICY: 'synthetic-only',
  EXAM_QA_COPY_PRODUCTION_DATA: 'false',
  EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
})

const TARGET_CASES = Object.freeze([
  targetCase('account', 'account-teacher', null, null, 'teacher', uuid(10)),
  targetCase(
    'personalOrganization',
    'personal-organization',
    OWNER_ID,
    null,
    'personal',
    `${ORG_ID}:${MEMBERSHIP_ID}`,
  ),
  targetCase('classroom', 'classroom-primary', OWNER_ID, ORG_ID, 'subject', uuid(12)),
  targetCase('question', 'question-written', OWNER_ID, ORG_ID, 'essay', uuid(13)),
  targetCase('question', 'question-upload', OWNER_ID, ORG_ID, 'file_upload', uuid(14)),
  targetCase('classroomMembership', 'membership-primary', STUDENT_ID, ORG_ID, 'student', uuid(15)),
  targetCase('assignment', 'assignment-primary', OWNER_ID, ORG_ID, 'exam', ASSIGNMENT_ID),
  targetCase(
    'configRevision',
    'config-revision-primary',
    OWNER_ID,
    ORG_ID,
    'seb_required',
    `${ASSIGNMENT_ID}:r1`,
  ),
  targetCase(
    'release',
    'release-primary',
    OWNER_ID,
    ORG_ID,
    'test_plaintext',
    `asr-${ASSIGNMENT_ID.replaceAll('-', '')}-r1-${'b'.repeat(16)}`,
  ),
  targetCase(
    'checkIn',
    'check-in-primary',
    STUDENT_ID,
    ORG_ID,
    'windows',
    `${ASSIGNMENT_ID}:${STUDENT_ID}`,
  ),
  targetCase('submission', 'submission-primary', STUDENT_ID, ORG_ID, 'seb_required', SUBMISSION_ID),
  targetCase('answer', 'answer-written', STUDENT_ID, ORG_ID, 'essay', ANSWER_ID),
  targetCase(
    'proctorConnection',
    'proctor-connection-primary',
    STUDENT_ID,
    ORG_ID,
    'heartbeat',
    `${SUBMISSION_ID}:${CLIENT_INSTANCE_ID}`,
  ),
  targetCase(
    'proctorEvent',
    'proctor-event-primary',
    STUDENT_ID,
    ORG_ID,
    'monitoring_started',
    '1',
  ),
  targetCase(
    'answerStorageObject',
    'answer-storage-primary',
    STUDENT_ID,
    ORG_ID,
    'submission_file',
    `${STUDENT_ID}/${SUBMISSION_ID}/${ANSWER_ID}/${UPLOAD_ID}.pdf`,
  ),
  targetCase(
    'assignmentArtifact',
    'assignment-artifact-primary',
    OWNER_ID,
    ORG_ID,
    'seb',
    `assignments/${ASSIGNMENT_ID}/r1/${'c'.repeat(64)}.seb`,
  ),
])

afterEach(() => {
  vi.useRealTimers()
})

function uuid(index) {
  return `${String(index).padStart(8, '0')}-0000-4000-8000-${String(index).padStart(12, '0')}`
}

function targetCase(kind, targetKey, ownerId, organizationId, resourceType, targetId) {
  return Object.freeze({ kind, targetKey, ownerId, organizationId, resourceType, targetId })
}

function authoritative(matches, overrides = {}) {
  return {
    schemaVersion: 1,
    authoritative: true,
    matches,
    ...overrides,
  }
}

function attestedReconciliationClient(findExactRunTargets) {
  return {
    targetOrigin: SUPABASE_ORIGIN,
    credentialKind: 'service-role',
    client: {
      supabaseUrl: SUPABASE_ORIGIN,
      findExactRunTargets,
    },
  }
}

function createHarness({
  environment = { ...OFFICIAL_ENVIRONMENT },
  reconcile = async () => authoritative([]),
  clock = () => new Date(NOW),
  reconciliationClient,
  reconciliationTimeoutMs = RECONCILIATION_TIMEOUT_MS,
} = {}) {
  const state = { environment }
  const readEnvironment = vi.fn(() => ({ ...state.environment }))
  const findExactRunTargets = vi.fn(reconcile)
  const client = reconciliationClient === undefined
    ? attestedReconciliationClient(findExactRunTargets)
    : reconciliationClient
  const ledger = createSebStagingPrivateRunLedger({
    schemaVersion: 1,
    identity: IDENTITY,
    namespace: NAMESPACE,
    readEnvironment,
    reconciliationClient: client,
    reconciliationTimeoutMs,
    clock,
  })
  return { ledger, state, readEnvironment, findExactRunTargets, reconciliationClient: client }
}

function planFor(target, overrides = {}) {
  return {
    schemaVersion: 1,
    targetKey: target.targetKey,
    kind: target.kind,
    identity: IDENTITY,
    namespace: NAMESPACE,
    ownerId: target.ownerId,
    organizationId: target.organizationId,
    resourceType: target.resourceType,
    ...overrides,
  }
}

function referenceFor(target, overrides = {}) {
  return {
    schemaVersion: 1,
    targetKey: target.targetKey,
    kind: target.kind,
    ...overrides,
  }
}

function candidateFor(target, overrides = {}) {
  return {
    schemaVersion: 1,
    targetKey: target.targetKey,
    kind: target.kind,
    identity: IDENTITY,
    targetId: target.targetId,
    namespace: NAMESPACE,
    ownerId: target.ownerId,
    organizationId: target.organizationId,
    resourceType: target.resourceType,
    createdAt: CREATED_AT,
    ...overrides,
  }
}

function expectPassed(result) {
  expect(result).toEqual({ status: 'passed' })
  expect(Object.isFrozen(result)).toBe(true)
}

function expectFailed(result) {
  expect(result).toEqual({ status: 'failed' })
  expect(Object.isFrozen(result)).toBe(true)
}

describe('SEB Staging private run ledger', () => {
  it('exports the complete audited S5 persistent target-kind allowlist', () => {
    expect(SEB_STAGING_LEDGER_TARGET_KINDS).toEqual([
      'account',
      'personalOrganization',
      'classroom',
      'question',
      'classroomMembership',
      'assignment',
      'configRevision',
      'release',
      'checkIn',
      'submission',
      'answer',
      'proctorConnection',
      'proctorEvent',
      'answerStorageObject',
      'assignmentArtifact',
    ])
    expect(Object.isFrozen(SEB_STAGING_LEDGER_TARGET_KINDS)).toBe(true)
  })

  it.each(TARGET_CASES)(
    'tracks $kind/$targetKey only through planned -> uncertain -> committed -> deleted',
    target => {
      const { ledger } = createHarness()
      const reference = referenceFor(target)

      expectPassed(ledger.planTarget(planFor(target)))
      expect(ledger.readCleanupTarget(reference)).toEqual({
        status: 'passed', state: 'planned', snapshots: [],
      })
      expectPassed(ledger.markUncertain(reference))
      expect(ledger.readCleanupTarget(reference)).toEqual({
        status: 'passed', state: 'uncertain', snapshots: [],
      })
      expectPassed(ledger.commitTarget(reference, candidateFor(target)))

      const read = ledger.readCleanupTarget(reference)
      expect(read).toEqual({
        status: 'passed',
        state: 'committed',
        snapshots: [candidateFor(target)],
      })
      expect(Object.isFrozen(read)).toBe(true)
      expect(Object.isFrozen(read.snapshots)).toBe(true)
      expect(Object.isFrozen(read.snapshots[0])).toBe(true)
      expect(Object.isFrozen(read.snapshots[0].identity)).toBe(true)
      expect(Object.isFrozen(read.snapshots[0].identity.creationWindow)).toBe(true)

      expectPassed(ledger.markDeleted(reference, {
        schemaVersion: 1,
        targetId: target.targetId,
      }))
      expect(ledger.readCleanupTarget(reference)).toEqual({
        status: 'passed', state: 'deleted', snapshots: [],
      })
    },
  )

  it('distinguishes an exact unplanned target from invalid input or a cleanup-policy failure', () => {
    const target = TARGET_CASES.find(value => value.kind === 'assignment')
    const { ledger, state } = createHarness()

    const unplanned = ledger.readCleanupTarget(referenceFor(target))
    expect(unplanned).toEqual({
      status: 'passed',
      state: 'unplanned',
      snapshots: [],
    })
    expect(Object.isFrozen(unplanned)).toBe(true)
    expect(Object.isFrozen(unplanned.snapshots)).toBe(true)

    expectFailed(ledger.readCleanupTarget({
      ...referenceFor(target),
      unexpected: 'not-accepted',
    }))
    state.environment = {
      ...OFFICIAL_ENVIRONMENT,
      NEXT_PUBLIC_SUPABASE_URL: 'https://production-project.supabase.co',
    }
    expectFailed(ledger.readCleanupTarget(referenceFor(target)))
  })

  it('fails closed when construction is not exact official synthetic Staging', () => {
    const findExactRunTargets = vi.fn(async () => authoritative([]))
    const valid = {
      schemaVersion: 1,
      identity: IDENTITY,
      namespace: NAMESPACE,
      readEnvironment: () => OFFICIAL_ENVIRONMENT,
      reconciliationClient: attestedReconciliationClient(findExactRunTargets),
      reconciliationTimeoutMs: RECONCILIATION_TIMEOUT_MS,
      clock: () => new Date(NOW),
    }
    const cases = [
      {},
      { ...valid, password: 'must-not-be-accepted' },
      { ...valid, namespace: 'qa:someone-else' },
      { ...valid, identity: { ...IDENTITY, sourceRevision: 'A'.repeat(40) } },
      { ...valid, identity: { ...IDENTITY, deploymentId: 'dpl_short' } },
      { ...valid, identity: { ...IDENTITY, runId: 'seb-s5-production' } },
      {
        ...valid,
        identity: {
          ...IDENTITY,
          creationWindow: {
            notBefore: NOT_BEFORE,
            notAfter: '2026-09-25T10:00:00.001Z',
          },
        },
      },
      {
        ...valid,
        readEnvironment: () => ({ ...OFFICIAL_ENVIRONMENT, VERCEL_ENV: 'production' }),
      },
      {
        ...valid,
        readEnvironment: () => ({
          ...OFFICIAL_ENVIRONMENT,
          NEXT_PUBLIC_SUPABASE_URL: 'https://production-project.supabase.co',
        }),
      },
      {
        ...valid,
        readEnvironment: () => ({
          ...OFFICIAL_ENVIRONMENT,
          EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'false',
        }),
      },
      { ...valid, reconciliationTimeoutMs: 0 },
      { ...valid, reconciliationTimeoutMs: 5_001 },
      { ...valid, reconciliationTimeoutMs: 10.5 },
      { ...valid, reconciliationTimeoutMs: '50' },
    ]

    for (const input of cases) {
      expect(() => createSebStagingPrivateRunLedger(input)).toThrow(
        SebStagingPrivateRunLedgerBlockedError,
      )
      try {
        createSebStagingPrivateRunLedger(input)
      } catch (error) {
        expect(error.message).toBe('SEB Staging private run ledger blocked')
        expect(error.message).not.toContain('password')
        expect(error.message).not.toContain('production-project')
      }
    }
  })

  it('requires the injected resolver to be service-role attested to exact canonical Staging', () => {
    const resolve = vi.fn(async () => authoritative([]))
    const validClient = attestedReconciliationClient(resolve)
    const cases = [
      null,
      { ...validClient, extra: true },
      { ...validClient, targetOrigin: 'https://project.supabase.co' },
      { ...validClient, credentialKind: 'anon' },
      { ...validClient, client: { ...validClient.client, supabaseUrl: 'https://project.supabase.co' } },
      { ...validClient, client: { supabaseUrl: SUPABASE_ORIGIN } },
    ]

    for (const reconciliationClient of cases) {
      expect(() => createHarness({ reconciliationClient })).toThrow(
        SebStagingPrivateRunLedgerBlockedError,
      )
    }
  })

  it('re-attests mutable resolver provenance immediately before and after lookup', async () => {
    const target = TARGET_CASES.find(value => value.kind === 'account')

    const beforeResolver = vi.fn(async () => authoritative([]))
    const beforeClient = attestedReconciliationClient(beforeResolver)
    const before = createHarness({ reconciliationClient: beforeClient })
    expectPassed(before.ledger.planTarget(planFor(target)))
    expectPassed(before.ledger.markUncertain(referenceFor(target)))
    beforeClient.targetOrigin = 'https://changed.supabase.co'
    expectFailed(await before.ledger.reconcileTarget(referenceFor(target)))
    expect(beforeResolver).not.toHaveBeenCalled()

    let afterClient
    const afterResolver = vi.fn(async () => {
      afterClient.credentialKind = 'anon'
      return authoritative([])
    })
    afterClient = attestedReconciliationClient(afterResolver)
    const after = createHarness({ reconciliationClient: afterClient })
    expectPassed(after.ledger.planTarget(planFor(target)))
    expectPassed(after.ledger.markUncertain(referenceFor(target)))
    expectFailed(await after.ledger.reconcileTarget(referenceFor(target)))
    expect(afterResolver).toHaveBeenCalledTimes(1)
    expect(after.ledger.readCleanupTarget(referenceFor(target))).toEqual({
      status: 'passed', state: 'uncertain', snapshots: [],
    })
  })

  it('requires the injected clock to be inside the bounded creation window', () => {
    expect(() => createHarness({
      clock: () => new Date('2026-09-23T09:59:59.999Z'),
    })).toThrow(SebStagingPrivateRunLedgerBlockedError)
    expect(() => createHarness({
      clock: () => new Date('2026-09-23T11:00:00.001Z'),
    })).toThrow(SebStagingPrivateRunLedgerBlockedError)
    expect(() => createHarness({ clock: () => new Date('invalid') })).toThrow(
      SebStagingPrivateRunLedgerBlockedError,
    )
    expect(() => createHarness({ clock: () => new Date(NOT_BEFORE) })).not.toThrow()
    expect(() => createHarness({ clock: () => new Date(NOT_AFTER) })).not.toThrow()
  })

  it.each([
    ['before the creation window', () => new Date('2026-09-23T09:59:59.999Z')],
    ['after the creation window', () => new Date('2026-09-23T11:00:00.001Z')],
    ['with an invalid clock value', () => new Date('invalid')],
    ['when the clock throws', () => { throw new Error('CLOCK_SECRET_SENTINEL') }],
  ])('re-checks the clock and blocks new target mutations %s', (_name, blockedClock) => {
    let readClock = () => new Date(NOW)
    const { ledger } = createHarness({ clock: () => readClock() })
    const plannedBeforeExpiry = TARGET_CASES.find(value => value.kind === 'classroom')
    const newTarget = TARGET_CASES.find(value => value.kind === 'assignment')

    expectPassed(ledger.planTarget(planFor(plannedBeforeExpiry)))
    readClock = blockedClock

    const uncertainResult = ledger.markUncertain(referenceFor(plannedBeforeExpiry))
    expectFailed(uncertainResult)
    expect(ledger.readCleanupTarget(referenceFor(plannedBeforeExpiry))).toEqual({
      status: 'passed', state: 'planned', snapshots: [],
    })
    const planResult = ledger.planTarget(planFor(newTarget))
    expectFailed(planResult)
    expect(ledger.readCleanupTarget(referenceFor(newTarget))).toEqual({
      status: 'passed', state: 'unplanned', snapshots: [],
    })
    expect(JSON.stringify([uncertainResult, planResult])).not.toContain('CLOCK_SECRET_SENTINEL')
  })

  it('records a response after the window only when its create attempt began in-window', () => {
    let now = NOW
    const { ledger } = createHarness({ clock: () => new Date(now) })
    const target = TARGET_CASES.find(value => value.kind === 'submission')
    const reference = referenceFor(target)

    expectPassed(ledger.planTarget(planFor(target)))
    expectPassed(ledger.markUncertain(reference))
    now = '2026-09-23T11:00:00.001Z'

    expectPassed(ledger.commitTarget(reference, candidateFor(target)))
    expect(ledger.readCleanupTarget(reference)).toEqual({
      status: 'passed', state: 'committed', snapshots: [candidateFor(target)],
    })
  })

  it('adopts only a trigger-derived personal organization after its exact account owner committed in-window', async () => {
    let now = NOW
    const personal = targetCase(
      'personalOrganization',
      'personal-organization-owner',
      OWNER_ID,
      null,
      'personal',
      `${ORG_ID}:${MEMBERSHIP_ID}`,
    )
    const owner = targetCase('account', 'account-owner', null, null, 'teacher', OWNER_ID)
    const { ledger, findExactRunTargets } = createHarness({
      clock: () => new Date(now),
      reconcile: async criteria => authoritative([candidateFor(personal, {
        targetKey: criteria.targetKey,
        ownerId: criteria.ownerId,
      })]),
    })

    expectPassed(ledger.planTarget(planFor(owner)))
    expectPassed(ledger.markUncertain(referenceFor(owner)))
    expectPassed(ledger.commitTarget(referenceFor(owner), candidateFor(owner)))
    now = '2026-09-23T11:00:00.001Z'

    expectFailed(ledger.planTarget(planFor(personal)))
    expectPassed(ledger.adoptDerivedTarget(planFor(personal), referenceFor(owner)))
    expect(ledger.readCleanupTarget(referenceFor(personal))).toEqual({
      status: 'passed', state: 'uncertain', snapshots: [],
    })
    expectPassed(await ledger.reconcileTarget(referenceFor(personal)))
    expect(findExactRunTargets).toHaveBeenCalledTimes(1)
    expect(ledger.readCleanupTarget(referenceFor(personal))).toEqual({
      status: 'passed',
      state: 'committed',
      snapshots: [candidateFor(personal)],
    })
  })

  it('adopts an identical derived plan when the window closes between planning and marking uncertain', () => {
    let now = NOW
    const personal = targetCase(
      'personalOrganization',
      'personal-organization-owner-boundary',
      OWNER_ID,
      null,
      'personal',
      `${ORG_ID}:${MEMBERSHIP_ID}`,
    )
    const owner = targetCase(
      'account', 'account-owner-boundary', null, null, 'teacher', OWNER_ID,
    )
    const { ledger } = createHarness({ clock: () => new Date(now) })

    expectPassed(ledger.planTarget(planFor(owner)))
    expectPassed(ledger.markUncertain(referenceFor(owner)))
    expectPassed(ledger.commitTarget(referenceFor(owner), candidateFor(owner)))
    expectPassed(ledger.planTarget(planFor(personal)))
    now = '2026-09-23T11:00:00.001Z'

    expectFailed(ledger.markUncertain(referenceFor(personal)))
    expectPassed(ledger.adoptDerivedTarget(planFor(personal), referenceFor(owner)))
    expect(ledger.readCleanupTarget(referenceFor(personal))).toEqual({
      status: 'passed', state: 'uncertain', snapshots: [],
    })
  })

  it('does not let derived-target adoption bypass kind, owner, window, or exact input boundaries', () => {
    let now = NOW
    const personal = targetCase(
      'personalOrganization',
      'personal-organization-owner-guarded',
      OWNER_ID,
      null,
      'personal',
      `${ORG_ID}:${MEMBERSHIP_ID}`,
    )
    const owner = targetCase('account', 'account-owner-guarded', null, null, 'teacher', OWNER_ID)
    const otherOwner = targetCase('account', 'account-owner-other', null, null, 'teacher', uuid(88))
    const assignment = TARGET_CASES.find(value => value.kind === 'assignment')
    const { ledger } = createHarness({ clock: () => new Date(now) })

    expectPassed(ledger.planTarget(planFor(owner)))
    expectPassed(ledger.markUncertain(referenceFor(owner)))
    expectPassed(ledger.commitTarget(referenceFor(owner), candidateFor(owner)))
    expectFailed(ledger.adoptDerivedTarget(planFor(personal), referenceFor(owner)))
    now = '2026-09-23T11:00:00.001Z'

    expectFailed(ledger.adoptDerivedTarget(planFor(assignment), referenceFor(owner)))
    expectFailed(ledger.adoptDerivedTarget(planFor(personal), referenceFor(otherOwner)))
    expectFailed(ledger.adoptDerivedTarget(
      { ...planFor(personal), targetKey: 'personal-organization-arbitrary' },
      referenceFor(owner),
    ))
    expectFailed(ledger.adoptDerivedTarget(
      { ...planFor(personal), ownerId: uuid(89) },
      referenceFor(owner),
    ))
    expectFailed(ledger.adoptDerivedTarget(
      { ...planFor(personal), secret: 'DERIVED_SECRET_SENTINEL' },
      referenceFor(owner),
    ))
    expect(ledger.readCleanupTarget(referenceFor(personal))).toEqual({
      status: 'passed', state: 'unplanned', snapshots: [],
    })
  })

  it('rejects unknown fields, kinds, mismatched identity, and invalid scoped markers', () => {
    const { ledger } = createHarness()
    const classroom = TARGET_CASES.find(target => target.kind === 'classroom')
    const account = TARGET_CASES.find(target => target.kind === 'account')

    expectFailed(ledger.planTarget({ ...planFor(classroom), password: 'secret' }))
    expectFailed(ledger.planTarget({ ...planFor(classroom), kind: 'browserSession' }))
    expectFailed(ledger.planTarget({
      ...planFor(classroom),
      identity: { ...IDENTITY, deploymentId: 'dpl_ffffffffffffffff' },
    }))
    expectFailed(ledger.planTarget({ ...planFor(classroom), namespace: 'qa:wrong' }))
    expectFailed(ledger.planTarget({ ...planFor(classroom), ownerId: null }))
    expectFailed(ledger.planTarget({ ...planFor(classroom), organizationId: null }))
    expectFailed(ledger.planTarget({ ...planFor(classroom), resourceType: 'homeroom' }))
    expectFailed(ledger.planTarget({ ...planFor(account), ownerId: OWNER_ID }))
    expectFailed(ledger.planTarget({ ...planFor(account), organizationId: ORG_ID }))
  })

  it('binds same-shape account candidates and reconciliation to exact targetKey', async () => {
    const primary = TARGET_CASES.find(target => target.targetKey === 'account-teacher')
    const unrelated = targetCase(
      'account',
      'account-teacher-unrelated',
      null,
      null,
      'teacher',
      uuid(90),
    )
    const primaryCandidate = candidateFor(primary)
    const { ledger, findExactRunTargets } = createHarness({
      reconcile: async () => authoritative([primaryCandidate]),
    })

    expectPassed(ledger.planTarget(planFor(primary)))
    expectPassed(ledger.planTarget(planFor(unrelated)))
    expectPassed(ledger.markUncertain(referenceFor(unrelated)))
    expectFailed(ledger.commitTarget(referenceFor(unrelated), primaryCandidate))
    expectFailed(await ledger.reconcileTarget(referenceFor(unrelated)))
    expect(findExactRunTargets).toHaveBeenCalledTimes(1)
    expect(findExactRunTargets.mock.calls[0][0].targetKey).toBe(unrelated.targetKey)
    expect(ledger.readCleanupTarget(referenceFor(unrelated))).toEqual({
      status: 'passed', state: 'uncertain', snapshots: [],
    })
  })

  it('retains an exact personal organization + membership composite for cleanup', () => {
    const { ledger } = createHarness()
    const target = TARGET_CASES.find(value => value.kind === 'personalOrganization')
    const reference = referenceFor(target)
    expectPassed(ledger.planTarget(planFor(target)))
    expectPassed(ledger.markUncertain(reference))
    expectFailed(ledger.commitTarget(reference, candidateFor(target, { targetId: ORG_ID })))
    expectPassed(ledger.commitTarget(reference, candidateFor(target)))

    const [organizationId, membershipId] = ledger
      .readCleanupTarget(reference)
      .snapshots[0]
      .targetId
      .split(':')
    expect(organizationId).toBe(ORG_ID)
    expect(membershipId).toBe(MEMBERSHIP_ID)
    expect(organizationId).not.toBe(membershipId)
  })

  it('closes authoritative zero-match reconciliation as safely absent while writes are disabled', async () => {
    const target = TARGET_CASES.find(value => value.kind === 'submission')
    const { ledger, state, findExactRunTargets } = createHarness({
      reconcile: async (criteria, options) => {
        expect(Object.isFrozen(criteria)).toBe(true)
        expect(Object.isFrozen(criteria.identity)).toBe(true)
        expect(Object.isFrozen(criteria.creationWindow)).toBe(true)
        expect(Object.isFrozen(options)).toBe(true)
        expect(options.signal).toBeInstanceOf(AbortSignal)
        return authoritative([])
      },
    })
    const reference = referenceFor(target)
    expectPassed(ledger.planTarget(planFor(target)))
    expectPassed(ledger.markUncertain(reference))
    state.environment = {
      ...OFFICIAL_ENVIRONMENT,
      EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'false',
    }

    expectPassed(await ledger.reconcileTarget(reference))
    expect(findExactRunTargets).toHaveBeenCalledTimes(1)
    expect(ledger.readCleanupTarget(reference)).toEqual({
      status: 'passed', state: 'deleted', snapshots: [],
    })
  })

  it('retains two exact ambiguous-create matches and deletes each proof independently', async () => {
    const target = TARGET_CASES.find(value => value.kind === 'submission')
    const first = candidateFor(target)
    const second = candidateFor(target, { targetId: uuid(55) })
    const { ledger, state } = createHarness({
      reconcile: async () => authoritative([second, first]),
    })
    const reference = referenceFor(target)
    expectPassed(ledger.planTarget(planFor(target)))
    expectPassed(ledger.markUncertain(reference))
    state.environment = {
      ...OFFICIAL_ENVIRONMENT,
      EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'false',
    }

    expectPassed(await ledger.reconcileTarget(reference))
    expect(ledger.readCleanupTarget(reference)).toEqual({
      status: 'passed',
      state: 'committed',
      snapshots: [first, second],
    })
    expectPassed(ledger.markDeleted(reference, { schemaVersion: 1, targetId: first.targetId }))
    expect(ledger.readCleanupTarget(reference)).toEqual({
      status: 'passed',
      state: 'committed',
      snapshots: [second],
    })
    expectFailed(ledger.markDeleted(reference, { schemaVersion: 1, targetId: first.targetId }))
    expectPassed(ledger.markDeleted(reference, { schemaVersion: 1, targetId: second.targetId }))
    expect(ledger.readCleanupTarget(reference)).toEqual({
      status: 'passed', state: 'deleted', snapshots: [],
    })
  })

  it.each([
    {
      name: 'duplicate target IDs',
      matches: target => [candidateFor(target), candidateFor(target)],
    },
    {
      name: 'more than the reconciliation cap',
      matches: target => Array.from({ length: 9 }, (_, index) => (
        candidateFor(target, { targetId: uuid(200 + index) })
      )),
    },
    {
      name: 'wrong target key provenance',
      matches: target => [candidateFor(target, { targetKey: 'submission-other' })],
    },
    {
      name: 'wrong namespace provenance',
      matches: target => [candidateFor(target, { namespace: 'qa:other-run' })],
    },
    {
      name: 'wrong owner provenance',
      matches: target => [candidateFor(target, { ownerId: uuid(91) })],
    },
    {
      name: 'wrong source/deployment identity',
      matches: target => [candidateFor(target, {
        identity: { ...IDENTITY, sourceRevision: 'f'.repeat(40) },
      })],
    },
    {
      name: 'creation outside the exact window',
      matches: target => [candidateFor(target, { createdAt: '2026-09-23T11:00:00.001Z' })],
    },
  ])('leaves the target uncertain for $name', async ({ matches }) => {
    const target = TARGET_CASES.find(value => value.kind === 'submission')
    const { ledger, state } = createHarness({
      reconcile: async () => authoritative(matches(target)),
    })
    const reference = referenceFor(target)
    expectPassed(ledger.planTarget(planFor(target)))
    expectPassed(ledger.markUncertain(reference))
    state.environment = {
      ...OFFICIAL_ENVIRONMENT,
      EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'false',
    }

    expectFailed(await ledger.reconcileTarget(reference))
    expect(ledger.readCleanupTarget(reference)).toEqual({
      status: 'passed', state: 'uncertain', snapshots: [],
    })
  })

  it('rejects a non-authoritative or secret-bearing reconciliation response', async () => {
    const target = TARGET_CASES.find(value => value.kind === 'answer')
    const responses = [
      { schemaVersion: 1, authoritative: false, matches: [] },
      { ...authoritative([]), databasePassword: 'secret' },
      { schemaVersion: 1, authoritative: true, matches: 'not-an-array' },
    ]

    for (const response of responses) {
      const { ledger } = createHarness({ reconcile: async () => response })
      const reference = referenceFor(target)
      expectPassed(ledger.planTarget(planFor(target)))
      expectPassed(ledger.markUncertain(reference))
      expectFailed(await ledger.reconcileTarget(reference))
      expect(ledger.readCleanupTarget(reference)).toEqual({
        status: 'passed', state: 'uncertain', snapshots: [],
      })
    }
  })

  it('aborts and fails a resolver that hangs beyond the bounded timeout', async () => {
    vi.useFakeTimers()
    const target = TARGET_CASES.find(value => value.kind === 'answer')
    let observedSignal = null
    const { ledger } = createHarness({
      reconciliationTimeoutMs: 10,
      reconcile: async (criteria, options) => {
        observedSignal = options.signal
        return new Promise(() => {})
      },
    })
    const reference = referenceFor(target)
    expectPassed(ledger.planTarget(planFor(target)))
    expectPassed(ledger.markUncertain(reference))

    const pending = ledger.reconcileTarget(reference)
    await vi.advanceTimersByTimeAsync(10)
    expectFailed(await pending)
    expect(observedSignal).toBeInstanceOf(AbortSignal)
    expect(observedSignal.aborted).toBe(true)
    expect(ledger.readCleanupTarget(reference)).toEqual({
      status: 'passed', state: 'uncertain', snapshots: [],
    })
  })

  it('serializes reconciliation per target and rejects racing transitions', async () => {
    const target = TARGET_CASES.find(value => value.kind === 'classroom')
    let resolveLookup
    const lookup = new Promise(resolve => {
      resolveLookup = resolve
    })
    const { ledger } = createHarness({ reconcile: async () => lookup })
    const reference = referenceFor(target)
    expectPassed(ledger.planTarget(planFor(target)))
    expectPassed(ledger.markUncertain(reference))

    const reconciliation = ledger.reconcileTarget(reference)
    await Promise.resolve()
    expectFailed(ledger.commitTarget(reference, candidateFor(target)))
    expectFailed(await ledger.reconcileTarget(reference))
    resolveLookup(authoritative([candidateFor(target)]))
    expectPassed(await reconciliation)
  })

  it('returns immutable, idempotent cleanup snapshots for only the requested reference', () => {
    const { ledger } = createHarness()
    const answer = TARGET_CASES.find(value => value.kind === 'answer')
    const storage = TARGET_CASES.find(value => value.kind === 'answerStorageObject')
    const mutablePlan = planFor(answer, {
      identity: { ...IDENTITY, creationWindow: { ...IDENTITY.creationWindow } },
    })
    const mutableCandidate = candidateFor(answer, {
      identity: { ...IDENTITY, creationWindow: { ...IDENTITY.creationWindow } },
    })

    expectPassed(ledger.planTarget(mutablePlan))
    expectPassed(ledger.planTarget(planFor(storage)))
    mutablePlan.identity.creationWindow.notBefore = '1990-01-01T00:00:00.000Z'
    expectPassed(ledger.markUncertain(referenceFor(answer)))
    expectPassed(ledger.commitTarget(referenceFor(answer), mutableCandidate))
    mutableCandidate.targetId = uuid(99)

    const first = ledger.readCleanupTarget(referenceFor(answer))
    const second = ledger.readCleanupTarget(referenceFor(answer))
    expect(first).toEqual(second)
    expect(first.snapshots).toHaveLength(1)
    expect(first.snapshots[0].targetId).toBe(answer.targetId)
    expect(first.snapshots[0].identity.creationWindow.notBefore).toBe(NOT_BEFORE)
    expect(first.snapshots.some(snapshot => snapshot.targetKey === storage.targetKey)).toBe(false)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.snapshots)).toBe(true)
    expect(Object.isFrozen(first.snapshots[0])).toBe(true)
    expect(ledger.listTargets).toBeUndefined()
    expect(ledger.dump).toBeUndefined()
  })

  it.each([
    [
      'configRevision',
      `${ASSIGNMENT_ID}:r2147483647`,
    ],
    [
      'release',
      `asr-${ASSIGNMENT_ID.replaceAll('-', '')}-r2147483647-${'b'.repeat(16)}`,
    ],
    [
      'assignmentArtifact',
      `assignments/${ASSIGNMENT_ID}/r2147483647/${'c'.repeat(64)}.seb`,
    ],
  ])('rejects an out-of-range %s revision before it can become cleanup state', (kind, targetId) => {
    const { ledger } = createHarness()
    const target = TARGET_CASES.find(value => value.kind === kind)
    const reference = referenceFor(target)

    expectPassed(ledger.planTarget(planFor(target)))
    expectPassed(ledger.markUncertain(reference))
    expectFailed(ledger.commitTarget(reference, candidateFor(target, { targetId })))
    expect(ledger.readCleanupTarget(reference)).toEqual({
      status: 'passed',
      state: 'uncertain',
      snapshots: [],
    })
  })

  it('returns redacted public failures and rejects secret-bearing candidates and proofs', () => {
    const { ledger } = createHarness()
    const target = TARGET_CASES.find(value => value.kind === 'release')
    const reference = referenceFor(target)
    const secrets = {
      password: 'teacher-quit-password',
      configKey: 'a'.repeat(64),
      browserExamKey: 'b'.repeat(64),
    }

    const planFailure = ledger.planTarget({ ...planFor(target), ...secrets })
    expectFailed(planFailure)
    expectPassed(ledger.planTarget(planFor(target)))
    expectPassed(ledger.markUncertain(reference))
    const candidateFailure = ledger.commitTarget(reference, {
      ...candidateFor(target),
      ...secrets,
    })
    expectFailed(candidateFailure)
    expectPassed(ledger.commitTarget(reference, candidateFor(target)))
    const proofFailure = ledger.markDeleted(reference, {
      schemaVersion: 1,
      targetId: target.targetId,
      deleteToken: secrets.password,
    })
    expectFailed(proofFailure)

    for (const result of [planFailure, candidateFailure, proofFailure]) {
      const serialized = JSON.stringify(result)
      expect(Object.keys(result)).toEqual(['status'])
      for (const secret of Object.values(secrets)) expect(serialized).not.toContain(secret)
    }
    expect(Object.keys(ledger).sort()).toEqual([
      'adoptDerivedTarget',
      'commitTarget',
      'markDeleted',
      'markUncertain',
      'planTarget',
      'readCleanupTarget',
      'reconcileTarget',
    ])
    expect(JSON.stringify(ledger)).toBe('{}')
  })

  it('fails closed if environment provenance changes before resolver readback', async () => {
    const target = TARGET_CASES.find(value => value.kind === 'assignment')
    const { ledger, state } = createHarness({
      reconcile: async () => {
        state.environment = { ...OFFICIAL_ENVIRONMENT, VERCEL_ENV: 'production' }
        return authoritative([candidateFor(target)])
      },
    })
    const reference = referenceFor(target)
    expectPassed(ledger.planTarget(planFor(target)))
    expectPassed(ledger.markUncertain(reference))
    expectFailed(await ledger.reconcileTarget(reference))
    expectFailed(ledger.readCleanupTarget(reference))
  })

  it('rejects malformed target identifiers and accessors without invoking them', () => {
    const { ledger } = createHarness()
    const target = TARGET_CASES.find(value => value.kind === 'assignmentArtifact')
    const reference = referenceFor(target)
    expectPassed(ledger.planTarget(planFor(target)))
    expectPassed(ledger.markUncertain(reference))
    expectFailed(ledger.commitTarget(reference, candidateFor(target, {
      targetId: `assignments/${ASSIGNMENT_ID}/r1/../secret.seb`,
    })))

    const getter = vi.fn(() => target.targetId)
    const accessorCandidate = candidateFor(target)
    Object.defineProperty(accessorCandidate, 'targetId', {
      enumerable: true,
      get: getter,
    })
    expectFailed(ledger.commitTarget(reference, accessorCandidate))
    expect(getter).not.toHaveBeenCalled()
  })
})
