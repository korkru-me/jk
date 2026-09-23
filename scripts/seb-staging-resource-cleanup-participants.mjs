const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const FORBIDDEN_RUN_ID_TERMS = /(prod(?:uction)?|live|real|customer)/
const SAFE_TARGET_KEY = /^[a-z][a-z0-9-]{0,63}$/
const UUID_PART = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const UUID = new RegExp(`^${UUID_PART}$`)
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const RELEASE_ID = /^asr-([0-9a-f]{32})-r([1-9][0-9]{0,9})-([0-9a-f]{16})$/
const SHA256 = /^[a-f0-9]{64}$/
const CONFIG_REVISION_ID = new RegExp(`^(${UUID_PART}):r([1-9][0-9]{0,9})$`)
const CHECK_IN_ID = new RegExp(`^(${UUID_PART}):(${UUID_PART})$`)
const ANSWER_STORAGE_ID = new RegExp(
  `^(${UUID_PART})/(${UUID_PART})/(${UUID_PART})/(${UUID_PART})\\.(jpg|pdf|png|webp)$`,
)
const ASSIGNMENT_ARTIFACT_ID = new RegExp(
  `^assignments/(${UUID_PART})/r([1-9][0-9]{0,9})/([0-9a-f]{64})\\.seb$`,
)
const MAX_CREATION_WINDOW_MS = 24 * 60 * 60 * 1_000
const MAX_ASSIGNMENT_CONFIG_REVISION = 2_147_483_646
const MIN_BOUNDARY_TIMEOUT_MS = 10
const MAX_BOUNDARY_TIMEOUT_MS = 30_000
const DEFAULT_BOUNDARY_TIMEOUT_MS = 5_000
const BLOCKED_MESSAGE = 'SEB Staging resource cleanup participants blocked'
const ANSWER_STORAGE_BUCKET = 'submission-files'
const ASSIGNMENT_ARTIFACT_BUCKET = 'assignment-seb-configs'

const ACCOUNT_ROLES = Object.freeze(new Map([
  ['teacher-primary', 'teacher'],
  ['teacher-unrelated', 'teacher'],
  ['student-primary', 'student'],
  ['student-secondary', 'student'],
]))

const KIND_PARTICIPANTS = Object.freeze(new Map([
  ['account', 'reference'],
  ['personalOrganization', 'personalOrganizations'],
  ['classroom', 'databaseFixture'],
  ['question', 'databaseFixture'],
  ['classroomMembership', 'databaseFixture'],
  ['assignment', 'databaseFixture'],
  ['configRevision', 'databaseFixture'],
  ['release', 'databaseFixture'],
  ['checkIn', 'databaseFixture'],
  ['submission', 'databaseFixture'],
  ['answer', 'databaseFixture'],
  ['proctorConnection', 'databaseFixture'],
  ['proctorEvent', 'databaseFixture'],
  ['answerStorageObject', 'answerStorage'],
  ['assignmentArtifact', 'artifactStorage'],
]))

const TEACHER_OWNED_KINDS = Object.freeze(new Set([
  'classroom', 'question', 'assignment', 'configRevision', 'release', 'assignmentArtifact',
]))
const STUDENT_OWNED_KINDS = Object.freeze(new Set([
  'classroomMembership', 'checkIn', 'submission', 'answer', 'proctorConnection',
  'proctorEvent', 'answerStorageObject',
]))

const RELATION_RULES = Object.freeze(new Map([
  ['account', Object.freeze({ parent: null, related: null, organization: null })],
  ['personalOrganization', Object.freeze({ parent: null, related: null, organization: null })],
  ['classroom', Object.freeze({ parent: null, related: null, organization: 'personalOrganization' })],
  // Questions are created before an assignment exists in the canonical browser
  // flow.  They are teacher/org-owned resources, not assignment children.  Any
  // later assignment reference is proved absent by the question closure before
  // deletion instead of being required as creation lineage here.
  ['question', Object.freeze({ parent: null, related: null, organization: 'personalOrganization' })],
  ['classroomMembership', Object.freeze({ parent: 'classroom', related: null, organization: 'personalOrganization' })],
  ['assignment', Object.freeze({ parent: 'classroom', related: null, organization: 'personalOrganization' })],
  ['configRevision', Object.freeze({ parent: 'assignment', related: null, organization: 'personalOrganization' })],
  ['release', Object.freeze({ parent: 'configRevision', related: 'assignment', organization: 'personalOrganization' })],
  ['checkIn', Object.freeze({ parent: 'assignment', related: null, organization: 'personalOrganization' })],
  ['submission', Object.freeze({ parent: 'assignment', related: null, organization: 'personalOrganization' })],
  ['answer', Object.freeze({ parent: 'submission', related: 'question', organization: 'personalOrganization' })],
  ['proctorConnection', Object.freeze({ parent: 'submission', related: null, organization: 'personalOrganization' })],
  ['proctorEvent', Object.freeze({ parent: 'proctorConnection', related: null, organization: 'personalOrganization' })],
  ['answerStorageObject', Object.freeze({ parent: 'answer', related: 'submission', organization: 'personalOrganization' })],
  ['assignmentArtifact', Object.freeze({ parent: 'release', related: 'assignment', organization: 'personalOrganization' })],
]))

const DATABASE_KIND_ORDER = Object.freeze(new Map([
  // Ordinary children are attested and deleted before their parent. The
  // assignment delete is reserved for its already-attested join row and the
  // two immutable SEB rows whose triggers intentionally reject direct DELETE.
  ['proctorEvent', 0],
  ['proctorConnection', 1],
  ['answer', 2],
  ['checkIn', 3],
  ['submission', 4],
  ['assignment', 5],
  ['release', 6],
  ['configRevision', 7],
  ['question', 8],
  ['classroomMembership', 9],
  ['classroom', 10],
]))

function topologySpec(kind, participant, resourceType, {
  alias = null,
  role = null,
  ownerKey = null,
  organizationKey = null,
  parentKey = null,
  relatedKey = null,
} = {}) {
  return Object.freeze({
    kind,
    participant,
    resourceType,
    alias,
    role,
    ownerKey,
    organizationKey,
    parentKey,
    relatedKey,
  })
}

const CANONICAL_TOPOLOGY = Object.freeze(new Map([
  ['account-teacher-primary', topologySpec('account', 'reference', 'teacher', { alias: 'teacher-primary', role: 'teacher' })],
  ['account-teacher-unrelated', topologySpec('account', 'reference', 'teacher', { alias: 'teacher-unrelated', role: 'teacher' })],
  ['account-student-primary', topologySpec('account', 'reference', 'student', { alias: 'student-primary', role: 'student' })],
  ['account-student-secondary', topologySpec('account', 'reference', 'student', { alias: 'student-secondary', role: 'student' })],
  ['personal-organization-teacher-primary', topologySpec('personalOrganization', 'personalOrganizations', 'personal', { ownerKey: 'account-teacher-primary' })],
  ['personal-organization-teacher-unrelated', topologySpec('personalOrganization', 'personalOrganizations', 'personal', { ownerKey: 'account-teacher-unrelated' })],
  ['personal-organization-student-primary', topologySpec('personalOrganization', 'personalOrganizations', 'personal', { ownerKey: 'account-student-primary' })],
  ['personal-organization-student-secondary', topologySpec('personalOrganization', 'personalOrganizations', 'personal', { ownerKey: 'account-student-secondary' })],
  ['classroom-primary', topologySpec('classroom', 'databaseFixture', 'subject', { ownerKey: 'account-teacher-primary', organizationKey: 'personal-organization-teacher-primary' })],
  ['assignment-primary', topologySpec('assignment', 'databaseFixture', 'exam', { ownerKey: 'account-teacher-primary', organizationKey: 'personal-organization-teacher-primary', parentKey: 'classroom-primary' })],
  ['question-written', topologySpec('question', 'databaseFixture', 'essay', { ownerKey: 'account-teacher-primary', organizationKey: 'personal-organization-teacher-primary' })],
  ['question-upload', topologySpec('question', 'databaseFixture', 'file_upload', { ownerKey: 'account-teacher-primary', organizationKey: 'personal-organization-teacher-primary' })],
  ['membership-primary', topologySpec('classroomMembership', 'databaseFixture', 'student', { ownerKey: 'account-student-primary', organizationKey: 'personal-organization-teacher-primary', parentKey: 'classroom-primary' })],
  ['membership-secondary', topologySpec('classroomMembership', 'databaseFixture', 'student', { ownerKey: 'account-student-secondary', organizationKey: 'personal-organization-teacher-primary', parentKey: 'classroom-primary' })],
  ['config-primary', topologySpec('configRevision', 'databaseFixture', 'seb_required', { ownerKey: 'account-teacher-primary', organizationKey: 'personal-organization-teacher-primary', parentKey: 'assignment-primary' })],
  ['release-primary', topologySpec('release', 'databaseFixture', 'test_plaintext', { ownerKey: 'account-teacher-primary', organizationKey: 'personal-organization-teacher-primary', parentKey: 'config-primary', relatedKey: 'assignment-primary' })],
  ['check-in-primary', topologySpec('checkIn', 'databaseFixture', 'windows', { ownerKey: 'account-student-primary', organizationKey: 'personal-organization-teacher-primary', parentKey: 'assignment-primary' })],
  ['submission-primary', topologySpec('submission', 'databaseFixture', 'seb_required', { ownerKey: 'account-student-primary', organizationKey: 'personal-organization-teacher-primary', parentKey: 'assignment-primary' })],
  ['answer-written', topologySpec('answer', 'databaseFixture', 'essay', { ownerKey: 'account-student-primary', organizationKey: 'personal-organization-teacher-primary', parentKey: 'submission-primary', relatedKey: 'question-written' })],
  ['answer-upload', topologySpec('answer', 'databaseFixture', 'file_upload', { ownerKey: 'account-student-primary', organizationKey: 'personal-organization-teacher-primary', parentKey: 'submission-primary', relatedKey: 'question-upload' })],
  ['proctor-connection', topologySpec('proctorConnection', 'databaseFixture', 'heartbeat', { ownerKey: 'account-student-primary', organizationKey: 'personal-organization-teacher-primary', parentKey: 'submission-primary' })],
  ['proctor-event', topologySpec('proctorEvent', 'databaseFixture', 'monitoring_started', { ownerKey: 'account-student-primary', organizationKey: 'personal-organization-teacher-primary', parentKey: 'proctor-connection' })],
  ['answer-storage', topologySpec('answerStorageObject', 'answerStorage', 'submission_file', { ownerKey: 'account-student-primary', organizationKey: 'personal-organization-teacher-primary', parentKey: 'answer-upload', relatedKey: 'submission-primary' })],
  ['assignment-artifact', topologySpec('assignmentArtifact', 'artifactStorage', 'seb', { ownerKey: 'account-teacher-primary', organizationKey: 'personal-organization-teacher-primary', parentKey: 'release-primary', relatedKey: 'assignment-primary' })],
]))

export const SEB_STAGING_RESOURCE_CLEANUP_TARGET_KEYS = Object.freeze([
  ...CANONICAL_TOPOLOGY.keys(),
])

/**
 * Construct the one permitted S5 cleanup topology. Callers provide only the
 * exact run identity; namespace, target keys, types, and relationships cannot
 * be customized by runtime wiring.
 */
export function createSebStagingResourceCleanupTopology(identity) {
  const parsedIdentity = parseRunIdentity(identity)
  if (!parsedIdentity) blocked()
  return freezeInput({
    schemaVersion: 1,
    identity: parsedIdentity,
    namespace: `qa:${parsedIdentity.runId}`,
    nodes: [...CANONICAL_TOPOLOGY.entries()].map(([targetKey, spec]) => ({
      schemaVersion: 1,
      targetKey,
      ...spec,
    })),
  })
}

export class SebStagingResourceCleanupParticipantsBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingResourceCleanupParticipantsBlockedError'
  }
}

function blocked() {
  throw new SebStagingResourceCleanupParticipantsBlockedError()
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

function parseTopology(topology) {
  if (!hasExactFields(topology, ['schemaVersion', 'identity', 'namespace', 'nodes'])
    || topology.schemaVersion !== 1
    || !Array.isArray(topology.nodes)) return null
  const identity = parseRunIdentity(topology.identity)
  if (!identity || topology.namespace !== `qa:${identity.runId}`) return null

  const nodes = []
  const byKey = new Map()
  const aliases = new Set()
  if (topology.nodes.length !== CANONICAL_TOPOLOGY.size) return null
  for (const value of topology.nodes) {
    if (!hasExactFields(value, [
      'schemaVersion', 'targetKey', 'kind', 'participant', 'resourceType',
      'alias', 'role', 'ownerKey', 'organizationKey', 'parentKey', 'relatedKey',
    ])
      || value.schemaVersion !== 1
      || typeof value.targetKey !== 'string'
      || !SAFE_TARGET_KEY.test(value.targetKey)
      || byKey.has(value.targetKey)
      || KIND_PARTICIPANTS.get(value.kind) !== value.participant
      || typeof value.resourceType !== 'string'
      || value.resourceType.length < 1
      || value.resourceType.length > 40) return null
    const canonical = CANONICAL_TOPOLOGY.get(value.targetKey)
    if (!canonical || Object.keys(canonical).some(field => value[field] !== canonical[field])) return null
    if (value.kind === 'account') {
      const expectedRole = ACCOUNT_ROLES.get(value.alias)
      if (!expectedRole
        || value.role !== expectedRole
        || value.resourceType !== expectedRole
        || aliases.has(value.alias)
        || value.ownerKey !== null
        || value.organizationKey !== null
        || value.parentKey !== null
        || value.relatedKey !== null) return null
      aliases.add(value.alias)
    } else if (value.alias !== null || value.role !== null) return null

    for (const field of ['ownerKey', 'organizationKey', 'parentKey', 'relatedKey']) {
      if (value[field] !== null
        && (typeof value[field] !== 'string' || !SAFE_TARGET_KEY.test(value[field]))) return null
    }
    const node = Object.freeze({ ...value })
    nodes.push(node)
    byKey.set(node.targetKey, node)
  }
  if (aliases.size !== ACCOUNT_ROLES.size
    || [...ACCOUNT_ROLES.keys()].some(alias => !aliases.has(alias))) return null

  for (const node of nodes) {
    const rule = RELATION_RULES.get(node.kind)
    const owner = node.ownerKey === null ? null : byKey.get(node.ownerKey)
    const organization = node.organizationKey === null ? null : byKey.get(node.organizationKey)
    const parent = node.parentKey === null ? null : byKey.get(node.parentKey)
    const related = node.relatedKey === null ? null : byKey.get(node.relatedKey)
    if (!rule
      || (node.kind !== 'account' && (!owner || owner.kind !== 'account'))
      || (TEACHER_OWNED_KINDS.has(node.kind) && owner?.role !== 'teacher')
      || (STUDENT_OWNED_KINDS.has(node.kind) && owner?.role !== 'student')
      || (rule.organization === null ? organization !== null : organization?.kind !== rule.organization)
      || (rule.parent === null ? parent !== null : parent?.kind !== rule.parent)
      || (rule.related === null ? related !== null : related?.kind !== rule.related)) return null
    if (organization && organization.ownerKey !== node.ownerKey && node.kind !== 'classroomMembership'
      && !STUDENT_OWNED_KINDS.has(node.kind)) return null
    if (organization && organization.ownerKey === null) return null
  }

  const databaseNodes = nodes.filter(node => node.participant === 'databaseFixture')
  if (databaseNodes.filter(node => node.kind === 'classroom').length !== 1
    || databaseNodes.filter(node => node.kind === 'assignment').length !== 1
    || databaseNodes.filter(node => node.kind === 'question').length < 1
    || nodes.filter(node => node.kind === 'assignmentArtifact').length > 1) return null

  return Object.freeze({
    schemaVersion: 1,
    identity,
    namespace: topology.namespace,
    nodes: Object.freeze(nodes),
    byKey,
  })
}

function parseRequestIdentity(identity, expected) {
  const runOnly = hasExactFields(identity, ['runId', 'sourceRevision', 'deploymentId'])
  const releaseBound = hasExactFields(identity, [
    'runId', 'sourceRevision', 'deploymentId', 'releaseId', 'releaseRevision', 'artifactSha256',
  ])
  if (!runOnly && !releaseBound) return null
  if (identity.runId !== expected.runId
    || identity.sourceRevision !== expected.sourceRevision
    || identity.deploymentId !== expected.deploymentId) return null
  if (!releaseBound) return Object.freeze({
    runId: identity.runId,
    sourceRevision: identity.sourceRevision,
    deploymentId: identity.deploymentId,
  })
  const release = typeof identity.releaseId === 'string' ? RELEASE_ID.exec(identity.releaseId) : null
  if (!release
    || !Number.isInteger(identity.releaseRevision)
    || identity.releaseRevision < 1
    || identity.releaseRevision > MAX_ASSIGNMENT_CONFIG_REVISION
    || Number(release[2]) !== identity.releaseRevision
    || typeof identity.artifactSha256 !== 'string'
    || !SHA256.test(identity.artifactSha256)
    || release[3] !== identity.artifactSha256.slice(0, 16)) return null
  return Object.freeze({ ...identity })
}

function parseRequest(request, topology) {
  if (!hasExactFields(request, ['schemaVersion', 'runId', 'namespace', 'identity', 'accounts'])
    || request.schemaVersion !== 1
    || request.runId !== topology.identity.runId
    || request.namespace !== topology.namespace
    || !Array.isArray(request.accounts)
    || request.accounts.length > ACCOUNT_ROLES.size) return null
  const identity = parseRequestIdentity(request.identity, topology.identity)
  if (!identity) return null
  const accounts = []
  const aliases = new Set()
  const ids = new Set()
  for (const account of request.accounts) {
    if (!hasExactFields(account, ['id', 'alias', 'role', 'namespace'])
      || !UUID.test(account.id)
      || ACCOUNT_ROLES.get(account.alias) !== account.role
      || account.namespace !== topology.namespace
      || aliases.has(account.alias)
      || ids.has(account.id)) return null
    const node = topology.nodes.find(candidate => (
      candidate.kind === 'account' && candidate.alias === account.alias
    ))
    if (!node || node.role !== account.role) return null
    aliases.add(account.alias)
    ids.add(account.id)
    accounts.push(Object.freeze({ ...account }))
  }
  return Object.freeze({ identity, accounts: Object.freeze(accounts) })
}

function validLedger(value) {
  return isDataRecord(value)
    && ['readCleanupTarget', 'reconcileTarget', 'markDeleted']
      .every(method => typeof value[method] === 'function')
}

function captureLedgerAttestation(value) {
  if (!validLedger(value)) return null
  try {
    return Object.freeze({
      ledger: value,
      readCleanupTarget: value.readCleanupTarget,
      reconcileTarget: value.reconcileTarget,
      markDeleted: value.markDeleted,
    })
  } catch {
    return null
  }
}

function sameLedgerAttestation(attestation) {
  if (!attestation || !validLedger(attestation.ledger)) return false
  try {
    return attestation.ledger.readCleanupTarget === attestation.readCleanupTarget
      && attestation.ledger.reconcileTarget === attestation.reconcileTarget
      && attestation.ledger.markDeleted === attestation.markDeleted
  } catch {
    return false
  }
}

function validClient(value, expectedBucket = null) {
  if (!hasExactFields(value, ['targetOrigin', 'credentialKind', 'client'])) return false
  try {
    return value.targetOrigin === OFFICIAL_STAGING_SUPABASE_ORIGIN
      && value.credentialKind === 'service-role'
      && value.client !== null
      && typeof value.client === 'object'
      && value.client.supabaseUrl === OFFICIAL_STAGING_SUPABASE_ORIGIN
      && (expectedBucket === null || value.client.bucketName === expectedBucket)
      && typeof value.client.enumerateExactCleanupTarget === 'function'
      && typeof value.client.deleteExactCleanupTarget === 'function'
  } catch {
    return false
  }
}

function captureClientAttestation(value, expectedBucket) {
  if (!validClient(value, expectedBucket)) return null
  try {
    return Object.freeze({
      wrapper: value,
      api: value.client,
      targetOrigin: value.targetOrigin,
      credentialKind: value.credentialKind,
      supabaseUrl: value.client.supabaseUrl,
      bucketName: expectedBucket === null ? null : value.client.bucketName,
      enumerate: value.client.enumerateExactCleanupTarget,
      delete: value.client.deleteExactCleanupTarget,
    })
  } catch {
    return null
  }
}

function sameClientAttestation(attestation, expectedBucket) {
  if (!attestation || !validClient(attestation.wrapper, expectedBucket)) return false
  try {
    return attestation.wrapper.client === attestation.api
      && attestation.wrapper.targetOrigin === attestation.targetOrigin
      && attestation.wrapper.credentialKind === attestation.credentialKind
      && attestation.api.supabaseUrl === attestation.supabaseUrl
      && (expectedBucket === null || attestation.api.bucketName === attestation.bucketName)
      && attestation.api.enumerateExactCleanupTarget === attestation.enumerate
      && attestation.api.deleteExactCleanupTarget === attestation.delete
  } catch {
    return false
  }
}

function freezeInput(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeInput))
  if (!isDataRecord(value)) return value
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, freezeInput(child)]),
  ))
}

function publicResult(status) {
  return Object.freeze({ status })
}

function referenceFor(node) {
  return Object.freeze({ schemaVersion: 1, targetKey: node.targetKey, kind: node.kind })
}

function exactPassed(result) {
  return hasExactFields(result, ['status']) && result.status === 'passed'
}

function exactState(result) {
  if (!hasExactFields(result, ['status', 'state', 'snapshots'])
    || result.status !== 'passed'
    || !['unplanned', 'planned', 'uncertain', 'committed', 'deleted'].includes(result.state)
    || !Array.isArray(result.snapshots)) return null
  if (result.state === 'committed') {
    return result.snapshots.length === 1 ? result.state : null
  }
  return result.snapshots.length === 0 ? result.state : null
}

function exactEnvironment(readEnvironment) {
  try {
    return hasOfficialStagingCleanupPolicy(readEnvironment())
  } catch {
    return false
  }
}

function createPrivilegedBoundary(readEnvironment, timeoutMs) {
  const pendingOperations = new Set()

  async function call(operation) {
    if (pendingOperations.size !== 0 || !exactEnvironment(readEnvironment)) {
      return Object.freeze({ boundaryOk: false, operationOk: false, value: null })
    }
    const abortController = new AbortController()
    let timeoutId
    const operationPromise = Promise.resolve()
      .then(() => operation(abortController.signal))
      .then(
        value => Object.freeze({ settled: true, operationOk: true, value }),
        () => Object.freeze({ settled: true, operationOk: false, value: null }),
      )
    // The deadline bounds the caller, not necessarily the underlying client.
    // Keep an abort-ignoring loser registered until its exact promise settles.
    let trackedOperation
    trackedOperation = operationPromise.then(outcome => {
      pendingOperations.delete(trackedOperation)
      return outcome
    })
    pendingOperations.add(trackedOperation)
    const timeoutPromise = new Promise(resolve => {
      timeoutId = setTimeout(() => {
        abortController.abort()
        resolve(Object.freeze({ settled: false, operationOk: false, value: null }))
      }, timeoutMs)
    })
    const outcome = await Promise.race([trackedOperation, timeoutPromise])
    clearTimeout(timeoutId)
    if (!outcome.settled || !exactEnvironment(readEnvironment)) {
      return Object.freeze({ boundaryOk: false, operationOk: false, value: null })
    }
    return Object.freeze({
      boundaryOk: true,
      operationOk: outcome.operationOk,
      value: outcome.value,
    })
  }

  return Object.freeze({
    call,
    isQuiescent() {
      return pendingOperations.size === 0
    },
  })
}

function participant(executor, isBoundaryQuiescent) {
  let busy = false
  return Object.freeze({
    async cleanupRun(request) {
      if (busy || !isBoundaryQuiescent()) return publicResult('failed')
      busy = true
      try {
        const passed = await executor(request)
        return passed && isBoundaryQuiescent()
          ? publicResult('passed')
          : publicResult('failed')
      } catch {
        return publicResult('failed')
      } finally {
        busy = false
      }
    },
  })
}

function parseAttestation(value) {
  if (!hasExactFields(value, [
    'schemaVersion', 'kind', 'targetId', 'runId', 'sourceRevision', 'deploymentId',
    'namespace', 'ownerId', 'organizationId', 'resourceType', 'createdAt', 'parentId', 'relatedId',
  ])) return null
  const createdAt = canonicalTimestamp(value.createdAt)
  if (value.schemaVersion !== 1
    || typeof value.targetId !== 'string'
    || !createdAt
    || (value.ownerId !== null && !UUID.test(value.ownerId))
    || (value.organizationId !== null && !UUID.test(value.organizationId))
    || (value.parentId !== null && typeof value.parentId !== 'string')
    || (value.relatedId !== null && typeof value.relatedId !== 'string')) return null
  return Object.freeze({ ...value, createdAt: createdAt.iso })
}

function exactMatchResponse(value) {
  return hasExactFields(value, ['matches']) && Array.isArray(value.matches) ? value.matches : null
}

/**
 * Build the four cleanup participants around a pre-planned, private run
 * ledger. Clients expose only a target-scoped find/enumerate/delete contract;
 * there is no unrestricted table, bucket, or ledger dump API. In particular,
 * databaseClient.deleteExactCleanupTarget is an authorized service-role
 * cleanup capability/RPC, not a raw table-delete handle. The personal-org
 * implementation owns the exact membership-before-organization transaction.
 */
export function createSebStagingResourceCleanupParticipants({
  readEnvironment,
  topology,
  privateRunLedger,
  answerStorageClient,
  artifactStorageClient,
  databaseClient,
  personalOrganizationsClient,
  boundaryTimeoutMs = DEFAULT_BOUNDARY_TIMEOUT_MS,
} = {}) {
  let initialEnvironment = null
  let parsedTopology = null
  let ledgerAttestation = null
  try {
    initialEnvironment = typeof readEnvironment === 'function' ? readEnvironment() : null
    parsedTopology = parseTopology(topology)
    ledgerAttestation = captureLedgerAttestation(privateRunLedger)
  } catch {
    blocked()
  }
  if (typeof readEnvironment !== 'function'
    || !hasOfficialStagingCleanupPolicy(initialEnvironment)
    || !parsedTopology
    || !ledgerAttestation
    || !validClient(answerStorageClient, ANSWER_STORAGE_BUCKET)
    || !validClient(artifactStorageClient, ASSIGNMENT_ARTIFACT_BUCKET)
    || !validClient(databaseClient)
    || !validClient(personalOrganizationsClient)
    || !Number.isInteger(boundaryTimeoutMs)
    || boundaryTimeoutMs < MIN_BOUNDARY_TIMEOUT_MS
    || boundaryTimeoutMs > MAX_BOUNDARY_TIMEOUT_MS) blocked()

  const boundary = createPrivilegedBoundary(readEnvironment, boundaryTimeoutMs)
  const snapshotCache = new Map()
  let databaseFixtureComplete = false

  async function callClientBoundary(client, expectedBucket, operation) {
    const attestation = captureClientAttestation(client, expectedBucket)
    if (!attestation) {
      return Object.freeze({ boundaryOk: false, operationOk: false, value: null })
    }
    const outcome = await boundary.call(signal => {
      if (!sameClientAttestation(attestation, expectedBucket)) blocked()
      return operation(attestation, signal)
    })
    if (!sameClientAttestation(attestation, expectedBucket)) {
      return Object.freeze({ boundaryOk: false, operationOk: false, value: null })
    }
    return outcome
  }

  function ledgerCall(method, ...args) {
    if (!exactEnvironment(readEnvironment) || !sameLedgerAttestation(ledgerAttestation)) return null
    let value
    try {
      value = ledgerAttestation[method].call(ledgerAttestation.ledger, ...args)
    } catch {
      return null
    }
    return exactEnvironment(readEnvironment) && sameLedgerAttestation(ledgerAttestation)
      ? value
      : null
  }

  function readState(node) {
    const result = ledgerCall('readCleanupTarget', referenceFor(node))
    if (result === null) return Object.freeze({ valid: false, state: null })
    const state = exactState(result)
    if (state) {
      if (result.snapshots.some(snapshot => !isDataRecord(snapshot))) {
        return Object.freeze({ valid: false, state: null })
      }
      if (result.snapshots.length > 0) {
        // Deleted dependencies intentionally keep their immutable, validated
        // snapshots in this closure. Later participants need those exact IDs
        // to attest graph edges after an earlier participant deleted a child.
        // This is process-local retry state, not crash/restart recovery.
        snapshotCache.set(node.targetKey, Object.freeze([...result.snapshots]))
      }
      return Object.freeze({ valid: true, state })
    }
    return Object.freeze({ valid: false, state: null })
  }

  function rawSnapshots(node) {
    if (!snapshotCache.has(node.targetKey)) {
      const state = readState(node)
      if (!state.valid) return null
    }
    return snapshotCache.get(node.targetKey) ?? null
  }

  function relationshipTargetId(snapshot) {
    if (snapshot?.kind !== 'personalOrganization') return snapshot?.targetId ?? null
    if (typeof snapshot.targetId !== 'string') return null
    const separator = snapshot.targetId.indexOf(':')
    return separator > 0 ? snapshot.targetId.slice(0, separator) : null
  }

  function expectedRelationshipId(key) {
    if (key === null) return null
    const snapshots = rawSnapshots(parsedTopology.byKey.get(key))
    return snapshots?.length === 1 ? relationshipTargetId(snapshots[0]) : null
  }

  function validateSnapshot(node, snapshot) {
    if (!hasExactFields(snapshot, [
      'schemaVersion', 'targetKey', 'kind', 'identity', 'namespace', 'ownerId',
      'organizationId', 'resourceType', 'targetId', 'createdAt',
    ])
      || snapshot.schemaVersion !== 1
      || snapshot.targetKey !== node.targetKey
      || snapshot.kind !== node.kind
      || snapshot.namespace !== parsedTopology.namespace
      || snapshot.resourceType !== node.resourceType
      || !hasExactFields(snapshot.identity, [
        'runId', 'sourceRevision', 'deploymentId', 'creationWindow',
      ])
      || JSON.stringify(snapshot.identity) !== JSON.stringify(parsedTopology.identity)
      || snapshot.ownerId !== expectedRelationshipId(node.ownerKey)
      || snapshot.organizationId !== expectedRelationshipId(node.organizationKey)) return false
    const createdAt = canonicalTimestamp(snapshot.createdAt)
    return createdAt !== null
      && createdAt.timestamp >= Date.parse(parsedTopology.identity.creationWindow.notBefore)
      && createdAt.timestamp <= Date.parse(parsedTopology.identity.creationWindow.notAfter)
  }

  function isOptionalStorageDependency(node, key) {
    return (node.kind === 'answerStorageObject' || node.kind === 'assignmentArtifact')
      && (key === node.parentKey || key === node.relatedKey)
  }

  function validateSnapshotGraph(node, snapshot, requestIdentity, ancestors = new Set()) {
    if (ancestors.has(node.targetKey) || !validateSnapshot(node, snapshot)) return false
    const nextAncestors = new Set(ancestors)
    nextAncestors.add(node.targetKey)
    for (const key of [
      node.ownerKey, node.organizationKey, node.parentKey, node.relatedKey,
    ]) {
      if (key === null) continue
      const dependency = parsedTopology.byKey.get(key)
      const snapshots = dependency ? rawSnapshots(dependency) : null
      if (isOptionalStorageDependency(node, key)) {
        const state = dependency ? readState(dependency) : null
        if (!state?.valid || state.state === 'uncertain') return false
        if (snapshots === null) {
          if (!['unplanned', 'planned', 'deleted'].includes(state.state)) return false
          continue
        }
      }
      if (!snapshots || snapshots.length !== 1
        || !validateSnapshotGraph(dependency, snapshots[0], requestIdentity, nextAncestors)) {
        return false
      }
    }
    const relationship = relationshipFor(node, snapshot.targetId)
    return relationship !== null
      && validateEncodedGraph(node, snapshot.targetId, relationship, requestIdentity)
  }

  function relationshipFor(node, targetId = null) {
    const ownerId = expectedRelationshipId(node.ownerKey)
    const organizationId = expectedRelationshipId(node.organizationKey)
    let parentId = expectedRelationshipId(node.parentKey)
    let relatedId = expectedRelationshipId(node.relatedKey)
    if (node.kind === 'answerStorageObject') {
      const match = typeof targetId === 'string' ? ANSWER_STORAGE_ID.exec(targetId) : null
      if (!match
        || match[1] !== ownerId
        || (parentId !== null && parentId !== match[3])
        || (relatedId !== null && relatedId !== match[2])) return null
      parentId = match[3]
      relatedId = match[2]
    } else if (node.kind === 'assignmentArtifact') {
      const match = typeof targetId === 'string' ? ASSIGNMENT_ARTIFACT_ID.exec(targetId) : null
      if (!match) return null
      const derivedReleaseId = `asr-${match[1].replaceAll('-', '')}-r${match[2]}-${match[3].slice(0, 16)}`
      if ((parentId !== null && parentId !== derivedReleaseId)
        || (relatedId !== null && relatedId !== match[1])) return null
      parentId = derivedReleaseId
      relatedId = match[1]
    }
    if ((node.ownerKey !== null && ownerId === null)
      || (node.organizationKey !== null && organizationId === null)
      || (node.parentKey !== null && parentId === null)
      || (node.relatedKey !== null && relatedId === null)) return null
    return Object.freeze({ ownerId, organizationId, parentId, relatedId })
  }

  function validateEncodedGraph(node, targetId, relationship, requestIdentity) {
    if (node.kind === 'configRevision') {
      const match = CONFIG_REVISION_ID.exec(targetId)
      return match !== null && match[1] === relationship.parentId
    }
    if (node.kind === 'release') {
      const match = RELEASE_ID.exec(targetId)
      const config = CONFIG_REVISION_ID.exec(relationship.parentId)
      return match !== null
        && config !== null
        && match[1] === relationship.relatedId.replaceAll('-', '')
        && Number(match[2]) === Number(config[2])
        && (!Object.hasOwn(requestIdentity, 'releaseId') || (
          targetId === requestIdentity.releaseId
          && Number(match[2]) === requestIdentity.releaseRevision
        ))
    }
    if (node.kind === 'checkIn') {
      const match = CHECK_IN_ID.exec(targetId)
      return match !== null && match[1] === relationship.parentId && match[2] === relationship.ownerId
    }
    if (node.kind === 'proctorConnection') {
      const match = CHECK_IN_ID.exec(targetId)
      return match !== null && match[1] === relationship.parentId
    }
    if (node.kind === 'answerStorageObject') {
      const match = ANSWER_STORAGE_ID.exec(targetId)
      return match !== null
        && match[1] === relationship.ownerId
        && match[2] === relationship.relatedId
        && match[3] === relationship.parentId
    }
    if (node.kind === 'assignmentArtifact') {
      const match = ASSIGNMENT_ARTIFACT_ID.exec(targetId)
      const release = RELEASE_ID.exec(relationship.parentId)
      return match !== null
        && release !== null
        && match[1] === relationship.relatedId
        && Number(match[2]) === Number(release[2])
        && match[3].slice(0, 16) === release[3]
        && (!Object.hasOwn(requestIdentity, 'artifactSha256') || (
          Number(match[2]) === requestIdentity.releaseRevision
          && match[3] === requestIdentity.artifactSha256
        ))
    }
    return true
  }

  function validateAttestation(value, node, targetId, requestIdentity) {
    const attestation = parseAttestation(value)
    const relationship = relationshipFor(node, targetId)
    if (!attestation || !relationship
      || attestation.kind !== node.kind
      || attestation.targetId !== targetId
      || attestation.runId !== parsedTopology.identity.runId
      || attestation.sourceRevision !== parsedTopology.identity.sourceRevision
      || attestation.deploymentId !== parsedTopology.identity.deploymentId
      || attestation.namespace !== parsedTopology.namespace
      || attestation.ownerId !== relationship.ownerId
      || attestation.organizationId !== relationship.organizationId
      || attestation.resourceType !== node.resourceType
      || attestation.parentId !== relationship.parentId
      || attestation.relatedId !== relationship.relatedId
      || !validateEncodedGraph(node, targetId, relationship, requestIdentity)) return null
    const timestamp = Date.parse(attestation.createdAt)
    if (timestamp < Date.parse(parsedTopology.identity.creationWindow.notBefore)
      || timestamp > Date.parse(parsedTopology.identity.creationWindow.notAfter)) return null
    return attestation
  }

  function expectedBucketForNode(node) {
    if (node.kind === 'answerStorageObject') return ANSWER_STORAGE_BUCKET
    if (node.kind === 'assignmentArtifact') return ASSIGNMENT_ARTIFACT_BUCKET
    return null
  }

  function exactStoragePrefix(node, targetId) {
    if (node.kind === 'answerStorageObject') {
      const match = ANSWER_STORAGE_ID.exec(targetId)
      return match === null ? null : `${match[1]}/${match[2]}/${match[3]}/`
    }
    if (node.kind === 'assignmentArtifact') {
      const match = ASSIGNMENT_ARTIFACT_ID.exec(targetId)
      return match === null ? null : `assignments/${match[1]}/r${match[2]}/`
    }
    return null
  }

  function clientInput(node, extra = {}) {
    const relationship = relationshipFor(node, extra.targetId)
    if (!relationship) return null
    const storageBucket = expectedBucketForNode(node)
    const storagePrefix = storageBucket === null
      ? null
      : exactStoragePrefix(node, extra.targetId)
    if (storageBucket !== null && storagePrefix === null) return null
    return freezeInput({
      schemaVersion: 1,
      reference: referenceFor(node),
      runIdentity: parsedTopology.identity,
      relationship,
      storageBucket,
      storagePrefix,
      ...extra,
    })
  }

  async function reconcile(node) {
    if (!exactEnvironment(readEnvironment) || !sameLedgerAttestation(ledgerAttestation)) return false
    let result
    try {
      result = await ledgerAttestation.reconcileTarget.call(
        ledgerAttestation.ledger,
        referenceFor(node),
      )
    } catch {
      return false
    }
    return exactEnvironment(readEnvironment)
      && sameLedgerAttestation(ledgerAttestation)
      && exactPassed(result)
  }

  async function resolveCommittedNodes(nodes, requestIdentity) {
    const committed = []
    for (const node of nodes) {
      let state = readState(node)
      if (!state.valid) return null
      if (state.state === 'unplanned' || state.state === 'planned' || state.state === 'deleted') continue
      if (state.state === 'uncertain') {
        if (!await reconcile(node)) return null
        state = readState(node)
        if (!state.valid) return null
        if (state.state === 'deleted') continue
        if (state.state !== 'committed') return null
      }
      if (state.state !== 'committed') return null
      if (node.kind === 'answerStorageObject' || node.kind === 'assignmentArtifact') {
        for (const key of [node.parentKey, node.relatedKey]) {
          const dependency = parsedTopology.byKey.get(key)
          if (!dependency) return null
          let dependencyState = readState(dependency)
          if (!dependencyState.valid) return null
          if (dependencyState.state === 'uncertain') {
            if (!await reconcile(dependency)) return null
            dependencyState = readState(dependency)
          }
          if (!dependencyState.valid || dependencyState.state === 'uncertain') return null
        }
      }
      const snapshots = rawSnapshots(node)
      if (!snapshots
        || snapshots.length < 1
        || (node.kind === 'personalOrganization' && snapshots.length !== 1)) return null
      for (const snapshot of snapshots) committed.push(Object.freeze({ node, snapshot }))
    }
    // Populate the cache before validating edges so topology order is irrelevant.
    for (const item of committed) {
      if (!validateSnapshotGraph(item.node, item.snapshot, requestIdentity)) return null
    }
    return committed
  }

  async function validateRequestAccounts(parsedRequest) {
    const suppliedByAlias = new Map(
      parsedRequest.accounts.map(account => [account.alias, account]),
    )
    let committedCount = 0
    for (const node of parsedTopology.nodes.filter(candidate => candidate.kind === 'account')) {
      let state = readState(node)
      if (!state.valid) return false
      if (state.state === 'uncertain') {
        if (!await reconcile(node)) return false
        state = readState(node)
        if (!state.valid) return false
      }
      const account = suppliedByAlias.get(node.alias)
      if (state.state !== 'committed') {
        if (!['unplanned', 'planned', 'deleted'].includes(state.state) || account) return false
        continue
      }
      committedCount += 1
      const snapshots = rawSnapshots(node)
      if (!account
        || !snapshots
        || snapshots.length !== 1
        || !validateSnapshot(node, snapshots[0])
        || snapshots[0].targetId !== account.id
        || snapshots[0].resourceType !== account.role) return false
    }
    return committedCount === suppliedByAlias.size
  }

  async function enumerateTarget(client, item, requestIdentity) {
    const input = clientInput(item.node, { targetId: item.snapshot.targetId })
    if (!input) return null
    const response = await callClientBoundary(
      client,
      expectedBucketForNode(item.node),
      (attestation, signal) => attestation.enumerate.call(
        attestation.api,
        input,
        Object.freeze({ signal }),
      ),
    )
    if (!response.boundaryOk || !response.operationOk) return null
    const matches = exactMatchResponse(response.value)
    if (matches === null || matches.length > 1) return null
    if (matches.length === 0) return Object.freeze([])
    const attestation = validateAttestation(
      matches[0], item.node, item.snapshot.targetId, requestIdentity,
    )
    return attestation ? Object.freeze([attestation]) : null
  }

  async function markDeleted(item) {
    const result = ledgerCall('markDeleted', referenceFor(item.node), {
      schemaVersion: 1,
      targetId: item.snapshot.targetId,
    })
    return result !== null && exactPassed(result)
  }

  async function cleanupCommittedNodes(nodes, client, parsedRequest, sort = null) {
    const committed = await resolveCommittedNodes(nodes, parsedRequest.identity)
    if (committed === null) return false
    if (!await validateRequestAccounts(parsedRequest)) return false

    const preflight = new Map()
    for (const item of committed) {
      const matches = await enumerateTarget(client, item, parsedRequest.identity)
      if (matches === null) return false
      preflight.set(`${item.node.targetKey}\u0000${item.snapshot.targetId}`, matches.length)
    }

    const ordered = sort ? [...committed].sort(sort) : committed
    for (const item of ordered) {
      if (preflight.get(`${item.node.targetKey}\u0000${item.snapshot.targetId}`) === 1) {
        // A previously deleted parent may have cascaded this exact child. Do
        // not invoke a protected child DELETE; attest the live state again.
        const liveMatches = await enumerateTarget(client, item, parsedRequest.identity)
        if (liveMatches === null) return false
        if (liveMatches.length === 0) {
          if (!await markDeleted(item)) return false
          continue
        }
        // These server-only rows are immutable and their database triggers
        // reject direct DELETE. They must already be absent through the exact
        // assignment cascade; otherwise stop instead of attempting a bypass.
        if (item.node.kind === 'release' || item.node.kind === 'configRevision') {
          return false
        }
        const input = clientInput(item.node, { targetId: item.snapshot.targetId })
        if (!input) return false
        const deletion = await callClientBoundary(
          client,
          expectedBucketForNode(item.node),
          (attestation, signal) => attestation.delete.call(
            attestation.api,
            input,
            Object.freeze({ signal }),
          ),
        )
        if (!deletion.boundaryOk
          || !deletion.operationOk
          || !exactPassed(deletion.value)) return false
        const remaining = await enumerateTarget(client, item, parsedRequest.identity)
        if (remaining === null || remaining.length !== 0) return false
      }
      if (!await markDeleted(item)) return false
    }
    return true
  }

  function nodesFor(participantName) {
    return parsedTopology.nodes.filter(node => node.participant === participantName)
  }

  async function parsedRequestOrNull(request) {
    let parsed
    try {
      parsed = parseRequest(request, parsedTopology)
    } catch {
      return null
    }
    if (!parsed || !await validateRequestAccounts(parsed)) return null
    if (Object.hasOwn(parsed.identity, 'releaseId')) {
      const releaseNodes = parsedTopology.nodes.filter(node => node.kind === 'release')
      const artifactNodes = parsedTopology.nodes.filter(node => node.kind === 'assignmentArtifact')
      if (releaseNodes.length !== 1 || artifactNodes.length !== 1) return null
      let releaseState = readState(releaseNodes[0])
      let artifactState = readState(artifactNodes[0])
      if (releaseState.valid && releaseState.state === 'uncertain') {
        if (!await reconcile(releaseNodes[0])) return null
        releaseState = readState(releaseNodes[0])
      }
      if (artifactState.valid && artifactState.state === 'uncertain') {
        if (!await reconcile(artifactNodes[0])) return null
        artifactState = readState(artifactNodes[0])
      }
      if (!releaseState.valid || !artifactState.valid
        || !['committed', 'deleted'].includes(releaseState.state)
        || !['committed', 'deleted'].includes(artifactState.state)) return null
      const releases = rawSnapshots(releaseNodes[0])
      const artifacts = rawSnapshots(artifactNodes[0])
      if ((releaseState.state === 'committed' && (!releases || releases.length !== 1))
        || !artifacts || artifacts.length !== 1
        || (releases && (releases.length !== 1
          || releases[0].targetId !== parsed.identity.releaseId
          || !validateSnapshotGraph(releaseNodes[0], releases[0], parsed.identity)))
        || !validateSnapshotGraph(artifactNodes[0], artifacts[0], parsed.identity)) return null
    }
    return parsed
  }

  const answerStorage = participant(async request => {
    const parsed = await parsedRequestOrNull(request)
    return parsed !== null && cleanupCommittedNodes(
      nodesFor('answerStorage'), answerStorageClient, parsed,
    )
  }, boundary.isQuiescent)

  const artifactStorage = participant(async request => {
    const parsed = await parsedRequestOrNull(request)
    return parsed !== null && cleanupCommittedNodes(
      nodesFor('artifactStorage'), artifactStorageClient, parsed,
    )
  }, boundary.isQuiescent)

  const databaseFixture = participant(async request => {
    databaseFixtureComplete = false
    const parsed = await parsedRequestOrNull(request)
    if (!parsed) return false
    const passed = await cleanupCommittedNodes(
      nodesFor('databaseFixture'),
      databaseClient,
      parsed,
      (left, right) => {
        const rank = (DATABASE_KIND_ORDER.get(left.node.kind) ?? 99)
          - (DATABASE_KIND_ORDER.get(right.node.kind) ?? 99)
        return rank || left.node.targetKey.localeCompare(right.node.targetKey)
      },
    )
    databaseFixtureComplete = passed
    return passed
  }, boundary.isQuiescent)

  const personalOrganizations = participant(async request => {
    if (!databaseFixtureComplete) return false
    const parsed = await parsedRequestOrNull(request)
    return parsed !== null && cleanupCommittedNodes(
      nodesFor('personalOrganizations'), personalOrganizationsClient, parsed,
    )
  }, boundary.isQuiescent)

  return Object.freeze({
    answerStorage,
    artifactStorage,
    databaseFixture,
    personalOrganizations,
  })
}
