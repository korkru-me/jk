const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const FORBIDDEN_RUN_ID_TERMS = /(prod(?:uction)?|live|real|customer)/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const RELEASE_ID = /^asr-[0-9a-f]{32}-r([1-9][0-9]{0,9})-([0-9a-f]{16})$/
const SHA256 = /^[a-f0-9]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const MAX_ASSIGNMENT_CONFIG_REVISION = 2_147_483_646
const BLOCKED_MESSAGE = 'SEB Staging aggregate cleanup blocked'

const ACCOUNT_ROLES = Object.freeze(new Map([
  ['teacher-primary', 'teacher'],
  ['teacher-unrelated', 'teacher'],
  ['student-primary', 'student'],
  ['student-secondary', 'student'],
]))

const PARTICIPANT_ORDER = Object.freeze([
  'answerStorage',
  'artifactStorage',
  'databaseFixture',
  'personalOrganizations',
  'runReservation',
])

export class SebStagingAggregateCleanupBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingAggregateCleanupBlockedError'
  }
}

function blocked() {
  throw new SebStagingAggregateCleanupBlockedError()
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
  try {
    const actual = Object.keys(value).sort()
    const expected = [...fields].sort()
    return actual.length === expected.length
      && actual.every((field, index) => field === expected[index])
  } catch {
    return false
  }
}

function hasOfficialStagingCleanupPolicy(environment) {
  return isDataRecord(environment)
    && environment.KORKRU_DEPLOYMENT_ENV === 'staging'
    && environment.EXAM_QA_ENVIRONMENT === 'staging'
    && environment.VERCEL_ENV === 'preview'
    && environment.NEXT_PUBLIC_SITE_URL === OFFICIAL_STAGING_SITE_ORIGIN
    && environment.NEXT_PUBLIC_SUPABASE_URL === OFFICIAL_STAGING_SUPABASE_ORIGIN
    && environment.EXAM_QA_DATA_POLICY === 'synthetic-only'
    && environment.EXAM_QA_COPY_PRODUCTION_DATA === 'false'
    && (
      environment.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'true'
      || environment.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'false'
    )
}

function validCleanupCapability(value) {
  return isDataRecord(value) && typeof value.cleanupRun === 'function'
}

function exactPassedResult(value) {
  return hasExactFields(value, ['status']) && value.status === 'passed'
}

function publicResult(status) {
  return Object.freeze({ status })
}

function parseIdentity(identity, runId) {
  const runOnly = hasExactFields(identity, [
    'runId',
    'sourceRevision',
    'deploymentId',
  ])
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

function parseAccounts(accounts, namespace) {
  if (!Array.isArray(accounts) || accounts.length > ACCOUNT_ROLES.size) return null
  const parsed = []
  const ids = new Set()
  const aliases = new Set()
  for (const account of accounts) {
    if (!hasExactFields(account, ['id', 'alias', 'role', 'namespace'])) return null
    const expectedRole = ACCOUNT_ROLES.get(account.alias)
    if (!expectedRole
      || account.role !== expectedRole
      || account.namespace !== namespace
      || typeof account.id !== 'string'
      || !UUID.test(account.id)
      || ids.has(account.id)
      || aliases.has(account.alias)) {
      return null
    }
    ids.add(account.id)
    aliases.add(account.alias)
    parsed.push(Object.freeze({
      id: account.id,
      alias: account.alias,
      role: account.role,
      namespace,
    }))
  }
  return Object.freeze(parsed)
}

function parseCleanupRequest(request) {
  if (!hasExactFields(request, [
    'schemaVersion',
    'runId',
    'namespace',
    'identity',
    'accounts',
  ])) return null

  const runId = request.runId
  if (request.schemaVersion !== 1
    || typeof runId !== 'string'
    || !SAFE_RUN_ID.test(runId)
    || FORBIDDEN_RUN_ID_TERMS.test(runId)
    || request.namespace !== `qa:${runId}`) {
    return null
  }
  const identity = parseIdentity(request.identity, runId)
  const accounts = parseAccounts(request.accounts, request.namespace)
  if (!identity || !accounts) return null

  return Object.freeze({
    schemaVersion: 1,
    runId,
    namespace: request.namespace,
    identity,
    accounts,
  })
}

/**
 * Build the resource cleanup capability consumed by the Staging fixture
 * adapter. Every participant keeps its own exact target ledger private; this
 * coordinator only forwards the frozen, credential-free run manifest.
 */
export function createSebStagingAggregateCleanupCapability({
  readEnvironment,
  answerStorage,
  artifactStorage,
  databaseFixture,
  personalOrganizations,
  runReservation,
} = {}) {
  const participants = {
    answerStorage,
    artifactStorage,
    databaseFixture,
    personalOrganizations,
    runReservation,
  }

  let initialEnvironment = null
  try {
    initialEnvironment = typeof readEnvironment === 'function' ? readEnvironment() : null
  } catch {
    blocked()
  }
  if (typeof readEnvironment !== 'function'
    || !hasOfficialStagingCleanupPolicy(initialEnvironment)
    || PARTICIPANT_ORDER.some(name => !validCleanupCapability(participants[name]))) {
    blocked()
  }
  const participantEntries = Object.freeze(PARTICIPANT_ORDER.map(name => Object.freeze({
    name,
    cleanupRun: participants[name].cleanupRun.bind(participants[name]),
  })))

  const completed = new Set()
  let boundRequest = null
  let boundSignature = null
  let busy = false

  function exactEnvironmentNow() {
    try {
      return hasOfficialStagingCleanupPolicy(readEnvironment())
    } catch {
      return false
    }
  }

  async function cleanupRun(request) {
    if (busy) return publicResult('failed')

    let parsed
    try {
      parsed = parseCleanupRequest(request)
    } catch {
      return publicResult('failed')
    }
    if (!parsed) return publicResult('failed')

    const signature = JSON.stringify(parsed)
    if (boundSignature !== null && signature !== boundSignature) {
      return publicResult('failed')
    }
    if (boundSignature === null) {
      boundSignature = signature
      boundRequest = parsed
    }

    busy = true
    let failed = false
    try {
      for (const participant of participantEntries) {
        const { name } = participant
        if (completed.has(name)) continue
        if (!exactEnvironmentNow()) {
          failed = true
          break
        }
        if (name === 'personalOrganizations' && !completed.has('databaseFixture')) {
          failed = true
          break
        }
        try {
          const result = await participant.cleanupRun(boundRequest)
          if (exactPassedResult(result)) {
            completed.add(name)
          } else {
            failed = true
            break
          }
        } catch {
          failed = true
          break
        }
      }
    } catch {
      failed = true
    } finally {
      busy = false
    }

    return publicResult(
      !failed && completed.size === PARTICIPANT_ORDER.length ? 'passed' : 'failed',
    )
  }

  return Object.freeze({ cleanupRun })
}
