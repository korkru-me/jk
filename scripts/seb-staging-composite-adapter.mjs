const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const OFFICIAL_STAGING_BRANCH = 'staging'
const READY_STATE = 'READY'
const CLEANUP_STEP_ID = 'cleanup-synthetic-fixture'
const REGISTER_RELEASE_STEP_ID = 'register-assignment-seb-release'
const PREFLIGHT_STEP_ID = 'verify-staging-isolation'
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const FORBIDDEN_RUN_ID_TERMS = /(prod(?:uction)?|live|real|customer)/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const RELEASE_ID = /^asr-[0-9a-f]{32}-r([1-9][0-9]{0,9})-([0-9a-f]{16})$/
const ARTIFACT_SHA256 = /^[a-f0-9]{64}$/
const MAX_ASSIGNMENT_CONFIG_REVISION = 2_147_483_646
const BLOCKED_MESSAGE = 'SEB Staging composite adapter blocked'

const STEP_CONTRACTS = Object.freeze([
  contract(PREFLIGHT_STEP_ID, 'preflight', 'harness', false, 'preflight'),
  contract('reserve-unique-run-id', 'fixture', 'fixture-admin', true, 'reservation'),
  contract('provision-synthetic-teacher', 'fixture', 'fixture-admin', true, 'fixture'),
  contract('provision-unrelated-teacher', 'fixture', 'fixture-admin', true, 'fixture'),
  contract('provision-synthetic-student', 'fixture', 'fixture-admin', true, 'fixture'),
  contract('provision-secondary-student', 'fixture', 'fixture-admin', true, 'fixture'),
  contract('authenticate-teacher', 'teacher-setup', 'teacher', false, 'fixture'),
  contract('create-subject-classroom', 'teacher-setup', 'teacher', true, 'browser'),
  contract('create-synthetic-written-question', 'teacher-setup', 'teacher', true, 'browser'),
  contract('create-synthetic-upload-question', 'teacher-setup', 'teacher', true, 'browser'),
  contract('authenticate-student-for-enrolment', 'student-enrolment', 'student', false, 'fixture'),
  contract('join-synthetic-student-to-classroom', 'student-enrolment', 'student', true, 'browser'),
  contract('authenticate-secondary-student-for-enrolment', 'student-enrolment', 'student-secondary', false, 'fixture'),
  contract('join-secondary-student-to-classroom', 'student-enrolment', 'student-secondary', true, 'browser'),
  contract('authenticate-teacher-for-assignment', 'teacher-setup', 'teacher', false, 'fixture'),
  contract('create-seb-assignment-draft-with-quit-password', 'teacher-setup', 'teacher', true, 'browser'),
  contract(REGISTER_RELEASE_STEP_ID, 'teacher-setup', 'native-operator', true, 'native'),
  contract('publish-seb-assignment', 'teacher-setup', 'teacher', true, 'browser'),
  contract('authenticate-student', 'student-journey', 'student', false, 'fixture'),
  contract('reject-invalid-seb-challenge', 'negative-session', 'student', false, 'browser'),
  contract('reject-expired-seb-challenge', 'negative-session', 'staging-qa-control', false, 'expiry'),
  contract('verify-seb-system-check', 'student-journey', 'student', true, 'browser'),
  contract('reject-replayed-seb-challenge', 'negative-session', 'student', false, 'browser'),
  contract('reject-invalid-seb-session', 'negative-session', 'student', false, 'browser'),
  contract('reject-expired-seb-session', 'negative-session', 'staging-qa-control', false, 'expiry'),
  contract('start-revision-bound-attempt', 'student-journey', 'student', true, 'browser'),
  contract('reject-replayed-seb-session', 'negative-session', 'student', false, 'browser'),
  contract('autosave-synthetic-answer', 'student-journey', 'student', true, 'browser'),
  contract('retry-autosave-after-transient-failure', 'failure-retry', 'student', true, 'browser'),
  contract('resume-same-attempt', 'student-journey', 'student', false, 'browser'),
  contract('upload-synthetic-attachment', 'student-journey', 'student', true, 'browser'),
  contract('retry-upload-after-transient-failure', 'failure-retry', 'student', true, 'browser'),
  contract('record-proctor-heartbeat', 'student-journey', 'student', true, 'browser'),
  contract('student-denied-teacher-result', 'authorization', 'student', false, 'browser'),
  contract('submit-attempt', 'student-journey', 'student', true, 'browser'),
  contract('authenticate-teacher-for-result', 'teacher-result', 'teacher', false, 'fixture'),
  contract('teacher-read-submitted-result', 'teacher-result', 'teacher', false, 'browser'),
  contract('authenticate-secondary-student', 'authorization', 'student-secondary', false, 'fixture'),
  contract('secondary-student-denied-primary-attempt', 'authorization', 'student-secondary', false, 'browser'),
  contract('authenticate-unrelated-teacher', 'authorization', 'teacher-unrelated', false, 'fixture'),
  contract('unrelated-teacher-denied-assignment-result', 'authorization', 'teacher-unrelated', false, 'browser'),
  contract('verify-cross-account-boundaries', 'authorization', 'harness', false, 'browser'),
  contract(CLEANUP_STEP_ID, 'cleanup', 'fixture-admin', true, 'cleanup'),
])
const STEP_BY_ID = new Map(STEP_CONTRACTS.map(value => [value.stepId, value]))

export class SebStagingCompositeAdapterBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingCompositeAdapterBlockedError'
  }
}

function contract(stepId, phase, actor, mutates, route) {
  return Object.freeze({ stepId, phase, actor, mutates, route })
}

function isDataRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    return Reflect.ownKeys(value).every(key => {
      if (typeof key !== 'string') return false
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      return descriptor !== undefined
        && Object.hasOwn(descriptor, 'value')
        && descriptor.enumerable === true
    })
  } catch {
    return false
  }
}

function hasExactFields(value, fields) {
  if (!isDataRecord(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...fields].sort()
  return actual.length === expected.length
    && actual.every((field, index) => field === expected[index])
}

function validExecutableCapability(value) {
  return isDataRecord(value) && typeof value.executeStep === 'function'
}

function validPreflightCapability(value) {
  return isDataRecord(value) && typeof value.attest === 'function'
}

function blocked() {
  throw new SebStagingCompositeAdapterBlockedError()
}

function safeStepId(stepId) {
  return STEP_BY_ID.has(stepId) ? stepId : 'invalid-step'
}

function redactedResult(stepId, status) {
  return Object.freeze({ stepId: safeStepId(stepId), status })
}

function parseReleaseIdentity(identity) {
  if (!hasExactFields(identity, ['releaseId', 'releaseRevision', 'artifactSha256'])) return null
  const releaseMatch = typeof identity.releaseId === 'string' ? RELEASE_ID.exec(identity.releaseId) : null
  if (!Number.isInteger(identity.releaseRevision)
    || identity.releaseRevision < 1
    || identity.releaseRevision > MAX_ASSIGNMENT_CONFIG_REVISION
    || typeof identity.artifactSha256 !== 'string'
    || !ARTIFACT_SHA256.test(identity.artifactSha256)
    || releaseMatch === null
    || Number(releaseMatch[1]) !== identity.releaseRevision
    || releaseMatch[2] !== identity.artifactSha256.slice(0, 16)) {
    return null
  }
  return Object.freeze({
    releaseId: identity.releaseId,
    releaseRevision: identity.releaseRevision,
    artifactSha256: identity.artifactSha256,
  })
}

function parseRequestIdentity(identity) {
  const runOnly = hasExactFields(identity, ['runId', 'sourceRevision', 'deploymentId'])
  const full = hasExactFields(identity, [
    'runId',
    'sourceRevision',
    'deploymentId',
    'releaseId',
    'releaseRevision',
    'artifactSha256',
  ])
  if (!runOnly && !full) return null
  if (typeof identity.runId !== 'string'
    || !SAFE_RUN_ID.test(identity.runId)
    || FORBIDDEN_RUN_ID_TERMS.test(identity.runId)
    || typeof identity.sourceRevision !== 'string'
    || !SOURCE_REVISION.test(identity.sourceRevision)
    || typeof identity.deploymentId !== 'string'
    || !DEPLOYMENT_ID.test(identity.deploymentId)) {
    return null
  }
  const releaseIdentity = full
    ? parseReleaseIdentity({
        releaseId: identity.releaseId,
        releaseRevision: identity.releaseRevision,
        artifactSha256: identity.artifactSha256,
      })
    : null
  if (full && !releaseIdentity) return null
  return Object.freeze({
    runId: identity.runId,
    sourceRevision: identity.sourceRevision,
    deploymentId: identity.deploymentId,
    releaseIdentity,
  })
}

function sameBaseIdentity(left, right) {
  return left?.runId === right?.runId
    && left?.sourceRevision === right?.sourceRevision
    && left?.deploymentId === right?.deploymentId
}

function sameReleaseIdentity(left, right) {
  return left?.releaseId === right?.releaseId
    && left?.releaseRevision === right?.releaseRevision
    && left?.artifactSha256 === right?.artifactSha256
}

function exactRequest(request, expected) {
  return hasExactFields(request, ['schemaVersion', 'stepId', 'phase', 'actor', 'mutates', 'identity'])
    && request.schemaVersion === 1
    && request.stepId === expected.stepId
    && request.phase === expected.phase
    && request.actor === expected.actor
    && request.mutates === expected.mutates
}

function exactPreflightAttestation(value, identity) {
  return hasExactFields(value, [
    'siteOrigin',
    'supabaseOrigin',
    'sourceRevision',
    'deploymentId',
    'branchRef',
    'readyState',
  ])
    && value.siteOrigin === OFFICIAL_STAGING_SITE_ORIGIN
    && value.supabaseOrigin === OFFICIAL_STAGING_SUPABASE_ORIGIN
    && value.sourceRevision === identity.sourceRevision
    && value.deploymentId === identity.deploymentId
    && value.branchRef === OFFICIAL_STAGING_BRANCH
    && value.readyState === READY_STATE
}

function exactNormalResult(value, stepId) {
  return hasExactFields(value, ['stepId', 'status'])
    && value.stepId === stepId
    && (value.status === 'passed' || value.status === 'failed')
}

function exactNativeResult(value) {
  if (exactNormalResult(value, REGISTER_RELEASE_STEP_ID)) {
    return Object.freeze({ status: value.status, releaseIdentity: null })
  }
  if (!hasExactFields(value, ['stepId', 'status', 'releaseIdentity'])
    || value.stepId !== REGISTER_RELEASE_STEP_ID
    || value.status !== 'passed') {
    return null
  }
  const releaseIdentity = parseReleaseIdentity(value.releaseIdentity)
  return releaseIdentity ? Object.freeze({ status: 'passed', releaseIdentity }) : null
}

/**
 * Route one issued S5 request to closure-private capabilities. This adapter
 * owns no credentials and returns only coarse step state plus the non-secret
 * release binding from the one native registration step.
 */
export function createSebStagingCompositeAdapter({
  preflightCapability,
  fixtureAdapter,
  browserDataCapability,
  nativeOperatorCapability,
  expiryControlCapability,
  runReservationCapability,
} = {}) {
  if (!validPreflightCapability(preflightCapability)
    || !validExecutableCapability(fixtureAdapter)
    || !validExecutableCapability(browserDataCapability)
    || !validExecutableCapability(nativeOperatorCapability)
    || !validExecutableCapability(expiryControlCapability)
    || !validExecutableCapability(runReservationCapability)) {
    blocked()
  }

  const attemptedSteps = new Set()
  let baseIdentity = null
  let declaredReleaseIdentity = null
  let boundReleaseIdentity = null
  let preflightPassed = false
  let cleanupStarted = false
  let journeyFailed = false
  let nextJourneyIndex = 0
  let busy = false

  async function executePreflight(request, identity) {
    let attestation
    try {
      attestation = await preflightCapability.attest(request)
    } catch {
      return redactedResult(request.stepId, 'failed')
    }
    if (!exactPreflightAttestation(attestation, identity)) {
      return redactedResult(request.stepId, 'failed')
    }
    preflightPassed = true
    return redactedResult(request.stepId, 'passed')
  }

  async function executeDelegated(capability, request) {
    let childResult
    try {
      childResult = await capability.executeStep(request)
    } catch {
      return redactedResult(request.stepId, 'failed')
    }
    return exactNormalResult(childResult, request.stepId)
      ? redactedResult(request.stepId, childResult.status)
      : redactedResult(request.stepId, 'failed')
  }

  async function executeNative(request) {
    let childResult
    try {
      childResult = await nativeOperatorCapability.executeStep(request)
    } catch {
      return redactedResult(request.stepId, 'failed')
    }
    const parsed = exactNativeResult(childResult)
    if (!parsed || parsed.status !== 'passed' || !parsed.releaseIdentity) {
      return redactedResult(request.stepId, 'failed')
    }
    if (declaredReleaseIdentity && !sameReleaseIdentity(parsed.releaseIdentity, declaredReleaseIdentity)) {
      return redactedResult(request.stepId, 'failed')
    }
    boundReleaseIdentity = parsed.releaseIdentity
    return Object.freeze({
      stepId: REGISTER_RELEASE_STEP_ID,
      status: 'passed',
      releaseIdentity: boundReleaseIdentity,
    })
  }

  async function executeStepInternal(request) {
    const expected = STEP_BY_ID.get(request?.stepId)
    if (busy || !expected || !exactRequest(request, expected)) {
      return redactedResult(request?.stepId, 'failed')
    }
    const identity = parseRequestIdentity(request.identity)
    if (!identity) return redactedResult(request.stepId, 'failed')
    if (!baseIdentity) {
      if (request.stepId !== PREFLIGHT_STEP_ID) return redactedResult(request.stepId, 'failed')
      baseIdentity = identity
      declaredReleaseIdentity = identity.releaseIdentity
    } else if (!sameBaseIdentity(baseIdentity, identity)) {
      return redactedResult(request.stepId, 'failed')
    }
    const requiredRelease = boundReleaseIdentity ?? declaredReleaseIdentity
    if (requiredRelease && !sameReleaseIdentity(identity.releaseIdentity, requiredRelease)) {
      return redactedResult(request.stepId, 'failed')
    }
    if (!requiredRelease && identity.releaseIdentity && request.stepId !== PREFLIGHT_STEP_ID) {
      return redactedResult(request.stepId, 'failed')
    }
    if (cleanupStarted && request.stepId !== CLEANUP_STEP_ID) {
      return redactedResult(request.stepId, 'failed')
    }
    if (journeyFailed && request.stepId !== CLEANUP_STEP_ID) {
      return redactedResult(request.stepId, 'failed')
    }
    if (request.stepId !== PREFLIGHT_STEP_ID && request.stepId !== CLEANUP_STEP_ID && !preflightPassed) {
      return redactedResult(request.stepId, 'failed')
    }
    if (request.stepId !== CLEANUP_STEP_ID
      && STEP_CONTRACTS[nextJourneyIndex]?.stepId !== request.stepId) {
      return redactedResult(request.stepId, 'failed')
    }
    if (request.stepId !== CLEANUP_STEP_ID && attemptedSteps.has(request.stepId)) {
      return redactedResult(request.stepId, 'failed')
    }

    if (request.stepId === CLEANUP_STEP_ID) cleanupStarted = true
    else attemptedSteps.add(request.stepId)
    busy = true
    try {
      let result
      if (expected.route === 'preflight') result = await executePreflight(request, identity)
      if (expected.route === 'fixture' || expected.route === 'cleanup') {
        result = await executeDelegated(fixtureAdapter, request)
      }
      if (expected.route === 'browser') result = await executeDelegated(browserDataCapability, request)
      if (expected.route === 'expiry') result = await executeDelegated(expiryControlCapability, request)
      if (expected.route === 'reservation') result = await executeDelegated(runReservationCapability, request)
      if (expected.route === 'native') result = await executeNative(request)
      if (!result) result = redactedResult(request.stepId, 'failed')

      if (request.stepId !== CLEANUP_STEP_ID) {
        if (result.status === 'passed') nextJourneyIndex += 1
        else journeyFailed = true
      }
      return result
    } finally {
      busy = false
    }
  }

  async function executeStep(request) {
    try {
      return await executeStepInternal(request)
    } catch {
      return redactedResult('invalid-step', 'failed')
    }
  }

  return Object.freeze({ executeStep })
}

export function listSebStagingCompositeStepContracts() {
  return Object.freeze(STEP_CONTRACTS.map(value => Object.freeze({ ...value })))
}
