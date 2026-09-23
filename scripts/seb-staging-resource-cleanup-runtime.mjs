const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const ANSWER_STORAGE_BUCKET = 'submission-files'
const ASSIGNMENT_ARTIFACT_BUCKET = 'assignment-seb-configs'
const BLOCKED_MESSAGE = 'SEB Staging resource cleanup runtime blocked'
const MAX_RECONCILIATION_MATCHES = 8
const QUERY_LIMIT = MAX_RECONCILIATION_MATCHES + 1
const MIN_TIMEOUT_MS = 10
const MAX_TIMEOUT_MS = 30_000
const DEFAULT_TIMEOUT_MS = 5_000
const MAX_WINDOW_MS = 24 * 60 * 60 * 1_000
const MAX_ASSIGNMENT_CONFIG_REVISION = 2_147_483_646
const UUID_PART = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const UUID = new RegExp(`^${UUID_PART}$`)
const CONFIG_REVISION_ID = new RegExp(`^(${UUID_PART}):r([1-9][0-9]{0,9})$`)
const CHECK_IN_ID = new RegExp(`^(${UUID_PART}):(${UUID_PART})$`)
const RELEASE_ID = /^asr-([0-9a-f]{32})-r([1-9][0-9]{0,9})-([0-9a-f]{16})$/
const ANSWER_STORAGE_ID = new RegExp(
  `^(${UUID_PART})/(${UUID_PART})/(${UUID_PART})/(${UUID_PART})\\.(jpg|pdf|png|webp)$`,
)
const ASSIGNMENT_ARTIFACT_ID = new RegExp(
  `^assignments/(${UUID_PART})/r([1-9][0-9]{0,9})/([0-9a-f]{64})\\.seb$`,
)
const RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const SHA256 = /^[a-f0-9]{64}$/
const BIGINT_TEXT = /^(?:0|[1-9][0-9]*)$/
const FORBIDDEN_RUN_ID_TERMS = /(prod(?:uction)?|live|real|customer)/

const REQUIRED_ENVIRONMENT = Object.freeze({
  KORKRU_DEPLOYMENT_ENV: 'staging',
  EXAM_QA_ENVIRONMENT: 'staging',
  VERCEL_ENV: 'preview',
  NEXT_PUBLIC_SITE_URL: OFFICIAL_STAGING_SITE_ORIGIN,
  NEXT_PUBLIC_SUPABASE_URL: OFFICIAL_STAGING_SUPABASE_ORIGIN,
  EXAM_QA_DATA_POLICY: 'synthetic-only',
  EXAM_QA_COPY_PRODUCTION_DATA: 'false',
  EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
})

const TARGETS = Object.freeze(new Map([
  ['personal-organization-teacher-primary', ['personalOrganization', 'personal']],
  ['personal-organization-teacher-unrelated', ['personalOrganization', 'personal']],
  ['personal-organization-student-primary', ['personalOrganization', 'personal']],
  ['personal-organization-student-secondary', ['personalOrganization', 'personal']],
  ['classroom-primary', ['classroom', 'subject']],
  ['assignment-primary', ['assignment', 'exam']],
  ['question-written', ['question', 'essay']],
  ['question-upload', ['question', 'file_upload']],
  ['membership-primary', ['classroomMembership', 'student']],
  ['membership-secondary', ['classroomMembership', 'student']],
  ['config-primary', ['configRevision', 'seb_required']],
  ['release-primary', ['release', 'test_plaintext']],
  ['check-in-primary', ['checkIn', 'windows']],
  ['submission-primary', ['submission', 'seb_required']],
  ['answer-written', ['answer', 'essay']],
  ['answer-upload', ['answer', 'file_upload']],
  ['proctor-connection', ['proctorConnection', 'heartbeat']],
  ['proctor-event', ['proctorEvent', 'monitoring_started']],
  ['answer-storage', ['answerStorageObject', 'submission_file']],
  ['assignment-artifact', ['assignmentArtifact', 'seb']],
]))
const ACCOUNT_TARGETS = Object.freeze(new Map([
  ['account-teacher-primary', ['account', 'teacher']],
  ['account-teacher-unrelated', ['account', 'teacher']],
  ['account-student-primary', ['account', 'student']],
  ['account-student-secondary', ['account', 'student']],
]))

const RAW_CLIENT_FIELDS = Object.freeze([
  'supabaseUrl',
  'credentialKind',
  'enumerateDatabase',
  'deleteDatabase',
  'enumerateStorage',
  'deleteStorage',
  'close',
])

const ORGANIZATION_CHILD_TABLES = Object.freeze([
  'org_invitations',
  'question_sets',
  'question_set_shares',
  'learning_standards',
  'question_standards',
  'notifications',
  'exam_android_approvals',
  'education_research_score_drafts',
  'education_research_import_templates',
  'education_research_import_template_rows',
  'education_research_import_batches',
  'education_research_import_batch_rows',
  'questions',
  'classrooms',
  'assignments',
  'submissions',
  'submission_answers',
  'question_shares',
  'assignment_seb_config_revisions',
  'assignment_seb_config_releases',
  'student_work_artifacts',
  'teaching_boards',
  'exam_seb_checkins',
  'exam_proctor_sessions',
  'exam_proctor_connections',
  'exam_proctor_events',
  'ioc_forms',
  'ioc_form_standards',
  'ioc_form_items',
  'ioc_form_experts',
  'ioc_ratings',
  'ioc_form_events',
  'education_research_projects',
  'education_research_participants',
  'education_research_measurements',
  'education_research_scores',
  'education_research_score_history',
  'education_research_export_events',
])

const ASSIGNMENT_UNEXPECTED_DEPENDENCIES = Object.freeze([
  ['submissions', 'assignment_id'],
  ['exam_seb_checkins', 'assignment_id'],
  ['exam_proctor_sessions', 'assignment_id'],
  ['exam_proctor_connections', 'assignment_id'],
  ['exam_proctor_events', 'assignment_id'],
  ['assignment_extensions', 'assignment_id'],
  ['notifications', 'related_assignment_id'],
  ['exam_android_approvals', 'assignment_id'],
  ['education_research_measurements', 'assignment_id'],
  ['teaching_boards', 'assignment_id'],
  ['ioc_forms', 'assignment_id'],
])

const QUESTION_UNEXPECTED_DEPENDENCIES = Object.freeze([
  ['submission_answers', 'question_id'],
  ['question_shares', 'question_id'],
  ['question_standards', 'question_id'],
  ['teaching_boards', 'question_id'],
  ['ioc_form_items', 'source_question_id'],
  ['questions', 'parent_question_id'],
])

const QUESTION_ARRAY_DEPENDENCIES = Object.freeze([
  ['assignments', 'question_ids'],
  ['question_sets', 'question_ids'],
  ['education_research_measurements', 'source_question_ids'],
  ['education_research_measurements', 'snapshot_question_ids'],
])

const CLASSROOM_UNEXPECTED_DEPENDENCIES = Object.freeze([
  ['classroom_students', 'classroom_id'],
  ['assignment_classrooms', 'classroom_id'],
  ['assignments', 'classroom_id'],
  ['classroom_invitations', 'classroom_id'],
  ['classroom_co_teachers', 'classroom_id'],
  ['classroom_posts', 'classroom_id'],
  ['notifications', 'related_classroom_id'],
  ['student_notes', 'classroom_id'],
  ['education_research_projects', 'classroom_id'],
  ['ioc_forms', 'classroom_id'],
])

const MIME_BY_EXTENSION = Object.freeze({
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
})

export class SebStagingResourceCleanupRuntimeBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingResourceCleanupRuntimeBlockedError'
  }
}

function blocked() {
  throw new SebStagingResourceCleanupRuntimeBlockedError()
}

function isRecord(value) {
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
  if (!isRecord(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...fields].sort()
  return actual.length === expected.length
    && actual.every((field, index) => field === expected[index])
}

function freezeInput(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeInput))
  if (!isRecord(value)) return value
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, freezeInput(child)]),
  ))
}

function isAbortSignal(value) {
  try {
    return value !== null
      && typeof value === 'object'
      && typeof value.aborted === 'boolean'
      && typeof value.addEventListener === 'function'
      && typeof value.removeEventListener === 'function'
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

function parseIdentity(value) {
  if (!hasExactFields(value, ['runId', 'sourceRevision', 'deploymentId', 'creationWindow'])
    || !hasExactFields(value.creationWindow, ['notBefore', 'notAfter'])) return null
  const notBefore = canonicalTimestamp(value.creationWindow.notBefore)
  const notAfter = canonicalTimestamp(value.creationWindow.notAfter)
  if (!RUN_ID.test(value.runId)
    || value.runId === 'seb-s5-preview'
    || FORBIDDEN_RUN_ID_TERMS.test(value.runId)
    || !SOURCE_REVISION.test(value.sourceRevision)
    || !DEPLOYMENT_ID.test(value.deploymentId)
    || !notBefore
    || !notAfter
    || notAfter.timestamp <= notBefore.timestamp
    || notAfter.timestamp - notBefore.timestamp > MAX_WINDOW_MS) return null
  return Object.freeze({
    runId: value.runId,
    sourceRevision: value.sourceRevision,
    deploymentId: value.deploymentId,
    creationWindow: Object.freeze({ notBefore: notBefore.iso, notAfter: notAfter.iso }),
  })
}

function parseEnvironment(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  try {
    for (const [field, expected] of Object.entries(REQUIRED_ENVIRONMENT)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field)
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.value !== expected) {
        return null
      }
    }
  } catch {
    return null
  }
  return REQUIRED_ENVIRONMENT
}

function parseTopology(value) {
  if (!hasExactFields(value, ['schemaVersion', 'identity', 'namespace', 'nodes'])
    || value.schemaVersion !== 1
    || !Array.isArray(value.nodes)) return null
  const identity = parseIdentity(value.identity)
  if (!identity || value.namespace !== `qa:${identity.runId}`) return null
  const seen = new Set()
  for (const node of value.nodes) {
    if (!isRecord(node)
      || node.schemaVersion !== 1
      || typeof node.targetKey !== 'string'
      || typeof node.kind !== 'string'
      || typeof node.resourceType !== 'string') return null
    const expected = TARGETS.get(node.targetKey) ?? ACCOUNT_TARGETS.get(node.targetKey)
    if (!expected || expected[0] !== node.kind || expected[1] !== node.resourceType || seen.has(node.targetKey)) {
      return null
    }
    seen.add(node.targetKey)
  }
  if (seen.size !== TARGETS.size + ACCOUNT_TARGETS.size
    || [...TARGETS.keys(), ...ACCOUNT_TARGETS.keys()].some(key => !seen.has(key))) return null
  return Object.freeze({ identity, namespace: value.namespace })
}

function timestampInWindow(value, identity) {
  const parsed = canonicalTimestamp(value)
  return parsed !== null
    && parsed.timestamp >= Date.parse(identity.creationWindow.notBefore)
    && parsed.timestamp <= Date.parse(identity.creationWindow.notAfter)
    ? parsed.iso
    : null
}

function parseOperationInput(value, topology) {
  if (!hasExactFields(value, [
    'schemaVersion', 'reference', 'runIdentity', 'relationship', 'storageBucket',
    'storagePrefix', 'targetId',
  ])
    || value.schemaVersion !== 1
    || !hasExactFields(value.reference, ['schemaVersion', 'targetKey', 'kind'])
    || value.reference.schemaVersion !== 1
    || !hasExactFields(value.relationship, ['ownerId', 'organizationId', 'parentId', 'relatedId'])) {
    return null
  }
  const expected = TARGETS.get(value.reference.targetKey)
  const identity = parseIdentity(value.runIdentity)
  if (!expected
    || expected[0] !== value.reference.kind
    || !identity
    || JSON.stringify(identity) !== JSON.stringify(topology.identity)
    || typeof value.targetId !== 'string'
    || value.targetId.length < 1
    || value.targetId.length > 512) return null
  for (const field of ['ownerId', 'organizationId']) {
    if (value.relationship[field] !== null && !UUID.test(value.relationship[field])) return null
  }
  for (const field of ['parentId', 'relatedId']) {
    if (value.relationship[field] !== null
      && (typeof value.relationship[field] !== 'string'
        || value.relationship[field].length < 1
        || value.relationship[field].length > 512)) return null
  }
  const storageKind = expected[0] === 'answerStorageObject' || expected[0] === 'assignmentArtifact'
  if (storageKind) {
    if (typeof value.storageBucket !== 'string'
      || typeof value.storagePrefix !== 'string'
      || !value.targetId.startsWith(value.storagePrefix)) return null
  } else if (value.storageBucket !== null || value.storagePrefix !== null) return null
  return freezeInput({
    targetKey: value.reference.targetKey,
    kind: expected[0],
    resourceType: expected[1],
    targetId: value.targetId,
    identity,
    namespace: topology.namespace,
    relationship: value.relationship,
    storageBucket: value.storageBucket,
    storagePrefix: value.storagePrefix,
  })
}

function validSecret(value) {
  return typeof value === 'string'
    && value.length >= 20
    && value.length <= 8_192
    && !/[\u0000-\u0020\u007f]/u.test(value)
}

function parseCredential(value, namespace) {
  return hasExactFields(value, [
    'schemaVersion', 'targetOrigin', 'credentialKind', 'namespace', 'serviceRoleKey',
  ])
    && value.schemaVersion === 1
    && value.targetOrigin === OFFICIAL_STAGING_SUPABASE_ORIGIN
    && value.credentialKind === 'service-role'
    && value.namespace === namespace
    && validSecret(value.serviceRoleKey)
    ? value.serviceRoleKey
    : null
}

function captureRawClient(value) {
  if (!hasExactFields(value, RAW_CLIENT_FIELDS)) return null
  try {
    if (value.supabaseUrl !== OFFICIAL_STAGING_SUPABASE_ORIGIN
      || value.credentialKind !== 'service-role'
      || RAW_CLIENT_FIELDS.slice(2).some(field => typeof value[field] !== 'function')) return null
    return Object.freeze({
      client: value,
      supabaseUrl: value.supabaseUrl,
      credentialKind: value.credentialKind,
      enumerateDatabase: value.enumerateDatabase,
      deleteDatabase: value.deleteDatabase,
      enumerateStorage: value.enumerateStorage,
      deleteStorage: value.deleteStorage,
      close: value.close,
    })
  } catch {
    return null
  }
}

function sameRawClient(attestation) {
  if (!attestation) return false
  try {
    const value = attestation.client
    return hasExactFields(value, RAW_CLIENT_FIELDS)
      && value.supabaseUrl === attestation.supabaseUrl
      && value.credentialKind === attestation.credentialKind
      && value.enumerateDatabase === attestation.enumerateDatabase
      && value.deleteDatabase === attestation.deleteDatabase
      && value.enumerateStorage === attestation.enumerateStorage
      && value.deleteStorage === attestation.deleteStorage
      && value.close === attestation.close
  } catch {
    return false
  }
}

function captureCloseObligation(value) {
  if (!isRecord(value)) return null
  try {
    if (typeof value.close !== 'function') return null
    return Object.freeze({ client: value, close: value.close })
  } catch {
    return null
  }
}

function sameCloseObligation(obligation) {
  if (!obligation) return false
  try {
    return isRecord(obligation.client)
      && obligation.client.close === obligation.close
  } catch {
    return false
  }
}

function exactPassed(value, count = undefined) {
  if (count === undefined) return hasExactFields(value, ['status']) && value.status === 'passed'
  return hasExactFields(value, ['status', 'deletedCount'])
    && value.status === 'passed'
    && value.deletedCount === count
}

function exactAtomicDeletePassed(value, count) {
  return hasExactFields(value, ['status', 'deletedCount', 'atomicClosureVerified'])
    && value.status === 'passed'
    && value.deletedCount === count
    && value.atomicClosureVerified === true
}

function predicate(column, operator, value) {
  return Object.freeze({ column, operator, value })
}

function closureRequirement(table, predicates, expectedCount) {
  return Object.freeze({ table, predicates: Object.freeze(predicates), expectedCount })
}

function atomicClosure(requireAbsent, requireExact, allowedCascadeTables) {
  return Object.freeze({
    schemaVersion: 1,
    isolation: 'serializable-parent-lock',
    requireAbsent: Object.freeze(requireAbsent),
    requireExact: Object.freeze(requireExact),
    allowedCascadeTables: Object.freeze(allowedCascadeTables),
  })
}

function exactRow(row, fields) {
  return hasExactFields(row, fields)
}

function primaryIdField(table) {
  return ({
    assignment_seb_config_revisions: 'assignment_id',
    assignment_seb_config_releases: 'release_id',
    exam_seb_checkins: 'assignment_id',
    exam_proctor_sessions: 'submission_id',
    exam_proctor_connections: 'submission_id',
    question_set_shares: 'question_set_id',
    question_standards: 'question_id',
    question_shares: 'question_id',
  })[table] ?? 'id'
}

function makeAttestation(input, createdAt) {
  return Object.freeze({
    schemaVersion: 1,
    kind: input.kind,
    targetId: input.targetId,
    runId: input.identity.runId,
    sourceRevision: input.identity.sourceRevision,
    deploymentId: input.identity.deploymentId,
    namespace: input.namespace,
    ownerId: input.relationship.ownerId,
    organizationId: input.relationship.organizationId,
    resourceType: input.resourceType,
    createdAt,
    parentId: input.relationship.parentId,
    relatedId: input.relationship.relatedId,
  })
}

function parseSubmittedFiles(value) {
  let parsed = value
  if (typeof value === 'string') {
    if (value.length > 50_000) return null
    try { parsed = JSON.parse(value) } catch { return null }
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) return null
  const file = parsed[0]
  return hasExactFields(file, ['url', 'name', 'type'])
    && typeof file.url === 'string'
    && file.url.length <= 2_000
    && typeof file.name === 'string'
    && file.name.length > 0
    && file.name.length <= 255
    && typeof file.type === 'string'
    ? Object.freeze({ ...file })
    : null
}

function storagePathFromPublicUrl(url, bucket) {
  if (/%2e|%2f|%5c/i.test(url)) return null
  try {
    const parsed = new URL(url)
    const marker = `/storage/v1/object/public/${bucket}/`
    if (parsed.origin !== OFFICIAL_STAGING_SUPABASE_ORIGIN
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || !parsed.pathname.startsWith(marker)) return null
    const path = decodeURIComponent(parsed.pathname.slice(marker.length))
    const segments = path.split('/')
    return path
      && !path.includes('\\')
      && !/[\u0000-\u001f\u007f]/u.test(path)
      && segments.every(segment => segment && segment !== '.' && segment !== '..')
      ? path
      : null
  } catch {
    return null
  }
}

/**
 * Builds the four target-scoped clients consumed by
 * createSebStagingResourceCleanupParticipants(). The injected factory is the
 * only closure that ever receives the service-role key. Its returned adapter
 * has five deliberately narrow operations and is never exposed to callers.
 */
export function createSebStagingResourceCleanupRuntime({
  readEnvironment,
  topology,
  serviceRoleCredentialProvider,
  createServiceRoleClient,
  boundaryTimeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  let parsedTopology
  let initialEnvironment
  try {
    parsedTopology = parseTopology(topology)
    initialEnvironment = parseEnvironment(readEnvironment?.())
  } catch {
    blocked()
  }
  if (typeof readEnvironment !== 'function'
    || !initialEnvironment
    || !parsedTopology
    || typeof serviceRoleCredentialProvider !== 'function'
    || typeof createServiceRoleClient !== 'function'
    || !Number.isInteger(boundaryTimeoutMs)
    || boundaryTimeoutMs < MIN_TIMEOUT_MS
    || boundaryTimeoutMs > MAX_TIMEOUT_MS) blocked()

  let rawAttestation = null
  let orphanAttestation = null
  let orphanCloseObligation = null
  let uncloseableFactoryResult = false
  let initializationPromise = null
  let closing = false
  let closed = false
  let closePromise = null
  let operationTail = Promise.resolve()
  const active = new Map()
  const enumerated = new Map()
  const submissionRows = new Map()

  function environmentOkay() {
    try { return parseEnvironment(readEnvironment()) !== null } catch { return false }
  }

  async function initialize(signal) {
    if (rawAttestation) {
      if (!sameRawClient(rawAttestation)) blocked()
      return rawAttestation
    }
    // A late factory result whose close did not pass remains owned by this
    // runtime. Never create another privileged client until closeAll() has
    // closed that orphan exactly; otherwise a later orphan could replace the
    // first one and make quiescence impossible to prove.
    if (orphanAttestation || orphanCloseObligation || uncloseableFactoryResult) blocked()
    if (initializationPromise) return initializationPromise
    initializationPromise = (async () => {
      if (!environmentOkay() || signal.aborted) blocked()
      const credential = await serviceRoleCredentialProvider(freezeInput({
        schemaVersion: 1,
        targetOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
        credentialKind: 'service-role',
        namespace: parsedTopology.namespace,
        signal,
      }))
      const secret = parseCredential(credential, parsedTopology.namespace)
      if (!secret || signal.aborted || !environmentOkay()) blocked()
      const raw = await createServiceRoleClient(freezeInput({
        schemaVersion: 1,
        targetOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
        credentialKind: 'service-role',
        namespace: parsedTopology.namespace,
        serviceRoleKey: secret,
        signal,
      }))
      const captured = captureRawClient(raw)
      if (!captured) {
        const closeObligation = captureCloseObligation(raw)
        if (!closeObligation) {
          // The factory received a privileged credential but returned no
          // auditable close capability. Quiescence can never be proven.
          uncloseableFactoryResult = true
          blocked()
        }
        orphanCloseObligation = closeObligation
        try {
          const result = await closeObligation.close.call(
            closeObligation.client,
            Object.freeze({ signal: AbortSignal.timeout(boundaryTimeoutMs) }),
          )
          if (sameCloseObligation(closeObligation) && exactPassed(result)) {
            orphanCloseObligation = null
          }
        } catch {
          // Keep the obligation for closeAll(); never discard a malformed
          // privileged client merely because its public shape was rejected.
        }
        blocked()
      }
      if (signal.aborted || !environmentOkay()) {
        orphanAttestation = captured
        try {
          const result = await captured.close.call(
            captured.client,
            Object.freeze({ signal: AbortSignal.timeout(boundaryTimeoutMs) }),
          )
          if (sameRawClient(captured) && exactPassed(result)) orphanAttestation = null
        } catch {
          // Retain ownership so closeAll() must retry and cannot report a false
          // quiescent success while this late-created client might remain live.
        }
        blocked()
      }
      rawAttestation = captured
      return captured
    })()
    try {
      return await initializationPromise
    } finally {
      initializationPromise = null
    }
  }

  function runTracked(parentSignal, task) {
    if (!isAbortSignal(parentSignal) || parentSignal.aborted || closing || closed) {
      return Promise.reject(new SebStagingResourceCleanupRuntimeBlockedError())
    }
    const controller = new AbortController()
    const token = Object.freeze({ controller })
    const abortFromParent = () => controller.abort()
    parentSignal.addEventListener('abort', abortFromParent, { once: true })
    const timeout = setTimeout(() => controller.abort(), boundaryTimeoutMs)

    const queued = operationTail
      .catch(() => undefined)
      .then(async () => {
        if (controller.signal.aborted || closing || closed || !environmentOkay()) blocked()
        const attestation = await initialize(controller.signal)
        if (controller.signal.aborted || !sameRawClient(attestation) || !environmentOkay()) blocked()
        const value = await task(attestation, controller.signal)
        if (controller.signal.aborted || !sameRawClient(attestation) || !environmentOkay()) blocked()
        return value
      })
      .catch(() => blocked())
    operationTail = queued.catch(() => undefined)
    active.set(token, queued)
    return queued.finally(() => {
      clearTimeout(timeout)
      parentSignal.removeEventListener('abort', abortFromParent)
      active.delete(token)
    })
  }

  async function databaseRows(attestation, signal, operationId, table, columns, predicates) {
    const request = freezeInput({
      schemaVersion: 1,
      operationId,
      table,
      columns,
      predicates,
      limit: QUERY_LIMIT,
    })
    const response = await attestation.enumerateDatabase.call(
      attestation.client,
      request,
      Object.freeze({ signal }),
    )
    if (!hasExactFields(response, ['rows'])
      || !Array.isArray(response.rows)
      || response.rows.length > MAX_RECONCILIATION_MATCHES
      || response.rows.some(row => !isRecord(row))) blocked()
    return response.rows
  }

  async function deleteDatabase(
    attestation,
    signal,
    operationId,
    table,
    predicates,
    expectedCount = 1,
    closure = null,
  ) {
    const response = await attestation.deleteDatabase.call(
      attestation.client,
      freezeInput({
        schemaVersion: 1,
        operationId,
        table,
        predicates,
        maxRows: expectedCount,
        atomicClosure: closure,
      }),
      Object.freeze({ signal }),
    )
    if (closure === null
      ? !exactPassed(response, expectedCount)
      : !exactAtomicDeletePassed(response, expectedCount)) blocked()
  }

  async function storageObjects(attestation, signal, operationId, bucketName, path) {
    const response = await attestation.enumerateStorage.call(
      attestation.client,
      freezeInput({
        schemaVersion: 1,
        operationId,
        bucketName,
        path,
        limit: QUERY_LIMIT,
      }),
      Object.freeze({ signal }),
    )
    if (!hasExactFields(response, ['objects'])
      || !Array.isArray(response.objects)
      || response.objects.length > MAX_RECONCILIATION_MATCHES
      || response.objects.some(row => !isRecord(row))) blocked()
    return response.objects
  }

  async function deleteStorage(attestation, signal, operationId, bucketName, path) {
    const response = await attestation.deleteStorage.call(
      attestation.client,
      freezeInput({ schemaVersion: 1, operationId, bucketName, path, maxObjects: 1 }),
      Object.freeze({ signal }),
    )
    if (!exactPassed(response, 1)) blocked()
  }

  async function expectNoRows(attestation, signal, operationId, table, column, value) {
    return expectNoRowsByPredicates(
      attestation,
      signal,
      operationId,
      table,
      [predicate(column, 'eq', value)],
    )
  }

  async function expectNoRowsByPredicates(attestation, signal, operationId, table, predicates) {
    const rows = await databaseRows(
      attestation,
      signal,
      operationId,
      table,
      [primaryIdField(table)],
      predicates,
    )
    if (rows.length !== 0) blocked()
  }

  function remember(input, attestation) {
    enumerated.set(`${input.targetKey}\u0000${input.targetId}`, Object.freeze({ input, attestation }))
  }

  function requireRemembered(input) {
    const record = enumerated.get(`${input.targetKey}\u0000${input.targetId}`)
    if (!record || JSON.stringify(record.input) !== JSON.stringify(input)) blocked()
    return record
  }

  function rememberedTarget(targetKey, targetId) {
    return enumerated.get(`${targetKey}\u0000${targetId}`) ?? null
  }

  function rememberedConfigRevision(assignmentId) {
    const matches = [...enumerated.values()].filter(record => (
      record.input.targetKey === 'config-primary'
      && CONFIG_REVISION_ID.exec(record.input.targetId)?.[1] === assignmentId
    ))
    if (matches.length !== 1) return null
    const parsed = CONFIG_REVISION_ID.exec(matches[0].input.targetId)
    return parsed ? Number(parsed[2]) : null
  }

  function observedProctorLineage(submissionId) {
    return [...enumerated.values()].some(record => {
      if (record.input.kind === 'proctorConnection') {
        return record.input.relationship.parentId === submissionId
      }
      if (record.input.kind !== 'proctorEvent') return false
      const connection = CHECK_IN_ID.exec(record.input.relationship.parentId ?? '')
      return connection !== null && connection[1] === submissionId
    })
  }

  function validateTargetEncoding(input) {
    const relation = input.relationship
    if (['classroom', 'question', 'classroomMembership', 'assignment', 'submission', 'answer'].includes(input.kind)) {
      return UUID.test(input.targetId)
    }
    if (input.kind === 'configRevision') {
      const match = CONFIG_REVISION_ID.exec(input.targetId)
      return match !== null
        && Number(match[2]) <= MAX_ASSIGNMENT_CONFIG_REVISION
        && match[1] === relation.parentId
    }
    if (input.kind === 'release') {
      const match = RELEASE_ID.exec(input.targetId)
      const config = CONFIG_REVISION_ID.exec(relation.parentId ?? '')
      return match !== null
        && config !== null
        && Number(match[2]) <= MAX_ASSIGNMENT_CONFIG_REVISION
        && Number(config[2]) <= MAX_ASSIGNMENT_CONFIG_REVISION
        && match[1] === (relation.relatedId ?? '').replaceAll('-', '')
        && match[2] === config[2]
    }
    if (input.kind === 'checkIn' || input.kind === 'proctorConnection') {
      const match = CHECK_IN_ID.exec(input.targetId)
      return match !== null
        && (input.kind === 'checkIn'
          ? match[1] === relation.parentId && match[2] === relation.ownerId
          : match[1] === relation.parentId)
    }
    if (input.kind === 'proctorEvent') return BIGINT_TEXT.test(input.targetId)
    if (input.kind === 'personalOrganization') {
      const parts = input.targetId.split(':')
      return parts.length === 2 && UUID.test(parts[0]) && UUID.test(parts[1])
    }
    if (input.kind === 'answerStorageObject') {
      const match = ANSWER_STORAGE_ID.exec(input.targetId)
      return match !== null
        && input.storageBucket === ANSWER_STORAGE_BUCKET
        && input.storagePrefix === `${match[1]}/${match[2]}/${match[3]}/`
        && match[1] === relation.ownerId
        && match[2] === relation.relatedId
        && match[3] === relation.parentId
    }
    if (input.kind === 'assignmentArtifact') {
      const match = ASSIGNMENT_ARTIFACT_ID.exec(input.targetId)
      const release = RELEASE_ID.exec(relation.parentId ?? '')
      return match !== null
        && release !== null
        && Number(match[2]) <= MAX_ASSIGNMENT_CONFIG_REVISION
        && Number(release[2]) <= MAX_ASSIGNMENT_CONFIG_REVISION
        && input.storageBucket === ASSIGNMENT_ARTIFACT_BUCKET
        && input.storagePrefix === `assignments/${match[1]}/r${match[2]}/`
        && match[1] === relation.relatedId
        && match[2] === release[2]
        && match[3].slice(0, 16) === release[3]
    }
    return false
  }

  async function enumerateDatabaseTarget(attestation, signal, input) {
    if (!validateTargetEncoding(input)) blocked()
    const relation = input.relationship
    let table
    let columns
    let predicates
    let validate

    if (input.kind === 'classroom') {
      table = 'classrooms'
      columns = ['id', 'teacher_id', 'org_id', 'classroom_type', 'created_at']
      predicates = [predicate('id', 'eq', input.targetId)]
      validate = row => exactRow(row, columns)
        && row.id === input.targetId
        && row.teacher_id === relation.ownerId
        && row.org_id === relation.organizationId
        && row.classroom_type === 'subject'
        && timestampInWindow(row.created_at, input.identity)
    } else if (input.kind === 'assignment') {
      table = 'assignments'
      columns = ['id', 'classroom_id', 'created_by', 'org_id', 'type', 'secure_browser_mode', 'question_ids', 'created_at']
      predicates = [predicate('id', 'eq', input.targetId)]
      validate = row => exactRow(row, columns)
        && row.id === input.targetId
        && row.classroom_id === relation.parentId
        && row.created_by === relation.ownerId
        && row.org_id === relation.organizationId
        && row.type === 'exam'
        && row.secure_browser_mode === 'seb_required'
        && Array.isArray(row.question_ids)
        && row.question_ids.length === 2
        && row.question_ids.every(id => UUID.test(id))
        && new Set(row.question_ids).size === row.question_ids.length
        && timestampInWindow(row.created_at, input.identity)
    } else if (input.kind === 'question') {
      table = 'questions'
      columns = ['id', 'created_by', 'org_id', 'question_type', 'created_at']
      predicates = [predicate('id', 'eq', input.targetId)]
      validate = row => exactRow(row, columns)
        && row.id === input.targetId
        && row.created_by === relation.ownerId
        && row.org_id === relation.organizationId
        && row.question_type === (input.resourceType === 'essay' ? 'written' : 'file_upload')
        && timestampInWindow(row.created_at, input.identity)
    } else if (input.kind === 'classroomMembership') {
      table = 'classroom_students'
      columns = ['id', 'classroom_id', 'student_id', 'joined_at']
      predicates = [predicate('id', 'eq', input.targetId)]
      validate = row => exactRow(row, columns)
        && row.id === input.targetId
        && row.classroom_id === relation.parentId
        && row.student_id === relation.ownerId
        && timestampInWindow(row.joined_at, input.identity)
    } else if (input.kind === 'configRevision') {
      const match = CONFIG_REVISION_ID.exec(input.targetId)
      table = 'assignment_seb_config_revisions'
      columns = ['assignment_id', 'revision', 'org_id', 'owner_id', 'created_at']
      predicates = [predicate('assignment_id', 'eq', match[1]), predicate('revision', 'eq', Number(match[2]))]
      validate = row => exactRow(row, columns)
        && row.assignment_id === relation.parentId
        && row.revision === Number(match[2])
        && row.owner_id === relation.ownerId
        && row.org_id === relation.organizationId
        && timestampInWindow(row.created_at, input.identity)
    } else if (input.kind === 'release') {
      const match = RELEASE_ID.exec(input.targetId)
      table = 'assignment_seb_config_releases'
      columns = [
        'assignment_id', 'revision', 'org_id', 'owner_id', 'release_id',
        'artifact_storage_path', 'artifact_sha256', 'artifact_size_bytes',
        'security_mode', 'created_at',
      ]
      predicates = [predicate('release_id', 'eq', input.targetId)]
      validate = row => exactRow(row, columns)
        && row.assignment_id === relation.relatedId
        && row.revision === Number(match[2])
        && row.owner_id === relation.ownerId
        && row.org_id === relation.organizationId
        && row.release_id === input.targetId
        && row.security_mode === 'test_plaintext'
        && row.artifact_storage_path === `assignments/${row.assignment_id}/r${row.revision}/${row.artifact_sha256}.seb`
        && SHA256.test(row.artifact_sha256)
        && row.artifact_sha256.slice(0, 16) === match[3]
        && Number.isInteger(row.artifact_size_bytes)
        && row.artifact_size_bytes >= 1
        && row.artifact_size_bytes <= 2_097_152
        && timestampInWindow(row.created_at, input.identity)
    } else if (input.kind === 'checkIn') {
      table = 'exam_seb_checkins'
      columns = ['assignment_id', 'student_id', 'org_id', 'platform', 'verified_at']
      predicates = [predicate('assignment_id', 'eq', relation.parentId), predicate('student_id', 'eq', relation.ownerId)]
      validate = row => exactRow(row, columns)
        && row.assignment_id === relation.parentId
        && row.student_id === relation.ownerId
        && row.org_id === relation.organizationId
        && row.platform === 'windows'
        && timestampInWindow(row.verified_at, input.identity)
    } else if (input.kind === 'submission') {
      table = 'submissions'
      columns = [
        'id', 'assignment_id', 'student_id', 'org_id', 'secure_browser_verified_at',
        'secure_browser_platform', 'seb_config_revision', 'created_at',
      ]
      predicates = [predicate('id', 'eq', input.targetId)]
      validate = row => exactRow(row, columns)
        && row.id === input.targetId
        && row.assignment_id === relation.parentId
        && row.student_id === relation.ownerId
        && row.org_id === relation.organizationId
        && row.secure_browser_platform === 'windows'
        && Number.isInteger(row.seb_config_revision)
        && row.seb_config_revision >= 1
        && row.seb_config_revision === rememberedConfigRevision(row.assignment_id)
        && timestampInWindow(row.secure_browser_verified_at, input.identity)
        && timestampInWindow(row.created_at, input.identity)
    } else if (input.kind === 'answer') {
      table = 'submission_answers'
      columns = ['id', 'submission_id', 'question_id', 'org_id', 'student_answer', 'created_at']
      predicates = [predicate('id', 'eq', input.targetId)]
      validate = row => exactRow(row, columns)
        && row.id === input.targetId
        && row.submission_id === relation.parentId
        && row.question_id === relation.relatedId
        && rememberedTarget(
          input.targetKey === 'answer-upload' ? 'question-upload' : 'question-written',
          relation.relatedId,
        ) !== null
        && row.org_id === relation.organizationId
        && timestampInWindow(row.created_at, input.identity)
    } else if (input.kind === 'proctorConnection') {
      const match = CHECK_IN_ID.exec(input.targetId)
      table = 'exam_proctor_connections'
      columns = ['submission_id', 'client_instance_id', 'assignment_id', 'student_id', 'org_id', 'connected_at']
      predicates = [predicate('submission_id', 'eq', match[1]), predicate('client_instance_id', 'eq', match[2])]
      validate = row => exactRow(row, columns)
        && row.submission_id === relation.parentId
        && row.client_instance_id === match[2]
        && submissionRows.get(relation.parentId)?.assignment_id === row.assignment_id
        && row.student_id === relation.ownerId
        && row.org_id === relation.organizationId
        && timestampInWindow(row.connected_at, input.identity)
    } else if (input.kind === 'proctorEvent') {
      const connection = CHECK_IN_ID.exec(relation.parentId ?? '')
      table = 'exam_proctor_events'
      columns = ['id', 'submission_id', 'assignment_id', 'student_id', 'org_id', 'event_type', 'created_at']
      predicates = [predicate('id', 'eq', input.targetId)]
      validate = row => exactRow(row, columns)
        && typeof row.id === 'string'
        && row.id === input.targetId
        && connection !== null
        && rememberedTarget('proctor-connection', relation.parentId) !== null
        && row.submission_id === connection[1]
        && submissionRows.get(connection[1])?.assignment_id === row.assignment_id
        && row.student_id === relation.ownerId
        && row.org_id === relation.organizationId
        && row.event_type === 'monitoring_started'
        && timestampInWindow(row.created_at, input.identity)
    } else {
      blocked()
    }

    const rows = await databaseRows(
      attestation,
      signal,
      `enumerate:${input.targetKey}`,
      table,
      columns,
      predicates,
    )
    if (rows.length === 0) return Object.freeze([])
    if (rows.length !== 1 || !validate(rows[0])) blocked()
    if (input.kind === 'submission') submissionRows.set(input.targetId, freezeInput(rows[0]))
    const createdField = input.kind === 'classroomMembership'
      ? 'joined_at'
      : input.kind === 'checkIn'
        ? 'verified_at'
        : input.kind === 'proctorConnection'
          ? 'connected_at'
          : 'created_at'
    const createdAt = timestampInWindow(rows[0][createdField], input.identity)
    if (!createdAt) blocked()
    const publicAttestation = makeAttestation(input, createdAt)
    remember(input, publicAttestation)
    return Object.freeze([publicAttestation])
  }

  function exactFiltersFor(input) {
    const relation = input.relationship
    const window = input.identity.creationWindow
    const commonWindow = column => [
      predicate(column, 'gte', window.notBefore),
      predicate(column, 'lte', window.notAfter),
    ]
    if (input.kind === 'classroom') return [
      predicate('id', 'eq', input.targetId),
      predicate('teacher_id', 'eq', relation.ownerId),
      predicate('org_id', 'eq', relation.organizationId),
      ...commonWindow('created_at'),
    ]
    if (input.kind === 'assignment') return [
      predicate('id', 'eq', input.targetId),
      predicate('classroom_id', 'eq', relation.parentId),
      predicate('created_by', 'eq', relation.ownerId),
      predicate('org_id', 'eq', relation.organizationId),
      ...commonWindow('created_at'),
    ]
    if (input.kind === 'question') return [
      predicate('id', 'eq', input.targetId),
      predicate('created_by', 'eq', relation.ownerId),
      predicate('org_id', 'eq', relation.organizationId),
      ...commonWindow('created_at'),
    ]
    if (input.kind === 'classroomMembership') return [
      predicate('id', 'eq', input.targetId),
      predicate('classroom_id', 'eq', relation.parentId),
      predicate('student_id', 'eq', relation.ownerId),
      ...commonWindow('joined_at'),
    ]
    if (input.kind === 'configRevision') {
      const match = CONFIG_REVISION_ID.exec(input.targetId)
      return [
        predicate('assignment_id', 'eq', match[1]),
        predicate('revision', 'eq', Number(match[2])),
        predicate('owner_id', 'eq', relation.ownerId),
        predicate('org_id', 'eq', relation.organizationId),
        ...commonWindow('created_at'),
      ]
    }
    if (input.kind === 'release') return [
      predicate('release_id', 'eq', input.targetId),
      predicate('assignment_id', 'eq', relation.relatedId),
      predicate('owner_id', 'eq', relation.ownerId),
      predicate('org_id', 'eq', relation.organizationId),
      ...commonWindow('created_at'),
    ]
    if (input.kind === 'checkIn') return [
      predicate('assignment_id', 'eq', relation.parentId),
      predicate('student_id', 'eq', relation.ownerId),
      predicate('org_id', 'eq', relation.organizationId),
      ...commonWindow('verified_at'),
    ]
    if (input.kind === 'submission') return [
      predicate('id', 'eq', input.targetId),
      predicate('assignment_id', 'eq', relation.parentId),
      predicate('student_id', 'eq', relation.ownerId),
      predicate('org_id', 'eq', relation.organizationId),
      ...commonWindow('created_at'),
    ]
    if (input.kind === 'answer') return [
      predicate('id', 'eq', input.targetId),
      predicate('submission_id', 'eq', relation.parentId),
      predicate('question_id', 'eq', relation.relatedId),
      predicate('org_id', 'eq', relation.organizationId),
      ...commonWindow('created_at'),
    ]
    if (input.kind === 'proctorConnection') {
      const match = CHECK_IN_ID.exec(input.targetId)
      return [
        predicate('submission_id', 'eq', match[1]),
        predicate('client_instance_id', 'eq', match[2]),
        predicate('student_id', 'eq', relation.ownerId),
        predicate('org_id', 'eq', relation.organizationId),
        ...commonWindow('connected_at'),
      ]
    }
    if (input.kind === 'proctorEvent') return [
      predicate('id', 'eq', input.targetId),
      predicate('student_id', 'eq', relation.ownerId),
      predicate('org_id', 'eq', relation.organizationId),
      ...commonWindow('created_at'),
    ]
    return null
  }

  function tableForKind(kind) {
    return {
      classroom: 'classrooms',
      assignment: 'assignments',
      question: 'questions',
      classroomMembership: 'classroom_students',
      configRevision: 'assignment_seb_config_revisions',
      release: 'assignment_seb_config_releases',
      checkIn: 'exam_seb_checkins',
      submission: 'submissions',
      answer: 'submission_answers',
      proctorConnection: 'exam_proctor_connections',
      proctorEvent: 'exam_proctor_events',
    }[kind] ?? null
  }

  async function proveZeroDependencies(attestation, signal, prefix, pairs, id) {
    for (const [table, column] of pairs) {
      await expectNoRows(attestation, signal, `${prefix}:${table}`, table, column, id)
    }
  }

  function absentRequirements(pairs, id) {
    return pairs.map(([table, column]) => closureRequirement(
      table,
      [predicate(column, 'eq', id)],
      0,
    ))
  }

  async function deleteSubmission(attestation, signal, input) {
    const dependencies = [
      ['submission_answers', 'submission_id'],
      ['exam_proctor_connections', 'submission_id'],
      ['exam_proctor_events', 'submission_id'],
      ['education_research_scores', 'submission_id'],
    ]
    await proveZeroDependencies(
      attestation,
      signal,
      'submission-closure',
      dependencies,
      input.targetId,
    )
    const sessionColumns = ['submission_id', 'assignment_id', 'student_id', 'org_id', 'created_at']
    const sessionRows = await databaseRows(
      attestation,
      signal,
      'submission-derived-session:enumerate',
      'exam_proctor_sessions',
      sessionColumns,
      [predicate('submission_id', 'eq', input.targetId)],
    )
    const proctorObserved = observedProctorLineage(input.targetId)
    if (sessionRows.length > 1 || (proctorObserved && sessionRows.length !== 1)) blocked()
    if (sessionRows.length === 1) {
      if (!exactRow(sessionRows[0], sessionColumns)
        || sessionRows[0].submission_id !== input.targetId
        || sessionRows[0].assignment_id !== input.relationship.parentId
        || sessionRows[0].student_id !== input.relationship.ownerId
        || sessionRows[0].org_id !== input.relationship.organizationId
        || !timestampInWindow(sessionRows[0].created_at, input.identity)) blocked()
    }
    const sessionExact = sessionRows.length === 1
      ? [
          closureRequirement('exam_proctor_sessions', [
            predicate('submission_id', 'eq', input.targetId),
          ], 1),
          closureRequirement('exam_proctor_sessions', [
            predicate('submission_id', 'eq', input.targetId),
            predicate('assignment_id', 'eq', input.relationship.parentId),
            predicate('student_id', 'eq', input.relationship.ownerId),
            predicate('org_id', 'eq', input.relationship.organizationId),
            predicate('created_at', 'gte', input.identity.creationWindow.notBefore),
            predicate('created_at', 'lte', input.identity.creationWindow.notAfter),
          ], 1),
        ]
      : []
    return atomicClosure(
      absentRequirements([
        ...dependencies,
        ...(sessionRows.length === 0 ? [['exam_proctor_sessions', 'submission_id']] : []),
      ], input.targetId),
      sessionExact,
      sessionRows.length === 1 ? ['exam_proctor_sessions'] : [],
    )
  }

  async function proveAssignmentClosure(attestation, signal, input) {
    const joinColumns = ['id', 'assignment_id', 'classroom_id', 'created_at']
    const joins = await databaseRows(
      attestation,
      signal,
      'assignment-closure:assignment-classrooms',
      'assignment_classrooms',
      joinColumns,
      [predicate('assignment_id', 'eq', input.targetId)],
    )
    if (joins.length !== 1
      || !exactRow(joins[0], joinColumns)
      || !UUID.test(joins[0].id)
      || joins[0].assignment_id !== input.targetId
      || joins[0].classroom_id !== input.relationship.parentId
      || !timestampInWindow(joins[0].created_at, input.identity)) blocked()

    const configEntries = [...enumerated.entries()].filter(([key]) => (
      key.startsWith('config-primary\u0000')
      && key.slice(key.indexOf('\u0000') + 1).startsWith(`${input.targetId}:r`)
    ))
    if (configEntries.length !== 1) blocked()
    const configMatch = CONFIG_REVISION_ID.exec(configEntries[0][1].input.targetId)
    if (!configMatch) blocked()
    const configRows = await databaseRows(
      attestation,
      signal,
      'assignment-closure:config-revisions',
      'assignment_seb_config_revisions',
      ['assignment_id', 'revision', 'org_id', 'owner_id', 'created_at'],
      [predicate('assignment_id', 'eq', input.targetId)],
    )
    if (configRows.length !== 1
      || !exactRow(configRows[0], ['assignment_id', 'revision', 'org_id', 'owner_id', 'created_at'])
      || configRows[0].assignment_id !== input.targetId
      || configRows[0].revision !== Number(configMatch[2])
      || configRows[0].owner_id !== input.relationship.ownerId
      || configRows[0].org_id !== input.relationship.organizationId
      || !timestampInWindow(configRows[0].created_at, input.identity)) blocked()

    const releaseEntries = [...enumerated.entries()].filter(([key]) => key.startsWith('release-primary\u0000'))
    if (releaseEntries.length !== 1) blocked()
    const releaseRows = await databaseRows(
      attestation,
      signal,
      'assignment-closure:config-releases',
      'assignment_seb_config_releases',
      [
        'assignment_id', 'revision', 'org_id', 'owner_id', 'release_id',
        'artifact_storage_path', 'artifact_sha256', 'artifact_size_bytes',
        'security_mode', 'created_at',
      ],
      [predicate('assignment_id', 'eq', input.targetId)],
    )
    if (releaseRows.length !== 1
      || !exactRow(releaseRows[0], [
        'assignment_id', 'revision', 'org_id', 'owner_id', 'release_id',
        'artifact_storage_path', 'artifact_sha256', 'artifact_size_bytes',
        'security_mode', 'created_at',
      ])
      || releaseRows[0].assignment_id !== input.targetId
      || releaseRows[0].release_id !== releaseEntries[0][1].input.targetId
      || releaseRows[0].revision !== Number(configMatch[2])
      || releaseRows[0].owner_id !== input.relationship.ownerId
      || releaseRows[0].org_id !== input.relationship.organizationId
      || releaseRows[0].artifact_storage_path !== `assignments/${input.targetId}/r${configMatch[2]}/${releaseRows[0].artifact_sha256}.seb`
      || !SHA256.test(releaseRows[0].artifact_sha256)
      || !Number.isInteger(releaseRows[0].artifact_size_bytes)
      || releaseRows[0].artifact_size_bytes < 1
      || releaseRows[0].artifact_size_bytes > 2_097_152
      || releaseRows[0].security_mode !== 'test_plaintext'
      || !timestampInWindow(releaseRows[0].created_at, input.identity)) blocked()

    await proveZeroDependencies(
      attestation, signal, 'assignment-closure:unexpected',
      ASSIGNMENT_UNEXPECTED_DEPENDENCIES, input.targetId,
    )
    return atomicClosure(
      absentRequirements(ASSIGNMENT_UNEXPECTED_DEPENDENCIES, input.targetId),
      [
        closureRequirement('assignment_classrooms', [
          predicate('assignment_id', 'eq', input.targetId),
        ], 1),
        closureRequirement('assignment_classrooms', [
          predicate('assignment_id', 'eq', input.targetId),
          predicate('classroom_id', 'eq', input.relationship.parentId),
          predicate('created_at', 'gte', input.identity.creationWindow.notBefore),
          predicate('created_at', 'lte', input.identity.creationWindow.notAfter),
        ], 1),
        closureRequirement('assignment_seb_config_revisions', [
          predicate('assignment_id', 'eq', input.targetId),
        ], 1),
        closureRequirement('assignment_seb_config_revisions', [
          predicate('assignment_id', 'eq', input.targetId),
          predicate('revision', 'eq', Number(configMatch[2])),
          predicate('org_id', 'eq', input.relationship.organizationId),
          predicate('owner_id', 'eq', input.relationship.ownerId),
          predicate('created_at', 'gte', input.identity.creationWindow.notBefore),
          predicate('created_at', 'lte', input.identity.creationWindow.notAfter),
        ], 1),
        closureRequirement('assignment_seb_config_releases', [
          predicate('assignment_id', 'eq', input.targetId),
        ], 1),
        closureRequirement('assignment_seb_config_releases', [
          predicate('assignment_id', 'eq', input.targetId),
          predicate('revision', 'eq', Number(configMatch[2])),
          predicate('org_id', 'eq', input.relationship.organizationId),
          predicate('owner_id', 'eq', input.relationship.ownerId),
          predicate('release_id', 'eq', releaseRows[0].release_id),
          predicate('artifact_storage_path', 'eq', releaseRows[0].artifact_storage_path),
          predicate('artifact_sha256', 'eq', releaseRows[0].artifact_sha256),
          predicate('artifact_size_bytes', 'eq', releaseRows[0].artifact_size_bytes),
          predicate('security_mode', 'eq', 'test_plaintext'),
          predicate('created_at', 'gte', input.identity.creationWindow.notBefore),
          predicate('created_at', 'lte', input.identity.creationWindow.notAfter),
        ], 1),
      ],
      [
        'assignment_classrooms',
        'assignment_seb_config_revisions',
        'assignment_seb_config_releases',
      ],
    )
  }

  async function verifyAssignmentCascade(attestation, signal, input) {
    for (const [table, column] of [
      ['assignment_classrooms', 'assignment_id'],
      ['assignment_seb_config_revisions', 'assignment_id'],
      ['assignment_seb_config_releases', 'assignment_id'],
    ]) {
      await expectNoRows(attestation, signal, `assignment-cascade:${table}`, table, column, input.targetId)
    }
  }

  async function deleteDatabaseTarget(attestation, signal, input) {
    if (!validateTargetEncoding(input)) blocked()
    requireRemembered(input)
    if (input.kind === 'configRevision' || input.kind === 'release') blocked()
    let closure = null
    if (input.kind === 'submission') closure = await deleteSubmission(attestation, signal, input)
    if (input.kind === 'assignment') closure = await proveAssignmentClosure(attestation, signal, input)
    if (input.kind === 'answer') {
      await expectNoRows(
        attestation, signal, 'answer-closure:student-work-artifacts',
        'student_work_artifacts', 'submission_answer_id', input.targetId,
      )
      closure = atomicClosure(
        absentRequirements([['student_work_artifacts', 'submission_answer_id']], input.targetId),
        [],
        [],
      )
    }
    if (input.kind === 'question') {
      await proveZeroDependencies(
        attestation, signal, 'question-closure',
        QUESTION_UNEXPECTED_DEPENDENCIES, input.targetId,
      )
      for (const [dependencyTable, arrayColumn] of QUESTION_ARRAY_DEPENDENCIES) {
        await expectNoRowsByPredicates(
          attestation,
          signal,
          `question-closure:${dependencyTable}:${arrayColumn}`,
          dependencyTable,
          [predicate(arrayColumn, 'contains', [input.targetId])],
        )
      }
      closure = atomicClosure(
        [
          ...absentRequirements(QUESTION_UNEXPECTED_DEPENDENCIES, input.targetId),
          ...QUESTION_ARRAY_DEPENDENCIES.map(([dependencyTable, arrayColumn]) => (
            closureRequirement(
              dependencyTable,
              [predicate(arrayColumn, 'contains', [input.targetId])],
              0,
            )
          )),
        ],
        [],
        [],
      )
    }
    if (input.kind === 'classroom') {
      await proveZeroDependencies(
        attestation, signal, 'classroom-closure',
        CLASSROOM_UNEXPECTED_DEPENDENCIES, input.targetId,
      )
      closure = atomicClosure(
        absentRequirements(CLASSROOM_UNEXPECTED_DEPENDENCIES, input.targetId),
        [],
        [],
      )
    }
    const table = tableForKind(input.kind)
    const filters = exactFiltersFor(input)
    if (!table || !filters) blocked()
    await deleteDatabase(
      attestation,
      signal,
      `delete:${input.targetKey}`,
      table,
      filters,
      1,
      closure,
    )
    await expectNoRowsByPredicates(
      attestation,
      signal,
      `verify-delete:${input.targetKey}`,
      table,
      filters,
    )
    if (input.kind === 'assignment') await verifyAssignmentCascade(attestation, signal, input)
    if (input.kind === 'submission') {
      await expectNoRows(
        attestation, signal, 'submission-derived-session:verify-cascade',
        'exam_proctor_sessions', 'submission_id', input.targetId,
      )
    }
    return Object.freeze({ status: 'passed' })
  }

  async function enumeratePersonalOrganization(attestation, signal, input) {
    if (!validateTargetEncoding(input)) blocked()
    const [organizationId, membershipId] = input.targetId.split(':')
    const orgColumns = ['id', 'is_personal', 'subscription_tier', 'deleted_at', 'created_at']
    const memberColumns = ['id', 'org_id', 'user_id', 'org_role', 'joined_at']
    const [organizations, memberships] = await Promise.all([
      databaseRows(
        attestation, signal, `enumerate:${input.targetKey}:organization`,
        'organizations', orgColumns, [predicate('id', 'eq', organizationId)],
      ),
      databaseRows(
        attestation, signal, `enumerate:${input.targetKey}:memberships`,
        'organization_members', memberColumns, [predicate('org_id', 'eq', organizationId)],
      ),
    ])
    if (organizations.length === 0 && memberships.length === 0) return Object.freeze([])
    if (organizations.length !== 1
      || memberships.length !== 1
      || !exactRow(organizations[0], orgColumns)
      || !exactRow(memberships[0], memberColumns)
      || organizations[0].id !== organizationId
      || organizations[0].is_personal !== true
      || organizations[0].subscription_tier !== 'free'
      || organizations[0].deleted_at !== null
      || memberships[0].id !== membershipId
      || memberships[0].org_id !== organizationId
      || memberships[0].user_id !== input.relationship.ownerId
      || memberships[0].org_role !== 'owner') blocked()
    const createdAt = timestampInWindow(organizations[0].created_at, input.identity)
    if (!createdAt || !timestampInWindow(memberships[0].joined_at, input.identity)) blocked()
    const publicAttestation = makeAttestation(input, createdAt)
    remember(input, publicAttestation)
    return Object.freeze([publicAttestation])
  }

  async function deletePersonalOrganization(attestation, signal, input) {
    requireRemembered(input)
    const [organizationId, membershipId] = input.targetId.split(':')
    for (const table of ORGANIZATION_CHILD_TABLES) {
      await expectNoRows(
        attestation, signal, `personal-organization-closure:${table}`,
        table, 'org_id', organizationId,
      )
    }
    const members = await databaseRows(
      attestation,
      signal,
      'personal-organization-closure:owner',
      'organization_members',
      ['id', 'org_id', 'user_id', 'org_role', 'joined_at'],
      [predicate('org_id', 'eq', organizationId)],
    )
    if (members.length !== 1
      || members[0].id !== membershipId
      || members[0].user_id !== input.relationship.ownerId
      || members[0].org_role !== 'owner') blocked()
    await deleteDatabase(
      attestation, signal, 'personal-organization:delete-organization',
      'organizations', [
        predicate('id', 'eq', organizationId),
        predicate('is_personal', 'eq', true),
        predicate('subscription_tier', 'eq', 'free'),
        predicate('deleted_at', 'is', null),
        predicate('created_at', 'gte', input.identity.creationWindow.notBefore),
        predicate('created_at', 'lte', input.identity.creationWindow.notAfter),
      ],
      1,
      atomicClosure(
        absentRequirements(
          ORGANIZATION_CHILD_TABLES.map(table => [table, 'org_id']),
          organizationId,
        ),
        [
          closureRequirement('organization_members', [
            predicate('org_id', 'eq', organizationId),
          ], 1),
          closureRequirement('organization_members', [
            predicate('id', 'eq', membershipId),
            predicate('org_id', 'eq', organizationId),
            predicate('user_id', 'eq', input.relationship.ownerId),
            predicate('org_role', 'eq', 'owner'),
            predicate('joined_at', 'gte', input.identity.creationWindow.notBefore),
            predicate('joined_at', 'lte', input.identity.creationWindow.notAfter),
          ], 1),
        ],
        ['organization_members'],
      ),
    )
    await expectNoRows(
      attestation, signal, 'personal-organization:verify-organization',
      'organizations', 'id', organizationId,
    )
    await expectNoRows(
      attestation, signal, 'personal-organization:verify-membership-cascade',
      'organization_members', 'id', membershipId,
    )
    return Object.freeze({ status: 'passed' })
  }

  function parseStorageObject(row, input) {
    if (!exactRow(row, [
      'bucketName', 'path', 'ownerId', 'createdAt', 'sizeBytes', 'mimeType', 'sha256',
    ])
      || row.bucketName !== input.storageBucket
      || row.path !== input.targetId
      || (row.ownerId !== null && !UUID.test(row.ownerId))
      || !Number.isInteger(row.sizeBytes)
      || row.sizeBytes < 1
      || !timestampInWindow(row.createdAt, input.identity)
      || (row.sha256 !== null && !SHA256.test(row.sha256))) return null
    return row
  }

  async function enumerateAnswerStorage(attestation, signal, input) {
    const path = ANSWER_STORAGE_ID.exec(input.targetId)
    if (!path || !validateTargetEncoding(input)) blocked()
    const answerColumns = ['id', 'submission_id', 'question_id', 'org_id', 'student_answer', 'created_at']
    const answers = await databaseRows(
      attestation, signal, 'answer-storage:answer-lineage',
      'submission_answers', answerColumns, [predicate('id', 'eq', input.relationship.parentId)],
    )
    if (answers.length > 1) blocked()
    const submissionColumns = ['id', 'assignment_id', 'student_id', 'org_id', 'created_at']
    const submissions = await databaseRows(
      attestation, signal, 'answer-storage:submission-lineage',
      'submissions', submissionColumns, [predicate('id', 'eq', input.relationship.relatedId)],
    )
    if (submissions.length > 1) blocked()
    let assignment = null
    if (submissions.length === 1) {
      if (!exactRow(submissions[0], submissionColumns)
        || submissions[0].id !== input.relationship.relatedId
        || submissions[0].student_id !== input.relationship.ownerId
        || submissions[0].org_id !== input.relationship.organizationId
        || !timestampInWindow(submissions[0].created_at, input.identity)) blocked()
      const assignmentColumns = [
        'id', 'org_id', 'type', 'secure_browser_mode', 'question_ids', 'created_at',
      ]
      const assignments = await databaseRows(
        attestation, signal, 'answer-storage:assignment-lineage',
        'assignments', assignmentColumns, [predicate('id', 'eq', submissions[0].assignment_id)],
      )
      if (assignments.length !== 1
        || !exactRow(assignments[0], assignmentColumns)
        || assignments[0].id !== submissions[0].assignment_id
        || assignments[0].org_id !== input.relationship.organizationId
        || assignments[0].type !== 'exam'
        || assignments[0].secure_browser_mode !== 'seb_required'
        || !Array.isArray(assignments[0].question_ids)
        || assignments[0].question_ids.length !== 2
        || assignments[0].question_ids.some(id => !UUID.test(id))
        || new Set(assignments[0].question_ids).size !== assignments[0].question_ids.length
        || !timestampInWindow(assignments[0].created_at, input.identity)) blocked()
      assignment = assignments[0]
    }
    let submitted = null
    if (answers.length === 1) {
      if (!exactRow(answers[0], answerColumns)
        || answers[0].id !== input.relationship.parentId
        || answers[0].submission_id !== input.relationship.relatedId
        || answers[0].org_id !== input.relationship.organizationId
        || !timestampInWindow(answers[0].created_at, input.identity)) blocked()
      if (submissions.length !== 1 || assignment === null) blocked()
      const questionColumns = ['id', 'org_id', 'question_type', 'created_at']
      const questions = await databaseRows(
        attestation, signal, 'answer-storage:question-lineage',
        'questions', questionColumns, [predicate('id', 'eq', answers[0].question_id)],
      )
      if (questions.length !== 1
        || !exactRow(questions[0], questionColumns)
        || questions[0].id !== answers[0].question_id
        || questions[0].org_id !== input.relationship.organizationId
        || questions[0].question_type !== 'file_upload'
        || !timestampInWindow(questions[0].created_at, input.identity)) blocked()
      if (assignment.question_ids.filter(id => id === questions[0].id).length !== 1) blocked()
      submitted = parseSubmittedFiles(answers[0].student_answer)
      if (!submitted
        || storagePathFromPublicUrl(submitted.url, ANSWER_STORAGE_BUCKET) !== input.targetId
        || submitted.type !== MIME_BY_EXTENSION[path[5]]) blocked()
    }
    const objects = await storageObjects(
      attestation, signal, 'answer-storage:enumerate',
      ANSWER_STORAGE_BUCKET, input.targetId,
    )
    if (objects.length === 0) return Object.freeze([])
    if (objects.length !== 1) blocked()
    const object = parseStorageObject(objects[0], input)
    if (!object
      || object.ownerId !== input.relationship.ownerId
      || object.mimeType !== (submitted?.type ?? MIME_BY_EXTENSION[path[5]])
      || (submitted === null && !SHA256.test(object.sha256))
      || object.sizeBytes > 10 * 1024 * 1024) blocked()
    const createdAt = timestampInWindow(object.createdAt, input.identity)
    const publicAttestation = makeAttestation(input, createdAt)
    remember(input, publicAttestation)
    return Object.freeze([publicAttestation])
  }

  async function releaseForArtifact(attestation, signal, input) {
    const releaseColumns = [
      'assignment_id', 'revision', 'org_id', 'owner_id', 'release_id',
      'artifact_storage_path', 'artifact_sha256', 'artifact_size_bytes',
      'security_mode', 'created_at',
    ]
    const releases = await databaseRows(
      attestation, signal, 'assignment-artifact:release-lineage',
      'assignment_seb_config_releases', releaseColumns,
      [predicate('artifact_storage_path', 'eq', input.targetId)],
    )
    if (releases.length === 0) return null
    if (releases.length !== 1 || !exactRow(releases[0], releaseColumns)) blocked()
    const release = releases[0]
    const path = ASSIGNMENT_ARTIFACT_ID.exec(input.targetId)
    if (!path
      || release.assignment_id !== input.relationship.relatedId
      || release.revision !== Number(path[2])
      || release.org_id !== input.relationship.organizationId
      || release.owner_id !== input.relationship.ownerId
      || release.release_id !== input.relationship.parentId
      || release.artifact_storage_path !== input.targetId
      || release.artifact_sha256 !== path[3]
      || !SHA256.test(release.artifact_sha256)
      || !Number.isInteger(release.artifact_size_bytes)
      || release.artifact_size_bytes < 1
      || release.artifact_size_bytes > 2_097_152
      || release.security_mode !== 'test_plaintext'
      || !timestampInWindow(release.created_at, input.identity)) blocked()
    return release
  }

  async function enumerateArtifactStorage(attestation, signal, input) {
    if (!validateTargetEncoding(input)) blocked()
    const path = ASSIGNMENT_ARTIFACT_ID.exec(input.targetId)
    if (!path) blocked()
    const release = await releaseForArtifact(attestation, signal, input)
    const assignmentColumns = [
      'id', 'created_by', 'org_id', 'type', 'secure_browser_mode', 'created_at',
    ]
    const assignments = await databaseRows(
      attestation, signal, 'assignment-artifact:assignment-lineage',
      'assignments', assignmentColumns, [predicate('id', 'eq', path[1])],
    )
    if (assignments.length > 1) blocked()
    if (assignments.length === 1) {
      const assignment = assignments[0]
      if (!exactRow(assignment, assignmentColumns)
        || assignment.id !== input.relationship.relatedId
        || assignment.created_by !== input.relationship.ownerId
        || assignment.org_id !== input.relationship.organizationId
        || assignment.type !== 'exam'
        || assignment.secure_browser_mode !== 'seb_required'
        || !timestampInWindow(assignment.created_at, input.identity)) blocked()
    } else if (release !== null) {
      blocked()
    }
    const objects = await storageObjects(
      attestation, signal, 'assignment-artifact:enumerate',
      ASSIGNMENT_ARTIFACT_BUCKET, input.targetId,
    )
    if (objects.length === 0) return Object.freeze([])
    if (objects.length !== 1) blocked()
    const object = parseStorageObject(objects[0], input)
    if (!object
      || (object.ownerId !== null && object.ownerId !== input.relationship.ownerId)
      || object.mimeType !== 'application/seb'
      || object.sizeBytes > 2_097_152
      || object.sha256 !== path[3]
      || (release !== null && (
        object.sizeBytes !== release.artifact_size_bytes
        || object.sha256 !== release.artifact_sha256
      ))) blocked()
    const createdAt = timestampInWindow(object.createdAt, input.identity)
    const publicAttestation = makeAttestation(input, createdAt)
    remember(input, publicAttestation)
    return Object.freeze([publicAttestation])
  }

  async function deleteStorageTarget(attestation, signal, input) {
    requireRemembered(input)
    if (!validateTargetEncoding(input)) blocked()
    await deleteStorage(
      attestation,
      signal,
      `delete:${input.targetKey}`,
      input.storageBucket,
      input.targetId,
    )
    const remaining = await storageObjects(
      attestation,
      signal,
      `verify-delete:${input.targetKey}`,
      input.storageBucket,
      input.targetId,
    )
    if (remaining.length !== 0) blocked()
    return Object.freeze({ status: 'passed' })
  }

  function makeClient(participantKind, bucketName, enumerate, remove) {
    function assertParticipantKind(input) {
      if (participantKind === 'answerStorage' && input.kind !== 'answerStorageObject') blocked()
      if (participantKind === 'artifactStorage' && input.kind !== 'assignmentArtifact') blocked()
      if (participantKind === 'personalOrganizations' && input.kind !== 'personalOrganization') blocked()
      if (participantKind === 'database' && ![
        'classroom', 'assignment', 'question', 'classroomMembership', 'configRevision',
        'release', 'checkIn', 'submission', 'answer', 'proctorConnection', 'proctorEvent',
      ].includes(input.kind)) blocked()
    }

    const api = {
      supabaseUrl: OFFICIAL_STAGING_SUPABASE_ORIGIN,
      ...(bucketName === null ? {} : { bucketName }),
      async enumerateExactCleanupTarget(rawInput, options) {
        if (!hasExactFields(options, ['signal']) || !isAbortSignal(options.signal)) blocked()
        const input = parseOperationInput(rawInput, parsedTopology)
        if (!input) blocked()
        return runTracked(options.signal, async (attestation, signal) => {
          assertParticipantKind(input)
          return Object.freeze({ matches: await enumerate(attestation, signal, input) })
        })
      },
      async deleteExactCleanupTarget(rawInput, options) {
        if (!hasExactFields(options, ['signal']) || !isAbortSignal(options.signal)) blocked()
        const input = parseOperationInput(rawInput, parsedTopology)
        if (!input) blocked()
        return runTracked(options.signal, (attestation, signal) => {
          assertParticipantKind(input)
          return remove(attestation, signal, input)
        })
      },
    }
    Object.freeze(api)
    return Object.freeze({
      targetOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
      credentialKind: 'service-role',
      client: api,
    })
  }

  const answerStorageClient = makeClient(
    'answerStorage', ANSWER_STORAGE_BUCKET,
    enumerateAnswerStorage, deleteStorageTarget,
  )
  const artifactStorageClient = makeClient(
    'artifactStorage', ASSIGNMENT_ARTIFACT_BUCKET,
    enumerateArtifactStorage, deleteStorageTarget,
  )
  const databaseClient = makeClient(
    'database', null, enumerateDatabaseTarget, deleteDatabaseTarget,
  )
  const personalOrganizationsClient = makeClient(
    'personalOrganizations', null, enumeratePersonalOrganization, deletePersonalOrganization,
  )

  async function closeAll() {
    if (closed) return Object.freeze({ status: 'passed' })
    if (closePromise) return closePromise
    closing = true
    closePromise = (async () => {
      try {
        for (const token of active.keys()) token.controller.abort()
        await Promise.allSettled([...active.values()])
        await operationTail.catch(() => undefined)
        if (uncloseableFactoryResult) blocked()
        if (orphanCloseObligation) {
          if (!sameCloseObligation(orphanCloseObligation)) blocked()
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), boundaryTimeoutMs)
          let result
          try {
            result = await orphanCloseObligation.close.call(
              orphanCloseObligation.client,
              Object.freeze({ signal: controller.signal }),
            )
          } finally {
            clearTimeout(timeout)
          }
          if (controller.signal.aborted
            || !sameCloseObligation(orphanCloseObligation)
            || !exactPassed(result)) blocked()
          orphanCloseObligation = null
        }
        if (orphanAttestation) {
          if (!sameRawClient(orphanAttestation)) blocked()
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), boundaryTimeoutMs)
          let result
          try {
            result = await orphanAttestation.close.call(
              orphanAttestation.client,
              Object.freeze({ signal: controller.signal }),
            )
          } finally {
            clearTimeout(timeout)
          }
          if (controller.signal.aborted
            || !sameRawClient(orphanAttestation)
            || !exactPassed(result)) blocked()
          orphanAttestation = null
        }
        if (rawAttestation) {
          if (!sameRawClient(rawAttestation)) blocked()
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), boundaryTimeoutMs)
          let result
          try {
            result = await rawAttestation.close.call(
              rawAttestation.client,
              Object.freeze({ signal: controller.signal }),
            )
          } finally {
            clearTimeout(timeout)
          }
          if (controller.signal.aborted || !sameRawClient(rawAttestation) || !exactPassed(result)) blocked()
        }
        rawAttestation = null
        closed = true
        return Object.freeze({ status: 'passed' })
      } catch {
        return Object.freeze({ status: 'failed' })
      } finally {
        closePromise = null
      }
    })()
    return closePromise
  }

  return Object.freeze({
    answerStorageClient,
    artifactStorageClient,
    databaseClient,
    personalOrganizationsClient,
    closeAll,
  })
}
