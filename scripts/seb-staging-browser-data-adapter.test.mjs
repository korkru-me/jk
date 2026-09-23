import { describe, expect, it, vi } from 'vitest'

import {
  SebStagingBrowserDataAdapterBlockedError,
  createSebStagingBrowserDataAdapter,
  listSebStagingBrowserDataStepContracts,
} from './seb-staging-browser-data-adapter.mjs'
import { listSebStagingCompositeStepContracts } from './seb-staging-composite-adapter.mjs'
import { createSebStagingPrivateRunLedger } from './seb-staging-private-run-ledger.mjs'

const NOW = '2026-09-24T03:00:00.000Z'
const SOURCE_REVISION = 'b'.repeat(40)
const DEPLOYMENT_ID = `dpl_${'C'.repeat(24)}`
const ARTIFACT_SHA256 = 'a'.repeat(64)
let sequence = 0

function uuid(value) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
}

const IDS = Object.freeze({
  teacher: uuid(1),
  unrelatedTeacher: uuid(2),
  student: uuid(3),
  secondaryStudent: uuid(4),
  teacherOrganization: uuid(5),
  teacherMembership: uuid(6),
  classroom: uuid(7),
  writtenQuestion: uuid(8),
  uploadQuestion: uuid(9),
  membership: uuid(10),
  secondaryMembership: uuid(11),
  assignment: uuid(12),
  submission: uuid(13),
  writtenAnswer: uuid(14),
  uploadAnswer: uuid(15),
  uploadObject: uuid(16),
  proctorClient: uuid(17),
})

const RELEASE_ID = `asr-${IDS.assignment.replaceAll('-', '')}-r1-${ARTIFACT_SHA256.slice(0, 16)}`
const RELEASE_IDENTITY = Object.freeze({
  releaseId: RELEASE_ID,
  releaseRevision: 1,
  artifactSha256: ARTIFACT_SHA256,
})

const BINDINGS = Object.freeze(new Map([
  ['teacher-primary', Object.freeze({ role: 'teacher', id: IDS.teacher })],
  ['teacher-unrelated', Object.freeze({ role: 'teacher', id: IDS.unrelatedTeacher })],
  ['student-primary', Object.freeze({ role: 'student', id: IDS.student })],
  ['student-secondary', Object.freeze({ role: 'student', id: IDS.secondaryStudent })],
]))

const TARGETS = Object.freeze(new Map([
  ['classroom-primary', Object.freeze({ kind: 'classroom', resourceType: 'subject', ownerAlias: 'teacher-primary', targetId: IDS.classroom })],
  ['question-written', Object.freeze({ kind: 'question', resourceType: 'essay', ownerAlias: 'teacher-primary', targetId: IDS.writtenQuestion })],
  ['question-upload', Object.freeze({ kind: 'question', resourceType: 'file_upload', ownerAlias: 'teacher-primary', targetId: IDS.uploadQuestion })],
  ['membership-primary', Object.freeze({ kind: 'classroomMembership', resourceType: 'student', ownerAlias: 'student-primary', targetId: IDS.membership })],
  ['membership-secondary', Object.freeze({ kind: 'classroomMembership', resourceType: 'student', ownerAlias: 'student-secondary', targetId: IDS.secondaryMembership })],
  ['assignment-primary', Object.freeze({ kind: 'assignment', resourceType: 'exam', ownerAlias: 'teacher-primary', targetId: IDS.assignment })],
  ['config-primary', Object.freeze({ kind: 'configRevision', resourceType: 'seb_required', ownerAlias: 'teacher-primary', targetId: `${IDS.assignment}:r1` })],
  ['check-in-primary', Object.freeze({ kind: 'checkIn', resourceType: 'windows', ownerAlias: 'student-primary', targetId: `${IDS.assignment}:${IDS.student}` })],
  ['submission-primary', Object.freeze({ kind: 'submission', resourceType: 'seb_required', ownerAlias: 'student-primary', targetId: IDS.submission })],
  ['answer-written', Object.freeze({ kind: 'answer', resourceType: 'essay', ownerAlias: 'student-primary', targetId: IDS.writtenAnswer })],
  ['answer-upload', Object.freeze({ kind: 'answer', resourceType: 'file_upload', ownerAlias: 'student-primary', targetId: IDS.uploadAnswer })],
  ['answer-storage', Object.freeze({
    kind: 'answerStorageObject',
    resourceType: 'submission_file',
    ownerAlias: 'student-primary',
    targetId: `${IDS.student}/${IDS.submission}/${IDS.uploadAnswer}/${IDS.uploadObject}.pdf`,
  })],
  ['proctor-connection', Object.freeze({
    kind: 'proctorConnection',
    resourceType: 'heartbeat',
    ownerAlias: 'student-primary',
    targetId: `${IDS.submission}:${IDS.proctorClient}`,
  })],
  ['proctor-event', Object.freeze({ kind: 'proctorEvent', resourceType: 'monitoring_started', ownerAlias: 'student-primary', targetId: '1' })],
]))

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze))
  if (value === null || typeof value !== 'object') return value
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, freeze(child)]),
  ))
}

function nextRunIdentity(overrides = {}) {
  sequence += 1
  return freeze({
    runId: `seb-s5-browser-${sequence}`,
    sourceRevision: SOURCE_REVISION,
    deploymentId: DEPLOYMENT_ID,
    creationWindow: {
      notBefore: '2026-09-24T02:00:00.000Z',
      notAfter: '2026-09-24T04:00:00.000Z',
    },
    ...overrides,
  })
}

function validEnvironment(overrides = {}) {
  return {
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
    EXAM_QA_DATA_POLICY: 'synthetic-only',
    EXAM_QA_COPY_PRODUCTION_DATA: 'false',
    EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
    ...overrides,
  }
}

function baseRequestIdentity(runIdentity) {
  return freeze({
    runId: runIdentity.runId,
    sourceRevision: runIdentity.sourceRevision,
    deploymentId: runIdentity.deploymentId,
  })
}

function releaseRequestIdentity(runIdentity, overrides = {}) {
  return freeze({
    ...baseRequestIdentity(runIdentity),
    ...RELEASE_IDENTITY,
    ...overrides,
  })
}

function request(contract, runIdentity, releaseBound = false, overrides = {}) {
  return freeze({
    schemaVersion: 1,
    stepId: contract.stepId,
    phase: contract.phase,
    actor: contract.actor,
    mutates: contract.mutates,
    identity: releaseBound
      ? releaseRequestIdentity(runIdentity)
      : baseRequestIdentity(runIdentity),
    ...overrides,
  })
}

function reference(kind, targetKey) {
  return freeze({ schemaVersion: 1, targetKey, kind })
}

function plan(runIdentity, namespace, {
  targetKey,
  kind,
  ownerId,
  organizationId,
  resourceType,
}) {
  return freeze({
    schemaVersion: 1,
    targetKey,
    kind,
    identity: runIdentity,
    namespace,
    ownerId,
    organizationId,
    resourceType,
  })
}

function candidate(runIdentity, namespace, value, createdAt = NOW) {
  return freeze({
    ...plan(runIdentity, namespace, value),
    targetId: value.targetId,
    createdAt,
  })
}

function exactPassed() {
  return Object.freeze({ status: 'passed' })
}

function makeBrowser(events, overrides = {}) {
  const method = (name, implementation = null) => vi.fn(async value => {
    events.push(`${name}:${value?.operationId ?? value?.alias ?? value?.contextAlias ?? ''}`)
    return implementation ? implementation(value) : exactPassed()
  })
  return Object.freeze({
    authenticate: method('authenticate', overrides.authenticate),
    execute: method('execute', overrides.execute),
    snapshotCookies: method('snapshot', overrides.snapshotCookies),
    replaceCookies: method('replace', overrides.replaceCookies),
    restoreCookies: method('restore', overrides.restoreCookies),
    closeAll: method('close', overrides.closeAll),
    probeUserScopedRead: method('probe', overrides.probeUserScopedRead),
  })
}

function makeHarness({
  environmentOverrides,
  browserOverrides,
  prepareOverride,
  attestOverride,
  failPlanTargetKey = null,
  resourcePlanTimeoutMs = 1_000,
  clock = () => new Date(NOW),
} = {}) {
  const runIdentity = nextRunIdentity()
  const namespace = `qa:${runIdentity.runId}`
  let environment = validEnvironment(environmentOverrides)
  const events = []
  const reconciliationMatches = new Map()
  const reconciliationClient = {
    targetOrigin: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
    credentialKind: 'service-role',
    client: {
      supabaseUrl: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
      async findExactRunTargets(criteria) {
        events.push(`reconcile:${criteria.targetKey}`)
        return freeze({
          schemaVersion: 1,
          authoritative: true,
          matches: reconciliationMatches.get(criteria.targetKey) ?? [],
        })
      },
    },
  }
  const ledger = createSebStagingPrivateRunLedger({
    schemaVersion: 1,
    identity: runIdentity,
    namespace,
    readEnvironment: () => environment,
    reconciliationClient,
    reconciliationTimeoutMs: 1_000,
    clock,
  })

  function seed(value, { uncertain = false } = {}) {
    expect(ledger.planTarget(plan(runIdentity, namespace, value))).toEqual({ status: 'passed' })
    expect(ledger.markUncertain(reference(value.kind, value.targetKey))).toEqual({ status: 'passed' })
    const exactCandidate = candidate(runIdentity, namespace, value)
    if (uncertain) {
      reconciliationMatches.set(value.targetKey, [exactCandidate])
    } else {
      expect(ledger.commitTarget(
        reference(value.kind, value.targetKey),
        exactCandidate,
      )).toEqual({ status: 'passed' })
    }
    return exactCandidate
  }

  for (const [alias, binding] of BINDINGS) {
    seed({
      targetKey: `account-${alias}`,
      kind: 'account',
      ownerId: null,
      organizationId: null,
      resourceType: binding.role,
      targetId: binding.id,
    })
  }
  seed({
    targetKey: 'personal-organization-teacher-primary',
    kind: 'personalOrganization',
    ownerId: IDS.teacher,
    organizationId: null,
    resourceType: 'personal',
    targetId: `${IDS.teacherOrganization}:${IDS.teacherMembership}`,
  })

  const contracts = listSebStagingBrowserDataStepContracts()
  const contractById = new Map(contracts.map(value => [value.stepId, value]))
  const preparedByStep = new Map()
  const resourcePlan = Object.freeze({
    readAccountBinding: vi.fn(async input => {
      events.push(`binding:${input.alias}`)
      const binding = BINDINGS.get(input.alias)
      return freeze({
        schemaVersion: 1,
        targetOrigin: 'https://staging.korkru.com',
        namespace,
        alias: input.alias,
        role: binding?.role,
        expectedUserId: binding?.id,
      })
    }),
    prepareStep: vi.fn(async (input, options) => {
      events.push(`prepare:${input.stepId}`)
      const contract = contractById.get(input.stepId)
      const binding = contract.alias === null ? null : BINDINGS.get(contract.alias)
      const targets = contract.targetKeys.map(targetKey => {
        const value = TARGETS.get(targetKey)
        return freeze({
          schemaVersion: 1,
          targetKey,
          kind: value.kind,
          ownerId: BINDINGS.get(value.ownerAlias).id,
          organizationId: IDS.teacherOrganization,
          resourceType: value.resourceType,
          targetId: value.targetId,
        })
      })
      const prepared = freeze({
        schemaVersion: 1,
        targetOrigin: 'https://staging.korkru.com',
        namespace,
        stepId: input.stepId,
        alias: contract.alias,
        role: contract.role,
        expectedUserId: binding?.id ?? null,
        targets,
      })
      preparedByStep.set(input.stepId, prepared)
      return prepareOverride ? prepareOverride(prepared, input, options) : prepared
    }),
    attestStep: vi.fn(async (input, options) => {
      events.push(`attest:${input.stepId}`)
      const prepared = preparedByStep.get(input.stepId)
      const attestation = freeze({
        schemaVersion: 1,
        stepId: input.stepId,
        status: 'passed',
        targets: prepared.targets.map(value => ({
          targetKey: value.targetKey,
          kind: value.kind,
          targetId: value.targetId,
          createdAt: NOW,
        })),
      })
      return attestOverride ? attestOverride(attestation, input, options) : attestation
    }),
  })
  const browser = makeBrowser(events, browserOverrides)
  const ledgerCapability = failPlanTargetKey === null
    ? ledger
    : Object.freeze({
        planTarget: value => {
          events.push(`plan:${value.targetKey}`)
          return value.targetKey === failPlanTargetKey
            ? Object.freeze({ status: 'failed' })
            : ledger.planTarget(value)
        },
        adoptDerivedTarget: (...args) => ledger.adoptDerivedTarget(...args),
        markUncertain: (...args) => ledger.markUncertain(...args),
        commitTarget: (...args) => ledger.commitTarget(...args),
        reconcileTarget: (...args) => ledger.reconcileTarget(...args),
        readCleanupTarget: (...args) => ledger.readCleanupTarget(...args),
        markDeleted: (...args) => ledger.markDeleted(...args),
      })
  const adapter = createSebStagingBrowserDataAdapter({
    readEnvironment: () => environment,
    runIdentity,
    privateRunLedger: ledgerCapability,
    browserSessionCapability: browser,
    privateResourcePlanCapability: resourcePlan,
    resourcePlanTimeoutMs,
    clock,
  })

  function seedRelease({ uncertain = false, targetId = RELEASE_ID } = {}) {
    return seed({
      targetKey: 'release-primary',
      kind: 'release',
      ownerId: IDS.teacher,
      organizationId: IDS.teacherOrganization,
      resourceType: 'test_plaintext',
      targetId,
    }, { uncertain })
  }

  return {
    adapter,
    browser,
    contracts,
    environment: value => { environment = value },
    events,
    ledger,
    namespace,
    reconciliationMatches,
    resourcePlan,
    runIdentity,
    seedRelease,
  }
}

async function runThrough(harness, lastStepId, { uncertainRelease = false } = {}) {
  const results = []
  for (const contract of harness.contracts) {
    if (contract.stepId === 'publish-seb-assignment') {
      harness.seedRelease({ uncertain: uncertainRelease })
    }
    const releaseBound = harness.contracts.findIndex(value => value.stepId === contract.stepId)
      >= harness.contracts.findIndex(value => value.stepId === 'publish-seb-assignment')
    const result = await harness.adapter.executeStep(request(
      contract,
      harness.runIdentity,
      releaseBound,
    ))
    results.push(result)
    if (contract.stepId === lastStepId) break
  }
  return results
}

describe('SEB Staging browser/data adapter', () => {
  it('declares exactly the browser-owned composite steps in canonical order', () => {
    const contracts = listSebStagingBrowserDataStepContracts()
    expect(contracts.map(value => value.stepId)).toEqual([
      'create-subject-classroom',
      'create-synthetic-written-question',
      'create-synthetic-upload-question',
      'join-synthetic-student-to-classroom',
      'join-secondary-student-to-classroom',
      'create-seb-assignment-draft-with-quit-password',
      'publish-seb-assignment',
      'reject-invalid-seb-challenge',
      'verify-seb-system-check',
      'reject-replayed-seb-challenge',
      'reject-invalid-seb-session',
      'start-revision-bound-attempt',
      'reject-replayed-seb-session',
      'autosave-synthetic-answer',
      'retry-autosave-after-transient-failure',
      'resume-same-attempt',
      'upload-synthetic-attachment',
      'retry-upload-after-transient-failure',
      'record-proctor-heartbeat',
      'student-denied-teacher-result',
      'submit-attempt',
      'teacher-read-submitted-result',
      'secondary-student-denied-primary-attempt',
      'unrelated-teacher-denied-assignment-result',
      'verify-cross-account-boundaries',
    ])
    expect(contracts.map(({ stepId, phase, actor, mutates }) => ({
      stepId, phase, actor, mutates,
    }))).toEqual(listSebStagingCompositeStepContracts()
      .filter(value => value.route === 'browser')
      .map(({ stepId, phase, actor, mutates }) => ({ stepId, phase, actor, mutates })))
    for (const value of contracts) {
      expect(Object.isFrozen(value)).toBe(true)
      expect(Object.isFrozen(value.targetKeys)).toBe(true)
    }
  })

  it('runs the full browser journey with closure-private ids and only coarse frozen evidence', async () => {
    const harness = makeHarness()
    const results = await runThrough(harness, 'verify-cross-account-boundaries')

    expect(results).toHaveLength(harness.contracts.length)
    expect(results.every(value => value.status === 'passed')).toBe(true)
    expect(results.every(value => Object.isFrozen(value))).toBe(true)
    expect(results.every(value => Object.keys(value).join(',') === 'stepId,status')).toBe(true)
    expect(JSON.stringify(results)).not.toContain(IDS.assignment)
    expect(JSON.stringify(results)).not.toContain(IDS.student)
    expect(JSON.stringify(results)).not.toContain(ARTIFACT_SHA256)

    for (const targetKey of TARGETS.keys()) {
      const value = TARGETS.get(targetKey)
      expect(harness.ledger.readCleanupTarget(reference(value.kind, targetKey))).toMatchObject({
        status: 'passed',
        state: 'committed',
      })
    }
    expect(harness.events).toContain('replace:teacher-primary')
    expect(harness.events).toContain('restore:teacher-primary')
    expect(harness.events).toContain('replace:student-primary')
    expect(harness.events).toContain('restore:student-primary')
  })

  it('places every creation in uncertain state before browser mutation and commits only after private attestation', async () => {
    let harness
    harness = makeHarness({
      browserOverrides: {
        execute(input) {
          if (input.operationId === 'create-subject-classroom') {
            expect(harness.ledger.readCleanupTarget(
              reference('classroom', 'classroom-primary'),
            )).toMatchObject({ state: 'uncertain' })
            expect(harness.events).not.toContain('attest:create-subject-classroom')
          }
          return exactPassed()
        },
      },
    })

    const [result] = await runThrough(harness, 'create-subject-classroom')
    expect(result).toEqual({ stepId: 'create-subject-classroom', status: 'passed' })
    expect(harness.ledger.readCleanupTarget(
      reference('classroom', 'classroom-primary'),
    )).toMatchObject({ state: 'committed' })
    expect(harness.events.indexOf('execute:create-subject-classroom'))
      .toBeLessThan(harness.events.indexOf('attest:create-subject-classroom'))
  })

  it('keeps a possibly-created target uncertain until browser quiescence and cleanup', async () => {
    let harness
    harness = makeHarness({
      browserOverrides: {
        execute(input) {
          if (input.operationId === 'create-subject-classroom') {
            const value = TARGETS.get('classroom-primary')
            harness.reconciliationMatches.set('classroom-primary', [candidate(
              harness.runIdentity,
              harness.namespace,
              {
                targetKey: 'classroom-primary',
                kind: value.kind,
                ownerId: IDS.teacher,
                organizationId: IDS.teacherOrganization,
                resourceType: value.resourceType,
                targetId: value.targetId,
              },
            )])
            return Object.freeze({ status: 'failed' })
          }
          return exactPassed()
        },
      },
    })

    const [result] = await runThrough(harness, 'create-subject-classroom')
    expect(result).toEqual({ stepId: 'create-subject-classroom', status: 'failed' })
    expect(harness.events).not.toContain('reconcile:classroom-primary')
    expect(harness.ledger.readCleanupTarget(
      reference('classroom', 'classroom-primary'),
    )).toMatchObject({ state: 'uncertain', snapshots: [] })
  })

  it('bounds an abort-ignoring private prepare without starting a browser mutation', async () => {
    let capturedSignal
    let releasePrepare
    const pendingPrepare = new Promise(resolve => {
      releasePrepare = resolve
    })
    const harness = makeHarness({
      resourcePlanTimeoutMs: 10,
      prepareOverride: async (prepared, _input, options) => {
        capturedSignal = options.signal
        await pendingPrepare
        return prepared
      },
    })

    const [result] = await runThrough(harness, 'create-subject-classroom')
    expect(result).toEqual({ stepId: 'create-subject-classroom', status: 'failed' })
    expect(capturedSignal).toBeInstanceOf(AbortSignal)
    expect(capturedSignal.aborted).toBe(true)
    expect(harness.browser.execute).not.toHaveBeenCalled()
    expect(harness.ledger.readCleanupTarget(
      reference('classroom', 'classroom-primary'),
    )).toEqual({ status: 'passed', state: 'unplanned', snapshots: [] })
    expect(await harness.adapter.closeAll()).toEqual({ status: 'failed' })

    releasePrepare()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(harness.browser.execute).not.toHaveBeenCalled()
    const closed = await harness.adapter.closeAll()
    expect(closed).toEqual({ status: 'passed' })
    expect(Object.isFrozen(closed)).toBe(true)
  })

  it('bounds an abort-ignoring private attestation and preserves post-mutation uncertainty', async () => {
    let capturedSignal
    let releaseAttestation
    const pendingAttestation = new Promise(resolve => {
      releaseAttestation = resolve
    })
    const harness = makeHarness({
      resourcePlanTimeoutMs: 10,
      attestOverride: async (attestation, _input, options) => {
        capturedSignal = options.signal
        await pendingAttestation
        return attestation
      },
    })

    const [result] = await runThrough(harness, 'create-subject-classroom')
    expect(result).toEqual({ stepId: 'create-subject-classroom', status: 'failed' })
    expect(capturedSignal).toBeInstanceOf(AbortSignal)
    expect(capturedSignal.aborted).toBe(true)
    expect(harness.browser.execute).toHaveBeenCalledTimes(1)
    expect(harness.ledger.readCleanupTarget(
      reference('classroom', 'classroom-primary'),
    )).toEqual({ status: 'passed', state: 'uncertain', snapshots: [] })
    expect(await harness.adapter.closeAll()).toEqual({ status: 'failed' })

    releaseAttestation()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(harness.ledger.readCleanupTarget(
      reference('classroom', 'classroom-primary'),
    )).toEqual({ status: 'passed', state: 'uncertain', snapshots: [] })
    expect(await harness.adapter.closeAll()).toEqual({ status: 'passed' })
  })

  it('permanently rejects data execution after the lifecycle boundary closes', async () => {
    const harness = makeHarness()
    const closed = await harness.adapter.closeAll()
    expect(closed).toEqual({ status: 'passed' })
    expect(Object.isFrozen(closed)).toBe(true)
    expect(await harness.adapter.closeAll()).toEqual({ status: 'passed' })

    const first = harness.contracts[0]
    expect(await harness.adapter.executeStep(request(first, harness.runIdentity)))
      .toEqual({ stepId: first.stepId, status: 'failed' })
    expect(harness.resourcePlan.readAccountBinding).not.toHaveBeenCalled()
    expect(harness.browser.execute).not.toHaveBeenCalled()
  })

  it('allows lifecycle quiescence after synthetic writes are disabled without reopening execution', async () => {
    const harness = makeHarness()
    harness.environment(validEnvironment({ EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'false' }))

    const closed = await harness.adapter.closeAll()
    expect(closed).toEqual({ status: 'passed' })
    expect(Object.isFrozen(closed)).toBe(true)

    const first = harness.contracts[0]
    expect(await harness.adapter.executeStep(request(first, harness.runIdentity)))
      .toEqual({ stepId: first.stepId, status: 'failed' })
    expect(harness.resourcePlan.readAccountBinding).not.toHaveBeenCalled()
    expect(harness.browser.execute).not.toHaveBeenCalled()
  })

  it('reconciles every already-uncertain target when a later target cannot be planned', async () => {
    const harness = makeHarness({ failPlanTargetKey: 'config-primary' })
    const results = await runThrough(
      harness,
      'create-seb-assignment-draft-with-quit-password',
    )

    expect(results.slice(0, -1).every(value => value.status === 'passed')).toBe(true)
    expect(results.at(-1)).toEqual({
      stepId: 'create-seb-assignment-draft-with-quit-password',
      status: 'failed',
    })
    expect(harness.events).toContain('plan:config-primary')
    expect(harness.events).toContain('reconcile:assignment-primary')
    expect(harness.events).not.toContain('execute:create-seb-assignment-draft-with-quit-password')
    expect(harness.ledger.readCleanupTarget(reference('assignment', 'assignment-primary')))
      .toMatchObject({ state: 'deleted', snapshots: [] })
    expect(harness.ledger.readCleanupTarget(reference('configRevision', 'config-primary')))
      .toMatchObject({ state: 'unplanned', snapshots: [] })
  })

  it('reconciles an uncertain native release before allowing publish retry semantics', async () => {
    const harness = makeHarness()
    const results = await runThrough(harness, 'publish-seb-assignment', {
      uncertainRelease: true,
    })

    expect(results.every(value => value.status === 'passed')).toBe(true)
    expect(harness.events).toContain('reconcile:release-primary')
    expect(harness.events.indexOf('reconcile:release-primary'))
      .toBeLessThan(harness.events.indexOf('execute:publish-seb-assignment'))
    expect(harness.ledger.readCleanupTarget(reference('release', 'release-primary')))
      .toMatchObject({ state: 'committed' })
  })

  it('binds assignment, config revision, release row, and request release to one identity', async () => {
    const wrongAssignment = uuid(91)
    const harness = makeHarness()
    const beforePublish = harness.contracts.find(value => (
      value.stepId === 'create-seb-assignment-draft-with-quit-password'
    ))
    const results = await runThrough(harness, beforePublish.stepId)
    expect(results.every(value => value.status === 'passed')).toBe(true)
    harness.seedRelease({
      targetId: `asr-${wrongAssignment.replaceAll('-', '')}-r1-${ARTIFACT_SHA256.slice(0, 16)}`,
    })

    const publish = harness.contracts.find(value => value.stepId === 'publish-seb-assignment')
    const output = await harness.adapter.executeStep(request(publish, harness.runIdentity, true))
    expect(output).toEqual({ stepId: publish.stepId, status: 'failed' })
    expect(harness.events).not.toContain('execute:publish-seb-assignment')
  })

  it('rejects a config target whose assignment id differs from the paired assignment target', async () => {
    const harness = makeHarness({
      prepareOverride(prepared) {
        if (prepared.stepId !== 'create-seb-assignment-draft-with-quit-password') {
          return prepared
        }
        return freeze({
          ...prepared,
          targets: prepared.targets.map(value => (
            value.targetKey === 'config-primary'
              ? { ...value, targetId: `${uuid(92)}:r1` }
              : value
          )),
        })
      },
    })
    const results = await runThrough(
      harness,
      'create-seb-assignment-draft-with-quit-password',
    )
    expect(results.at(-1)).toEqual({
      stepId: 'create-seb-assignment-draft-with-quit-password',
      status: 'failed',
    })
    expect(harness.events).not.toContain('execute:create-seb-assignment-draft-with-quit-password')
  })

  it('restores a replaced account context even when the private read probe fails', async () => {
    let failProbe = false
    const harness = makeHarness({
      browserOverrides: {
        probeUserScopedRead(input) {
          if (failProbe
            && input.contextAlias === 'student-primary'
            && input.authenticatedAsAlias === 'student-secondary') {
            return Object.freeze({ status: 'failed' })
          }
          return exactPassed()
        },
      },
    })
    const beforeCross = harness.contracts.at(-2).stepId
    const results = await runThrough(harness, beforeCross)
    expect(results.every(value => value.status === 'passed')).toBe(true)
    failProbe = true

    const cross = harness.contracts.at(-1)
    const result = await harness.adapter.executeStep(request(cross, harness.runIdentity, true))
    expect(result).toEqual({ stepId: cross.stepId, status: 'failed' })
    expect(harness.events).toContain('replace:student-primary')
    expect(harness.events).toContain('restore:student-primary')
    expect(harness.events.indexOf('restore:student-primary'))
      .toBeGreaterThan(harness.events.indexOf('replace:student-primary'))
  })

  it.each([
    ['extra public field', contract => ({ ...request(contract.contract, contract.runIdentity), secret: 'PUBLIC_SECRET_SENTINEL' })],
    ['wrong actor', contract => ({ ...request(contract.contract, contract.runIdentity), actor: 'fixture-admin' })],
    ['wrong mutation bit', contract => ({ ...request(contract.contract, contract.runIdentity), mutates: false })],
    ['cross-run identity', contract => ({
      ...request(contract.contract, contract.runIdentity),
      identity: { ...baseRequestIdentity(contract.runIdentity), runId: 'seb-s5-other-run' },
    })],
  ])('rejects %s without reaching browser or private planning', async (_label, forge) => {
    const harness = makeHarness()
    const contract = harness.contracts[0]
    const output = await harness.adapter.executeStep(forge({ contract, runIdentity: harness.runIdentity }))

    expect(output).toEqual({ stepId: contract.stepId, status: 'failed' })
    expect(JSON.stringify(output)).not.toContain('PUBLIC_SECRET_SENTINEL')
    expect(harness.browser.execute).not.toHaveBeenCalled()
    expect(harness.resourcePlan.prepareStep).not.toHaveBeenCalled()
  })

  it('rejects out-of-order execution without poisoning the expected first step', async () => {
    const harness = makeHarness()
    const second = harness.contracts[1]
    expect(await harness.adapter.executeStep(request(second, harness.runIdentity)))
      .toEqual({ stepId: second.stepId, status: 'failed' })
    expect(harness.browser.execute).not.toHaveBeenCalled()

    const first = harness.contracts[0]
    expect(await harness.adapter.executeStep(request(first, harness.runIdentity)))
      .toEqual({ stepId: first.stepId, status: 'passed' })
  })

  it('fails closed when a private plan adds fields, changes ownership, or invents a target id', async () => {
    for (const prepareOverride of [
      prepared => freeze({ ...prepared, secret: 'PRIVATE_PLAN_SECRET_SENTINEL' }),
      prepared => {
        const targets = [...prepared.targets]
        targets.secret = 'PRIVATE_ARRAY_SECRET_SENTINEL'
        Object.freeze(targets)
        return Object.freeze({ ...prepared, targets })
      },
      prepared => freeze({
        ...prepared,
        targets: prepared.targets.map(value => ({ ...value, ownerId: IDS.student })),
      }),
      prepared => freeze({
        ...prepared,
        targets: prepared.targets.map(value => ({ ...value, targetId: 'not-a-uuid' })),
      }),
    ]) {
      const harness = makeHarness({ prepareOverride })
      const [result] = await runThrough(harness, 'create-subject-classroom')
      expect(result.status).toBe('failed')
      expect(JSON.stringify(result)).not.toContain('PRIVATE_PLAN_SECRET_SENTINEL')
      expect(JSON.stringify(result)).not.toContain('PRIVATE_ARRAY_SECRET_SENTINEL')
      expect(harness.browser.execute).not.toHaveBeenCalled()
    }
  })

  it('fails and preserves uncertainty when runner attestation is missing, mismatched, or carries extra data', async () => {
    for (const attestOverride of [
      attestation => freeze({ ...attestation, secret: 'RUNNER_SECRET_SENTINEL' }),
      attestation => freeze({
        ...attestation,
        targets: attestation.targets.map(value => ({ ...value, targetId: uuid(99) })),
      }),
      attestation => freeze({ ...attestation, status: 'failed' }),
    ]) {
      const harness = makeHarness({ attestOverride })
      const [result] = await runThrough(harness, 'create-subject-classroom')
      expect(result.status).toBe('failed')
      expect(JSON.stringify(result)).not.toContain('RUNNER_SECRET_SENTINEL')
      expect(harness.events).not.toContain('reconcile:classroom-primary')
      expect(harness.ledger.readCleanupTarget(
        reference('classroom', 'classroom-primary'),
      )).toMatchObject({ state: 'uncertain', snapshots: [] })
    }
  })

  it('rejects non-exact broker results and never accepts a secret-shaped success payload', async () => {
    const harness = makeHarness({
      browserOverrides: {
        execute() {
          return freeze({ status: 'passed', token: 'BROKER_SECRET_SENTINEL' })
        },
      },
    })
    const [result] = await runThrough(harness, 'create-subject-classroom')
    expect(result).toEqual({ stepId: 'create-subject-classroom', status: 'failed' })
    expect(JSON.stringify(result)).not.toContain('BROKER_SECRET_SENTINEL')
    expect(harness.events).not.toContain('reconcile:classroom-primary')
    expect(harness.ledger.readCleanupTarget(
      reference('classroom', 'classroom-primary'),
    )).toMatchObject({ state: 'uncertain', snapshots: [] })
  })

  it('fails on environment drift before a later browser mutation', async () => {
    const harness = makeHarness()
    const first = harness.contracts[0]
    expect((await harness.adapter.executeStep(request(first, harness.runIdentity))).status).toBe('passed')
    harness.environment(validEnvironment({ NEXT_PUBLIC_SITE_URL: 'https://www.korkru.com' }))

    const second = harness.contracts[1]
    expect(await harness.adapter.executeStep(request(second, harness.runIdentity)))
      .toEqual({ stepId: second.stepId, status: 'failed' })
    expect(harness.browser.execute).toHaveBeenCalledTimes(1)
  })

  it('rechecks the creation window after async planning and before a targetless mutation', async () => {
    let now = NOW
    const harness = makeHarness({
      clock: () => new Date(now),
      prepareOverride(prepared, input) {
        if (input.stepId === 'publish-seb-assignment') {
          now = '2026-09-25T03:00:00.000Z'
        }
        return prepared
      },
    })

    const results = await runThrough(harness, 'publish-seb-assignment')
    expect(results.slice(0, -1).every(value => value.status === 'passed')).toBe(true)
    expect(results.at(-1)).toEqual({
      stepId: 'publish-seb-assignment',
      status: 'failed',
    })
    expect(harness.events).toContain('prepare:publish-seb-assignment')
    expect(harness.events).not.toContain('execute:publish-seb-assignment')
  })

  it('requires one consistent release binding from publish onward', async () => {
    const harness = makeHarness()
    const beforePublish = harness.contracts.find(value => (
      value.stepId === 'create-seb-assignment-draft-with-quit-password'
    ))
    const results = await runThrough(harness, beforePublish.stepId)
    expect(results.every(value => value.status === 'passed')).toBe(true)
    harness.seedRelease()
    const publish = harness.contracts.find(value => value.stepId === 'publish-seb-assignment')

    expect(await harness.adapter.executeStep(request(publish, harness.runIdentity, false)))
      .toEqual({ stepId: publish.stepId, status: 'failed' })
  })

  it('blocks construction for mutable capabilities, Production targets, and expired windows', () => {
    const runIdentity = nextRunIdentity()
    const namespace = `qa:${runIdentity.runId}`
    const noop = () => exactPassed()
    const mutableLedger = Object.fromEntries([
      'planTarget', 'adoptDerivedTarget', 'markUncertain', 'commitTarget',
      'reconcileTarget', 'readCleanupTarget', 'markDeleted',
    ].map(method => [method, noop]))
    const browser = makeBrowser([])
    const resourcePlan = Object.freeze({
      readAccountBinding: noop,
      prepareStep: noop,
      attestStep: noop,
    })

    expect(() => createSebStagingBrowserDataAdapter({
      readEnvironment: () => validEnvironment(),
      runIdentity,
      privateRunLedger: mutableLedger,
      browserSessionCapability: browser,
      privateResourcePlanCapability: resourcePlan,
      clock: () => new Date(NOW),
    })).toThrow(SebStagingBrowserDataAdapterBlockedError)

    const frozenLedger = Object.freeze(mutableLedger)
    expect(() => createSebStagingBrowserDataAdapter({
      readEnvironment: () => validEnvironment({ KORKRU_DEPLOYMENT_ENV: 'production' }),
      runIdentity,
      privateRunLedger: frozenLedger,
      browserSessionCapability: browser,
      privateResourcePlanCapability: resourcePlan,
      clock: () => new Date(NOW),
    })).toThrow(SebStagingBrowserDataAdapterBlockedError)

    expect(() => createSebStagingBrowserDataAdapter({
      readEnvironment: () => validEnvironment(),
      runIdentity,
      privateRunLedger: frozenLedger,
      browserSessionCapability: browser,
      privateResourcePlanCapability: resourcePlan,
      clock: () => new Date('2026-09-25T03:00:00.000Z'),
    })).toThrow(SebStagingBrowserDataAdapterBlockedError)
    expect(namespace).toBe(`qa:${runIdentity.runId}`)
  })
})
