import { createHash } from 'node:crypto'

const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const BLOCKED_MESSAGE = 'SEB Staging Supabase narrow driver blocked'
const DEFAULT_TIMEOUT_MS = 5_000
const MIN_TIMEOUT_MS = 10
const MAX_TIMEOUT_MS = 30_000
const MAX_RECONCILIATION_MATCHES = 8
const MAX_QUERY_LIMIT = MAX_RECONCILIATION_MATCHES + 1
const MAX_PREDICATES = 12
const MAX_JSON_STRING = 50_000
const SERVICE_ROLE_CREDENTIAL_FIELDS = Object.freeze([
  'schemaVersion', 'targetOrigin', 'credentialKind', 'namespace', 'serviceRoleKey',
])
const RAW_DRIVER_FIELDS = Object.freeze([
  'supabaseUrl', 'credentialKind', 'enumerateDatabase', 'deleteDatabase',
  'enumerateStorage', 'deleteStorage', 'close',
])
const UUID_PART = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const UUID = new RegExp(`^${UUID_PART}$`)
const RUN_NAMESPACE = /^qa:seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const OPERATION_ID = /^[a-z0-9][a-z0-9:_-]{0,191}$/
const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/
const DECIMAL_BIGINT = /^(?:0|[1-9][0-9]*)$/
const SHA256 = /^[a-f0-9]{64}$/
const ANSWER_PATH = new RegExp(
  `^(${UUID_PART})/(${UUID_PART})/(${UUID_PART})/(${UUID_PART})\\.(jpg|pdf|png|webp)$`,
)
const ARTIFACT_PATH = new RegExp(
  `^assignments/(${UUID_PART})/r([1-9][0-9]{0,9})/([a-f0-9]{64})\\.seb$`,
)
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const SAFE_TARGET_KEY = /^[a-z][a-z0-9-]{0,63}$/
const MAX_CREATION_WINDOW_MS = 24 * 60 * 60 * 1_000

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

const MIME_BY_EXTENSION = Object.freeze({
  jpg: 'image/jpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  webp: 'image/webp',
})

const FORBIDDEN_FIELDS = Object.freeze(new Set([
  'hashed_quit_password',
  'config_key',
  'browser_exam_keys',
  'quit_password',
  'quit_password_hash',
  'unlock_password',
  'password',
  'service_role_key',
  'secret',
  'token',
]))

function tableProfile(select, predicates, deleteMode = 'none', deleteIdentity = []) {
  return Object.freeze({
    select: Object.freeze(new Set(select)),
    predicates: Object.freeze(new Set([...select, ...predicates])),
    deleteMode,
    deleteIdentity: Object.freeze([...deleteIdentity]),
  })
}

// These are the only public-schema fields this adapter may ever select. In
// particular, the three SEB secret-derived columns are deliberately absent.
const TABLES = Object.freeze(new Map([
  ['assignments', tableProfile(
    ['id', 'classroom_id', 'created_by', 'org_id', 'type', 'secure_browser_mode', 'question_ids', 'created_at'],
    [], 'rpc', ['id'],
  )],
  ['classrooms', tableProfile(
    [
      'id', 'teacher_id', 'org_id', 'classroom_type', 'name', 'description',
      'created_at',
    ], [], 'rpc', ['id'],
  )],
  ['questions', tableProfile(
    ['id', 'created_by', 'org_id', 'question_type', 'created_at'],
    ['parent_question_id'], 'rpc', ['id'],
  )],
  ['classroom_students', tableProfile(
    ['id', 'classroom_id', 'student_id', 'joined_at'], [], 'direct', ['id'],
  )],
  ['assignment_classrooms', tableProfile(
    ['id', 'assignment_id', 'classroom_id', 'created_at'], [], 'none', ['id'],
  )],
  ['assignment_seb_config_revisions', tableProfile(
    ['assignment_id', 'revision', 'org_id', 'owner_id', 'created_at'], [], 'none', ['assignment_id', 'revision'],
  )],
  ['assignment_seb_config_releases', tableProfile(
    [
      'assignment_id', 'revision', 'org_id', 'owner_id', 'release_id',
      'artifact_storage_path', 'artifact_sha256', 'artifact_size_bytes',
      'security_mode', 'created_at',
    ],
    [], 'none', ['release_id'],
  )],
  ['exam_seb_checkins', tableProfile(
    ['assignment_id', 'student_id', 'org_id', 'platform', 'verified_at'],
    [], 'direct', ['assignment_id', 'student_id'],
  )],
  ['submissions', tableProfile(
    [
      'id', 'assignment_id', 'student_id', 'org_id', 'secure_browser_verified_at',
      'secure_browser_platform', 'seb_config_revision', 'created_at',
    ],
    [], 'rpc', ['id'],
  )],
  ['submission_answers', tableProfile(
    ['id', 'submission_id', 'question_id', 'org_id', 'student_answer', 'created_at'],
    [], 'rpc', ['id'],
  )],
  ['exam_proctor_connections', tableProfile(
    ['submission_id', 'client_instance_id', 'assignment_id', 'student_id', 'org_id', 'connected_at'],
    [], 'direct', ['submission_id', 'client_instance_id'],
  )],
  ['exam_proctor_events', tableProfile(
    ['id', 'submission_id', 'assignment_id', 'student_id', 'org_id', 'event_type', 'created_at'],
    [], 'direct', ['id'],
  )],
  ['exam_proctor_sessions', tableProfile(
    ['submission_id', 'assignment_id', 'student_id', 'org_id', 'created_at'],
    [], 'direct', ['submission_id'],
  )],
  ['organizations', tableProfile(
    ['id', 'is_personal', 'subscription_tier', 'deleted_at', 'created_at'],
    [], 'rpc', ['id'],
  )],
  ['organization_members', tableProfile(
    ['id', 'org_id', 'user_id', 'org_role', 'joined_at'], [], 'none', ['id'],
  )],
  ['student_work_artifacts', tableProfile(['id'], ['submission_answer_id', 'org_id'])],
  ['org_invitations', tableProfile(['id'], ['org_id'])],
  ['question_sets', tableProfile(['id'], ['org_id', 'question_ids'])],
  ['question_set_shares', tableProfile(['question_set_id'], ['org_id'])],
  ['learning_standards', tableProfile(['id'], ['org_id'])],
  ['question_standards', tableProfile(['question_id'], ['org_id'])],
  ['notifications', tableProfile(['id'], ['org_id', 'related_assignment_id', 'related_classroom_id'])],
  ['exam_android_approvals', tableProfile(['id'], ['org_id', 'assignment_id'])],
  ['education_research_score_drafts', tableProfile(['id'], ['org_id'])],
  ['education_research_import_templates', tableProfile(['id'], ['org_id'])],
  ['education_research_import_template_rows', tableProfile(['id'], ['org_id'])],
  ['education_research_import_batches', tableProfile(['id'], ['org_id'])],
  ['education_research_import_batch_rows', tableProfile(['id'], ['org_id'])],
  ['question_shares', tableProfile(['question_id'], ['org_id'])],
  ['teaching_boards', tableProfile(['id'], ['org_id', 'assignment_id', 'question_id'])],
  ['ioc_forms', tableProfile(['id'], ['org_id', 'assignment_id', 'classroom_id'])],
  ['ioc_form_standards', tableProfile(['id'], ['org_id'])],
  ['ioc_form_items', tableProfile(['id'], ['org_id', 'source_question_id'])],
  ['ioc_form_experts', tableProfile(['id'], ['org_id'])],
  ['ioc_ratings', tableProfile(['id'], ['org_id'])],
  ['ioc_form_events', tableProfile(['id'], ['org_id'])],
  ['education_research_projects', tableProfile(['id'], ['org_id', 'classroom_id'])],
  ['education_research_participants', tableProfile(['id'], ['org_id'])],
  ['education_research_measurements', tableProfile(
    ['id'], ['org_id', 'assignment_id', 'source_question_ids', 'snapshot_question_ids'],
  )],
  ['education_research_scores', tableProfile(['id'], ['org_id', 'submission_id'])],
  ['education_research_score_history', tableProfile(['id'], ['org_id'])],
  ['education_research_export_events', tableProfile(['id'], ['org_id'])],
  ['assignment_extensions', tableProfile(['id'], ['assignment_id'])],
  ['classroom_invitations', tableProfile(['id'], ['classroom_id'])],
  ['classroom_co_teachers', tableProfile(['id'], ['classroom_id'])],
  ['classroom_posts', tableProfile(['id'], ['classroom_id'])],
  ['student_notes', tableProfile(['id'], ['classroom_id'])],
]))

const BIGINT_COLUMNS = Object.freeze(new Map([
  ['exam_proctor_events', Object.freeze(new Set(['id']))],
]))

const LEDGER_KIND_TARGET_PATTERNS = Object.freeze(new Map([
  ['account', UUID],
  ['personalOrganization', new RegExp(`^${UUID_PART}:${UUID_PART}$`)],
  ['classroom', UUID],
  ['question', UUID],
  ['classroomMembership', UUID],
  ['assignment', UUID],
  ['configRevision', new RegExp(`^${UUID_PART}:r[1-9][0-9]{0,9}$`)],
  ['release', /^asr-[0-9a-f]{32}-r[1-9][0-9]{0,9}-[0-9a-f]{16}$/],
  ['checkIn', new RegExp(`^${UUID_PART}:${UUID_PART}$`)],
  ['submission', UUID],
  ['answer', UUID],
  ['proctorConnection', new RegExp(`^${UUID_PART}:${UUID_PART}$`)],
  ['proctorEvent', /^[1-9][0-9]{0,18}$/],
  ['answerStorageObject', ANSWER_PATH],
  ['assignmentArtifact', ARTIFACT_PATH],
]))

export class SebStagingSupabaseNarrowDriverBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingSupabaseNarrowDriverBlockedError'
  }
}

function blocked() {
  throw new SebStagingSupabaseNarrowDriverBlockedError()
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

function hasOnlyFields(value, required, optional = []) {
  if (!isRecord(value)) return false
  const allowed = new Set([...required, ...optional])
  return required.every(field => Object.hasOwn(value, field))
    && Object.keys(value).every(field => allowed.has(field))
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
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
    ? Object.freeze({ timestamp, iso: new Date(timestamp).toISOString() })
    : null
}

function environmentIsOfficial(readEnvironment) {
  try {
    const value = readEnvironment()
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
    return Object.entries(REQUIRED_ENVIRONMENT)
      .every(([key, expected]) => value[key] === expected)
  } catch {
    return false
  }
}

function validSecret(value) {
  return typeof value === 'string'
    && value.length >= 20
    && value.length <= 8_192
    && !/[\u0000-\u0020\u007f]/u.test(value)
}

function validScalar(value) {
  return value === null
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isSafeInteger(value))
    || (typeof value === 'string'
      && value.length <= 512
      && !/[\u0000-\u001f\u007f]/u.test(value))
}

function validPredicateValue(operator, value) {
  if (operator === 'contains') {
    return Array.isArray(value)
      && value.length === 1
      && typeof value[0] === 'string'
      && UUID.test(value[0])
  }
  return validScalar(value)
}

function sanitizeJson(value, depth = 0) {
  if (depth > 5) blocked()
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) blocked()
    return value
  }
  if (typeof value === 'string') {
    if (value.length > MAX_JSON_STRING || /[\u0000]/u.test(value)) blocked()
    return value
  }
  if (Array.isArray(value)) {
    if (value.length > 100) blocked()
    return Object.freeze(value.map(item => sanitizeJson(item, depth + 1)))
  }
  if (isRecord(value)) {
    if (Object.keys(value).length > 30) blocked()
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => {
      if (!IDENTIFIER.test(key) || FORBIDDEN_FIELDS.has(key)) blocked()
      return [key, sanitizeJson(child, depth + 1)]
    })))
  }
  blocked()
}

function normalizeBigint(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) blocked()
    return String(value)
  }
  if (typeof value !== 'string' || !DECIMAL_BIGINT.test(value) || value.length > 20) blocked()
  return value
}

function normalizeRow(table, row, columns) {
  if (!hasExactFields(row, columns)) blocked()
  const bigintColumns = BIGINT_COLUMNS.get(table) ?? new Set()
  return Object.freeze(Object.fromEntries(columns.map(column => [
    column,
    bigintColumns.has(column)
      ? normalizeBigint(row[column])
      : sanitizeJson(row[column]),
  ])))
}

function validatePredicate(predicate, profile) {
  if (!hasExactFields(predicate, ['column', 'operator', 'value'])
    || typeof predicate.column !== 'string'
    || !profile.predicates.has(predicate.column)
    || FORBIDDEN_FIELDS.has(predicate.column)
    || !['eq', 'is', 'gte', 'lte', 'contains'].includes(predicate.operator)
    || !validPredicateValue(predicate.operator, predicate.value)
    || (predicate.operator === 'is' && predicate.value !== null)
    || (predicate.operator !== 'is' && predicate.value === null)
    || (predicate.operator === 'contains'
      && !['question_ids', 'source_question_ids', 'snapshot_question_ids'].includes(predicate.column))) blocked()
  return Object.freeze({
    column: predicate.column,
    operator: predicate.operator,
    value: predicate.value,
  })
}

function parseDatabaseEnumerateRequest(value) {
  if (!hasExactFields(value, [
    'schemaVersion', 'operationId', 'table', 'columns', 'predicates', 'limit',
  ])
    || value.schemaVersion !== 1
    || typeof value.operationId !== 'string'
    || !OPERATION_ID.test(value.operationId)
    || typeof value.table !== 'string'
    || !TABLES.has(value.table)
    || !Array.isArray(value.columns)
    || value.columns.length < 1
    || value.columns.length > 12
    || new Set(value.columns).size !== value.columns.length
    || !Array.isArray(value.predicates)
    || value.predicates.length < 1
    || value.predicates.length > MAX_PREDICATES
    || !Number.isInteger(value.limit)
    || value.limit < 1
    || value.limit > MAX_QUERY_LIMIT) blocked()
  const profile = TABLES.get(value.table)
  if (value.columns.some(column => (
    typeof column !== 'string'
    || !profile.select.has(column)
    || FORBIDDEN_FIELDS.has(column)
  ))) blocked()
  const predicates = value.predicates.map(item => validatePredicate(item, profile))
  const signatures = predicates.map(item => `${item.column}\u0000${item.operator}`)
  if (new Set(signatures).size !== signatures.length) blocked()
  return freezeInput({
    schemaVersion: 1,
    operationId: value.operationId,
    table: value.table,
    columns: value.columns,
    predicates,
    limit: value.limit,
  })
}

function parseAtomicClosure(value) {
  if (value === null) return null
  if (!hasExactFields(value, [
    'schemaVersion', 'isolation', 'requireAbsent', 'requireExact', 'allowedCascadeTables',
  ])
    || value.schemaVersion !== 1
    || value.isolation !== 'serializable-parent-lock'
    || !Array.isArray(value.requireAbsent)
    || !Array.isArray(value.requireExact)
    || !Array.isArray(value.allowedCascadeTables)
    || value.requireAbsent.length > 64
    || value.requireExact.length > 16
    || value.allowedCascadeTables.length > 8
    || new Set(value.allowedCascadeTables).size !== value.allowedCascadeTables.length) blocked()

  const parseRequirement = (requirement, expectedCount) => {
    if (!hasExactFields(requirement, ['table', 'predicates', 'expectedCount'])
      || typeof requirement.table !== 'string'
      || !TABLES.has(requirement.table)
      || requirement.expectedCount !== expectedCount
      || !Array.isArray(requirement.predicates)
      || requirement.predicates.length < 1
      || requirement.predicates.length > MAX_PREDICATES) blocked()
    const profile = TABLES.get(requirement.table)
    const predicates = requirement.predicates.map(item => validatePredicate(item, profile))
    const signatures = predicates.map(item => `${item.column}\u0000${item.operator}`)
    if (new Set(signatures).size !== signatures.length) blocked()
    return Object.freeze({
      table: requirement.table,
      predicates: Object.freeze(predicates),
      expectedCount,
    })
  }
  const requireAbsent = value.requireAbsent.map(item => parseRequirement(item, 0))
  const requireExact = value.requireExact.map(item => parseRequirement(item, 1))
  const exactTables = new Set(requireExact.map(item => item.table))
  for (const table of value.allowedCascadeTables) {
    if (typeof table !== 'string' || !exactTables.has(table)) blocked()
  }
  return Object.freeze({
    schemaVersion: 1,
    isolation: 'serializable-parent-lock',
    requireAbsent: Object.freeze(requireAbsent),
    requireExact: Object.freeze(requireExact),
    allowedCascadeTables: Object.freeze([...value.allowedCascadeTables]),
  })
}

function parseDatabaseDeleteRequest(value) {
  if (!hasExactFields(value, [
    'schemaVersion', 'operationId', 'table', 'predicates', 'maxRows', 'atomicClosure',
  ])
    || value.schemaVersion !== 1
    || typeof value.operationId !== 'string'
    || !OPERATION_ID.test(value.operationId)
    || typeof value.table !== 'string'
    || !TABLES.has(value.table)
    || !Array.isArray(value.predicates)
    || value.predicates.length < 1
    || value.predicates.length > MAX_PREDICATES
    || value.maxRows !== 1) blocked()
  const profile = TABLES.get(value.table)
  if (profile.deleteMode === 'none') blocked()
  const atomicClosure = parseAtomicClosure(value.atomicClosure)
  if (profile.deleteMode === 'rpc' && atomicClosure === null) blocked()
  const predicates = value.predicates.map(item => validatePredicate(item, profile))
  const signatures = predicates.map(item => `${item.column}\u0000${item.operator}`)
  if (new Set(signatures).size !== signatures.length) blocked()
  for (const identityColumn of profile.deleteIdentity) {
    if (!predicates.some(item => item.column === identityColumn && item.operator === 'eq')) blocked()
  }
  return freezeInput({
    schemaVersion: 1,
    operationId: value.operationId,
    table: value.table,
    predicates,
    maxRows: 1,
    atomicClosure,
  })
}

function validatePath(path) {
  if (typeof path !== 'string'
    || path.length < 1
    || path.length > 1_024
    || path.includes('\\')
    || /[\u0000-\u001f\u007f]/u.test(path)
    || path.split('/').some(segment => !segment || segment === '.' || segment === '..')) blocked()
  return path
}

function parseStorageRequest(value, deletion = false) {
  const expectedFields = deletion
    ? ['schemaVersion', 'operationId', 'bucketName', 'path', 'maxObjects']
    : ['schemaVersion', 'operationId', 'bucketName', 'path', 'limit']
  if (!hasExactFields(value, expectedFields)
    || value.schemaVersion !== 1
    || typeof value.operationId !== 'string'
    || !OPERATION_ID.test(value.operationId)
    || !['submission-files', 'assignment-seb-configs'].includes(value.bucketName)
    || (deletion
      ? value.maxObjects !== 1
      : (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > MAX_QUERY_LIMIT))) blocked()
  const path = validatePath(value.path)
  if (value.bucketName === 'submission-files' ? !ANSWER_PATH.test(path) : !ARTIFACT_PATH.test(path)) blocked()
  return freezeInput({
    schemaVersion: 1,
    operationId: value.operationId,
    bucketName: value.bucketName,
    path,
    ...(deletion ? { maxObjects: 1 } : { limit: value.limit }),
  })
}

function encodePostgrestValue(value) {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return `{${value.join(',')}}`
  return String(value)
}

function databaseUrl(request, columns, limit) {
  const url = new URL(`/rest/v1/${request.table}`, OFFICIAL_STAGING_SUPABASE_ORIGIN)
  const bigintColumns = BIGINT_COLUMNS.get(request.table) ?? new Set()
  url.searchParams.set('select', columns.map(column => (
    bigintColumns.has(column) ? `${column}::text` : column
  )).join(','))
  for (const predicate of request.predicates) {
    url.searchParams.append(
      predicate.column,
      `${predicate.operator === 'contains' ? 'cs' : predicate.operator}.${encodePostgrestValue(predicate.value)}`,
    )
  }
  url.searchParams.set('limit', String(limit))
  return url
}

function jsonHeaders(serviceRoleKey, write = false) {
  return {
    Accept: 'application/json',
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...(write ? { 'Content-Type': 'application/json' } : {}),
  }
}

function isResponseLike(value) {
  try {
    return value !== null
      && typeof value === 'object'
      && typeof value.ok === 'boolean'
      && Number.isInteger(value.status)
      && value.headers !== null
      && typeof value.headers?.get === 'function'
      && typeof value.json === 'function'
      && typeof value.arrayBuffer === 'function'
  } catch {
    return false
  }
}

function encodedStoragePath(path) {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

function exactOptions(value) {
  if (!hasExactFields(value, ['signal']) || !isAbortSignal(value.signal)) blocked()
  return value.signal
}

function parseIdentity(value) {
  if (!hasExactFields(value, ['runId', 'sourceRevision', 'deploymentId', 'creationWindow'])
    || !hasExactFields(value.creationWindow, ['notBefore', 'notAfter'])) return null
  const before = canonicalTimestamp(value.creationWindow.notBefore)
  const after = canonicalTimestamp(value.creationWindow.notAfter)
  if (!RUN_NAMESPACE.test(`qa:${value.runId}`)
    || !SOURCE_REVISION.test(value.sourceRevision)
    || !DEPLOYMENT_ID.test(value.deploymentId)
    || !before
    || !after
    || after.timestamp <= before.timestamp
    || after.timestamp - before.timestamp > MAX_CREATION_WINDOW_MS) return null
  return Object.freeze({
    runId: value.runId,
    sourceRevision: value.sourceRevision,
    deploymentId: value.deploymentId,
    creationWindow: Object.freeze({ notBefore: before.iso, notAfter: after.iso }),
  })
}

function parseLedgerCriteria(value, namespace) {
  if (!hasExactFields(value, [
    'schemaVersion', 'targetKey', 'kind', 'identity', 'namespace', 'ownerId',
    'organizationId', 'resourceType', 'creationWindow',
  ])
    || value.schemaVersion !== 1
    || typeof value.targetKey !== 'string'
    || !SAFE_TARGET_KEY.test(value.targetKey)
    || !LEDGER_KIND_TARGET_PATTERNS.has(value.kind)
    || value.namespace !== namespace
    || (value.ownerId !== null && !UUID.test(value.ownerId))
    || (value.organizationId !== null && !UUID.test(value.organizationId))
    || typeof value.resourceType !== 'string'
    || value.resourceType.length < 1
    || value.resourceType.length > 64) blocked()
  const identity = parseIdentity(value.identity)
  if (!identity
    || !hasExactFields(value.creationWindow, ['notBefore', 'notAfter'])
    || value.creationWindow.notBefore !== identity.creationWindow.notBefore
    || value.creationWindow.notAfter !== identity.creationWindow.notAfter
    || namespace !== `qa:${identity.runId}`) blocked()
  return freezeInput({
    schemaVersion: 1,
    targetKey: value.targetKey,
    kind: value.kind,
    identity,
    namespace,
    ownerId: value.ownerId,
    organizationId: value.organizationId,
    resourceType: value.resourceType,
    creationWindow: identity.creationWindow,
  })
}

function parseLedgerResponse(value, criteria) {
  if (!hasExactFields(value, ['schemaVersion', 'authoritative', 'matches'])
    || value.schemaVersion !== 1
    || value.authoritative !== true
    || !Array.isArray(value.matches)
    || value.matches.length > MAX_RECONCILIATION_MATCHES) blocked()
  const seen = new Set()
  const matches = value.matches.map(match => {
    if (!hasExactFields(match, [
      'schemaVersion', 'targetKey', 'kind', 'identity', 'targetId', 'namespace',
      'ownerId', 'organizationId', 'resourceType', 'createdAt',
    ])
      || match.schemaVersion !== 1
      || match.targetKey !== criteria.targetKey
      || match.kind !== criteria.kind
      || match.namespace !== criteria.namespace
      || match.ownerId !== criteria.ownerId
      || match.organizationId !== criteria.organizationId
      || match.resourceType !== criteria.resourceType
      || JSON.stringify(match.identity) !== JSON.stringify(criteria.identity)
      || typeof match.targetId !== 'string'
      || !LEDGER_KIND_TARGET_PATTERNS.get(match.kind).test(match.targetId)
      || seen.has(match.targetId)) blocked()
    const createdAt = canonicalTimestamp(match.createdAt)
    if (!createdAt
      || createdAt.timestamp < Date.parse(criteria.creationWindow.notBefore)
      || createdAt.timestamp > Date.parse(criteria.creationWindow.notAfter)) blocked()
    seen.add(match.targetId)
    return Object.freeze({ ...match, identity: criteria.identity, createdAt: createdAt.iso })
  })
  return Object.freeze({ schemaVersion: 1, authoritative: true, matches: Object.freeze(matches) })
}

function parseFactoryOptions(value) {
  if (!hasOnlyFields(value, [
    'readEnvironment', 'namespace', 'serviceRoleCredentialProvider',
  ], ['fetchImplementation', 'boundaryTimeoutMs'])
    || typeof value.readEnvironment !== 'function'
    || typeof value.namespace !== 'string'
    || !RUN_NAMESPACE.test(value.namespace)
    || typeof value.serviceRoleCredentialProvider !== 'function'
    || (Object.hasOwn(value, 'fetchImplementation') && typeof value.fetchImplementation !== 'function')) blocked()
  const boundaryTimeoutMs = Object.hasOwn(value, 'boundaryTimeoutMs')
    ? value.boundaryTimeoutMs
    : DEFAULT_TIMEOUT_MS
  if (!Number.isInteger(boundaryTimeoutMs)
    || boundaryTimeoutMs < MIN_TIMEOUT_MS
    || boundaryTimeoutMs > MAX_TIMEOUT_MS) blocked()
  const fetchImplementation = value.fetchImplementation ?? globalThis.fetch
  if (typeof fetchImplementation !== 'function' || !environmentIsOfficial(value.readEnvironment)) blocked()
  return Object.freeze({
    readEnvironment: value.readEnvironment,
    namespace: value.namespace,
    serviceRoleCredentialProvider: value.serviceRoleCredentialProvider,
    fetchImplementation,
    boundaryTimeoutMs,
  })
}

function parseBoundaryFactoryOptions(value) {
  if (!hasOnlyFields(value, ['readEnvironment', 'serviceRoleCredentialProvider'], [
    'fetchImplementation', 'boundaryTimeoutMs',
  ])
    || typeof value.readEnvironment !== 'function'
    || typeof value.serviceRoleCredentialProvider !== 'function'
    || (Object.hasOwn(value, 'fetchImplementation') && typeof value.fetchImplementation !== 'function')
    || !environmentIsOfficial(value.readEnvironment)) blocked()
  const boundaryTimeoutMs = Object.hasOwn(value, 'boundaryTimeoutMs')
    ? value.boundaryTimeoutMs
    : DEFAULT_TIMEOUT_MS
  if (!Number.isInteger(boundaryTimeoutMs)
    || boundaryTimeoutMs < MIN_TIMEOUT_MS
    || boundaryTimeoutMs > MAX_TIMEOUT_MS) blocked()
  const fetchImplementation = value.fetchImplementation ?? globalThis.fetch
  if (typeof fetchImplementation !== 'function') blocked()
  return Object.freeze({
    readEnvironment: value.readEnvironment,
    serviceRoleCredentialProvider: value.serviceRoleCredentialProvider,
    fetchImplementation,
    boundaryTimeoutMs,
  })
}

function parseRuntimeClientRequest(value) {
  if (!hasExactFields(value, [
    'schemaVersion', 'targetOrigin', 'credentialKind', 'namespace', 'serviceRoleKey', 'signal',
  ])
    || value.schemaVersion !== 1
    || value.targetOrigin !== OFFICIAL_STAGING_SUPABASE_ORIGIN
    || value.credentialKind !== 'service-role'
    || typeof value.namespace !== 'string'
    || !RUN_NAMESPACE.test(value.namespace)
    || !validSecret(value.serviceRoleKey)
    || !isAbortSignal(value.signal)
    || value.signal.aborted) blocked()
  return value
}

function createCredentialTransport(options) {
  let serviceRoleKey = ''
  let credentialPromise = null
  let closing = false
  let closed = false
  let closePromise = null
  const active = new Map()

  function environmentOkay() {
    return environmentIsOfficial(options.readEnvironment)
  }

  async function credential(signal) {
    if (serviceRoleKey) return serviceRoleKey
    if (credentialPromise) return credentialPromise
    credentialPromise = (async () => {
      if (!environmentOkay() || signal.aborted || closing || closed) blocked()
      const value = await options.serviceRoleCredentialProvider(freezeInput({
        schemaVersion: 1,
        targetOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
        credentialKind: 'service-role',
        namespace: options.namespace,
        signal,
      }))
      if (!hasExactFields(value, SERVICE_ROLE_CREDENTIAL_FIELDS)
        || value.schemaVersion !== 1
        || value.targetOrigin !== OFFICIAL_STAGING_SUPABASE_ORIGIN
        || value.credentialKind !== 'service-role'
        || value.namespace !== options.namespace
        || !validSecret(value.serviceRoleKey)
        || signal.aborted
        || !environmentOkay()) blocked()
      serviceRoleKey = value.serviceRoleKey
      return serviceRoleKey
    })()
    try {
      return await credentialPromise
    } finally {
      credentialPromise = null
    }
  }

  function run(parentSignal, task) {
    if (!isAbortSignal(parentSignal)
      || parentSignal.aborted
      || closing
      || closed
      || !environmentOkay()) return Promise.reject(new SebStagingSupabaseNarrowDriverBlockedError())
    const controller = new AbortController()
    const abort = () => controller.abort()
    parentSignal.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(() => controller.abort(), options.boundaryTimeoutMs)
    const token = Object.freeze({ controller })
    const promise = Promise.resolve().then(async () => {
      const key = await credential(controller.signal)
      if (controller.signal.aborted || !environmentOkay()) blocked()
      const result = await task(key, controller.signal)
      if (controller.signal.aborted || !environmentOkay()) blocked()
      return result
    }).catch(() => blocked())
    active.set(token, promise)
    return promise.finally(() => {
      clearTimeout(timeout)
      parentSignal.removeEventListener('abort', abort)
      active.delete(token)
    })
  }

  async function request(key, url, init, signal, expectedStatuses = [200]) {
    if (!environmentOkay() || signal.aborted) blocked()
    const expectedUrl = new URL(url).href
    const response = await options.fetchImplementation(url, Object.freeze({
      ...init,
      redirect: 'error',
      cache: 'no-store',
      signal,
    }))
    if (!isResponseLike(response)
      || !expectedStatuses.includes(response.status)
      || response.ok !== true
      || response.url !== expectedUrl
      || signal.aborted
      || !environmentOkay()) blocked()
    return response
  }

  async function jsonRequest(key, url, init, signal, expectedStatuses = [200]) {
    const response = await request(key, url, init, signal, expectedStatuses)
    const contentType = response.headers.get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      ?.toLowerCase()
    if (contentType !== 'application/json') blocked()
    let json
    try { json = await response.json() } catch { blocked() }
    if (signal.aborted || !environmentOkay()) blocked()
    return json
  }

  async function close(closeSignal) {
    if (!isAbortSignal(closeSignal) || closeSignal.aborted) blocked()
    if (closed) return Object.freeze({ status: 'passed' })
    if (closePromise) return closePromise
    closing = true
    closePromise = (async () => {
      for (const token of active.keys()) token.controller.abort()
      await Promise.allSettled([...active.values()])
      if (active.size !== 0) blocked()
      serviceRoleKey = ''
      credentialPromise = null
      closed = true
      return Object.freeze({ status: 'passed' })
    })()
    return closePromise
  }

  return Object.freeze({ run, request, jsonRequest, close })
}

async function readDatabaseRows(transport, key, signal, request, columns, limit) {
  const url = databaseUrl(request, columns, limit)
  const body = await transport.jsonRequest(key, url, {
    method: 'GET',
    headers: jsonHeaders(key),
  }, signal)
  if (!Array.isArray(body) || body.length > MAX_RECONCILIATION_MATCHES) blocked()
  return Object.freeze(body.map(row => normalizeRow(request.table, row, columns)))
}

async function callRpc(transport, key, signal, name, body) {
  const url = new URL(`/rest/v1/rpc/${name}`, OFFICIAL_STAGING_SUPABASE_ORIGIN)
  return transport.jsonRequest(key, url, {
    method: 'POST',
    headers: {
      ...jsonHeaders(key, true),
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
    },
    body: JSON.stringify(body),
  }, signal)
}

function storageMetadata(value, request) {
  if (!hasExactFields(value, [
    'bucketName', 'path', 'ownerId', 'createdAt', 'sizeBytes', 'mimeType',
  ])
    || value.bucketName !== request.bucketName
    || value.path !== request.path
    || (value.ownerId !== null && !UUID.test(value.ownerId))
    || !canonicalTimestamp(value.createdAt)
    || !Number.isInteger(value.sizeBytes)
    || value.sizeBytes < 1
    || typeof value.mimeType !== 'string') blocked()
  if (request.bucketName === 'submission-files') {
    const path = ANSWER_PATH.exec(request.path)
    if (!path
      || value.ownerId !== path[1]
      || value.mimeType !== MIME_BY_EXTENSION[path[5]]
      || value.sizeBytes > 10 * 1024 * 1024) blocked()
  } else {
    if (!ARTIFACT_PATH.test(request.path)
      || (value.ownerId !== null && !UUID.test(value.ownerId))
      || value.mimeType !== 'application/seb'
      || value.sizeBytes > 2_097_152) blocked()
  }
  return Object.freeze({ ...value, createdAt: canonicalTimestamp(value.createdAt).iso })
}

async function attestStorage(transport, key, signal, request, namespace) {
  const result = await callRpc(
    transport,
    key,
    signal,
    'seb_s5_attest_storage_object',
    Object.freeze({
      p_schema_version: 1,
      p_qa_namespace: namespace,
      p_bucket_name: request.bucketName,
      p_path: request.path,
    }),
  )
  if (!hasExactFields(result, ['schemaVersion', 'objects'])
    || result.schemaVersion !== 1
    || !Array.isArray(result.objects)
    || result.objects.length > 1) blocked()
  if (result.objects.length === 0) return Object.freeze([])
  return Object.freeze([storageMetadata(result.objects[0], request)])
}

async function downloadAndHash(transport, key, signal, request, metadata) {
  const url = new URL(
    `/storage/v1/object/${encodeURIComponent(request.bucketName)}/${encodedStoragePath(request.path)}`,
    OFFICIAL_STAGING_SUPABASE_ORIGIN,
  )
  const response = await transport.request(key, url, {
    method: 'GET',
    headers: jsonHeaders(key),
  }, signal)
  const declaredLength = response.headers.get('content-length')
  if (declaredLength !== null
    && (!/^(?:0|[1-9][0-9]*)$/.test(declaredLength)
      || Number(declaredLength) !== metadata.sizeBytes)) blocked()
  const declaredMime = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (declaredMime !== metadata.mimeType) blocked()
  let bytes
  try { bytes = new Uint8Array(await response.arrayBuffer()) } catch { blocked() }
  if (signal.aborted || bytes.byteLength !== metadata.sizeBytes) blocked()
  return createHash('sha256').update(bytes).digest('hex')
}

async function enumerateExactStorage(transport, key, signal, request, namespace) {
  const metadataRows = await attestStorage(transport, key, signal, request, namespace)
  if (metadataRows.length === 0) return Object.freeze([])
  const metadata = metadataRows[0]
  const sha256 = await downloadAndHash(transport, key, signal, request, metadata)
  if (!SHA256.test(sha256)) blocked()
  const artifact = ARTIFACT_PATH.exec(request.path)
  if (artifact && sha256 !== artifact[3]) blocked()
  return Object.freeze([Object.freeze({ ...metadata, sha256 })])
}

/**
 * Composition boundary for createSebStagingResourceCleanupRuntime(). The
 * original provider remains closure-private; callers receive only the two
 * narrow callbacks expected by that runtime. The raw client callback accepts
 * exactly the runtime's already-attested credential request and returns the
 * exact seven-field driver below.
 */
export function createSebStagingSupabaseNarrowDriverFactory(input = {}) {
  const options = parseBoundaryFactoryOptions(input)

  async function serviceRoleCredentialProvider(request) {
    if (!hasExactFields(request, [
      'schemaVersion', 'targetOrigin', 'credentialKind', 'namespace', 'signal',
    ])
      || request.schemaVersion !== 1
      || request.targetOrigin !== OFFICIAL_STAGING_SUPABASE_ORIGIN
      || request.credentialKind !== 'service-role'
      || typeof request.namespace !== 'string'
      || !RUN_NAMESPACE.test(request.namespace)
      || !isAbortSignal(request.signal)
      || request.signal.aborted
      || !environmentIsOfficial(options.readEnvironment)) blocked()
    const result = await options.serviceRoleCredentialProvider(request)
    if (!hasExactFields(result, SERVICE_ROLE_CREDENTIAL_FIELDS)
      || result.schemaVersion !== 1
      || result.targetOrigin !== OFFICIAL_STAGING_SUPABASE_ORIGIN
      || result.credentialKind !== 'service-role'
      || result.namespace !== request.namespace
      || !validSecret(result.serviceRoleKey)
      || request.signal.aborted
      || !environmentIsOfficial(options.readEnvironment)) blocked()
    return result
  }

  async function createServiceRoleClient(rawRequest) {
    const request = parseRuntimeClientRequest(rawRequest)
    if (!environmentIsOfficial(options.readEnvironment)) blocked()
    const namespace = request.namespace
    const credentialHolder = { value: request.serviceRoleKey }
    return createSebStagingSupabaseNarrowDriver({
      readEnvironment: options.readEnvironment,
      namespace,
      serviceRoleCredentialProvider: async providerRequest => {
        if (providerRequest.signal.aborted || !environmentIsOfficial(options.readEnvironment)) blocked()
        const serviceRoleKey = credentialHolder.value
        credentialHolder.value = ''
        if (!validSecret(serviceRoleKey)) blocked()
        return Object.freeze({
          schemaVersion: 1,
          targetOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
          credentialKind: 'service-role',
          namespace,
          serviceRoleKey,
        })
      },
      fetchImplementation: options.fetchImplementation,
      boundaryTimeoutMs: options.boundaryTimeoutMs,
    })
  }

  return Object.freeze({ serviceRoleCredentialProvider, createServiceRoleClient })
}

/**
 * Creates the least-privilege raw adapter consumed by
 * createSebStagingResourceCleanupRuntime(). The service-role key is obtained
 * from an injected provider, remains inside this closure, and is erased on
 * close. No process environment secret is read by this module.
 */
export async function createSebStagingSupabaseNarrowDriver(input = {}) {
  const options = parseFactoryOptions(input)
  const transport = createCredentialTransport(options)

  const driver = {
    supabaseUrl: OFFICIAL_STAGING_SUPABASE_ORIGIN,
    credentialKind: 'service-role',

    async enumerateDatabase(rawRequest, rawOptions) {
      const request = parseDatabaseEnumerateRequest(rawRequest)
      const signal = exactOptions(rawOptions)
      return transport.run(signal, async (key, operationSignal) => Object.freeze({
        rows: await readDatabaseRows(
          transport, key, operationSignal, request, request.columns, request.limit,
        ),
      }))
    },

    async deleteDatabase(rawRequest, rawOptions) {
      const request = parseDatabaseDeleteRequest(rawRequest)
      const signal = exactOptions(rawOptions)
      return transport.run(signal, async (key, operationSignal) => {
        const profile = TABLES.get(request.table)
        if (request.atomicClosure !== null) {
          // Parent/closure-sensitive deletion is never issued as a direct
          // PostgREST DELETE. The fixed RPC must re-prove the closure and
          // perform the delete in one database transaction.
          const result = await callRpc(
            transport,
            key,
            operationSignal,
            'seb_s5_delete_exact_cleanup_target',
            Object.freeze({
              p_qa_namespace: options.namespace,
              p_request: request,
            }),
          )
          if (!hasExactFields(result, [
            'schemaVersion', 'status', 'deletedCount', 'atomicClosureVerified',
          ])
            || result.schemaVersion !== 1
            || result.status !== 'passed'
            || !Number.isInteger(result.deletedCount)
            || result.deletedCount < 0
            || result.deletedCount > request.maxRows
            || result.atomicClosureVerified !== true) blocked()
          return Object.freeze({
            status: 'passed',
            deletedCount: result.deletedCount,
            atomicClosureVerified: true,
          })
        }

        if (profile.deleteMode !== 'direct') blocked()

        const before = await readDatabaseRows(
          transport,
          key,
          operationSignal,
          request,
          profile.deleteIdentity,
          request.maxRows + 1,
        )
        if (before.length > request.maxRows) blocked()
        if (before.length === 0) return Object.freeze({ status: 'passed', deletedCount: 0 })

        const url = databaseUrl(request, profile.deleteIdentity, request.maxRows + 1)
        const result = await transport.jsonRequest(key, url, {
          method: 'DELETE',
          headers: {
            ...jsonHeaders(key),
            Prefer: 'return=representation,count=exact',
            'Accept-Profile': 'public',
            'Content-Profile': 'public',
          },
        }, operationSignal)
        if (!Array.isArray(result) || result.length !== before.length) blocked()
        const deleted = result.map(row => normalizeRow(request.table, row, profile.deleteIdentity))
        if (JSON.stringify(deleted) !== JSON.stringify(before)) blocked()
        return Object.freeze({ status: 'passed', deletedCount: deleted.length })
      })
    },

    async enumerateStorage(rawRequest, rawOptions) {
      const request = parseStorageRequest(rawRequest)
      const signal = exactOptions(rawOptions)
      return transport.run(signal, async (key, operationSignal) => Object.freeze({
        objects: await enumerateExactStorage(
          transport, key, operationSignal, request, options.namespace,
        ),
      }))
    },

    async deleteStorage(rawRequest, rawOptions) {
      const request = parseStorageRequest(rawRequest, true)
      const signal = exactOptions(rawOptions)
      return transport.run(signal, async (key, operationSignal) => {
        const before = await enumerateExactStorage(
          transport, key, operationSignal, request, options.namespace,
        )
        if (before.length === 0) return Object.freeze({ status: 'passed', deletedCount: 0 })
        const url = new URL(
          `/storage/v1/object/${encodeURIComponent(request.bucketName)}`,
          OFFICIAL_STAGING_SUPABASE_ORIGIN,
        )
        const response = await transport.jsonRequest(key, url, {
          method: 'DELETE',
          headers: jsonHeaders(key, true),
          body: JSON.stringify({ prefixes: [request.path] }),
        }, operationSignal)
        // Storage-js documents an empty array for a successful remove. Exact
        // post-delete attestation below is the authoritative deletion proof.
        if (!Array.isArray(response) || response.length !== 0) blocked()
        const after = await attestStorage(
          transport, key, operationSignal, request, options.namespace,
        )
        if (after.length !== 0) blocked()
        return Object.freeze({ status: 'passed', deletedCount: 1 })
      })
    },

    async close(rawOptions) {
      const signal = exactOptions(rawOptions)
      const result = await transport.close(signal)
      if (!hasExactFields(result, ['status']) || result.status !== 'passed') blocked()
      return result
    },
  }
  if (!hasExactFields(driver, RAW_DRIVER_FIELDS)) blocked()
  return Object.freeze(driver)
}

/**
 * Separate ledger boundary. Its fixed RPC must return only public ledger
 * candidates and must perform the account/database/storage reconciliation
 * inside the database. The credential is closure-private and no close/raw
 * client capability is exposed to the ledger.
 */
export function createSebStagingSupabaseLedgerReconciliationAttestation(input = {}) {
  const options = parseFactoryOptions(input)
  const transport = createCredentialTransport(options)
  const client = {
    supabaseUrl: OFFICIAL_STAGING_SUPABASE_ORIGIN,
    async findExactRunTargets(rawCriteria, rawOptions) {
      const criteria = parseLedgerCriteria(rawCriteria, options.namespace)
      const signal = exactOptions(rawOptions)
      return transport.run(signal, async (key, operationSignal) => {
        const response = await callRpc(
          transport,
          key,
          operationSignal,
          'seb_s5_find_exact_run_targets',
          Object.freeze({ p_criteria: criteria }),
        )
        return parseLedgerResponse(response, criteria)
      })
    },
  }
  Object.freeze(client)
  return Object.freeze({
    targetOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
    credentialKind: 'service-role',
    client,
  })
}
