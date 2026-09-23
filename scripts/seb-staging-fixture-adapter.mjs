const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const FORBIDDEN_RUN_ID_TERMS = /(prod(?:uction)?|live|real|customer)/
const BLOCKED_MESSAGE = 'SEB Staging fixture adapter blocked'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const RELEASE_ID = /^asr-[0-9a-f]{32}-r([1-9][0-9]{0,9})-([0-9a-f]{16})$/
const SHA256 = /^[a-f0-9]{64}$/
const MAX_ASSIGNMENT_CONFIG_REVISION = 2_147_483_646
const QA_SCHEMA_VERSION = 1
const RANDOM_BYTE_COUNT = 32
const AUTH_RECONCILIATION_PER_PAGE = 100
const AUTH_RECONCILIATION_MAX_PAGES = 10
const AUTH_RECONCILIATION_TIMEOUT_MS = 5_000
const CONFIRMED_NON_CREATING_AUTH_ERRORS = Object.freeze(new Map([
  ['email_address_invalid', Object.freeze(new Set([400, 422]))],
  ['validation_failed', Object.freeze(new Set([400, 422]))],
  ['weak_password', Object.freeze(new Set([400, 422]))],
]))
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

export class SebStagingFixtureAdapterBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingFixtureAdapterBlockedError'
  }
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

function parseRequestIdentity(identity, runId) {
  const runOnly = hasExactFields(identity, ['runId', 'sourceRevision', 'deploymentId'])
  const releaseBound = hasExactFields(identity, [
    'runId',
    'sourceRevision',
    'deploymentId',
    'releaseId',
    'releaseRevision',
    'artifactSha256',
  ])
  if (!runOnly && !releaseBound) return null
  if (identity.runId !== runId
    || typeof identity.sourceRevision !== 'string'
    || !SOURCE_REVISION.test(identity.sourceRevision)
    || typeof identity.deploymentId !== 'string'
    || !DEPLOYMENT_ID.test(identity.deploymentId)) {
    return null
  }

  const parsed = {
    runId,
    sourceRevision: identity.sourceRevision,
    deploymentId: identity.deploymentId,
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
      || releaseMatch[2] !== identity.artifactSha256.slice(0, 16)) {
      return null
    }
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

function isUniqueSafeRunId(runId) {
  return SAFE_RUN_ID.test(runId)
    && runId !== 'seb-s5-preview'
    && !FORBIDDEN_RUN_ID_TERMS.test(runId)
    && !USED_RUN_IDS.has(runId)
}

function blocked() {
  throw new SebStagingFixtureAdapterBlockedError()
}

function redactedResult(stepId, status) {
  return Object.freeze({ stepId, status })
}

function isConfirmedNonCreatingAuthError(error) {
  try {
    const statuses = CONFIRMED_NON_CREATING_AUTH_ERRORS.get(error?.code)
    return statuses?.has(error?.status) === true
  } catch {
    return false
  }
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
  const userMetadata = Object.freeze({
    full_name: spec.fullName,
    role: spec.role,
    survey_role: spec.role,
    qa_fixture: 'seb-s5',
    qa_namespace: namespace,
    qa_role: spec.role,
    qa_alias: spec.alias,
    qa_schema_version: QA_SCHEMA_VERSION,
    qa_created_at: createdAt,
  })
  const appMetadata = Object.freeze({
    role: spec.role,
    qa_fixture: 'seb-s5',
    qa_namespace: namespace,
    qa_role: spec.role,
    qa_alias: spec.alias,
    qa_schema_version: QA_SCHEMA_VERSION,
  })

  return {
    expected: Object.freeze({
      stepId: spec.stepId,
      alias: spec.alias,
      role: spec.role,
      namespace,
      email,
    }),
    password,
    attributes: {
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
      app_metadata: appMetadata,
    },
  }
}

function hasPlannedMetadata(actual, planned) {
  if (!isDataRecord(actual) || !isDataRecord(planned)) return false
  const plannedEntries = Object.entries(planned)
  if (!plannedEntries.every(([key, value]) => actual[key] === value)) return false

  const plannedQaFields = Object.keys(planned).filter(key => key.startsWith('qa_')).sort()
  const actualQaFields = Object.keys(actual).filter(key => key.startsWith('qa_')).sort()
  return plannedQaFields.length === actualQaFields.length
    && plannedQaFields.every((key, index) => key === actualQaFields[index])
}

function hasExpectedMetadata(user, expected) {
  const userMetadata = user?.user_metadata
  const appMetadata = user?.app_metadata
  return clean(user?.id).toLowerCase() === expected.id
    && user?.email === expected.email
    && hasPlannedMetadata(userMetadata, expected.userMetadata)
    && hasPlannedMetadata(appMetadata, expected.appMetadata)
}

function recordFromPlannedUser(user, planned) {
  const id = clean(user?.id).toLowerCase()
  const record = Object.freeze({
    id,
    stepId: planned.stepId,
    email: planned.email,
    alias: planned.alias,
    role: planned.role,
    namespace: planned.namespace,
    userMetadata: planned.userMetadata,
    appMetadata: planned.appMetadata,
  })
  return UUID.test(id) && hasExpectedMetadata(user, record) ? record : null
}

function isAttestedAdminClient(value) {
  const client = value?.client
  return isDataRecord(value)
    && value.targetOrigin === OFFICIAL_STAGING_SUPABASE_ORIGIN
    && client?.supabaseUrl === OFFICIAL_STAGING_SUPABASE_ORIGIN
    && typeof client?.auth?.admin?.createUser === 'function'
    && typeof client?.auth?.admin?.listUsers === 'function'
    && typeof client?.auth?.admin?.getUserById === 'function'
    && typeof client?.auth?.admin?.deleteUser === 'function'
}

function isExactStepRequest(request, runId, spec = null) {
  if (!hasExactFields(request, [
    'schemaVersion',
    'stepId',
    'phase',
    'actor',
    'mutates',
    'identity',
  ])
    || request.schemaVersion !== 1
    || request.mutates !== true
    || !parseRequestIdentity(request.identity, runId)) {
    return false
  }

  if (spec) {
    return request.stepId === spec.stepId
      && request.phase === 'fixture'
      && request.actor === 'fixture-admin'
  }

  return request.stepId === CLEANUP_STEP_ID
    && request.phase === 'cleanup'
    && request.actor === 'fixture-admin'
}

function isExactAuthenticationRequest(request, runId, spec) {
  return hasExactFields(request, [
    'schemaVersion',
    'stepId',
    'phase',
    'actor',
    'mutates',
    'identity',
  ])
    && request.schemaVersion === 1
    && request.stepId === spec.stepId
    && request.phase === spec.phase
    && request.actor === spec.actor
    && request.mutates === false
    && parseRequestIdentity(request.identity, runId) !== null
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

function exactCleanupResult(value) {
  return isDataRecord(value)
    && Object.keys(value).length === 1
    && value.status === 'passed'
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
 * Staging. It handles the four Auth provisioning steps, closure-private browser
 * authentication, and the exact cleanup step from the issued S5 plan. The
 * injected resource cleanup capability must retain its planned target ledger
 * privately; it runs after sessions close and before Auth deletion. Credentials
 * are never exposed by this public interface.
 */
export function createSebStagingFixtureAdapter({
  readEnvironment,
  runId,
  adminClientFactory,
  browserSessionCapability,
  resourceCleanupCapability,
  randomBytes,
  clock,
} = {}) {
  const normalizedRunId = clean(runId)
  let initialEnvironment = null
  try {
    initialEnvironment = typeof readEnvironment === 'function' ? readEnvironment() : null
  } catch {
    blocked()
  }
  if (typeof readEnvironment !== 'function'
    || !permitsCreation(initialEnvironment)
    || !isUniqueSafeRunId(normalizedRunId)
    || typeof adminClientFactory !== 'function'
    || !validBrowserSessionCapability(browserSessionCapability)
    || !validResourceCleanupCapability(resourceCleanupCapability)
    || typeof randomBytes !== 'function'
    || typeof clock !== 'function') {
    blocked()
  }

  let clockValue
  try {
    clockValue = clock()
  } catch {
    blocked()
  }
  const createdAtDate = clockValue instanceof Date
    ? new Date(clockValue.getTime())
    : new Date(clockValue)
  if (!Number.isFinite(createdAtDate.getTime())) blocked()

  USED_RUN_IDS.add(normalizedRunId)
  const namespace = `qa:${normalizedRunId}`
  const createdAt = createdAtDate.toISOString()
  const manifest = []
  const accountCleanupLedger = []
  const credentialVault = new Map()
  const plannedCreations = new Map()
  const attemptedSteps = new Set()
  const attemptedAuthenticationSteps = new Set()
  const unresolvedCreations = new Set()
  const uncertainDeletes = new Set()
  let nextAccountIndex = 0
  let attestedClient = null
  let busy = false
  let cleanupStarted = false
  let sessionsClosed = false
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

  function assertAttestedTarget() {
    if (!isAttestedAdminClient(attestedClient)) blocked()
    return attestedClient.client
  }

  async function ensureAdminClient() {
    currentEnvironment('create')
    if (attestedClient) return assertAttestedTarget()
    const candidate = await adminClientFactory(Object.freeze({
      targetOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
    }))
    if (!isAttestedAdminClient(candidate)) blocked()
    attestedClient = candidate
    currentEnvironment('create')
    return assertAttestedTarget()
  }

  async function findExactPlannedUser(planned) {
    let timedOut = false
    let timeoutHandle = null
    const scan = (async () => {
      const matches = []
      let expectedTotal = null
      for (let page = 1; page <= AUTH_RECONCILIATION_MAX_PAGES; page += 1) {
        if (timedOut) blocked()
        currentEnvironment('cleanup')
        const client = assertAttestedTarget()
        const response = await client.auth.admin.listUsers(Object.freeze({
          page,
          perPage: AUTH_RECONCILIATION_PER_PAGE,
        }))
        if (timedOut) blocked()
        currentEnvironment('cleanup')
        assertAttestedTarget()

        const users = response?.data?.users
        const total = response?.data?.total
        const nextPage = response?.data?.nextPage
        if (response?.error
          || !Array.isArray(users)
          || users.length > AUTH_RECONCILIATION_PER_PAGE
          || !Number.isInteger(total)
          || total < 0
          || total > AUTH_RECONCILIATION_PER_PAGE * AUTH_RECONCILIATION_MAX_PAGES
          || (nextPage !== null && !Number.isInteger(nextPage))) {
          blocked()
        }
        if (expectedTotal === null) expectedTotal = total
        if (total !== expectedTotal) blocked()

        for (const user of users) {
          if (user?.email !== planned.email) continue
          const record = recordFromPlannedUser(user, planned)
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
      // A full final page means there could be another matching account beyond
      // the scan boundary. Never infer uniqueness from a truncated directory.
      blocked()
    })()

    const timeout = new Promise((resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true
        reject(new SebStagingFixtureAdapterBlockedError())
      }, AUTH_RECONCILIATION_TIMEOUT_MS)
    })
    try {
      return await Promise.race([scan, timeout])
    } finally {
      if (timeoutHandle !== null) clearTimeout(timeoutHandle)
    }
  }

  async function reconcileUnresolvedCreations() {
    for (const stepId of [...unresolvedCreations].reverse()) {
      const planned = plannedCreations.get(stepId)
      if (!planned) blocked()
      const record = await findExactPlannedUser(planned)
      if (!record || accountCleanupLedger.some(value => value.id === record.id)) blocked()
      manifest.push(record)
      accountCleanupLedger.push(record)
      unresolvedCreations.delete(stepId)
    }
  }

  async function provisionAccount(request, spec, accountIndex) {
    if (busy
      || cleanupStarted
      || !isExactStepRequest(request, normalizedRunId, spec)
      || attemptedSteps.has(spec.stepId)
      || accountIndex !== nextAccountIndex) {
      return redactedResult(spec.stepId, 'failed')
    }

    attemptedSteps.add(spec.stepId)
    busy = true
    let input = null
    try {
      currentEnvironment('create')
      input = runtimeAccountInput(spec, accountIndex, namespace, createdAt, randomBytes)
      const planned = Object.freeze({
        stepId: spec.stepId,
        email: input.expected.email,
        alias: input.expected.alias,
        role: input.expected.role,
        namespace: input.expected.namespace,
        userMetadata: input.attributes.user_metadata,
        appMetadata: input.attributes.app_metadata,
      })
      plannedCreations.set(spec.stepId, planned)
      credentialVault.set(spec.alias, Object.freeze({
        email: input.expected.email,
        password: input.password,
      }))

      const client = await ensureAdminClient()
      currentEnvironment('create')
      assertAttestedTarget()
      unresolvedCreations.add(spec.stepId)
      const response = await client.auth.admin.createUser(input.attributes)
      const returnedUser = response?.data?.user
      const record = recordFromPlannedUser(returnedUser, planned)
      const idIsUnique = record !== null && !manifest.some(value => value.id === record.id)

      if (idIsUnique) {
        manifest.push(record)
        accountCleanupLedger.push(record)
        unresolvedCreations.delete(spec.stepId)
      } else if (response?.error
        && !returnedUser
        && isConfirmedNonCreatingAuthError(response.error)) {
        // Only pre-mutation validation errors are confirmed non-creates. A
        // transport, 5xx, conflict, or unclassified error may have committed
        // before the response was lost and must be reconciled during cleanup.
        unresolvedCreations.delete(spec.stepId)
        plannedCreations.delete(spec.stepId)
      }
      if (response?.error
        || !idIsUnique
        || !hasExpectedMetadata(returnedUser, record)) {
        credentialVault.delete(spec.alias)
        return redactedResult(spec.stepId, 'failed')
      }

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
      || !isExactAuthenticationRequest(request, normalizedRunId, spec)
      || attemptedAuthenticationSteps.has(spec.stepId)) {
      return redactedResult(spec.stepId, 'failed')
    }

    const record = manifest.find(value => value.alias === spec.alias)
    const credential = credentialVault.get(spec.alias)
    if (!record || !credential) return redactedResult(spec.stepId, 'failed')

    attemptedAuthenticationSteps.add(spec.stepId)
    busy = true
    const ephemeralCredentials = {
      email: credential.email,
      password: credential.password,
    }
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

  async function cleanup(request) {
    if (busy || !isExactStepRequest(request, normalizedRunId)) {
      return redactedResult(CLEANUP_STEP_ID, 'failed')
    }
    cleanupStarted = true
    busy = true
    let failed = false

    try {
      currentEnvironment('cleanup')
      if (!sessionsClosed && browserSessionCapability) {
        try {
          await browserSessionCapability.closeAll()
          sessionsClosed = true
        } catch {
          failed = true
        }
        currentEnvironment('cleanup')
      }
      if (browserSessionCapability && !sessionsClosed) {
        return redactedResult(CLEANUP_STEP_ID, 'failed')
      }
      if (unresolvedCreations.size > 0) {
        try {
          await reconcileUnresolvedCreations()
        } catch {
          failed = true
        }
        currentEnvironment('cleanup')
      }
      if (unresolvedCreations.size > 0) {
        return redactedResult(CLEANUP_STEP_ID, 'failed')
      }
      if (!resourcesCleaned && unresolvedCreations.size === 0) {
        if (!resourceCleanupRequest) {
          const cleanupIdentity = parseRequestIdentity(request.identity, normalizedRunId)
          if (!cleanupIdentity) blocked()
          const accounts = Object.freeze(accountCleanupLedger.map(record => Object.freeze({
            id: record.id,
            alias: record.alias,
            role: record.role,
            namespace: record.namespace,
          })))
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
          resourcesCleaned = exactCleanupResult(cleanupResult)
          if (!resourcesCleaned) failed = true
        } catch {
          failed = true
        }
        currentEnvironment('cleanup')
      }
      if (!resourcesCleaned) {
        return redactedResult(CLEANUP_STEP_ID, 'failed')
      }
      if (manifest.length === 0) {
        credentialVault.clear()
        return redactedResult(
          CLEANUP_STEP_ID,
          !failed && resourcesCleaned && unresolvedCreations.size === 0 ? 'passed' : 'failed',
        )
      }

      for (let index = manifest.length - 1; index >= 0; index -= 1) {
        const record = manifest[index]
        try {
          currentEnvironment('cleanup')
          const readClient = assertAttestedTarget()
          const readBack = await readClient.auth.admin.getUserById(record.id)
          if (
            uncertainDeletes.has(record.id)
            && !readBack?.data?.user
            && readBack?.error?.code === 'user_not_found'
          ) {
            manifest.splice(index, 1)
            uncertainDeletes.delete(record.id)
            credentialVault.delete(record.alias)
            plannedCreations.delete(record.stepId)
            continue
          }
          if (readBack?.error || !hasExpectedMetadata(readBack?.data?.user, record)) {
            failed = true
            continue
          }

          currentEnvironment('cleanup')
          const deleteClient = assertAttestedTarget()
          uncertainDeletes.add(record.id)
          const deletion = await deleteClient.auth.admin.deleteUser(record.id)
          if (deletion?.error) {
            failed = true
            continue
          }
          uncertainDeletes.delete(record.id)
          manifest.splice(index, 1)
          credentialVault.delete(record.alias)
          plannedCreations.delete(record.stepId)
        } catch {
          failed = true
        }
      }

      if (manifest.length === 0) credentialVault.clear()
      return redactedResult(
        CLEANUP_STEP_ID,
        failed || !resourcesCleaned || manifest.length > 0 || unresolvedCreations.size > 0
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
