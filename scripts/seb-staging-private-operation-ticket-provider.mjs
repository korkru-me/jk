import { randomBytes } from 'node:crypto'

const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const CREATE_CLASSROOM_PATH = '/classrooms/new'
const CLASSROOM_LIST_PATH = '/classrooms'
const QUESTION_LIST_PATH = '/questions'
const BLOCKED_MESSAGE = 'SEB Staging private operation ticket provider blocked'
const DEFAULT_BOUNDARY_TIMEOUT_MS = 10_000
const MIN_BOUNDARY_TIMEOUT_MS = 10
const MAX_BOUNDARY_TIMEOUT_MS = 120_000
const SAFE_NAMESPACE = /^qa:seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const FORBIDDEN_RUN_ID_TERMS = /(prod(?:uction)?|live|real|customer)/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const CONFIG_REVISION_ID = new RegExp(`^${UUID.source.slice(1, -1)}:r[1-9][0-9]{0,9}$`)
const UUID_PAIR = new RegExp(`^${UUID.source.slice(1, -1)}:${UUID.source.slice(1, -1)}$`)
const ANSWER_STORAGE_ID = new RegExp(
  `^${UUID.source.slice(1, -1)}/${UUID.source.slice(1, -1)}/${UUID.source.slice(1, -1)}/${UUID.source.slice(1, -1)}\\.(?:jpg|pdf|png|webp)$`,
)
const DECIMAL_ID = /^(?:[1-9][0-9]{0,18})$/
const MUTATING_OPERATIONS = new Set([
  'create-subject-classroom',
  'create-synthetic-written-question',
  'create-synthetic-upload-question',
  'join-synthetic-student-to-classroom',
  'join-secondary-student-to-classroom',
  'create-seb-assignment-draft-with-quit-password',
  'publish-seb-assignment',
  'verify-seb-system-check',
  'start-revision-bound-attempt',
  'autosave-synthetic-answer',
  'retry-autosave-after-transient-failure',
  'upload-synthetic-attachment',
  'retry-upload-after-transient-failure',
  'record-proctor-heartbeat',
  'submit-attempt',
])

function operationSpec({ alias, role, route, heading, target, targets, markerFields, submitLabel }) {
  const targetList = targets ?? [target]
  return Object.freeze({
    alias,
    role,
    route,
    heading,
    target: targetList[0] ? Object.freeze(targetList[0]) : null,
    targets: Object.freeze(targetList.map(value => Object.freeze(value))),
    markerFields: Object.freeze(markerFields),
    submitLabel,
  })
}

const OPERATION_SPECS = Object.freeze(new Map([
  ['create-subject-classroom', operationSpec({
    alias: 'teacher-primary',
    role: 'teacher',
    route: CREATE_CLASSROOM_PATH,
    heading: 'สร้างห้องเรียนใหม่',
    target: {
      targetKey: 'classroom-primary',
      kind: 'classroom',
      resourceType: 'subject',
    },
    markerFields: [
      Object.freeze({ selector: '#cls-name', value: 'marker' }),
      Object.freeze({ selector: '#cls-desc', value: 'description' }),
    ],
    submitLabel: 'ยืนยันสร้างห้องเรียน',
  })],
  ['create-synthetic-written-question', operationSpec({
    alias: 'teacher-primary',
    role: 'teacher',
    route: '/questions/new/essay',
    heading: 'สร้างโจทย์อัตนัย',
    target: {
      targetKey: 'question-written',
      kind: 'question',
      resourceType: 'essay',
    },
    markerFields: [
      Object.freeze({ selector: '#title', value: 'marker' }),
      Object.freeze({ selector: 'input[placeholder="พิมพ์ชื่อวิชา เช่น ฟิสิกส์, เคมี"]', value: 'subject' }),
      Object.freeze({ selector: '[contenteditable="true"][data-placeholder="พิมพ์เนื้อหาโจทย์ที่นี่..."]', value: 'description' }),
    ],
    submitLabel: 'บันทึกโจทย์',
  })],
  ['create-synthetic-upload-question', operationSpec({
    alias: 'teacher-primary',
    role: 'teacher',
    route: '/questions/new/file-upload',
    heading: 'สร้างโจทย์ส่งไฟล์งาน',
    target: {
      targetKey: 'question-upload',
      kind: 'question',
      resourceType: 'file_upload',
    },
    markerFields: [
      Object.freeze({ selector: '#title', value: 'marker' }),
      Object.freeze({ selector: 'input[placeholder="พิมพ์ชื่อวิชา เช่น ฟิสิกส์, เคมี"]', value: 'subject' }),
      Object.freeze({ selector: '[contenteditable="true"][data-placeholder^="พิมพ์คำสั่งงานที่นักเรียนต้องทำ"]', value: 'description' }),
    ],
    submitLabel: 'บันทึกโจทย์',
  })],
  ['join-synthetic-student-to-classroom', operationSpec({
    alias: 'student-primary',
    role: 'student',
    route: CLASSROOM_LIST_PATH,
    heading: 'ห้องเรียนของฉัน',
    target: {
      targetKey: 'membership-primary',
      kind: 'classroomMembership',
      resourceType: 'student',
    },
    markerFields: [],
    submitLabel: 'เข้าร่วม',
  })],
  ['join-secondary-student-to-classroom', operationSpec({
    alias: 'student-secondary',
    role: 'student',
    route: CLASSROOM_LIST_PATH,
    heading: 'ห้องเรียนของฉัน',
    target: {
      targetKey: 'membership-secondary',
      kind: 'classroomMembership',
      resourceType: 'student',
    },
    markerFields: [],
    submitLabel: 'เข้าร่วม',
  })],
  ['create-seb-assignment-draft-with-quit-password', operationSpec({
    alias: 'teacher-primary',
    role: 'teacher',
    route: '/assignments/new',
    heading: 'สร้างงานที่มอบหมาย',
    targets: [
      {
        targetKey: 'assignment-primary',
        kind: 'assignment',
        resourceType: 'exam',
      },
      {
        targetKey: 'config-primary',
        kind: 'configRevision',
        resourceType: 'seb_required',
      },
    ],
    markerFields: [
      Object.freeze({ selector: '#title', value: 'marker' }),
      Object.freeze({ selector: '#desc', value: 'description' }),
    ],
    submitLabel: 'สร้างชุดข้อสอบ',
  })],
  ['publish-seb-assignment', operationSpec({
    alias: 'teacher-primary',
    role: 'teacher',
    route: '/assignments',
    heading: 'รายละเอียดงาน',
    targets: [],
    markerFields: [],
    submitLabel: 'เผยแพร่',
  })],
  ['reject-invalid-seb-challenge', studentOperation('/system-check', 'ตรวจความพร้อมก่อนสอบ')],
  ['verify-seb-system-check', studentOperation('/system-check', 'ตรวจความพร้อมก่อนสอบ', [{
    targetKey: 'check-in-primary',
    kind: 'checkIn',
    resourceType: 'windows',
  }])],
  ['reject-replayed-seb-challenge', studentOperation('/system-check', 'ตรวจความพร้อมก่อนสอบ')],
  ['reject-invalid-seb-session', studentOperation('/take', 'เข้าสอบผ่าน Safe Exam Browser')],
  ['start-revision-bound-attempt', studentOperation('/take', null, [
    { targetKey: 'submission-primary', kind: 'submission', resourceType: 'seb_required' },
    { targetKey: 'answer-written', kind: 'answer', resourceType: 'essay' },
    { targetKey: 'answer-upload', kind: 'answer', resourceType: 'file_upload' },
  ])],
  ['reject-replayed-seb-session', studentOperation('/take', 'เข้าสอบผ่าน Safe Exam Browser')],
  ['autosave-synthetic-answer', studentOperation('/take', null)],
  ['retry-autosave-after-transient-failure', studentOperation('/take', null)],
  ['resume-same-attempt', studentOperation('/take', null)],
  ['upload-synthetic-attachment', studentOperation('/take', null, [{
    targetKey: 'answer-storage',
    kind: 'answerStorageObject',
    resourceType: 'submission_file',
  }])],
  ['retry-upload-after-transient-failure', studentOperation('/take', null)],
  ['record-proctor-heartbeat', studentOperation('/take', null, [
    { targetKey: 'proctor-connection', kind: 'proctorConnection', resourceType: 'heartbeat' },
    { targetKey: 'proctor-event', kind: 'proctorEvent', resourceType: 'monitoring_started' },
  ])],
  ['student-denied-teacher-result', studentOperation('/results', null)],
  ['submit-attempt', studentOperation('/take', null)],
  ['teacher-read-submitted-result', operationSpec({
    alias: 'teacher-primary',
    role: 'teacher',
    route: '/submissions',
    heading: null,
    targets: [],
    markerFields: [],
    submitLabel: null,
  })],
  ['secondary-student-denied-primary-attempt', operationSpec({
    alias: 'student-secondary',
    role: 'student',
    route: '/submissions',
    heading: null,
    targets: [],
    markerFields: [],
    submitLabel: null,
  })],
  ['unrelated-teacher-denied-assignment-result', operationSpec({
    alias: 'teacher-unrelated',
    role: 'teacher',
    route: '/submissions',
    heading: null,
    targets: [],
    markerFields: [],
    submitLabel: null,
  })],
  ['verify-cross-account-boundaries', operationSpec({
    alias: null,
    role: null,
    route: null,
    heading: null,
    targets: [],
    markerFields: [],
    submitLabel: null,
  })],
]))

function studentOperation(route, heading, targets = []) {
  return operationSpec({
    alias: 'student-primary',
    role: 'student',
    route,
    heading,
    targets,
    markerFields: [],
    submitLabel: null,
  })
}

const DATA_BOUNDARY_METHODS = Object.freeze([
  'readAccountBinding',
  'prepareOperation',
  'attestOperation',
  'abortOperation',
  'closeAll',
])
const MATERIAL_METHODS = Object.freeze([
  'applySecretInputs',
  'applySyntheticUpload',
  'closeAll',
])
const TICKET_METHODS = Object.freeze([
  'applyMarkers',
  'navigate',
  'applySecrets',
  'applyUploads',
  'beginMutation',
  'finish',
  'abort',
])

export class SebStagingPrivateOperationTicketProviderBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingPrivateOperationTicketProviderBlockedError'
  }
}

function blocked() {
  throw new SebStagingPrivateOperationTicketProviderBlockedError()
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

function hasOnlyFields(value, required, optional = []) {
  if (!isDataRecord(value)) return false
  const keys = Object.keys(value)
  const permitted = new Set([...required, ...optional])
  return required.every(field => Object.hasOwn(value, field))
    && keys.every(field => permitted.has(field))
}

function isExactFrozenArray(value, expectedLength) {
  if (!Array.isArray(value)
    || !Object.isFrozen(value)
    || value.length !== expectedLength) return false
  try {
    const keys = Reflect.ownKeys(value)
    if (keys.length !== expectedLength + 1 || keys.at(-1) !== 'length') return false
    for (let index = 0; index < expectedLength; index += 1) {
      if (keys[index] !== String(index)) return false
    }
    return true
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

function passed() {
  return Object.freeze({ status: 'passed' })
}

function failed() {
  return Object.freeze({ status: 'failed' })
}

function exactPassed(value) {
  return Object.isFrozen(value)
    && hasExactFields(value, ['status'])
    && value.status === 'passed'
}

function validAbortSignal(value) {
  try {
    return value instanceof AbortSignal
      && typeof value.aborted === 'boolean'
      && typeof value.addEventListener === 'function'
  } catch {
    return false
  }
}

function captureCapability(value, methods) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, methods)
    || !methods.every(method => typeof value[method] === 'function')) return null
  return Object.freeze({
    wrapper: value,
    methods: Object.freeze(Object.fromEntries(methods.map(method => [method, value[method]]))),
  })
}

function sameCapability(attestation, methods) {
  return attestation !== null
    && Object.isFrozen(attestation.wrapper)
    && hasExactFields(attestation.wrapper, methods)
    && methods.every(method => attestation.wrapper[method] === attestation.methods[method])
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
  try {
    const value = clock()
    const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
    return Number.isFinite(timestamp) ? timestamp : null
  } catch {
    return null
  }
}

function parseIdentity(value) {
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
    || notAfter.timestamp - notBefore.timestamp > 24 * 60 * 60 * 1_000) return null
  return freezeInput({
    runId: value.runId,
    sourceRevision: value.sourceRevision,
    deploymentId: value.deploymentId,
    creationWindow: {
      notBefore: notBefore.iso,
      notAfter: notAfter.iso,
    },
  })
}

function hasOfficialStagingPolicy(value, { cleanup = false } = {}) {
  return isDataRecord(value)
    && value.KORKRU_DEPLOYMENT_ENV === 'staging'
    && value.EXAM_QA_ENVIRONMENT === 'staging'
    && value.VERCEL_ENV === 'preview'
    && value.NEXT_PUBLIC_SITE_URL === OFFICIAL_STAGING_SITE_ORIGIN
    && value.NEXT_PUBLIC_SUPABASE_URL === OFFICIAL_STAGING_SUPABASE_ORIGIN
    && value.EXAM_QA_DATA_POLICY === 'synthetic-only'
    && value.EXAM_QA_COPY_PRODUCTION_DATA === 'false'
    && (cleanup
      ? value.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'true'
        || value.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'false'
      : value.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'true')
}

function validPage(value) {
  try {
    return value !== null
      && typeof value === 'object'
      && typeof value.url === 'function'
      && typeof value.goto === 'function'
      && typeof value.locator === 'function'
      && typeof value.getByRole === 'function'
      && typeof value.getByText === 'function'
      && typeof value.waitForURL === 'function'
  } catch {
    return false
  }
}

function parseTicketInput(value) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, ['page', 'signal'])
    || !validPage(value.page)
    || !validAbortSignal(value.signal)
    || value.signal.aborted) return null
  return Object.freeze({ page: value.page, signal: value.signal })
}

function parseCallOptions(value) {
  return Object.isFrozen(value)
    && hasExactFields(value, ['signal'])
    && validAbortSignal(value.signal)
    && !value.signal.aborted
    ? value.signal
    : null
}

function runIdentityMatches(value, identity) {
  return hasExactFields(value, [
    'runId', 'sourceRevision', 'deploymentId', 'creationWindow',
  ])
    && hasExactFields(value.creationWindow, ['notBefore', 'notAfter'])
    && value.runId === identity.runId
    && value.sourceRevision === identity.sourceRevision
    && value.deploymentId === identity.deploymentId
    && value.creationWindow.notBefore === identity.creationWindow.notBefore
    && value.creationWindow.notAfter === identity.creationWindow.notAfter
}

function exactBindingRequest(value, namespace) {
  return Object.isFrozen(value)
    && hasExactFields(value, [
      'schemaVersion', 'targetOrigin', 'namespace', 'alias', 'role',
    ])
    && value.schemaVersion === 1
    && value.targetOrigin === OFFICIAL_STAGING_SITE_ORIGIN
    && value.namespace === namespace
    && [...OPERATION_SPECS.values()].some(spec => (
      spec.alias === value.alias && spec.role === value.role
    ))
}

function parseBindingResponse(value, namespace, request) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, [
      'schemaVersion', 'targetOrigin', 'namespace', 'alias', 'role', 'expectedUserId',
    ])
    || value.schemaVersion !== 1
    || value.targetOrigin !== OFFICIAL_STAGING_SITE_ORIGIN
    || value.namespace !== namespace
    || value.alias !== request.alias
    || value.role !== request.role
    || typeof value.expectedUserId !== 'string'
    || !UUID.test(value.expectedUserId)) return null
  return value
}

function exactPrepareRequest(value, namespace, identity, binding) {
  const spec = OPERATION_SPECS.get(value?.stepId)
  return spec !== undefined
    && Object.isFrozen(value)
    && hasExactFields(value, [
      'schemaVersion', 'targetOrigin', 'namespace', 'identity', 'stepId',
      'alias', 'role', 'expectedUserId',
    ])
    && value.schemaVersion === 1
    && value.targetOrigin === OFFICIAL_STAGING_SITE_ORIGIN
    && value.namespace === namespace
    && runIdentityMatches(value.identity, identity)
    && value.alias === spec.alias
    && value.role === spec.role
    && (spec.alias === null
      ? binding === null && value.expectedUserId === null
      : binding?.alias === spec.alias
        && binding.role === spec.role
        && value.expectedUserId === binding.expectedUserId)
}

function parsePreparedResponse(value, namespace, binding, spec, stepId) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, [
      'schemaVersion', 'targetOrigin', 'namespace', 'stepId', 'alias', 'role',
      'expectedUserId', 'targets',
    ])
    || value.schemaVersion !== 1
    || value.targetOrigin !== OFFICIAL_STAGING_SITE_ORIGIN
    || value.namespace !== namespace
    || value.stepId !== stepId
    || value.alias !== spec.alias
    || value.role !== spec.role
    || value.expectedUserId !== (binding?.expectedUserId ?? null)
    || !isExactFrozenArray(value.targets, spec.targets.length)) return null
  for (let index = 0; index < spec.targets.length; index += 1) {
    const target = value.targets[index]
    const expected = spec.targets[index]
    if (!Object.isFrozen(target)
      || !hasExactFields(target, [
        'schemaVersion', 'targetKey', 'kind', 'ownerId', 'organizationId',
        'resourceType',
      ])
      || target.schemaVersion !== 1
      || target.targetKey !== expected.targetKey
      || target.kind !== expected.kind
      || typeof target.ownerId !== 'string'
      || !UUID.test(target.ownerId)
      || typeof target.organizationId !== 'string'
      || !UUID.test(target.organizationId)
      || target.resourceType !== expected.resourceType) return null
  }
  return Object.freeze({ response: value, targets: value.targets })
}

function exactAttestRequest(value, namespace, identity, plan) {
  return plan !== null
    && Object.isFrozen(value)
    && hasExactFields(value, [
      'schemaVersion', 'targetOrigin', 'namespace', 'identity', 'stepId',
    ])
    && value.schemaVersion === 1
    && value.targetOrigin === OFFICIAL_STAGING_SITE_ORIGIN
    && value.namespace === namespace
    && runIdentityMatches(value.identity, identity)
    && value.stepId === plan.stepId
}

function parseAttestedResponse(value, plan, identity) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, ['schemaVersion', 'stepId', 'status', 'targets'])
    || value.schemaVersion !== 1
    || value.stepId !== plan.stepId
    || value.status !== 'passed'
    || !isExactFrozenArray(value.targets, plan.spec.targets.length)) return null
  for (let index = 0; index < plan.spec.targets.length; index += 1) {
    const target = value.targets[index]
    const expected = plan.spec.targets[index]
    const planned = plan.targets[index]
    if (!Object.isFrozen(target)
      || !hasExactFields(target, ['targetKey', 'kind', 'matches'])
      || target.targetKey !== expected.targetKey
      || target.kind !== expected.kind
      || !isExactFrozenArray(target.matches, 1)) return null
    const match = target.matches[0]
    const createdAt = canonicalTimestamp(match?.createdAt)
    if (!Object.isFrozen(match)
      || !hasExactFields(match, [
        'targetId', 'createdAt', 'ownerId', 'organizationId', 'resourceType',
        'parentId', 'relatedIds',
      ])
      || typeof match.targetId !== 'string'
      || !validAttestedTargetId(expected.kind, match.targetId)
      || !createdAt
      || createdAt.timestamp < Date.parse(identity.creationWindow.notBefore)
      || createdAt.timestamp > Date.parse(identity.creationWindow.notAfter)
      || match.ownerId !== planned.ownerId
      || match.organizationId !== planned.organizationId
      || match.resourceType !== expected.resourceType
      || (match.parentId !== null && (typeof match.parentId !== 'string' || !UUID.test(match.parentId)))
      || !Array.isArray(match.relatedIds)
      || !Object.isFrozen(match.relatedIds)
      || !match.relatedIds.every(id => typeof id === 'string' && UUID.test(id))) return null
  }
  return value
}

function validAttestedTargetId(kind, value) {
  if (typeof value !== 'string') return false
  if (kind === 'configRevision') return CONFIG_REVISION_ID.test(value)
  if (kind === 'checkIn' || kind === 'proctorConnection') return UUID_PAIR.test(value)
  if (kind === 'answerStorageObject') return ANSWER_STORAGE_ID.test(value)
  if (kind === 'proctorEvent') return DECIMAL_ID.test(value)
  return UUID.test(value)
}

function exactIssueRequest(value, namespace, binding) {
  const spec = OPERATION_SPECS.get(value?.operationId)
  return Object.isFrozen(value)
    && hasExactFields(value, [
      'targetOrigin', 'namespace', 'alias', 'expectedUserId', 'operationId',
    ])
    && value.targetOrigin === OFFICIAL_STAGING_SITE_ORIGIN
    && value.namespace === namespace
    && spec !== undefined
    && value.alias === spec.alias
    && binding.alias === spec.alias
    && value.expectedUserId === binding.expectedUserId
}

function assignmentPath(resourceIds, suffix = '') {
  const assignmentId = resourceIds.get('assignment-primary')
  return typeof assignmentId === 'string' && UUID.test(assignmentId)
    ? `/assignments/${assignmentId}${suffix}`
    : null
}

function submissionPath(resourceIds) {
  const submissionId = resourceIds.get('submission-primary')
  return typeof submissionId === 'string' && UUID.test(submissionId)
    ? `/submissions/${submissionId}`
    : null
}

function resolveRoute(stepId, spec, resourceIds) {
  if (stepId === 'publish-seb-assignment') return assignmentPath(resourceIds)
  if (['reject-invalid-seb-challenge', 'verify-seb-system-check', 'reject-replayed-seb-challenge']
    .includes(stepId)) return assignmentPath(resourceIds, '/system-check')
  if (stepId === 'student-denied-teacher-result') return assignmentPath(resourceIds, '/results')
  if (['teacher-read-submitted-result', 'secondary-student-denied-primary-attempt',
    'unrelated-teacher-denied-assignment-result'].includes(stepId)) return submissionPath(resourceIds)
  if (['reject-invalid-seb-session', 'reject-replayed-seb-session'].includes(stepId)) {
    return assignmentPath(resourceIds, '/take')
  }
  if (['start-revision-bound-attempt', 'autosave-synthetic-answer',
    'retry-autosave-after-transient-failure', 'resume-same-attempt',
    'upload-synthetic-attachment', 'retry-upload-after-transient-failure',
    'record-proctor-heartbeat', 'submit-attempt'].includes(stepId)) {
    return stepId === 'start-revision-bound-attempt'
      ? assignmentPath(resourceIds)
      : assignmentPath(resourceIds, '/take')
  }
  return spec.route
}

function pathIs(value, expectedPath) {
  try {
    const url = new URL(value)
    return url.origin === OFFICIAL_STAGING_SITE_ORIGIN && url.pathname === expectedPath
  } catch {
    return false
  }
}

function exactLocator(value, methods) {
  return value !== null
    && typeof value === 'object'
    && methods.every(method => typeof value[method] === 'function')
}

/**
 * Compose the browser data adapter's private resource-plan contract with the
 * operation runtime's one-shot ticket contract. Only the two frozen facades
 * below may leave this closure. The Page, fixed route, marker and injected
 * private boundaries never appear in a ticket result or factory output.
 *
 * This provider owns the concrete selector flows for the deterministic
 * teacher setup operations. Unsupported operations still fail before ticket
 * issue or browser mutation, so the surface can be expanded in audited slices.
 */
export function createSebStagingPrivateOperationTicketProvider(options = {}) {
  if (!hasOnlyFields(options, [
    'schemaVersion', 'namespace', 'identity', 'readEnvironment',
    'privateDataBoundary', 'privateMaterialCapability', 'clock',
  ], ['boundaryTimeoutMs'])) blocked()
  const {
    schemaVersion,
    namespace,
    identity: identityInput,
    readEnvironment,
    privateDataBoundary,
    privateMaterialCapability,
    clock,
    boundaryTimeoutMs = DEFAULT_BOUNDARY_TIMEOUT_MS,
  } = options
  const identity = parseIdentity(identityInput)
  const dataAttestation = captureCapability(privateDataBoundary, DATA_BOUNDARY_METHODS)
  const materialAttestation = captureCapability(privateMaterialCapability, MATERIAL_METHODS)
  let initialEnvironment = null
  try {
    initialEnvironment = typeof readEnvironment === 'function' ? readEnvironment() : null
  } catch {
    blocked()
  }
  const initialTimestamp = typeof clock === 'function' ? clockTimestamp(clock) : null
  if (schemaVersion !== 1
    || !identity
    || typeof namespace !== 'string'
    || !SAFE_NAMESPACE.test(namespace)
    || namespace !== `qa:${identity.runId}`
    || typeof readEnvironment !== 'function'
    || !hasOfficialStagingPolicy(initialEnvironment)
    || !dataAttestation
    || !materialAttestation
    || typeof clock !== 'function'
    || initialTimestamp === null
    || initialTimestamp < Date.parse(identity.creationWindow.notBefore)
    || initialTimestamp > Date.parse(identity.creationWindow.notAfter)
    || !Number.isInteger(boundaryTimeoutMs)
    || boundaryTimeoutMs < MIN_BOUNDARY_TIMEOUT_MS
    || boundaryTimeoutMs > MAX_BOUNDARY_TIMEOUT_MS) blocked()

  const bindings = new Map()
  const resourceIds = new Map()
  const resourceMarkers = new Map()
  let plan = null
  let resourceBusy = false
  let cleanupStarted = false
  let closeBusy = false
  let closed = false
  let materialClosed = false
  let dataClosed = false
  let materialCloseTask = null
  let dataCloseTask = null
  const pendingBoundaryTasks = new Map()

  function currentEnvironment({ cleanup = false } = {}) {
    let value = null
    try {
      value = readEnvironment()
    } catch {
      blocked()
    }
    if (!hasOfficialStagingPolicy(value, { cleanup })) blocked()
    return value
  }

  function creationWindowIsActive() {
    const timestamp = clockTimestamp(clock)
    return timestamp !== null
      && timestamp >= Date.parse(identity.creationWindow.notBefore)
      && timestamp <= Date.parse(identity.creationWindow.notAfter)
  }

  function assertCapabilitiesStable() {
    if (!sameCapability(dataAttestation, DATA_BOUNDARY_METHODS)
      || !sameCapability(materialAttestation, MATERIAL_METHODS)) blocked()
  }

  async function boundaryCall(attestation, methods, method, request, callerSignal, {
    allowCleanup = false,
  } = {}) {
    if ((!allowCleanup && cleanupStarted)
      || closed
      || !validAbortSignal(callerSignal)
      || callerSignal.aborted) blocked()
    currentEnvironment({ cleanup: allowCleanup })
    assertCapabilitiesStable()
    const controller = new AbortController()
    const abortFromCaller = () => controller.abort()
    callerSignal.addEventListener('abort', abortFromCaller, { once: true })
    const operation = Promise.resolve().then(() => {
      if (controller.signal.aborted
        || (!allowCleanup && cleanupStarted)
        || closed) blocked()
      return attestation.methods[method].call(
        attestation.wrapper,
        request,
        Object.freeze({ signal: controller.signal }),
      )
    })
    pendingBoundaryTasks.set(operation, controller)
    operation.then(
      () => pendingBoundaryTasks.delete(operation),
      () => pendingBoundaryTasks.delete(operation),
    )

    let timeoutId = null
    let abortListener = null
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort()
        reject(new SebStagingPrivateOperationTicketProviderBlockedError())
      }, boundaryTimeoutMs)
    })
    const aborted = new Promise((_, reject) => {
      abortListener = () => reject(new SebStagingPrivateOperationTicketProviderBlockedError())
      controller.signal.addEventListener('abort', abortListener, { once: true })
    })
    try {
      const result = await Promise.race([operation, timeout, aborted])
      currentEnvironment({ cleanup: allowCleanup })
      assertCapabilitiesStable()
      if (controller.signal.aborted
        || callerSignal.aborted
        || !sameCapability(attestation, methods)) blocked()
      return result
    } catch {
      if (!controller.signal.aborted) controller.abort()
      blocked()
    } finally {
      callerSignal.removeEventListener('abort', abortFromCaller)
      if (abortListener) controller.signal.removeEventListener('abort', abortListener)
      if (timeoutId !== null) clearTimeout(timeoutId)
    }
  }

  async function readAccountBinding(request, callOptions) {
    const signal = parseCallOptions(callOptions)
    if (!signal
      || resourceBusy
      || cleanupStarted
      || closed
      || !exactBindingRequest(request, namespace)
      || !creationWindowIsActive()) blocked()
    resourceBusy = true
    try {
      const response = await boundaryCall(
        dataAttestation,
        DATA_BOUNDARY_METHODS,
        'readAccountBinding',
        request,
        signal,
      )
      const parsed = parseBindingResponse(response, namespace, request)
      const existing = bindings.get(request.alias)
      if (!parsed
        || (existing && existing.expectedUserId !== parsed.expectedUserId)) blocked()
      if (!existing) bindings.set(request.alias, parsed)
      return bindings.get(request.alias)
    } finally {
      resourceBusy = false
    }
  }

  function makeMarker() {
    try {
      const nonce = randomBytes(12).toString('hex')
      return `SEB S5 ${identity.runId} ${nonce}`
    } catch {
      blocked()
    }
  }

  async function prepareStep(request, callOptions) {
    const signal = parseCallOptions(callOptions)
    const spec = OPERATION_SPECS.get(request?.stepId)
    const binding = spec?.alias === null ? null : spec ? bindings.get(spec.alias) : null
    if (!signal
      || (spec?.alias !== null && !binding)
      || plan
      || resourceBusy
      || cleanupStarted
      || closed
      || !exactPrepareRequest(request, namespace, identity, binding)
      || !creationWindowIsActive()) blocked()
    resourceBusy = true
    const marker = makeMarker()
    try {
      const response = await boundaryCall(
        dataAttestation,
        DATA_BOUNDARY_METHODS,
        'prepareOperation',
        freezeInput({
          schemaVersion: 1,
          targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
          namespace,
          identity,
          stepId: request.stepId,
          alias: spec.alias,
          role: spec.role,
          expectedUserId: binding?.expectedUserId ?? null,
          marker,
        }),
        signal,
      )
      const prepared = parsePreparedResponse(response, namespace, binding, spec, request.stepId)
      if (!prepared) blocked()
      const route = resolveRoute(request.stepId, spec, resourceIds)
      const heading = request.stepId === 'publish-seb-assignment'
        ? resourceMarkers.get('assignment-primary')
        : spec.heading
      if (request.stepId !== 'verify-cross-account-boundaries'
        && (typeof route !== 'string' || !route.startsWith('/'))) blocked()
      if (request.stepId === 'publish-seb-assignment'
        && (!/^\/assignments\/[0-9a-f-]{36}$/.test(route)
          || typeof heading !== 'string')) blocked()
      plan = {
        state: request.stepId === 'verify-cross-account-boundaries' ? 'FINISHED' : 'PREPARED',
        stepId: request.stepId,
        spec,
        binding,
        marker,
        targets: prepared.targets,
        route,
        heading,
        ticket: null,
        page: null,
        methodBusy: false,
      }
      return prepared.response
    } finally {
      resourceBusy = false
    }
  }

  async function waitForVisible(locator) {
    if (!exactLocator(locator, ['waitFor'])) blocked()
    try {
      await locator.waitFor({ state: 'visible', timeout: boundaryTimeoutMs })
    } catch {
      blocked()
    }
  }

  function assertTicketPage(parsed) {
    if (!plan) blocked()
    if (plan.page === null) plan.page = parsed.page
    if (plan.page !== parsed.page) blocked()
  }

  async function runTicketMethod(expectedState, nextState, ticketInput, action, {
    allowCleanup = false,
  } = {}) {
    const parsed = parseTicketInput(ticketInput)
    if (!parsed
      || !plan
      || plan.state !== expectedState
      || plan.methodBusy
      || closed
      || (!allowCleanup && cleanupStarted)) blocked()
    assertCapabilitiesStable()
    assertTicketPage(parsed)
    plan.methodBusy = true
    try {
      if (parsed.signal.aborted) blocked()
      await action(parsed)
      if (parsed.signal.aborted) blocked()
      assertCapabilitiesStable()
      plan.state = nextState
      return passed()
    } catch {
      blocked()
    } finally {
      plan.methodBusy = false
    }
  }

  function createTicket() {
    async function navigate(ticketInput) {
      return runTicketMethod('ISSUED', 'NAVIGATED', ticketInput, async ({ page, signal }) => {
        if (!creationWindowIsActive()) blocked()
        try {
          await page.goto(`${OFFICIAL_STAGING_SITE_ORIGIN}${plan.route}`, {
            waitUntil: 'domcontentloaded',
            timeout: boundaryTimeoutMs,
          })
        } catch {
          blocked()
        }
        if (signal.aborted || !pathIs(page.url(), plan.route)) blocked()
        if (plan.heading !== null) {
          const heading = page.getByRole('heading', {
            name: plan.heading,
            exact: true,
          })
          await waitForVisible(heading)
        }
      })
    }

    async function applyMarkers(ticketInput) {
      return runTicketMethod('NAVIGATED', 'MARKED', ticketInput, async ({ page, signal }) => {
        if (!pathIs(page.url(), plan.route)) blocked()
        for (const field of plan.spec.markerFields) {
          const locator = page.locator(field.selector)
          if (!exactLocator(locator, ['fill'])) blocked()
          const value = field.value === 'marker'
            ? plan.marker
            : field.value === 'subject'
              ? 'วิทยาศาสตร์'
              : `Synthetic-only SEB Staging fixture ${plan.marker}`
          try {
            await locator.fill(value, { timeout: boundaryTimeoutMs })
          } catch {
            blocked()
          }
        }
        if (plan.stepId === 'create-seb-assignment-draft-with-quit-password') {
          const classroomChoices = page.locator('button[aria-pressed="false"]')
          if (!exactLocator(classroomChoices, ['count', 'first'])) blocked()
          let classroomCount
          try { classroomCount = await classroomChoices.count() } catch { blocked() }
          if (classroomCount !== 1) blocked()
          const classroomChoice = classroomChoices.first()
          const examChoice = page.getByRole('button', { name: 'ข้อสอบ', exact: true })
          if (!exactLocator(classroomChoice, ['click'])
            || !exactLocator(examChoice, ['click'])) blocked()
          try {
            await classroomChoice.click({ timeout: boundaryTimeoutMs })
            await examChoice.click({ timeout: boundaryTimeoutMs })
          } catch { blocked() }
          const next = page.getByRole('button', { name: 'ถัดไป', exact: true })
          if (!exactLocator(next, ['click'])) blocked()
          try { await next.click({ timeout: boundaryTimeoutMs }) } catch { blocked() }
          if (signal.aborted) blocked()
          const questionChoices = page.locator('input[type="checkbox"]')
          if (!exactLocator(questionChoices, ['count', 'nth'])) blocked()
          let questionCount
          try { questionCount = await questionChoices.count() } catch { blocked() }
          if (questionCount !== 2) blocked()
          for (let index = 0; index < questionCount; index += 1) {
            const choice = questionChoices.nth(index)
            if (!exactLocator(choice, ['check'])) blocked()
            try { await choice.check({ timeout: boundaryTimeoutMs }) } catch { blocked() }
          }
          for (let index = 0; index < 2; index += 1) {
            try { await next.click({ timeout: boundaryTimeoutMs }) } catch { blocked() }
            if (signal.aborted) blocked()
          }
          const sebRequired = page.locator('#create-seb-required')
          if (!exactLocator(sebRequired, ['check'])) blocked()
          try { await sebRequired.check({ timeout: boundaryTimeoutMs }) } catch { blocked() }
        }
      })
    }

    async function applySecrets(ticketInput) {
      return runTicketMethod('MARKED', 'SECRETS_APPLIED', ticketInput, async ({ page, signal }) => {
        if (!['classroomMembership', 'assignment'].includes(plan.spec.target?.kind)) return
        const result = await boundaryCall(
          materialAttestation,
          MATERIAL_METHODS,
          'applySecretInputs',
          Object.freeze({
            schemaVersion: 1,
            targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
            namespace,
            identity,
            operationId: plan.stepId,
            alias: plan.spec.alias,
            expectedUserId: plan.binding.expectedUserId,
            page,
          }),
          signal,
        )
        if (!exactPassed(result)) blocked()
      })
    }

    async function applyUploads(ticketInput) {
      return runTicketMethod('SECRETS_APPLIED', 'UPLOADS_APPLIED', ticketInput, async () => {
        // Upload bytes are deliberately delayed until beginMutation, after the
        // runtime has re-authorized the Staging-only write boundary.
      })
    }

    async function beginMutation(ticketInput) {
      return runTicketMethod('UPLOADS_APPLIED', 'MUTATION_STARTED', ticketInput, async ({ page, signal }) => {
        currentEnvironment()
        if (!creationWindowIsActive() || !pathIs(page.url(), plan.route)) blocked()
        if (plan.stepId === 'start-revision-bound-attempt') {
          const takeRoute = assignmentPath(resourceIds, '/take')
          if (!takeRoute) blocked()
          try {
            await page.goto(`${OFFICIAL_STAGING_SITE_ORIGIN}${takeRoute}`, {
              waitUntil: 'domcontentloaded',
              timeout: boundaryTimeoutMs,
            })
          } catch { blocked() }
          if (signal.aborted || !pathIs(page.url(), takeRoute)) blocked()
          return
        }
        if (['autosave-synthetic-answer', 'retry-autosave-after-transient-failure']
          .includes(plan.stepId)) {
          const answer = page.locator('textarea[aria-label="คำตอบเรียงความ"]')
          if (!exactLocator(answer, ['fill'])) blocked()
          try { await answer.fill(plan.marker, { timeout: boundaryTimeoutMs }) } catch { blocked() }
          if (plan.stepId === 'retry-autosave-after-transient-failure') {
            const retry = page.getByRole('button', { name: 'ลองอีกครั้ง', exact: true })
            if (exactLocator(retry, ['click'])) {
              try { await retry.click({ timeout: boundaryTimeoutMs }) } catch { /* debounce may retry itself */ }
            }
          }
          return
        }
        if (plan.stepId === 'upload-synthetic-attachment') {
          const result = await boundaryCall(
            materialAttestation,
            MATERIAL_METHODS,
            'applySyntheticUpload',
            Object.freeze({
              schemaVersion: 1,
              targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
              namespace,
              identity,
              operationId: plan.stepId,
              alias: plan.spec.alias,
              expectedUserId: plan.binding.expectedUserId,
              page,
            }),
            signal,
          )
          if (!exactPassed(result)) blocked()
          return
        }
        if (plan.stepId === 'retry-upload-after-transient-failure') {
          const retry = page.getByRole('button', { name: /ลองอัปโหลดไฟล์ .+ อีกครั้ง/ })
          if (!exactLocator(retry, ['click'])) blocked()
          try { await retry.click({ timeout: boundaryTimeoutMs }) } catch { blocked() }
          return
        }
        if (plan.stepId === 'submit-attempt') {
          const submit = page.getByRole('button', { name: 'ส่งคำตอบ ✓', exact: true })
          if (!exactLocator(submit, ['click'])) blocked()
          try { await submit.click({ timeout: boundaryTimeoutMs }) } catch { blocked() }
          await waitForVisible(page.getByRole('heading', { name: 'ยืนยันการส่งข้อสอบ', exact: true }))
          const confirm = page.getByRole('button', { name: 'ยืนยันส่งเลย', exact: true })
          if (!exactLocator(confirm, ['click'])) blocked()
          try { await confirm.click({ timeout: boundaryTimeoutMs }) } catch { blocked() }
          return
        }
        if (['verify-seb-system-check', 'record-proctor-heartbeat'].includes(plan.stepId)) return
        if (plan.stepId === 'create-subject-classroom') {
          const nextButton = page.getByRole('button', { name: 'ถัดไป', exact: true })
          if (!exactLocator(nextButton, ['click'])) blocked()
          try {
            await nextButton.click({ timeout: boundaryTimeoutMs })
          } catch {
            blocked()
          }
          if (signal.aborted) blocked()
          const stepHeading = page.getByRole('heading', {
            name: 'การเข้าร่วมและระยะเวลา',
            exact: true,
          })
          await waitForVisible(stepHeading)
        }
        if (plan.stepId === 'create-seb-assignment-draft-with-quit-password') {
          const nextButton = page.getByRole('button', { name: 'ถัดไป', exact: true })
          const createButton = page.getByRole('button', {
            name: plan.spec.submitLabel,
            exact: true,
          })
          if (!exactLocator(nextButton, ['click']) || !exactLocator(createButton, ['click'])) blocked()
          try {
            await nextButton.click({ timeout: boundaryTimeoutMs })
            await createButton.click({ timeout: boundaryTimeoutMs })
          } catch { blocked() }
          if (signal.aborted) blocked()
          const draftButton = page.getByRole('button', {
            name: 'ยังไม่เผยแพร่ (เก็บไว้เป็นร่าง)',
            exact: true,
          })
          if (!exactLocator(draftButton, ['click'])) blocked()
          try { await draftButton.click({ timeout: boundaryTimeoutMs }) } catch { blocked() }
          return
        }
        if (plan.stepId === 'publish-seb-assignment') {
          const publishButton = page.getByRole('button', {
            name: plan.spec.submitLabel,
            exact: true,
          })
          if (!exactLocator(publishButton, ['click'])) blocked()
          try { await publishButton.click({ timeout: boundaryTimeoutMs }) } catch { blocked() }
          return
        }
        if (!plan.spec.submitLabel) return
        currentEnvironment()
        if (!creationWindowIsActive() || signal.aborted) blocked()
        const confirmButton = page.getByRole('button', {
          name: plan.spec.submitLabel,
          exact: true,
        })
        if (!exactLocator(confirmButton, ['click'])) blocked()
        try {
          await confirmButton.click({ timeout: boundaryTimeoutMs })
        } catch {
          blocked()
        }
      })
    }

    async function finish(ticketInput) {
      const expectedState = MUTATING_OPERATIONS.has(plan?.stepId)
        ? 'MUTATION_STARTED'
        : 'UPLOADS_APPLIED'
      return runTicketMethod(expectedState, 'FINISHED', ticketInput, async ({ page, signal }) => {
        if (plan.stepId === 'create-seb-assignment-draft-with-quit-password') {
          try {
            await page.waitForURL(url => (
              url.origin === OFFICIAL_STAGING_SITE_ORIGIN
                && /^\/assignments\/[0-9a-f-]{36}$/.test(url.pathname)
            ), { timeout: boundaryTimeoutMs })
          } catch { blocked() }
          if (signal.aborted) blocked()
          const marker = page.getByText(plan.marker, { exact: true })
          await waitForVisible(marker)
          return
        }
        if (plan.stepId === 'publish-seb-assignment') {
          if (!pathIs(page.url(), plan.route)) blocked()
          const published = page.getByText('เผยแพร่แล้ว', { exact: true })
          await waitForVisible(published)
          return
        }
        if (plan.stepId === 'verify-seb-system-check') {
          await waitForVisible(page.getByText('เครื่องนี้ผ่านการตรวจสอบ', { exact: true }))
          return
        }
        if (['reject-invalid-seb-challenge', 'reject-replayed-seb-challenge',
          'reject-invalid-seb-session', 'reject-replayed-seb-session'].includes(plan.stepId)) {
          const denial = page.getByText(/ไม่ถูกต้อง|หมดอายุ|ใช้แล้ว|ไม่สามารถ|ปฏิเสธ/)
          await waitForVisible(denial)
          return
        }
        if (plan.stepId === 'start-revision-bound-attempt') {
          const takeRoute = assignmentPath(resourceIds, '/take')
          if (!takeRoute || !pathIs(page.url(), takeRoute)) blocked()
          await waitForVisible(page.locator('textarea[aria-label="คำตอบเรียงความ"]'))
          return
        }
        if (['autosave-synthetic-answer', 'retry-autosave-after-transient-failure']
          .includes(plan.stepId)) {
          await waitForVisible(page.getByText('บันทึกอัตโนมัติ', { exact: true }))
          return
        }
        if (plan.stepId === 'resume-same-attempt') {
          const answer = page.locator('textarea[aria-label="คำตอบเรียงความ"]')
          if (!exactLocator(answer, ['inputValue'])) blocked()
          let value
          try { value = await answer.inputValue() } catch { blocked() }
          if (value !== resourceMarkers.get('answer-written')) blocked()
          return
        }
        if (['upload-synthetic-attachment', 'retry-upload-after-transient-failure']
          .includes(plan.stepId)) {
          await waitForVisible(page.getByText('✓ แนบไฟล์แล้ว 1 ไฟล์', { exact: true }))
          return
        }
        if (plan.stepId === 'record-proctor-heartbeat') {
          const takeRoute = assignmentPath(resourceIds, '/take')
          if (!takeRoute || !pathIs(page.url(), takeRoute)) blocked()
          return
        }
        if (plan.stepId === 'submit-attempt') {
          const resultRoute = submissionPath(resourceIds)
          if (!resultRoute) blocked()
          try {
            await page.waitForURL(url => url.origin === OFFICIAL_STAGING_SITE_ORIGIN
              && url.pathname === resultRoute, { timeout: boundaryTimeoutMs })
          } catch { blocked() }
          await waitForVisible(page.getByRole('heading', {
            name: 'ส่งคำตอบเรียบร้อยแล้ว', exact: true,
          }))
          return
        }
        if (plan.stepId === 'teacher-read-submitted-result') {
          await waitForVisible(page.getByRole('heading', {
            name: 'ส่งคำตอบเรียบร้อยแล้ว', exact: true,
          }))
          return
        }
        if (['student-denied-teacher-result', 'secondary-student-denied-primary-attempt',
          'unrelated-teacher-denied-assignment-result'].includes(plan.stepId)) {
          await waitForVisible(page.getByText(/ไม่พบ|ไม่มีสิทธิ์|ไม่สามารถเข้าถึง|404|could not be found/i))
          return
        }
        const expectedPath = plan.stepId === 'create-subject-classroom'
          || plan.spec.target.kind === 'classroomMembership'
          ? CLASSROOM_LIST_PATH
          : QUESTION_LIST_PATH
        try {
          await page.waitForURL(
            url => url.origin === OFFICIAL_STAGING_SITE_ORIGIN
              && url.pathname === expectedPath,
            { timeout: boundaryTimeoutMs },
          )
        } catch {
          blocked()
        }
        if (signal.aborted || !pathIs(page.url(), expectedPath)) blocked()
        if (plan.spec.target.kind !== 'classroomMembership') {
          const marker = page.getByText(plan.marker, { exact: true })
          await waitForVisible(marker)
        }
      })
    }

    async function abort(ticketInput) {
      const parsed = parseTicketInput(ticketInput)
      if (!parsed
        || !plan
        || plan.methodBusy
        || closed
        || ![
          'ISSUED', 'NAVIGATED', 'MARKED', 'SECRETS_APPLIED',
          'UPLOADS_APPLIED', 'MUTATION_STARTED',
        ].includes(plan.state)) blocked()
      assertTicketPage(parsed)
      currentEnvironment({ cleanup: true })
      assertCapabilitiesStable()
      plan.methodBusy = true
      try {
        await reconcilePlan(parsed.signal, { allowCleanup: true })
      } finally {
        plan.methodBusy = false
      }
      plan.state = 'ABORTED'
      return passed()
    }

    const ticket = Object.freeze({
      applyMarkers,
      navigate,
      applySecrets,
      applyUploads,
      beginMutation,
      finish,
      abort,
    })
    if (!hasExactFields(ticket, TICKET_METHODS)) blocked()
    return ticket
  }

  async function issueOperationTicket(request, callOptions) {
    const signal = parseCallOptions(callOptions)
    const spec = OPERATION_SPECS.get(request?.operationId)
    const binding = spec ? bindings.get(spec.alias) : null
    if (!signal
      || !binding
      || !plan
      || plan.state !== 'PREPARED'
      || plan.ticket !== null
      || resourceBusy
      || cleanupStarted
      || closed
      || plan.stepId !== request.operationId
      || !exactIssueRequest(request, namespace, binding)
      || !creationWindowIsActive()) blocked()
    currentEnvironment()
    assertCapabilitiesStable()
    const ticket = createTicket()
    plan.ticket = ticket
    plan.state = 'ISSUED'
    return ticket
  }

  async function attestStep(request, callOptions) {
    const signal = parseCallOptions(callOptions)
    if (!signal
      || !plan
      || plan.state !== 'FINISHED'
      || plan.methodBusy
      || resourceBusy
      || cleanupStarted
      || closed
      || !exactAttestRequest(request, namespace, identity, plan)) blocked()
    resourceBusy = true
    plan.state = 'ATTESTING'
    try {
      const response = await boundaryCall(
        dataAttestation,
        DATA_BOUNDARY_METHODS,
        'attestOperation',
        freezeInput({
          schemaVersion: 1,
          targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
          namespace,
          identity,
          stepId: plan.stepId,
          alias: plan.spec.alias,
          expectedUserId: plan.binding?.expectedUserId ?? null,
          marker: plan.marker,
          ...(plan.targets.length === 1
            ? { target: plan.targets[0] }
            : { targets: plan.targets }),
        }),
        signal,
      )
      const attested = parseAttestedResponse(response, plan, identity)
      if (!attested) blocked()
      for (const target of attested.targets) {
        resourceIds.set(target.targetKey, target.matches[0].targetId)
        if (target.kind === 'assignment') resourceMarkers.set(target.targetKey, plan.marker)
      }
      if (['autosave-synthetic-answer', 'retry-autosave-after-transient-failure']
        .includes(plan.stepId)) resourceMarkers.set('answer-written', plan.marker)
      plan.state = 'ATTESTED'
      plan = null
      return attested
    } catch {
      if (plan?.state === 'ATTESTING') plan.state = 'FINISHED'
      blocked()
    } finally {
      resourceBusy = false
    }
  }

  async function reconcilePlan(signal, { allowCleanup = false } = {}) {
    if (!plan || !validAbortSignal(signal) || signal.aborted) blocked()
    const result = await boundaryCall(
      dataAttestation,
      DATA_BOUNDARY_METHODS,
      'abortOperation',
      freezeInput({
        schemaVersion: 1,
        targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
        namespace,
        identity,
        stepId: plan.stepId,
        alias: plan.spec.alias,
        expectedUserId: plan.binding?.expectedUserId ?? null,
        marker: plan.marker,
        ...(plan.targets.length === 1
          ? { target: plan.targets[0] }
          : { targets: plan.targets }),
      }),
      signal,
      { allowCleanup },
    )
    if (!exactPassed(result)) blocked()
  }

  async function awaitPendingBoundaryTasks() {
    for (const controller of pendingBoundaryTasks.values()) controller.abort()
    if (pendingBoundaryTasks.size === 0) return true
    let timeoutId = null
    try {
      await Promise.race([
        Promise.allSettled([...pendingBoundaryTasks.keys()]),
        new Promise(resolve => {
          timeoutId = setTimeout(resolve, boundaryTimeoutMs)
        }),
      ])
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId)
    }
    return pendingBoundaryTasks.size === 0
  }

  async function closeChild(attestation, methods, field) {
    if (field === 'material' && materialClosed) return true
    if (field === 'data' && dataClosed) return true
    let task = field === 'material' ? materialCloseTask : dataCloseTask
    if (!task) {
      task = Promise.resolve().then(() => attestation.methods.closeAll.call(attestation.wrapper))
      if (field === 'material') materialCloseTask = task
      else dataCloseTask = task
      task.then(
        result => {
          if (exactPassed(result) && sameCapability(attestation, methods)) {
            if (field === 'material') materialClosed = true
            else dataClosed = true
          } else if (field === 'material') materialCloseTask = null
          else dataCloseTask = null
        },
        () => {
          if (field === 'material') materialCloseTask = null
          else dataCloseTask = null
        },
      )
    }
    let timeoutId = null
    try {
      const result = await Promise.race([
        task,
        new Promise(resolve => {
          timeoutId = setTimeout(() => resolve(null), boundaryTimeoutMs)
        }),
      ])
      return exactPassed(result) && sameCapability(attestation, methods)
    } catch {
      return false
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId)
    }
  }

  async function closeAll() {
    cleanupStarted = true
    if (closed) return passed()
    if (closeBusy) return failed()
    closeBusy = true
    try {
      try {
        currentEnvironment({ cleanup: true })
        assertCapabilitiesStable()
      } catch {
        return failed()
      }
      if (!await awaitPendingBoundaryTasks()
        || resourceBusy
        || plan?.methodBusy
        || (plan && !['PREPARED', 'FINISHED', 'ABORTED', 'ATTESTED'].includes(plan.state))) {
        return failed()
      }
      if (plan && ['PREPARED', 'FINISHED'].includes(plan.state)) {
        const controller = new AbortController()
        plan.methodBusy = true
        try {
          await reconcilePlan(controller.signal, { allowCleanup: true })
          plan.state = 'ABORTED'
        } catch {
          return failed()
        } finally {
          plan.methodBusy = false
        }
      }
      if (!await closeChild(materialAttestation, MATERIAL_METHODS, 'material')) return failed()
      if (!await closeChild(dataAttestation, DATA_BOUNDARY_METHODS, 'data')) return failed()
      try {
        currentEnvironment({ cleanup: true })
        assertCapabilitiesStable()
      } catch {
        return failed()
      }
      plan = null
      bindings.clear()
      resourceIds.clear()
      resourceMarkers.clear()
      closed = true
      return passed()
    } finally {
      closeBusy = false
    }
  }

  const resourcePlanCapability = Object.freeze({
    readAccountBinding,
    prepareStep,
    attestStep,
  })
  const operationPlanCapability = Object.freeze({ issueOperationTicket })
  return Object.freeze({ resourcePlanCapability, operationPlanCapability, closeAll })
}
