const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const FORBIDDEN_RUN_ID_TERMS = /(prod(?:uction)?|live|real|customer)/
const BLOCKED_MESSAGE = 'SEB Staging fixture adapter blocked'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const UUID_PART = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const PERSONAL_ORGANIZATION_ID = new RegExp(`^${UUID_PART}:${UUID_PART}$`)
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const RELEASE_ID = /^asr-[0-9a-f]{32}-r([1-9][0-9]{0,9})-([0-9a-f]{16})$/
const SHA256 = /^[a-f0-9]{64}$/
const MAX_ASSIGNMENT_CONFIG_REVISION = 2_147_483_646
const MAX_CREATION_WINDOW_MS = 24 * 60 * 60 * 1_000
const MIN_AUTH_BOUNDARY_TIMEOUT_MS = 10
const MAX_AUTH_BOUNDARY_TIMEOUT_MS = 30_000
const DEFAULT_AUTH_BOUNDARY_TIMEOUT_MS = 5_000
const QA_SCHEMA_VERSION = 1
const RANDOM_BYTE_COUNT = 32
const AUTH_RECONCILIATION_PER_PAGE = 100
const AUTH_RECONCILIATION_MAX_PAGES = 10
const USED_RUN_IDS = new Set()

const ACCOUNT_STEPS = Object.freeze([
  Object.freeze({
    stepId: 'provision-synthetic-teacher',
    alias: 'teacher-primary',
    emailAlias: 'tp',
    role: 'teacher',
    fullName: 'SEB S5 Teacher Primary',
  }),
  Object.freeze({
    stepId: 'provision-unrelated-teacher',
    alias: 'teacher-unrelated',
    emailAlias: 'tu',
    role: 'teacher',
    fullName: 'SEB S5 Teacher Unrelated',
  }),
  Object.freeze({
    stepId: 'provision-synthetic-student',
    alias: 'student-primary',
    emailAlias: 'sp',
    role: 'student',
    fullName: 'SEB S5 Student Primary',
  }),
  Object.freeze({
    stepId: 'provision-secondary-student',
    alias: 'student-secondary',
    emailAlias: 'ss',
    role: 'student',
    fullName: 'SEB S5 Student Secondary',
  }),
])
const ACCOUNT_STEP_BY_ID = new Map(ACCOUNT_STEPS.map((spec, index) => [spec.stepId, { spec, index }]))
const AUTHENTICATION_STEPS = Object.freeze([
  Object.freeze({ stepId: 'authenticate-teacher', phase: 'teacher-setup', actor: 'teacher', alias: 'teacher-primary' }),
  Object.freeze({ stepId: 'authenticate-student-for-enrolment', phase: 'student-enrolment', actor: 'student', alias: 'student-primary' }),
  Object.freeze({ stepId: 'authenticate-secondary-student-for-enrolment', phase: 'student-enrolment', actor: 'student-secondary', alias: 'student-secondary' }),
  Object.freeze({ stepId: 'authenticate-teacher-for-assignment', phase: 'teacher-setup', actor: 'teacher', alias: 'teacher-primary' }),
  Object.freeze({ stepId: 'authenticate-student', phase: 'student-journey', actor: 'student', alias: 'student-primary' }),
  Object.freeze({ stepId: 'authenticate-teacher-for-result', phase: 'teacher-result', actor: 'teacher', alias: 'teacher-primary' }),
  Object.freeze({ stepId: 'authenticate-secondary-student', phase: 'authorization', actor: 'student-secondary', alias: 'student-secondary' }),
  Object.freeze({ stepId: 'authenticate-unrelated-teacher', phase: 'authorization', actor: 'teacher-unrelated', alias: 'teacher-unrelated' }),
])
const AUTHENTICATION_STEP_BY_ID = new Map(AUTHENTICATION_STEPS.map(spec => [spec.stepId, spec]))
const CLEANUP_STEP_ID = 'cleanup-synthetic-fixture'
const LEDGER_METHODS = Object.freeze([
  'planTarget',
  'adoptDerivedTarget',
  'markUncertain',
  'commitTarget',
  'reconcileTarget',
  'readCleanupTarget',
  'markDeleted',
])

export class SebStagingFixtureAdapterBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingFixtureAdapterBlockedError'
  }
}

function blocked() {
  throw new SebStagingFixtureAdapterBlockedError()
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
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

function canonicalTimestamp(value) {
  if (typeof value !== 'string'
    || value.length < 20
    || value.length > 64
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return null
  }
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  return Object.freeze({ timestamp, iso: new Date(timestamp).toISOString() })
}

function clockTimestamp(clock) {
  let value
  try {
    value = clock()
  } catch {
    return null
  }
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function parseRunIdentity(value) {
  if (!hasExactFields(value, [
    'runId', 'sourceRevision', 'deploymentId', 'creationWindow',
  ]) || !hasExactFields(value.creationWindow, ['notBefore', 'notAfter'])) return null
  const notBefore = canonicalTimestamp(value.creationWindow.notBefore)
  const notAfter = canonicalTimestamp(value.creationWindow.notAfter)
  if (typeof value.runId !== 'string'
    || !SAFE_RUN_ID.test(value.runId)
    || value.runId === 'seb-s5-preview'
    || FORBIDDEN_RUN_ID_TERMS.test(value.runId)
    || typeof value.sourceRevision !== 'string'
    || !SOURCE_REVISION.test(value.sourceRevision)
    || typeof value.deploymentId !== 'string'
    || !DEPLOYMENT_ID.test(value.deploymentId)
    || !notBefore
    || !notAfter
    || notAfter.timestamp <= notBefore.timestamp
    || notAfter.timestamp - notBefore.timestamp > MAX_CREATION_WINDOW_MS) return null
  return Object.freeze({
    runId: value.runId,
    sourceRevision: value.sourceRevision,
    deploymentId: value.deploymentId,
    creationWindow: Object.freeze({
      notBefore: notBefore.iso,
      notAfter: notAfter.iso,
    }),
  })
}

function parseRequestIdentity(identity, runIdentity) {
  const runOnly = hasExactFields(identity, ['runId', 'sourceRevision', 'deploymentId'])
  const releaseBound = hasExactFields(identity, [
    'runId', 'sourceRevision', 'deploymentId', 'releaseId', 'releaseRevision', 'artifactSha256',
  ])
  if (!runOnly && !releaseBound) return null
  if (identity.runId !== runIdentity.runId
    || identity.sourceRevision !== runIdentity.sourceRevision
    || identity.deploymentId !== runIdentity.deploymentId) return null
  const parsed = {
    runId: runIdentity.runId,
    sourceRevision: runIdentity.sourceRevision,
    deploymentId: runIdentity.deploymentId,
  }
  if (releaseBound) {
    const releaseMatch = typeof identity.releaseId === 'string'
      ? RELEASE_ID.exec(identity.releaseId)
      : null
    if (releaseMatch === null
      || !Number.isInteger(identity.releaseRevision)
      || identity.releaseRevision < 1
      || identity.releaseRevision > MAX_ASSIGNMENT_CONFIG_REVISION
      || Number(releaseMatch[1]) !== identity.releaseRevision
      || typeof identity.artifactSha256 !== 'string'
      || !SHA256.test(identity.artifactSha256)
      || releaseMatch[2] !== identity.artifactSha256.slice(0, 16)) return null
    parsed.releaseId = identity.releaseId
    parsed.releaseRevision = identity.releaseRevision
    parsed.artifactSha256 = identity.artifactSha256
  }
  return Object.freeze(parsed)
}

function hasOfficialStagingPolicy(environment) {
  return isDataRecord(environment)
    && environment.KORKRU_DEPLOYMENT_ENV === 'staging'
    && environment.EXAM_QA_ENVIRONMENT === 'staging'
    && environment.VERCEL_ENV === 'preview'
    && environment.NEXT_PUBLIC_SITE_URL === OFFICIAL_STAGING_SITE_ORIGIN
    && environment.NEXT_PUBLIC_SUPABASE_URL === OFFICIAL_STAGING_SUPABASE_ORIGIN
    && environment.EXAM_QA_DATA_POLICY === 'synthetic-only'
    && environment.EXAM_QA_COPY_PRODUCTION_DATA === 'false'
}

function permitsCreation(environment) {
  return hasOfficialStagingPolicy(environment)
    && environment.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'true'
}

function permitsCleanup(environment) {
  return hasOfficialStagingPolicy(environment)
    && (environment.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'true'
      || environment.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'false')
}

function redactedResult(stepId, status) {
  return Object.freeze({ stepId, status })
}

function bytesToHex(bytes) {
  let value = ''
  for (const byte of bytes) value += byte.toString(16).padStart(2, '0')
  return value
}

function runtimeAccountInput(spec, index, namespace, createdAt, randomBytes) {
  const bytes = randomBytes(RANDOM_BYTE_COUNT)
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== RANDOM_BYTE_COUNT) blocked()
  const token = bytesToHex(bytes)
  const email = `seb-s5-${spec.emailAlias}-${token.slice(0, 20)}@qa.staging.korkru.com`
  const password = `Aa1!${token}${index}`
  return {
    expected: Object.freeze({ alias: spec.alias, role: spec.role, namespace, email }),
    password,
    attributes: {
      email,
      password,
      email_confirm: true,
      user_metadata: Object.freeze({
        full_name: spec.fullName,
        role: spec.role,
        survey_role: spec.role,
        qa_fixture: 'seb-s5',
        qa_namespace: namespace,
        qa_role: spec.role,
        qa_alias: spec.alias,
        qa_schema_version: QA_SCHEMA_VERSION,
        qa_created_at: createdAt,
      }),
      app_metadata: Object.freeze({
        role: spec.role,
        qa_fixture: 'seb-s5',
        qa_namespace: namespace,
        qa_role: spec.role,
        qa_alias: spec.alias,
        qa_schema_version: QA_SCHEMA_VERSION,
      }),
    },
  }
}

function hasPlannedMetadata(actual, planned) {
  if (!isDataRecord(actual) || !isDataRecord(planned)) return false
  if (!Object.entries(planned).every(([key, value]) => actual[key] === value)) return false
  const plannedQaFields = Object.keys(planned).filter(key => key.startsWith('qa_')).sort()
  const actualQaFields = Object.keys(actual).filter(key => key.startsWith('qa_')).sort()
  return plannedQaFields.length === actualQaFields.length
    && plannedQaFields.every((key, index) => key === actualQaFields[index])
}

function recordFromPlannedUser(user, planned, runIdentity) {
  const id = clean(user?.id).toLowerCase()
  const createdAt = canonicalTimestamp(user?.created_at)
  const notBefore = Date.parse(runIdentity.creationWindow.notBefore)
  const notAfter = Date.parse(runIdentity.creationWindow.notAfter)
  if (!UUID.test(id)
    || user?.email !== planned.email
    || !hasPlannedMetadata(user?.user_metadata, planned.userMetadata)
    || !hasPlannedMetadata(user?.app_metadata, planned.appMetadata)
    || !createdAt
    || createdAt.timestamp < notBefore
    || createdAt.timestamp > notAfter) return null
  return Object.freeze({
    id,
    createdAt: createdAt.iso,
    stepId: planned.stepId,
    targetKey: planned.targetKey,
    email: planned.email,
    alias: planned.alias,
    role: planned.role,
    namespace: planned.namespace,
    userMetadata: planned.userMetadata,
    appMetadata: planned.appMetadata,
  })
}

function hasExpectedMetadata(user, record, runIdentity) {
  const candidate = recordFromPlannedUser(user, record, runIdentity)
  return candidate?.id === record.id && candidate.createdAt === record.createdAt
}

function captureAdminAttestation(value) {
  if (!hasExactFields(value, ['targetOrigin', 'credentialKind', 'client'])) return null
  try {
    const client = value.client
    const auth = client?.auth
    const admin = auth?.admin
    if (value.targetOrigin !== OFFICIAL_STAGING_SUPABASE_ORIGIN
      || value.credentialKind !== 'service-role'
      || client?.supabaseUrl !== OFFICIAL_STAGING_SUPABASE_ORIGIN
      || typeof admin?.createUser !== 'function'
      || typeof admin?.listUsers !== 'function'
      || typeof admin?.getUserById !== 'function'
      || typeof admin?.deleteUser !== 'function') return null
    return Object.freeze({
      wrapper: value,
      client,
      auth,
      admin,
      createUser: admin.createUser,
      listUsers: admin.listUsers,
      getUserById: admin.getUserById,
      deleteUser: admin.deleteUser,
    })
  } catch {
    return null
  }
}

function sameAdminAttestation(attestation) {
  if (!attestation) return false
  const current = captureAdminAttestation(attestation.wrapper)
  return current !== null
    && current.client === attestation.client
    && current.auth === attestation.auth
    && current.admin === attestation.admin
    && current.createUser === attestation.createUser
    && current.listUsers === attestation.listUsers
    && current.getUserById === attestation.getUserById
    && current.deleteUser === attestation.deleteUser
}

function captureLedgerAttestation(value) {
  if (!hasExactFields(value, LEDGER_METHODS)
    || !LEDGER_METHODS.every(method => typeof value[method] === 'function')) return null
  return Object.freeze({
    ledger: value,
    methods: Object.freeze(Object.fromEntries(
      LEDGER_METHODS.map(method => [method, value[method]]),
    )),
  })
}

function sameLedgerAttestation(attestation) {
  if (!attestation || !hasExactFields(attestation.ledger, LEDGER_METHODS)) return false
  return LEDGER_METHODS.every(method => attestation.ledger[method] === attestation.methods[method])
}

function exactPassed(value) {
  return hasExactFields(value, ['status']) && value.status === 'passed'
}

function parseLedgerRead(value) {
  if (!hasExactFields(value, ['status', 'state', 'snapshots'])
    || value.status !== 'passed'
    || !['planned', 'uncertain', 'committed', 'deleted'].includes(value.state)
    || !Array.isArray(value.snapshots)) return null
  return value
}

function freezeInput(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeInput))
  if (!isDataRecord(value)) return value
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, freezeInput(child)]),
  ))
}

function accountTargetKey(alias) {
  return `account-${alias}`
}

function personalOrganizationTargetKey(alias) {
  return `personal-organization-${alias}`
}

function ledgerReference(kind, targetKey) {
  return Object.freeze({ schemaVersion: 1, targetKey, kind })
}

function ledgerPlan(runIdentity, namespace, kind, targetKey, ownerId, resourceType) {
  return freezeInput({
    schemaVersion: 1,
    targetKey,
    kind,
    identity: runIdentity,
    namespace,
    ownerId,
    organizationId: null,
    resourceType,
  })
}

function ledgerCandidate(runIdentity, namespace, kind, targetKey, ownerId, resourceType, targetId, createdAt) {
  return freezeInput({
    schemaVersion: 1,
    targetKey,
    kind,
    identity: runIdentity,
    targetId,
    namespace,
    ownerId,
    organizationId: null,
    resourceType,
    createdAt,
  })
}

function isExactStepRequest(request, runIdentity, spec = null) {
  if (!hasExactFields(request, [
    'schemaVersion', 'stepId', 'phase', 'actor', 'mutates', 'identity',
  ]) || request.schemaVersion !== 1
    || request.mutates !== true
    || !parseRequestIdentity(request.identity, runIdentity)) return false
  if (spec) {
    return request.stepId === spec.stepId
      && request.phase === 'fixture'
      && request.actor === 'fixture-admin'
  }
  return request.stepId === CLEANUP_STEP_ID
    && request.phase === 'cleanup'
    && request.actor === 'fixture-admin'
}

function isExactAuthenticationRequest(request, runIdentity, spec) {
  return hasExactFields(request, [
    'schemaVersion', 'stepId', 'phase', 'actor', 'mutates', 'identity',
  ])
    && request.schemaVersion === 1
    && request.stepId === spec.stepId
    && request.phase === spec.phase
    && request.actor === spec.actor
    && request.mutates === false
    && parseRequestIdentity(request.identity, runIdentity) !== null
}

function validBrowserSessionCapability(value) {
  return value === undefined || (
    isDataRecord(value)
    && typeof value.authenticate === 'function'
    && typeof value.closeAll === 'function'
  )
}

function validResourceCleanupCapability(value) {
  return isDataRecord(value) && typeof value.cleanupRun === 'function'
}

function captureBrowserDataLifecycleCapability(value) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, ['executeStep', 'closeAll'])
    || typeof value.executeStep !== 'function'
    || typeof value.closeAll !== 'function') return null
  return Object.freeze({
    wrapper: value,
    executeStep: value.executeStep,
    closeAll: value.closeAll,
  })
}

function sameBrowserDataLifecycleCapability(attestation) {
  return attestation !== null
    && Object.isFrozen(attestation.wrapper)
    && hasExactFields(attestation.wrapper, ['executeStep', 'closeAll'])
    && attestation.wrapper.executeStep === attestation.executeStep
    && attestation.wrapper.closeAll === attestation.closeAll
}

function exactCleanupResult(value) {
  return hasExactFields(value, ['status']) && value.status === 'passed'
}

function exactAuthDeleteSuccess(value, record, runIdentity) {
  if (!hasExactFields(value, ['data', 'error'])
    || value.error !== null
    || !hasExactFields(value.data, ['user'])) return false
  return value.data.user === null
    || hasExpectedMetadata(value.data.user, record, runIdentity)
}

function exactAuthUserNotFound(value) {
  return hasExactFields(value, ['data', 'error'])
    && hasExactFields(value.data, ['user'])
    && value.data.user === null
    && value.error !== null
    && typeof value.error === 'object'
    && value.error.code === 'user_not_found'
}

function hasExpectedSessionAttestation(attestation, record) {
  const appMetadata = attestation?.appMetadata
  return isDataRecord(attestation)
    && attestation.targetOrigin === OFFICIAL_STAGING_SITE_ORIGIN
    && clean(attestation.authenticatedUserId).toLowerCase() === record.id
    && isDataRecord(appMetadata)
    && appMetadata.qa_fixture === 'seb-s5'
    && appMetadata.qa_namespace === record.namespace
    && appMetadata.qa_role === record.role
    && appMetadata.qa_alias === record.alias
    && appMetadata.role === record.role
    && appMetadata.qa_schema_version === QA_SCHEMA_VERSION
}

/**
 * Build a single-use, closure-private fixture adapter for official KorKru
 * Staging. Auth mutations are planned in the private run ledger before they
 * can start. A step passes only after both the exact Auth account and its
 * trigger-created personal organization are committed to that ledger.
 */
export function createSebStagingFixtureAdapter({
  readEnvironment,
  runId,
  runIdentity: runIdentityInput,
  privateRunLedger,
  adminClientFactory,
  browserSessionCapability,
  browserDataLifecycleCapability,
  resourceCleanupCapability,
  randomBytes,
  clock,
  authBoundaryTimeoutMs = DEFAULT_AUTH_BOUNDARY_TIMEOUT_MS,
} = {}) {
  const normalizedRunId = clean(runId)
  const runIdentity = parseRunIdentity(runIdentityInput)
  const ledgerAttestation = captureLedgerAttestation(privateRunLedger)
  const browserDataLifecycleAttestation = captureBrowserDataLifecycleCapability(
    browserDataLifecycleCapability,
  )
  let initialEnvironment = null
  try {
    initialEnvironment = typeof readEnvironment === 'function' ? readEnvironment() : null
  } catch {
    blocked()
  }
  const initialNow = typeof clock === 'function' ? clockTimestamp(clock) : null
  const notBefore = runIdentity ? Date.parse(runIdentity.creationWindow.notBefore) : null
  const notAfter = runIdentity ? Date.parse(runIdentity.creationWindow.notAfter) : null
  if (typeof readEnvironment !== 'function'
    || !permitsCreation(initialEnvironment)
    || !runIdentity
    || runIdentity.runId !== normalizedRunId
    || !SAFE_RUN_ID.test(normalizedRunId)
    || normalizedRunId === 'seb-s5-preview'
    || FORBIDDEN_RUN_ID_TERMS.test(normalizedRunId)
    || USED_RUN_IDS.has(normalizedRunId)
    || !ledgerAttestation
    || typeof adminClientFactory !== 'function'
    || !validBrowserSessionCapability(browserSessionCapability)
    || !browserDataLifecycleAttestation
    || !validResourceCleanupCapability(resourceCleanupCapability)
    || typeof randomBytes !== 'function'
    || typeof clock !== 'function'
    || initialNow === null
    || initialNow < notBefore
    || initialNow > notAfter
    || !Number.isInteger(authBoundaryTimeoutMs)
    || authBoundaryTimeoutMs < MIN_AUTH_BOUNDARY_TIMEOUT_MS
    || authBoundaryTimeoutMs > MAX_AUTH_BOUNDARY_TIMEOUT_MS) blocked()

  USED_RUN_IDS.add(normalizedRunId)
  const namespace = `qa:${normalizedRunId}`
  const createdAt = new Date(initialNow).toISOString()
  const plannedCreations = new Map()
  const accountRecords = new Map()
  const credentialVault = new Map()
  const attemptedSteps = new Set()
  const attemptedAuthenticationSteps = new Set()
  const personalOrganizationPlans = new Set()
  const uncertainDeletes = new Set()
  const pendingPrivilegedOperations = new Set()
  let nextAccountIndex = 0
  let adminAttestation = null
  let busy = false
  let cleanupStarted = false
  let sessionsClosed = false
  let browserDataClosed = false
  let resourcesCleaned = false
  let resourceCleanupRequest = null

  function currentEnvironment(kind) {
    let environment
    try {
      environment = readEnvironment()
    } catch {
      blocked()
    }
    if (kind === 'create' ? !permitsCreation(environment) : !permitsCleanup(environment)) blocked()
    return environment
  }

  function creationWindowIsActive() {
    const now = clockTimestamp(clock)
    return now !== null && now >= notBefore && now <= notAfter
  }

  function assertLedgerStable() {
    if (!sameLedgerAttestation(ledgerAttestation)) blocked()
  }

  function ledgerCall(method, ...args) {
    assertLedgerStable()
    let result
    try {
      result = ledgerAttestation.methods[method].call(privateRunLedger, ...args)
    } catch {
      blocked()
    }
    assertLedgerStable()
    return result
  }

  async function ledgerCallAsync(method, ...args) {
    assertLedgerStable()
    let result
    try {
      result = await ledgerAttestation.methods[method].call(privateRunLedger, ...args)
    } catch {
      blocked()
    }
    assertLedgerStable()
    return result
  }

  async function trackedBoundary(kind, operation) {
    currentEnvironment(kind)
    const controller = new AbortController()
    let timeoutHandle = null
    const task = Promise.resolve().then(() => operation(controller.signal))
    pendingPrivilegedOperations.add(task)
    task.finally(() => pendingPrivilegedOperations.delete(task)).catch(() => {})
    const timeout = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort()
        reject(new SebStagingFixtureAdapterBlockedError())
      }, authBoundaryTimeoutMs)
    })
    try {
      const result = await Promise.race([task, timeout])
      if (controller.signal.aborted) blocked()
      currentEnvironment(kind)
      return result
    } finally {
      if (timeoutHandle !== null) clearTimeout(timeoutHandle)
    }
  }

  function assertAdminStable() {
    if (!sameAdminAttestation(adminAttestation)) blocked()
    return adminAttestation
  }

  async function ensureAdminClient(kind) {
    currentEnvironment(kind)
    if (adminAttestation) return assertAdminStable()
    const candidate = await trackedBoundary(kind, signal => adminClientFactory(Object.freeze({
      targetOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
      credentialKind: 'service-role',
      signal,
    })))
    const captured = captureAdminAttestation(candidate)
    if (!captured) blocked()
    adminAttestation = captured
    currentEnvironment(kind)
    return assertAdminStable()
  }

  async function adminCall(kind, invoke) {
    const attestation = await ensureAdminClient(kind)
    if (!sameAdminAttestation(attestation)) blocked()
    const result = await trackedBoundary(kind, signal => {
      if (!sameAdminAttestation(attestation)) blocked()
      return invoke(attestation, signal)
    })
    if (!sameAdminAttestation(attestation)) blocked()
    return result
  }

  async function createAuthUser(attributes) {
    // Do not scrub the object observed by an in-flight SDK call until that
    // call really settles. A timeout only ends our wait; a transport that
    // ignores AbortSignal may still read this payload before committing.
    const ephemeralAttributes = {
      ...attributes,
      user_metadata: { ...attributes.user_metadata },
      app_metadata: { ...attributes.app_metadata },
    }
    return adminCall('create', (attestation, signal) => Promise.resolve(
      attestation.createUser.call(
        attestation.admin,
        ephemeralAttributes,
        Object.freeze({ signal }),
      ),
    ).finally(() => {
      ephemeralAttributes.email = ''
      ephemeralAttributes.password = ''
    }))
  }

  async function listAuthUsers(params) {
    return adminCall('cleanup', (attestation, signal) => (
      attestation.listUsers.call(attestation.admin, params, Object.freeze({ signal }))
    ))
  }

  async function getAuthUser(id) {
    return adminCall('cleanup', (attestation, signal) => (
      attestation.getUserById.call(attestation.admin, id, Object.freeze({ signal }))
    ))
  }

  async function deleteAuthUser(id) {
    return adminCall('cleanup', (attestation, signal) => (
      // Keep Supabase's positional shouldSoftDelete flag false. A private
      // wrapper may consume the third AbortSignal option.
      attestation.deleteUser.call(attestation.admin, id, false, Object.freeze({ signal }))
    ))
  }

  function planAccount(spec, planned) {
    if (!exactPassed(ledgerCall('planTarget', ledgerPlan(
      runIdentity,
      namespace,
      'account',
      planned.targetKey,
      null,
      spec.role,
    )))) blocked()
    if (!exactPassed(ledgerCall(
      'markUncertain',
      ledgerReference('account', planned.targetKey),
    ))) blocked()
  }

  function commitAccount(record) {
    const candidate = ledgerCandidate(
      runIdentity,
      namespace,
      'account',
      record.targetKey,
      null,
      record.role,
      record.id,
      record.createdAt,
    )
    if (!exactPassed(ledgerCall(
      'commitTarget',
      ledgerReference('account', record.targetKey),
      candidate,
    ))) blocked()
    accountRecords.set(record.targetKey, record)
  }

  function readLedgerTarget(kind, targetKey) {
    return parseLedgerRead(ledgerCall(
      'readCleanupTarget',
      ledgerReference(kind, targetKey),
    ))
  }

  async function ensurePersonalOrganization(record, requirePresent) {
    const targetKey = personalOrganizationTargetKey(record.alias)
    const reference = ledgerReference('personalOrganization', targetKey)
    if (!personalOrganizationPlans.has(targetKey)) {
      const plan = ledgerPlan(
        runIdentity,
        namespace,
        'personalOrganization',
        targetKey,
        record.id,
        'personal',
      )
      const planned = exactPassed(ledgerCall('planTarget', plan))
      if (planned) {
        if (!exactPassed(ledgerCall('markUncertain', reference))) blocked()
      } else if (!exactPassed(ledgerCall(
        'adoptDerivedTarget',
        plan,
        ledgerReference('account', record.targetKey),
      ))) blocked()
      personalOrganizationPlans.add(targetKey)
    }
    let state = readLedgerTarget('personalOrganization', targetKey)
    if (!state) blocked()
    if (state.state === 'uncertain') {
      if (!exactPassed(await ledgerCallAsync('reconcileTarget', reference))) blocked()
      state = readLedgerTarget('personalOrganization', targetKey)
    }
    if (!state) blocked()
    if (state.state === 'deleted' && state.snapshots.length === 0 && !requirePresent) return
    if (state.state !== 'committed' || state.snapshots.length !== 1) blocked()
    const snapshot = state.snapshots[0]
    if (!hasExactFields(snapshot, [
      'schemaVersion', 'targetKey', 'kind', 'identity', 'targetId', 'namespace',
      'ownerId', 'organizationId', 'resourceType', 'createdAt',
    ])
      || snapshot.schemaVersion !== 1
      || snapshot.targetKey !== targetKey
      || snapshot.kind !== 'personalOrganization'
      || snapshot.namespace !== namespace
      || snapshot.ownerId !== record.id
      || snapshot.organizationId !== null
      || snapshot.resourceType !== 'personal'
      || !PERSONAL_ORGANIZATION_ID.test(snapshot.targetId)) blocked()
  }

  async function findExactPlannedUser(planned) {
    const matches = []
    let expectedTotal = null
    for (let page = 1; page <= AUTH_RECONCILIATION_MAX_PAGES; page += 1) {
      const response = await listAuthUsers(Object.freeze({
        page,
        perPage: AUTH_RECONCILIATION_PER_PAGE,
      }))
      const users = response?.data?.users
      const total = response?.data?.total
      const nextPage = response?.data?.nextPage
      if (response?.error
        || !Array.isArray(users)
        || users.length > AUTH_RECONCILIATION_PER_PAGE
        || !Number.isInteger(total)
        || total < 0
        || total > AUTH_RECONCILIATION_PER_PAGE * AUTH_RECONCILIATION_MAX_PAGES
        || (nextPage !== null && !Number.isInteger(nextPage))) blocked()
      if (expectedTotal === null) expectedTotal = total
      if (total !== expectedTotal) blocked()
      for (const user of users) {
        if (user?.email !== planned.email) continue
        const record = recordFromPlannedUser(user, planned, runIdentity)
        if (!record) blocked()
        matches.push(record)
        if (matches.length > 1) blocked()
      }
      const scannedCount = (page - 1) * AUTH_RECONCILIATION_PER_PAGE + users.length
      if (scannedCount > total) blocked()
      if (scannedCount === total) {
        if (nextPage !== null) blocked()
        return matches.length === 1 ? matches[0] : null
      }
      if (users.length !== AUTH_RECONCILIATION_PER_PAGE || nextPage !== page + 1) blocked()
    }
    blocked()
  }

  async function reconcileAccount(planned) {
    const reference = ledgerReference('account', planned.targetKey)
    let state = readLedgerTarget('account', planned.targetKey)
    if (!state) blocked()
    if (state.state === 'uncertain') {
      if (!exactPassed(await ledgerCallAsync('reconcileTarget', reference))) blocked()
      state = readLedgerTarget('account', planned.targetKey)
    }
    if (!state) blocked()
    if (state.state === 'deleted' && state.snapshots.length === 0) {
      accountRecords.delete(planned.targetKey)
      credentialVault.delete(planned.alias)
      return null
    }
    if (state.state !== 'committed' || state.snapshots.length !== 1) blocked()
    const snapshot = state.snapshots[0]
    if (snapshot?.targetKey !== planned.targetKey
      || snapshot?.kind !== 'account'
      || snapshot?.namespace !== namespace
      || snapshot?.ownerId !== null
      || snapshot?.organizationId !== null
      || snapshot?.resourceType !== planned.role
      || !UUID.test(snapshot?.targetId)) blocked()
    let record = accountRecords.get(planned.targetKey)
    if (!record) {
      record = await findExactPlannedUser(planned)
      if (!record || record.id !== snapshot.targetId || record.createdAt !== snapshot.createdAt) blocked()
      accountRecords.set(planned.targetKey, record)
    }
    if (record.id !== snapshot.targetId || record.createdAt !== snapshot.createdAt) blocked()
    return record
  }

  async function collectCommittedAccounts() {
    const records = []
    const ids = new Set()
    const aliases = new Set()
    for (const planned of plannedCreations.values()) {
      const record = await reconcileAccount(planned)
      if (!record) continue
      if (ids.has(record.id) || aliases.has(record.alias)) blocked()
      ids.add(record.id)
      aliases.add(record.alias)
      await ensurePersonalOrganization(record, false)
      records.push(record)
    }
    const committedRecords = [...accountRecords.values()]
    if (committedRecords.length !== records.length
      || committedRecords.some(record => !ids.has(record.id))) blocked()
    return records
  }

  async function provisionAccount(request, spec, accountIndex) {
    if (busy
      || cleanupStarted
      || !creationWindowIsActive()
      || !isExactStepRequest(request, runIdentity, spec)
      || attemptedSteps.has(spec.stepId)
      || accountIndex !== nextAccountIndex) return redactedResult(spec.stepId, 'failed')
    attemptedSteps.add(spec.stepId)
    busy = true
    let input = null
    try {
      currentEnvironment('create')
      input = runtimeAccountInput(spec, accountIndex, namespace, createdAt, randomBytes)
      const planned = Object.freeze({
        stepId: spec.stepId,
        targetKey: accountTargetKey(spec.alias),
        email: input.expected.email,
        alias: input.expected.alias,
        role: input.expected.role,
        namespace: input.expected.namespace,
        userMetadata: input.attributes.user_metadata,
        appMetadata: input.attributes.app_metadata,
      })
      plannedCreations.set(spec.stepId, planned)
      planAccount(spec, planned)
      credentialVault.set(spec.alias, Object.freeze({
        email: input.expected.email,
        password: input.password,
      }))
      const response = await createAuthUser(input.attributes)
      const returnedUser = response?.data?.user
      const record = response?.error
        ? null
        : recordFromPlannedUser(returnedUser, planned, runIdentity)
      if (!record || accountRecords.has(planned.targetKey)) {
        credentialVault.delete(spec.alias)
        return redactedResult(spec.stepId, 'failed')
      }
      commitAccount(record)
      await ensurePersonalOrganization(record, true)
      nextAccountIndex += 1
      return redactedResult(spec.stepId, 'passed')
    } catch {
      credentialVault.delete(spec.alias)
      return redactedResult(spec.stepId, 'failed')
    } finally {
      if (input) {
        input.password = ''
        input.attributes.password = ''
        input.attributes.email = ''
      }
      busy = false
    }
  }

  async function authenticateAccount(request, spec) {
    if (busy
      || cleanupStarted
      || !browserSessionCapability
      || !isExactAuthenticationRequest(request, runIdentity, spec)
      || attemptedAuthenticationSteps.has(spec.stepId)) return redactedResult(spec.stepId, 'failed')
    const record = accountRecords.get(accountTargetKey(spec.alias))
    const credential = credentialVault.get(spec.alias)
    if (!record || !credential) return redactedResult(spec.stepId, 'failed')
    attemptedAuthenticationSteps.add(spec.stepId)
    busy = true
    const ephemeralCredentials = { email: credential.email, password: credential.password }
    try {
      currentEnvironment('create')
      const attestation = await browserSessionCapability.authenticate({
        targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
        alias: record.alias,
        role: record.role,
        namespace: record.namespace,
        expectedUserId: record.id,
        credentials: ephemeralCredentials,
      })
      currentEnvironment('create')
      return redactedResult(
        spec.stepId,
        hasExpectedSessionAttestation(attestation, record) ? 'passed' : 'failed',
      )
    } catch {
      return redactedResult(spec.stepId, 'failed')
    } finally {
      ephemeralCredentials.email = ''
      ephemeralCredentials.password = ''
      busy = false
    }
  }

  function markAccountDeleted(record) {
    return exactPassed(ledgerCall(
      'markDeleted',
      ledgerReference('account', record.targetKey),
      Object.freeze({ schemaVersion: 1, targetId: record.id }),
    ))
  }

  async function cleanup(request) {
    if (busy || !isExactStepRequest(request, runIdentity)) {
      return redactedResult(CLEANUP_STEP_ID, 'failed')
    }
    cleanupStarted = true
    busy = true
    let failed = false
    try {
      currentEnvironment('cleanup')
      if (!sessionsClosed && browserSessionCapability) {
        try {
          const closeResult = await browserSessionCapability.closeAll()
          sessionsClosed = exactCleanupResult(closeResult) && Object.isFrozen(closeResult)
          if (!sessionsClosed) failed = true
        } catch {
          failed = true
        }
        currentEnvironment('cleanup')
      }
      if (browserSessionCapability && !sessionsClosed) {
        return redactedResult(CLEANUP_STEP_ID, 'failed')
      }
      if (!browserDataClosed) {
        try {
          currentEnvironment('cleanup')
          if (!sameBrowserDataLifecycleCapability(browserDataLifecycleAttestation)) blocked()
          const closeResult = await browserDataLifecycleAttestation.closeAll.call(
            browserDataLifecycleCapability,
          )
          if (!sameBrowserDataLifecycleCapability(browserDataLifecycleAttestation)) blocked()
          browserDataClosed = exactCleanupResult(closeResult) && Object.isFrozen(closeResult)
          if (!browserDataClosed) failed = true
        } catch {
          failed = true
        }
        currentEnvironment('cleanup')
      }
      if (!browserDataClosed) {
        return redactedResult(CLEANUP_STEP_ID, 'failed')
      }
      if (pendingPrivilegedOperations.size > 0) {
        return redactedResult(CLEANUP_STEP_ID, 'failed')
      }
      let records
      try {
        records = await collectCommittedAccounts()
      } catch {
        return redactedResult(CLEANUP_STEP_ID, 'failed')
      }
      if (pendingPrivilegedOperations.size > 0) {
        return redactedResult(CLEANUP_STEP_ID, 'failed')
      }
      if (!resourcesCleaned) {
        if (!resourceCleanupRequest) {
          const cleanupIdentity = parseRequestIdentity(request.identity, runIdentity)
          if (!cleanupIdentity) blocked()
          const accounts = Object.freeze(records.map(record => Object.freeze({
            id: record.id,
            alias: record.alias,
            role: record.role,
            namespace: record.namespace,
          })))
          if (accounts.length !== records.length
            || accounts.some((account, index) => account.id !== records[index].id)) blocked()
          resourceCleanupRequest = Object.freeze({
            schemaVersion: 1,
            runId: normalizedRunId,
            namespace,
            identity: cleanupIdentity,
            accounts,
          })
        }
        try {
          currentEnvironment('cleanup')
          const cleanupResult = await resourceCleanupCapability.cleanupRun(resourceCleanupRequest)
          resourcesCleaned = exactCleanupResult(cleanupResult) && Object.isFrozen(cleanupResult)
          if (!resourcesCleaned) failed = true
        } catch {
          failed = true
        }
        currentEnvironment('cleanup')
      }
      if (!resourcesCleaned) return redactedResult(CLEANUP_STEP_ID, 'failed')

      for (let index = records.length - 1; index >= 0; index -= 1) {
        const record = records[index]
        try {
          currentEnvironment('cleanup')
          const readBack = await getAuthUser(record.id)
          if (uncertainDeletes.has(record.id) && exactAuthUserNotFound(readBack)) {
            if (!markAccountDeleted(record)) blocked()
            uncertainDeletes.delete(record.id)
            accountRecords.delete(record.targetKey)
            credentialVault.delete(record.alias)
            continue
          }
          if (readBack?.error || !hasExpectedMetadata(readBack?.data?.user, record, runIdentity)) {
            failed = true
            continue
          }
          uncertainDeletes.add(record.id)
          const deletion = await deleteAuthUser(record.id)
          if (!exactAuthDeleteSuccess(deletion, record, runIdentity)) {
            failed = true
            continue
          }
          const postDelete = await getAuthUser(record.id)
          if (!exactAuthUserNotFound(postDelete)) {
            failed = true
            continue
          }
          if (!markAccountDeleted(record)) {
            failed = true
            continue
          }
          uncertainDeletes.delete(record.id)
          accountRecords.delete(record.targetKey)
          credentialVault.delete(record.alias)
        } catch {
          failed = true
        }
        if (pendingPrivilegedOperations.size > 0) {
          failed = true
          break
        }
      }

      if (accountRecords.size === 0) credentialVault.clear()
      return redactedResult(
        CLEANUP_STEP_ID,
        failed || accountRecords.size > 0 || pendingPrivilegedOperations.size > 0
          ? 'failed'
          : 'passed',
      )
    } catch {
      return redactedResult(CLEANUP_STEP_ID, 'failed')
    } finally {
      busy = false
    }
  }

  async function executeStep(request) {
    const match = ACCOUNT_STEP_BY_ID.get(request?.stepId)
    if (match) return provisionAccount(request, match.spec, match.index)
    const authentication = AUTHENTICATION_STEP_BY_ID.get(request?.stepId)
    if (authentication) return authenticateAccount(request, authentication)
    if (request?.stepId === CLEANUP_STEP_ID) return cleanup(request)
    blocked()
  }

  return Object.freeze({ executeStep })
}
