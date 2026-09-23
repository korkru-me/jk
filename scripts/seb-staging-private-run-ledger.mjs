const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const FORBIDDEN_RUN_ID_TERMS = /(prod(?:uction)?|live|real|customer)/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const SAFE_TARGET_KEY = /^[a-z][a-z0-9-]{0,63}$/
const UUID_PART = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const UUID = new RegExp(`^${UUID_PART}$`)
const PERSONAL_ORGANIZATION_ID = new RegExp(`^${UUID_PART}:${UUID_PART}$`)
const RELEASE_ID = /^asr-[0-9a-f]{32}-r([1-9][0-9]{0,9})-[0-9a-f]{16}$/
const CONFIG_REVISION_ID = new RegExp(`^${UUID_PART}:r([1-9][0-9]{0,9})$`)
const CHECK_IN_ID = new RegExp(`^${UUID_PART}:${UUID_PART}$`)
const PROCTOR_CONNECTION_ID = CHECK_IN_ID
const PROCTOR_EVENT_ID = /^[1-9][0-9]{0,18}$/
const ANSWER_STORAGE_ID = new RegExp(
  `^${UUID_PART}/${UUID_PART}/${UUID_PART}/${UUID_PART}\\.(?:jpg|pdf|png|webp)$`,
)
const ASSIGNMENT_ARTIFACT_ID = new RegExp(
  `^assignments/${UUID_PART}/r([1-9][0-9]{0,9})/[0-9a-f]{64}\\.seb$`,
)
const MAX_ASSIGNMENT_CONFIG_REVISION = 2_147_483_646
const MAX_CREATION_WINDOW_MS = 24 * 60 * 60 * 1_000
const MIN_RECONCILIATION_TIMEOUT_MS = 10
const MAX_RECONCILIATION_TIMEOUT_MS = 5_000
const MAX_RECONCILIATION_MATCHES = 8
const BLOCKED_MESSAGE = 'SEB Staging private run ledger blocked'

const TARGET_POLICIES = Object.freeze(new Map([
  ['account', policy('forbidden', 'forbidden', ['teacher', 'student'], UUID)],
  // targetId is the exact "organization UUID:membership UUID" pair. Both
  // rows are therefore retained and deleted together during cleanup.
  ['personalOrganization', policy(
    'required',
    'forbidden',
    ['personal'],
    PERSONAL_ORGANIZATION_ID,
  )],
  ['classroom', policy('required', 'required', ['subject'], UUID)],
  ['question', policy('required', 'required', ['essay', 'file_upload'], UUID)],
  ['classroomMembership', policy('required', 'required', ['student'], UUID)],
  ['assignment', policy('required', 'required', ['exam'], UUID)],
  ['configRevision', policy('required', 'required', ['seb_required'], CONFIG_REVISION_ID)],
  ['release', policy('required', 'required', ['test_plaintext', 'x509_encrypted'], RELEASE_ID)],
  ['checkIn', policy('required', 'required', ['windows', 'macos', 'ios'], CHECK_IN_ID)],
  ['submission', policy('required', 'required', ['seb_required'], UUID)],
  ['answer', policy('required', 'required', ['essay', 'file_upload'], UUID)],
  ['proctorConnection', policy('required', 'required', ['heartbeat'], PROCTOR_CONNECTION_ID)],
  ['proctorEvent', policy('required', 'required', ['monitoring_started'], PROCTOR_EVENT_ID)],
  ['answerStorageObject', policy('required', 'required', ['submission_file'], ANSWER_STORAGE_ID)],
  ['assignmentArtifact', policy('required', 'required', ['seb'], ASSIGNMENT_ARTIFACT_ID)],
]))

export const SEB_STAGING_LEDGER_TARGET_KINDS = Object.freeze([...TARGET_POLICIES.keys()])

export class SebStagingPrivateRunLedgerBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingPrivateRunLedgerBlockedError'
  }
}

function policy(owner, organization, resourceTypes, targetIdPattern) {
  return Object.freeze({
    owner,
    organization,
    resourceTypes: Object.freeze([...resourceTypes]),
    targetIdPattern,
  })
}

function blocked() {
  throw new SebStagingPrivateRunLedgerBlockedError()
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
  try {
    const actual = Object.keys(value).sort()
    const expected = [...expectedFields].sort()
    return actual.length === expected.length
      && actual.every((field, index) => field === expected[index])
  } catch {
    return false
  }
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

function isAttestedReconciliationClient(value) {
  if (!hasExactFields(value, ['targetOrigin', 'credentialKind', 'client'])) return false
  try {
    return value.targetOrigin === OFFICIAL_STAGING_SUPABASE_ORIGIN
      && value.credentialKind === 'service-role'
      && value.client !== null
      && typeof value.client === 'object'
      && value.client.supabaseUrl === OFFICIAL_STAGING_SUPABASE_ORIGIN
      && typeof value.client.findExactRunTargets === 'function'
  } catch {
    return false
  }
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

function parseIdentity(value) {
  if (!hasExactFields(value, [
    'runId',
    'sourceRevision',
    'deploymentId',
    'creationWindow',
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
    || notAfter.timestamp - notBefore.timestamp > MAX_CREATION_WINDOW_MS) {
    return null
  }

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

function sameIdentity(left, right) {
  return left?.runId === right?.runId
    && left?.sourceRevision === right?.sourceRevision
    && left?.deploymentId === right?.deploymentId
    && left?.creationWindow?.notBefore === right?.creationWindow?.notBefore
    && left?.creationWindow?.notAfter === right?.creationWindow?.notAfter
}

function validScopedId(value, requirement) {
  if (requirement === 'forbidden') return value === null
  return typeof value === 'string' && UUID.test(value)
}

function validTargetId(kind, value, targetPolicy) {
  if (typeof value !== 'string' || !targetPolicy.targetIdPattern.test(value)) return false
  let revision = null
  if (kind === 'configRevision') revision = CONFIG_REVISION_ID.exec(value)?.[1] ?? null
  if (kind === 'release') revision = RELEASE_ID.exec(value)?.[1] ?? null
  if (kind === 'assignmentArtifact') revision = ASSIGNMENT_ARTIFACT_ID.exec(value)?.[1] ?? null
  if (revision === null) return true
  const parsed = Number(revision)
  return Number.isSafeInteger(parsed)
    && parsed >= 1
    && parsed <= MAX_ASSIGNMENT_CONFIG_REVISION
}

function parsePlan(value, identity, namespace) {
  if (!hasExactFields(value, [
    'schemaVersion',
    'targetKey',
    'kind',
    'identity',
    'namespace',
    'ownerId',
    'organizationId',
    'resourceType',
  ]) || value.schemaVersion !== 1
    || typeof value.targetKey !== 'string'
    || !SAFE_TARGET_KEY.test(value.targetKey)
    || value.namespace !== namespace) {
    return null
  }

  const parsedIdentity = parseIdentity(value.identity)
  const targetPolicy = TARGET_POLICIES.get(value.kind)
  if (!parsedIdentity
    || !sameIdentity(parsedIdentity, identity)
    || !targetPolicy
    || !validScopedId(value.ownerId, targetPolicy.owner)
    || !validScopedId(value.organizationId, targetPolicy.organization)
    || typeof value.resourceType !== 'string'
    || !targetPolicy.resourceTypes.includes(value.resourceType)) {
    return null
  }

  return Object.freeze({
    schemaVersion: 1,
    targetKey: value.targetKey,
    kind: value.kind,
    identity,
    namespace,
    ownerId: value.ownerId,
    organizationId: value.organizationId,
    resourceType: value.resourceType,
  })
}

function parseReference(value) {
  if (!hasExactFields(value, ['schemaVersion', 'targetKey', 'kind'])
    || value.schemaVersion !== 1
    || typeof value.targetKey !== 'string'
    || !SAFE_TARGET_KEY.test(value.targetKey)
    || !TARGET_POLICIES.has(value.kind)) {
    return null
  }
  return Object.freeze({
    schemaVersion: 1,
    targetKey: value.targetKey,
    kind: value.kind,
  })
}

function parseCandidate(value, record) {
  if (!hasExactFields(value, [
    'schemaVersion',
    'targetKey',
    'kind',
    'identity',
    'targetId',
    'namespace',
    'ownerId',
    'organizationId',
    'resourceType',
    'createdAt',
  ]) || value.schemaVersion !== 1
    || value.targetKey !== record.plan.targetKey
    || value.kind !== record.plan.kind
    || value.namespace !== record.plan.namespace
    || value.ownerId !== record.plan.ownerId
    || value.organizationId !== record.plan.organizationId
    || value.resourceType !== record.plan.resourceType
    || typeof value.targetId !== 'string') {
    return null
  }

  const parsedIdentity = parseIdentity(value.identity)
  const targetPolicy = TARGET_POLICIES.get(value.kind)
  const createdAt = canonicalTimestamp(value.createdAt)
  const notBefore = Date.parse(record.plan.identity.creationWindow.notBefore)
  const notAfter = Date.parse(record.plan.identity.creationWindow.notAfter)
  if (!parsedIdentity
    || !sameIdentity(parsedIdentity, record.plan.identity)
    || !targetPolicy
    || !validTargetId(value.kind, value.targetId, targetPolicy)
    || !createdAt
    || createdAt.timestamp < notBefore
    || createdAt.timestamp > notAfter) {
    return null
  }

  return Object.freeze({
    schemaVersion: 1,
    targetKey: record.plan.targetKey,
    kind: record.plan.kind,
    identity: record.plan.identity,
    targetId: value.targetId,
    namespace: record.plan.namespace,
    ownerId: record.plan.ownerId,
    organizationId: record.plan.organizationId,
    resourceType: record.plan.resourceType,
    createdAt: createdAt.iso,
  })
}

function exactDeletionProof(value, record) {
  return hasExactFields(value, ['schemaVersion', 'targetId'])
    && value.schemaVersion === 1
    && typeof value.targetId === 'string'
    && record.targets.has(value.targetId)
}

function publicResult(status) {
  return Object.freeze({ status })
}

function reconciliationCriteria(record) {
  return Object.freeze({
    schemaVersion: 1,
    targetKey: record.plan.targetKey,
    kind: record.plan.kind,
    identity: record.plan.identity,
    namespace: record.plan.namespace,
    ownerId: record.plan.ownerId,
    organizationId: record.plan.organizationId,
    resourceType: record.plan.resourceType,
    creationWindow: record.plan.identity.creationWindow,
  })
}

function parseReconciliationResponse(value, record, committedTargets) {
  if (!hasExactFields(value, ['schemaVersion', 'authoritative', 'matches'])
    || value.schemaVersion !== 1
    || value.authoritative !== true
    || !Array.isArray(value.matches)
    || value.matches.length > MAX_RECONCILIATION_MATCHES) {
    return null
  }

  const parsed = []
  const targetIds = new Set()
  for (const match of value.matches) {
    const candidate = parseCandidate(match, record)
    if (!candidate
      || targetIds.has(candidate.targetId)
      || committedTargets.has(`${candidate.kind}\u0000${candidate.targetId}`)) {
      return null
    }
    targetIds.add(candidate.targetId)
    parsed.push(candidate)
  }
  return Object.freeze(parsed)
}

async function callReconciliationClient(reconciliationClient, criteria, timeoutMs) {
  const controller = new AbortController()
  let timeoutHandle = null
  const timeout = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort()
      reject(new SebStagingPrivateRunLedgerBlockedError())
    }, timeoutMs)
  })
  const lookup = Promise.resolve().then(async () => {
    if (!isAttestedReconciliationClient(reconciliationClient)) blocked()
    const attestedClient = reconciliationClient.client
    const resolver = attestedClient.findExactRunTargets
    const result = await resolver.call(
      attestedClient,
      criteria,
      Object.freeze({ signal: controller.signal }),
    )
    if (!isAttestedReconciliationClient(reconciliationClient)
      || reconciliationClient.client !== attestedClient
      || reconciliationClient.client.findExactRunTargets !== resolver) {
      blocked()
    }
    return result
  })

  try {
    return await Promise.race([lookup, timeout])
  } finally {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle)
  }
}

/**
 * Keep the exact mutable targets for one synthetic S5 run inside a private
 * closure. Callers may address one pre-planned target at a time; there is no
 * list/dump API and secret-shaped extra fields are rejected by every schema.
 */
export function createSebStagingPrivateRunLedger(input = {}) {
  if (!hasExactFields(input, [
    'schemaVersion',
    'identity',
    'namespace',
    'readEnvironment',
    'reconciliationClient',
    'reconciliationTimeoutMs',
    'clock',
  ])) blocked()
  const {
    schemaVersion,
    identity: identityInput,
    namespace,
    readEnvironment,
    reconciliationClient,
    reconciliationTimeoutMs,
    clock,
  } = input
  const identity = parseIdentity(identityInput)
  let initialEnvironment
  try {
    initialEnvironment = typeof readEnvironment === 'function' ? readEnvironment() : null
  } catch {
    blocked()
  }
  const now = typeof clock === 'function' ? clockTimestamp(clock) : null
  const notBefore = identity ? Date.parse(identity.creationWindow.notBefore) : null
  const notAfter = identity ? Date.parse(identity.creationWindow.notAfter) : null
  if (schemaVersion !== 1
    || !identity
    || namespace !== `qa:${identity.runId}`
    || typeof readEnvironment !== 'function'
    || !permitsCreation(initialEnvironment)
    || !isAttestedReconciliationClient(reconciliationClient)
    || !Number.isInteger(reconciliationTimeoutMs)
    || reconciliationTimeoutMs < MIN_RECONCILIATION_TIMEOUT_MS
    || reconciliationTimeoutMs > MAX_RECONCILIATION_TIMEOUT_MS
    || typeof clock !== 'function'
    || now === null
    || now < notBefore
    || now > notAfter) {
    blocked()
  }

  const records = new Map()
  const committedTargets = new Set()
  const busyTargets = new Set()

  function creationWindowIsActive() {
    const timestamp = clockTimestamp(clock)
    return timestamp !== null && timestamp >= notBefore && timestamp <= notAfter
  }

  function creationWindowHasEnded() {
    const timestamp = clockTimestamp(clock)
    return timestamp !== null && timestamp > notAfter
  }

  function environmentPermits(kind) {
    try {
      const current = readEnvironment()
      return kind === 'create' ? permitsCreation(current) : permitsCleanup(current)
    } catch {
      return false
    }
  }

  function findRecord(referenceInput) {
    const reference = parseReference(referenceInput)
    if (!reference) return null
    const record = records.get(reference.targetKey)
    return record?.plan.kind === reference.kind ? record : null
  }

  function planTarget(planInput) {
    try {
      if (!environmentPermits('create')) return publicResult('failed')
      const plan = parsePlan(planInput, identity, namespace)
      if (!plan
        || records.has(plan.targetKey)
        || !creationWindowIsActive()) {
        return publicResult('failed')
      }
      records.set(plan.targetKey, {
        plan,
        state: 'planned',
        targets: new Map(),
      })
      return publicResult('passed')
    } catch {
      return publicResult('failed')
    }
  }

  /**
   * Adopt only the personal organization that an already-committed synthetic
   * Auth account created transactionally. This changes ledger state only: it
   * cannot create product data, cannot adopt any other target kind, and is
   * available only after the bounded creation window has ended.
   */
  function adoptDerivedTarget(planInput, ownerReferenceInput) {
    try {
      if (!environmentPermits('cleanup') || !creationWindowHasEnded()) {
        return publicResult('failed')
      }
      const plan = parsePlan(planInput, identity, namespace)
      const ownerReference = parseReference(ownerReferenceInput)
      const ownerAlias = ownerReference?.targetKey.startsWith('account-')
        ? ownerReference.targetKey.slice('account-'.length)
        : ''
      if (!plan
        || plan.kind !== 'personalOrganization'
        || !ownerReference
        || ownerReference.kind !== 'account'
        || ownerAlias.length === 0
        || plan.targetKey !== `personal-organization-${ownerAlias}`) {
        return publicResult('failed')
      }
      const ownerRecord = records.get(ownerReference.targetKey)
      if (!ownerRecord
        || ownerRecord.plan.kind !== 'account'
        || ownerRecord.state !== 'committed'
        || ownerRecord.targets.size !== 1
        || busyTargets.has(ownerRecord.plan.targetKey)) {
        return publicResult('failed')
      }
      const [ownerSnapshot] = ownerRecord.targets.values()
      if (ownerSnapshot.targetId !== plan.ownerId) return publicResult('failed')

      const existing = records.get(plan.targetKey)
      if (existing) {
        const samePlan = existing.plan.schemaVersion === plan.schemaVersion
          && existing.plan.targetKey === plan.targetKey
          && existing.plan.kind === plan.kind
          && sameIdentity(existing.plan.identity, plan.identity)
          && existing.plan.namespace === plan.namespace
          && existing.plan.ownerId === plan.ownerId
          && existing.plan.organizationId === plan.organizationId
          && existing.plan.resourceType === plan.resourceType
        if (!samePlan
          || existing.state !== 'planned'
          || existing.targets.size !== 0
          || busyTargets.has(existing.plan.targetKey)) {
          return publicResult('failed')
        }
        existing.state = 'uncertain'
        return publicResult('passed')
      }
      records.set(plan.targetKey, {
        plan,
        state: 'uncertain',
        targets: new Map(),
      })
      return publicResult('passed')
    } catch {
      return publicResult('failed')
    }
  }

  function markUncertain(referenceInput) {
    try {
      if (!environmentPermits('create')) return publicResult('failed')
      const record = findRecord(referenceInput)
      if (!record || record.state !== 'planned' || busyTargets.has(record.plan.targetKey)) {
        return publicResult('failed')
      }
      if (!creationWindowIsActive()) return publicResult('failed')
      record.state = 'uncertain'
      return publicResult('passed')
    } catch {
      return publicResult('failed')
    }
  }

  function commitTarget(referenceInput, candidateInput) {
    try {
      if (!environmentPermits('create')) return publicResult('failed')
      const record = findRecord(referenceInput)
      if (!record || record.state !== 'uncertain' || busyTargets.has(record.plan.targetKey)) {
        return publicResult('failed')
      }
      const candidate = parseCandidate(candidateInput, record)
      const targetIdentity = candidate ? `${candidate.kind}\u0000${candidate.targetId}` : null
      if (!candidate || committedTargets.has(targetIdentity)) return publicResult('failed')
      record.targets.set(candidate.targetId, candidate)
      record.state = 'committed'
      committedTargets.add(targetIdentity)
      return publicResult('passed')
    } catch {
      return publicResult('failed')
    }
  }

  async function reconcileTarget(referenceInput) {
    let record
    try {
      record = findRecord(referenceInput)
      if (!record
        || record.state !== 'uncertain'
        || busyTargets.has(record.plan.targetKey)
        || !environmentPermits('cleanup')) {
        return publicResult('failed')
      }
      busyTargets.add(record.plan.targetKey)
      const response = await callReconciliationClient(
        reconciliationClient,
        reconciliationCriteria(record),
        reconciliationTimeoutMs,
      )
      if (!environmentPermits('cleanup')) return publicResult('failed')
      const candidates = parseReconciliationResponse(response, record, committedTargets)
      if (!candidates) return publicResult('failed')

      if (candidates.length === 0) {
        record.state = 'deleted'
        return publicResult('passed')
      }
      for (const candidate of candidates) {
        record.targets.set(candidate.targetId, candidate)
        committedTargets.add(`${candidate.kind}\u0000${candidate.targetId}`)
      }
      record.state = 'committed'
      return publicResult('passed')
    } catch {
      return publicResult('failed')
    } finally {
      if (record) busyTargets.delete(record.plan.targetKey)
    }
  }

  function readCleanupTarget(referenceInput) {
    try {
      if (!environmentPermits('cleanup')) return publicResult('failed')
      const reference = parseReference(referenceInput)
      if (!reference) return publicResult('failed')
      const record = records.get(reference.targetKey)
      if (!record) {
        return Object.freeze({
          status: 'passed',
          state: 'unplanned',
          snapshots: Object.freeze([]),
        })
      }
      if (record.plan.kind !== reference.kind) return publicResult('failed')
      const snapshots = Object.freeze(
        [...record.targets.values()].sort((left, right) => (
          left.targetId < right.targetId ? -1 : left.targetId > right.targetId ? 1 : 0
        )),
      )
      return Object.freeze({
        status: 'passed',
        state: record.state,
        snapshots,
      })
    } catch {
      return publicResult('failed')
    }
  }

  function markDeleted(referenceInput, proofInput) {
    try {
      if (!environmentPermits('cleanup')) return publicResult('failed')
      const record = findRecord(referenceInput)
      if (!record
        || record.state !== 'committed'
        || busyTargets.has(record.plan.targetKey)
        || !exactDeletionProof(proofInput, record)) {
        return publicResult('failed')
      }
      const targetId = proofInput.targetId
      record.targets.delete(targetId)
      record.state = record.targets.size === 0 ? 'deleted' : 'committed'
      return publicResult('passed')
    } catch {
      return publicResult('failed')
    }
  }

  return Object.freeze({
    planTarget,
    adoptDerivedTarget,
    markUncertain,
    commitTarget,
    reconcileTarget,
    readCleanupTarget,
    markDeleted,
  })
}
