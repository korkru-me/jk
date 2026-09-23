import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto'

const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const RESERVATION_TABLE = 'seb_staging_qa_run_reservations'
const RESERVATION_STEP = Object.freeze({
  schemaVersion: 1,
  stepId: 'reserve-unique-run-id',
  phase: 'fixture',
  actor: 'fixture-admin',
  mutates: true,
})
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const FORBIDDEN_RUN_ID_TERMS = /(prod(?:uction)?|live|real|customer)/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const RELEASE_ID = /^asr-[0-9a-f]{32}-r([1-9][0-9]{0,9})-([0-9a-f]{16})$/
const SHA256 = /^[a-f0-9]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const MAX_ASSIGNMENT_CONFIG_REVISION = 2_147_483_646
const RESERVATION_PROOF_BYTES = 32
const ACCOUNT_ROLES = Object.freeze(new Map([
  ['teacher-primary', 'teacher'],
  ['teacher-unrelated', 'teacher'],
  ['student-primary', 'student'],
  ['student-secondary', 'student'],
]))
const ROW_FIELDS = Object.freeze([
  'run_id',
  'qa_namespace',
  'source_sha',
  'deployment_id',
  'reservation_proof_sha256',
  'state',
  'reserved_at',
  'cleaned_at',
])
const ROW_SELECT = ROW_FIELDS.join(',')
const BLOCKED_MESSAGE = 'SEB Staging run reservation blocked'

export class SebStagingRunReservationBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingRunReservationBlockedError'
  }
}

function blocked() {
  throw new SebStagingRunReservationBlockedError()
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

function hasExactFields(value, expectedFields) {
  if (!isDataRecord(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...expectedFields].sort()
  return actual.length === expected.length
    && actual.every((field, index) => field === expected[index])
}

function parseRunIdentity(value) {
  if (!hasExactFields(value, ['runId', 'sourceRevision', 'deploymentId'])) return null
  const { runId, sourceRevision, deploymentId } = value
  if (typeof runId !== 'string'
    || typeof sourceRevision !== 'string'
    || typeof deploymentId !== 'string'
    || !SAFE_RUN_ID.test(runId)
    || runId === 'seb-s5-preview'
    || FORBIDDEN_RUN_ID_TERMS.test(runId)
    || !SOURCE_REVISION.test(sourceRevision)
    || !DEPLOYMENT_ID.test(deploymentId)) {
    return null
  }
  return Object.freeze({ runId, sourceRevision, deploymentId })
}

function parseCleanupIdentity(value) {
  const runOnly = hasExactFields(value, ['runId', 'sourceRevision', 'deploymentId'])
  const releaseBound = hasExactFields(value, [
    'runId',
    'sourceRevision',
    'deploymentId',
    'releaseId',
    'releaseRevision',
    'artifactSha256',
  ])
  if (!runOnly && !releaseBound) return null

  const baseIdentity = parseRunIdentity({
    runId: value.runId,
    sourceRevision: value.sourceRevision,
    deploymentId: value.deploymentId,
  })
  if (!baseIdentity) return null
  if (!releaseBound) return baseIdentity

  const match = typeof value.releaseId === 'string' ? RELEASE_ID.exec(value.releaseId) : null
  if (match === null
    || !Number.isInteger(value.releaseRevision)
    || value.releaseRevision < 1
    || value.releaseRevision > MAX_ASSIGNMENT_CONFIG_REVISION
    || Number(match[1]) !== value.releaseRevision
    || typeof value.artifactSha256 !== 'string'
    || !SHA256.test(value.artifactSha256)
    || match[2] !== value.artifactSha256.slice(0, 16)) {
    return null
  }
  return baseIdentity
}

function validCredentialFreeAccounts(accounts, namespace) {
  if (!Array.isArray(accounts) || accounts.length > ACCOUNT_ROLES.size) return false
  const ids = new Set()
  const aliases = new Set()
  for (const account of accounts) {
    if (!hasExactFields(account, ['id', 'alias', 'role', 'namespace'])) return false
    const expectedRole = ACCOUNT_ROLES.get(account.alias)
    if (!expectedRole
      || account.role !== expectedRole
      || account.namespace !== namespace
      || typeof account.id !== 'string'
      || !UUID.test(account.id)
      || ids.has(account.id)
      || aliases.has(account.alias)) {
      return false
    }
    ids.add(account.id)
    aliases.add(account.alias)
  }
  return true
}

function sameIdentity(left, right) {
  return left?.runId === right?.runId
    && left?.sourceRevision === right?.sourceRevision
    && left?.deploymentId === right?.deploymentId
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

function permitsReservation(environment) {
  return hasOfficialStagingPolicy(environment)
    && environment.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'true'
}

function permitsCleanup(environment) {
  return hasOfficialStagingPolicy(environment)
    && (environment.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'true'
      || environment.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'false')
}

function exactReservationRequest(request, identity) {
  return hasExactFields(request, [
    'schemaVersion',
    'stepId',
    'phase',
    'actor',
    'mutates',
    'identity',
  ])
    && request.schemaVersion === RESERVATION_STEP.schemaVersion
    && request.stepId === RESERVATION_STEP.stepId
    && request.phase === RESERVATION_STEP.phase
    && request.actor === RESERVATION_STEP.actor
    && request.mutates === RESERVATION_STEP.mutates
    && sameIdentity(parseCleanupIdentity(request.identity), identity)
}

function exactCleanupRequest(request, identity, namespace) {
  return hasExactFields(request, [
    'schemaVersion',
    'runId',
    'namespace',
    'identity',
    'accounts',
  ])
    && request.schemaVersion === 1
    && request.runId === identity.runId
    && request.namespace === namespace
    && sameIdentity(parseCleanupIdentity(request.identity), identity)
    && validCredentialFreeAccounts(request.accounts, namespace)
}

function isAttestedServiceRoleClient(value) {
  const client = value?.client
  return isDataRecord(value)
    && value.targetOrigin === OFFICIAL_STAGING_SUPABASE_ORIGIN
    && value.credentialKind === 'service-role'
    && client?.supabaseUrl === OFFICIAL_STAGING_SUPABASE_ORIGIN
    && typeof client?.from === 'function'
}

function dateValue(value) {
  if (typeof value !== 'string' || value.length > 64) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function exactReservationRow(row, expected, expectedState = null) {
  if (!hasExactFields(row, ROW_FIELDS)
    || row.run_id !== expected.runId
    || row.qa_namespace !== expected.namespace
    || row.source_sha !== expected.sourceRevision
    || row.deployment_id !== expected.deploymentId
    || row.reservation_proof_sha256 !== expected.proofSha256
    || (row.state !== 'reserved' && row.state !== 'cleaned')) {
    return null
  }
  if (expectedState !== null && row.state !== expectedState) return null

  const reservedAt = dateValue(row.reserved_at)
  const cleanedAt = row.cleaned_at === null ? null : dateValue(row.cleaned_at)
  const timestampsAreValid = reservedAt !== null
    && (row.state === 'reserved'
      ? cleanedAt === null
      : cleanedAt !== null && cleanedAt >= reservedAt)
  if (!timestampsAreValid) return null

  return Object.freeze({
    state: row.state,
    reservedAt,
    cleanedAt,
  })
}

function proofFromRandomBytes(randomBytes) {
  let bytes
  try {
    bytes = randomBytes(RESERVATION_PROOF_BYTES)
  } catch {
    blocked()
  }
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== RESERVATION_PROOF_BYTES) blocked()
  try {
    return createHash('sha256').update(bytes).digest('hex')
  } finally {
    bytes.fill(0)
  }
}

function redactedStepResult(status) {
  return Object.freeze({ stepId: RESERVATION_STEP.stepId, status })
}

function redactedCleanupResult(status) {
  return Object.freeze({ status })
}

/**
 * Build a single-run reservation capability for the official isolated Staging
 * project. The service-role client and per-process proof remain closure-private;
 * public results expose only passed/failed state.
 */
export function createSebStagingRunReservation({
  readEnvironment,
  identity,
  serviceRoleClientFactory,
  randomBytes = nodeRandomBytes,
} = {}) {
  const expectedIdentity = parseRunIdentity(identity)
  let initialEnvironment
  try {
    initialEnvironment = typeof readEnvironment === 'function' ? readEnvironment() : null
  } catch {
    blocked()
  }
  if (!expectedIdentity
    || typeof readEnvironment !== 'function'
    || !permitsReservation(initialEnvironment)
    || typeof serviceRoleClientFactory !== 'function'
    || typeof randomBytes !== 'function') {
    blocked()
  }

  const namespace = `qa:${expectedIdentity.runId}`
  const proofSha256 = proofFromRandomBytes(randomBytes)
  const expectedRow = Object.freeze({
    ...expectedIdentity,
    namespace,
    proofSha256,
  })
  let busy = false
  let reservationAttempted = false
  let cleanupConfirmed = false

  function currentEnvironment(kind) {
    let environment
    try {
      environment = readEnvironment()
    } catch {
      blocked()
    }
    const permitted = kind === 'reserve'
      ? permitsReservation(environment)
      : permitsCleanup(environment)
    if (!permitted) blocked()
  }

  async function acquireClient(kind) {
    currentEnvironment(kind)
    let candidate
    try {
      candidate = await serviceRoleClientFactory(Object.freeze({
        targetOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
        credentialKind: 'service-role',
      }))
    } catch {
      blocked()
    }
    if (!isAttestedServiceRoleClient(candidate)) blocked()
    currentEnvironment(kind)
    return candidate.client
  }

  async function readOwnRow(kind) {
    const client = await acquireClient(kind)
    currentEnvironment(kind)
    let response
    try {
      response = await client
        .from(RESERVATION_TABLE)
        .select(ROW_SELECT)
        .eq('run_id', expectedIdentity.runId)
        .maybeSingle()
    } catch {
      return null
    }
    currentEnvironment(kind)
    if (!isDataRecord(response) || response.error !== null) return null
    return exactReservationRow(response.data, expectedRow)
  }

  async function attemptInsert() {
    const client = await acquireClient('reserve')
    currentEnvironment('reserve')
    try {
      await client.from(RESERVATION_TABLE).insert({
        run_id: expectedIdentity.runId,
        qa_namespace: namespace,
        source_sha: expectedIdentity.sourceRevision,
        deployment_id: expectedIdentity.deploymentId,
        reservation_proof_sha256: proofSha256,
      })
    } catch {
      // A transport failure may arrive after commit. The mandatory independent
      // read-back below is the only authority for accepting the reservation.
    }
    currentEnvironment('reserve')
  }

  async function executeStep(request) {
    if (busy
      || reservationAttempted
      || cleanupConfirmed
      || !exactReservationRequest(request, expectedIdentity)) {
      return redactedStepResult('failed')
    }

    busy = true
    reservationAttempted = true
    try {
      await attemptInsert()
      const readBack = await readOwnRow('reserve')
      return redactedStepResult(readBack?.state === 'reserved' ? 'passed' : 'failed')
    } catch {
      return redactedStepResult('failed')
    } finally {
      busy = false
    }
  }

  async function attemptCleanupUpdate() {
    const client = await acquireClient('cleanup')
    currentEnvironment('cleanup')
    try {
      await client
        .from(RESERVATION_TABLE)
        .update({ state: 'cleaned' })
        .eq('run_id', expectedIdentity.runId)
        .eq('reservation_proof_sha256', proofSha256)
        .eq('state', 'reserved')
    } catch {
      // As with insert, only the independent read-back can resolve whether an
      // ambiguous update committed.
    }
    currentEnvironment('cleanup')
  }

  async function cleanupRun(request) {
    if (busy
      || !reservationAttempted
      || !exactCleanupRequest(request, expectedIdentity, namespace)) {
      return redactedCleanupResult('failed')
    }
    if (cleanupConfirmed) return redactedCleanupResult('passed')

    busy = true
    try {
      const before = await readOwnRow('cleanup')
      if (!before) return redactedCleanupResult('failed')
      if (before.state === 'cleaned') {
        cleanupConfirmed = true
        return redactedCleanupResult('passed')
      }
      if (before.state !== 'reserved') return redactedCleanupResult('failed')

      await attemptCleanupUpdate()
      const readBack = await readOwnRow('cleanup')
      cleanupConfirmed = readBack?.state === 'cleaned'
      return redactedCleanupResult(cleanupConfirmed ? 'passed' : 'failed')
    } catch {
      return redactedCleanupResult('failed')
    } finally {
      busy = false
    }
  }

  return Object.freeze({ executeStep, cleanupRun })
}
