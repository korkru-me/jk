const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const BLOCKED_MESSAGE = 'SEB Staging browser data adapter blocked'
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const FORBIDDEN_RUN_ID_TERMS = /(prod(?:uction)?|live|real|customer)/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const RELEASE_ID = /^asr-([0-9a-f]{32})-r([1-9][0-9]{0,9})-([0-9a-f]{16})$/
const SHA256 = /^[a-f0-9]{64}$/
const UUID_PART = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const UUID = new RegExp(`^${UUID_PART}$`)
const UUID_PAIR = new RegExp(`^${UUID_PART}:${UUID_PART}$`)
const CONFIG_REVISION_ID = new RegExp(`^${UUID_PART}:r([1-9][0-9]{0,9})$`)
const PROCTOR_EVENT_ID = /^[1-9][0-9]{0,18}$/
const ANSWER_STORAGE_ID = new RegExp(
  `^${UUID_PART}/${UUID_PART}/${UUID_PART}/${UUID_PART}\\.(?:jpg|pdf|png|webp)$`,
)
const SAFE_TARGET_KEY = /^[a-z][a-z0-9-]{0,63}$/
const MAX_ASSIGNMENT_CONFIG_REVISION = 2_147_483_646
const MAX_CREATION_WINDOW_MS = 24 * 60 * 60 * 1_000
const DEFAULT_RESOURCE_PLAN_TIMEOUT_MS = 10_000
const MIN_RESOURCE_PLAN_TIMEOUT_MS = 10
const MAX_RESOURCE_PLAN_TIMEOUT_MS = 120_000

const ACCOUNT_ROLES = Object.freeze(new Map([
  ['teacher-primary', 'teacher'],
  ['teacher-unrelated', 'teacher'],
  ['student-primary', 'student'],
  ['student-secondary', 'student'],
]))

function target(targetKey, kind, resourceType, ownerAlias) {
  return Object.freeze({ targetKey, kind, resourceType, ownerAlias })
}

function guard(targetKey, kind) {
  return Object.freeze({ targetKey, kind })
}

function contract(stepId, phase, actor, mutates, alias, targets, guards) {
  return Object.freeze({
    stepId,
    phase,
    actor,
    mutates,
    alias,
    role: alias === null ? null : ACCOUNT_ROLES.get(alias),
    targets: Object.freeze(targets),
    guards: Object.freeze(guards),
  })
}

const TEACHER_ORGANIZATION = guard(
  'personal-organization-teacher-primary',
  'personalOrganization',
)
const CLASSROOM = guard('classroom-primary', 'classroom')
const ASSIGNMENT = guard('assignment-primary', 'assignment')
const CONFIG = guard('config-primary', 'configRevision')
const RELEASE = guard('release-primary', 'release')
const CHECK_IN = guard('check-in-primary', 'checkIn')
const SUBMISSION = guard('submission-primary', 'submission')
const QUESTION_WRITTEN = guard('question-written', 'question')
const QUESTION_UPLOAD = guard('question-upload', 'question')
const MEMBERSHIP_PRIMARY = guard('membership-primary', 'classroomMembership')
const MEMBERSHIP_SECONDARY = guard('membership-secondary', 'classroomMembership')
const ANSWER_WRITTEN = guard('answer-written', 'answer')
const ANSWER_UPLOAD = guard('answer-upload', 'answer')
const ANSWER_STORAGE = guard('answer-storage', 'answerStorageObject')
const PROCTOR_CONNECTION = guard('proctor-connection', 'proctorConnection')

function accountGuard(alias) {
  return guard(`account-${alias}`, 'account')
}

function scopedGuards(alias, values = []) {
  return [accountGuard(alias), TEACHER_ORGANIZATION, ...values]
}

const STEP_CONTRACTS = Object.freeze([
  contract(
    'create-subject-classroom',
    'teacher-setup',
    'teacher',
    true,
    'teacher-primary',
    [target('classroom-primary', 'classroom', 'subject', 'teacher-primary')],
    scopedGuards('teacher-primary'),
  ),
  contract(
    'create-synthetic-written-question',
    'teacher-setup',
    'teacher',
    true,
    'teacher-primary',
    [target('question-written', 'question', 'essay', 'teacher-primary')],
    scopedGuards('teacher-primary', [CLASSROOM]),
  ),
  contract(
    'create-synthetic-upload-question',
    'teacher-setup',
    'teacher',
    true,
    'teacher-primary',
    [target('question-upload', 'question', 'file_upload', 'teacher-primary')],
    scopedGuards('teacher-primary', [CLASSROOM, QUESTION_WRITTEN]),
  ),
  contract(
    'join-synthetic-student-to-classroom',
    'student-enrolment',
    'student',
    true,
    'student-primary',
    [target('membership-primary', 'classroomMembership', 'student', 'student-primary')],
    scopedGuards('student-primary', [CLASSROOM]),
  ),
  contract(
    'join-secondary-student-to-classroom',
    'student-enrolment',
    'student-secondary',
    true,
    'student-secondary',
    [target('membership-secondary', 'classroomMembership', 'student', 'student-secondary')],
    scopedGuards('student-secondary', [CLASSROOM, MEMBERSHIP_PRIMARY]),
  ),
  contract(
    'create-seb-assignment-draft-with-quit-password',
    'teacher-setup',
    'teacher',
    true,
    'teacher-primary',
    [
      target('assignment-primary', 'assignment', 'exam', 'teacher-primary'),
      target('config-primary', 'configRevision', 'seb_required', 'teacher-primary'),
    ],
    scopedGuards('teacher-primary', [
      CLASSROOM,
      QUESTION_WRITTEN,
      QUESTION_UPLOAD,
      MEMBERSHIP_PRIMARY,
      MEMBERSHIP_SECONDARY,
    ]),
  ),
  contract(
    'publish-seb-assignment',
    'teacher-setup',
    'teacher',
    true,
    'teacher-primary',
    [],
    scopedGuards('teacher-primary', [ASSIGNMENT, CONFIG, RELEASE]),
  ),
  contract(
    'reject-invalid-seb-challenge',
    'negative-session',
    'student',
    false,
    'student-primary',
    [],
    scopedGuards('student-primary', [ASSIGNMENT, CONFIG, RELEASE]),
  ),
  contract(
    'verify-seb-system-check',
    'student-journey',
    'student',
    true,
    'student-primary',
    [target('check-in-primary', 'checkIn', 'windows', 'student-primary')],
    scopedGuards('student-primary', [ASSIGNMENT, CONFIG, RELEASE]),
  ),
  contract(
    'reject-replayed-seb-challenge',
    'negative-session',
    'student',
    false,
    'student-primary',
    [],
    scopedGuards('student-primary', [ASSIGNMENT, CONFIG, RELEASE, CHECK_IN]),
  ),
  contract(
    'reject-invalid-seb-session',
    'negative-session',
    'student',
    false,
    'student-primary',
    [],
    scopedGuards('student-primary', [ASSIGNMENT, CONFIG, RELEASE, CHECK_IN]),
  ),
  contract(
    'start-revision-bound-attempt',
    'student-journey',
    'student',
    true,
    'student-primary',
    [
      target('submission-primary', 'submission', 'seb_required', 'student-primary'),
      target('answer-written', 'answer', 'essay', 'student-primary'),
      target('answer-upload', 'answer', 'file_upload', 'student-primary'),
    ],
    scopedGuards('student-primary', [
      ASSIGNMENT,
      CONFIG,
      RELEASE,
      CHECK_IN,
      QUESTION_WRITTEN,
      QUESTION_UPLOAD,
    ]),
  ),
  contract(
    'reject-replayed-seb-session',
    'negative-session',
    'student',
    false,
    'student-primary',
    [],
    scopedGuards('student-primary', [ASSIGNMENT, CONFIG, RELEASE, CHECK_IN, SUBMISSION]),
  ),
  contract(
    'autosave-synthetic-answer',
    'student-journey',
    'student',
    true,
    'student-primary',
    [],
    scopedGuards('student-primary', [SUBMISSION, QUESTION_WRITTEN, ANSWER_WRITTEN]),
  ),
  contract(
    'retry-autosave-after-transient-failure',
    'failure-retry',
    'student',
    true,
    'student-primary',
    [],
    scopedGuards('student-primary', [SUBMISSION, ANSWER_WRITTEN]),
  ),
  contract(
    'resume-same-attempt',
    'student-journey',
    'student',
    false,
    'student-primary',
    [],
    scopedGuards('student-primary', [SUBMISSION, ANSWER_WRITTEN]),
  ),
  contract(
    'upload-synthetic-attachment',
    'student-journey',
    'student',
    true,
    'student-primary',
    [target('answer-storage', 'answerStorageObject', 'submission_file', 'student-primary')],
    scopedGuards('student-primary', [SUBMISSION, QUESTION_UPLOAD, ANSWER_UPLOAD]),
  ),
  contract(
    'retry-upload-after-transient-failure',
    'failure-retry',
    'student',
    true,
    'student-primary',
    [],
    scopedGuards('student-primary', [SUBMISSION, ANSWER_UPLOAD, ANSWER_STORAGE]),
  ),
  contract(
    'record-proctor-heartbeat',
    'student-journey',
    'student',
    true,
    'student-primary',
    [
      target('proctor-connection', 'proctorConnection', 'heartbeat', 'student-primary'),
      target('proctor-event', 'proctorEvent', 'monitoring_started', 'student-primary'),
    ],
    scopedGuards('student-primary', [ASSIGNMENT, SUBMISSION]),
  ),
  contract(
    'student-denied-teacher-result',
    'authorization',
    'student',
    false,
    'student-primary',
    [],
    scopedGuards('student-primary', [ASSIGNMENT, SUBMISSION]),
  ),
  contract(
    'submit-attempt',
    'student-journey',
    'student',
    true,
    'student-primary',
    [],
    scopedGuards('student-primary', [
      SUBMISSION,
      ANSWER_WRITTEN,
      ANSWER_UPLOAD,
      ANSWER_STORAGE,
      PROCTOR_CONNECTION,
    ]),
  ),
  contract(
    'teacher-read-submitted-result',
    'teacher-result',
    'teacher',
    false,
    'teacher-primary',
    [],
    scopedGuards('teacher-primary', [ASSIGNMENT, SUBMISSION, ANSWER_WRITTEN, ANSWER_UPLOAD]),
  ),
  contract(
    'secondary-student-denied-primary-attempt',
    'authorization',
    'student-secondary',
    false,
    'student-secondary',
    [],
    scopedGuards('student-secondary', [SUBMISSION]),
  ),
  contract(
    'unrelated-teacher-denied-assignment-result',
    'authorization',
    'teacher-unrelated',
    false,
    'teacher-unrelated',
    [],
    scopedGuards('teacher-unrelated', [ASSIGNMENT, SUBMISSION]),
  ),
  contract(
    'verify-cross-account-boundaries',
    'authorization',
    'harness',
    false,
    null,
    [],
    [
      accountGuard('teacher-primary'),
      accountGuard('teacher-unrelated'),
      accountGuard('student-primary'),
      accountGuard('student-secondary'),
      TEACHER_ORGANIZATION,
      ASSIGNMENT,
      SUBMISSION,
    ],
  ),
])
const STEP_BY_ID = new Map(STEP_CONTRACTS.map(value => [value.stepId, value]))
const RELEASE_REQUIRED_INDEX = STEP_CONTRACTS.findIndex(
  value => value.stepId === 'publish-seb-assignment',
)

const LEDGER_METHODS = Object.freeze([
  'planTarget',
  'adoptDerivedTarget',
  'markUncertain',
  'commitTarget',
  'reconcileTarget',
  'readCleanupTarget',
  'markDeleted',
])
const BROWSER_METHODS = Object.freeze([
  'authenticate',
  'execute',
  'snapshotCookies',
  'replaceCookies',
  'restoreCookies',
  'closeAll',
  'probeUserScopedRead',
])
const RESOURCE_PLAN_METHODS = Object.freeze([
  'readAccountBinding',
  'prepareStep',
  'attestStep',
])

export class SebStagingBrowserDataAdapterBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingBrowserDataAdapterBlockedError'
  }
}

function blocked() {
  throw new SebStagingBrowserDataAdapterBlockedError()
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

function parseReleaseIdentity(value) {
  if (!hasExactFields(value, ['releaseId', 'releaseRevision', 'artifactSha256'])) return null
  const releaseMatch = typeof value.releaseId === 'string' ? RELEASE_ID.exec(value.releaseId) : null
  if (!releaseMatch
    || !Number.isInteger(value.releaseRevision)
    || value.releaseRevision < 1
    || value.releaseRevision > MAX_ASSIGNMENT_CONFIG_REVISION
    || Number(releaseMatch[2]) !== value.releaseRevision
    || typeof value.artifactSha256 !== 'string'
    || !SHA256.test(value.artifactSha256)
    || releaseMatch[3] !== value.artifactSha256.slice(0, 16)) return null
  return Object.freeze({
    releaseId: value.releaseId,
    releaseRevision: value.releaseRevision,
    artifactSha256: value.artifactSha256,
  })
}

function parseRequestIdentity(value, runIdentity) {
  const runOnly = hasExactFields(value, ['runId', 'sourceRevision', 'deploymentId'])
  const releaseBound = hasExactFields(value, [
    'runId', 'sourceRevision', 'deploymentId',
    'releaseId', 'releaseRevision', 'artifactSha256',
  ])
  if (!runOnly && !releaseBound) return null
  if (value.runId !== runIdentity.runId
    || value.sourceRevision !== runIdentity.sourceRevision
    || value.deploymentId !== runIdentity.deploymentId) return null
  const releaseIdentity = releaseBound
    ? parseReleaseIdentity({
        releaseId: value.releaseId,
        releaseRevision: value.releaseRevision,
        artifactSha256: value.artifactSha256,
      })
    : null
  if (releaseBound && !releaseIdentity) return null
  return Object.freeze({ releaseIdentity })
}

function sameReleaseIdentity(left, right) {
  return left?.releaseId === right?.releaseId
    && left?.releaseRevision === right?.releaseRevision
    && left?.artifactSha256 === right?.artifactSha256
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

function exactPassed(value) {
  return Object.isFrozen(value)
    && hasExactFields(value, ['status'])
    && value.status === 'passed'
}

function redactedResult(stepId, status) {
  return Object.freeze({
    stepId: STEP_BY_ID.has(stepId) ? stepId : 'invalid-step',
    status,
  })
}

function exactStepRequest(value, expected, runIdentity) {
  return hasExactFields(value, [
    'schemaVersion', 'stepId', 'phase', 'actor', 'mutates', 'identity',
  ])
    && value.schemaVersion === 1
    && value.stepId === expected.stepId
    && value.phase === expected.phase
    && value.actor === expected.actor
    && value.mutates === expected.mutates
    && parseRequestIdentity(value.identity, runIdentity) !== null
}

function validTargetId(kind, value) {
  if (typeof value !== 'string') return false
  if ([
    'classroom', 'question', 'classroomMembership', 'assignment', 'submission', 'answer',
  ].includes(kind)) return UUID.test(value)
  if (kind === 'configRevision') {
    const match = CONFIG_REVISION_ID.exec(value)
    const revision = match ? Number(match[1]) : null
    return Number.isSafeInteger(revision)
      && revision >= 1
      && revision <= MAX_ASSIGNMENT_CONFIG_REVISION
  }
  if (kind === 'checkIn' || kind === 'proctorConnection') return UUID_PAIR.test(value)
  if (kind === 'proctorEvent') return PROCTOR_EVENT_ID.test(value)
  if (kind === 'answerStorageObject') return ANSWER_STORAGE_ID.test(value)
  return false
}

function parseBinding(value, alias, namespace) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, [
      'schemaVersion', 'targetOrigin', 'namespace', 'alias', 'role', 'expectedUserId',
    ])
    || value.schemaVersion !== 1
    || value.targetOrigin !== OFFICIAL_STAGING_SITE_ORIGIN
    || value.namespace !== namespace
    || value.alias !== alias
    || value.role !== ACCOUNT_ROLES.get(alias)
    || typeof value.expectedUserId !== 'string'
    || !UUID.test(value.expectedUserId)) return null
  return Object.freeze({
    targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
    namespace,
    alias,
    role: value.role,
    expectedUserId: value.expectedUserId,
  })
}

function parsePreparedStep(value, contractValue, namespace, binding, ownerBindings, organizationId) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, [
      'schemaVersion', 'targetOrigin', 'namespace', 'stepId', 'alias', 'role',
      'expectedUserId', 'targets',
    ])
    || value.schemaVersion !== 1
    || value.targetOrigin !== OFFICIAL_STAGING_SITE_ORIGIN
    || value.namespace !== namespace
    || value.stepId !== contractValue.stepId
    || value.alias !== contractValue.alias
    || value.role !== contractValue.role
    || value.expectedUserId !== (binding?.expectedUserId ?? null)
    || !isExactFrozenArray(value.targets, contractValue.targets.length)) return null

  const parsedTargets = []
  for (let index = 0; index < contractValue.targets.length; index += 1) {
    const expected = contractValue.targets[index]
    const actual = value.targets[index]
    const owner = ownerBindings.get(expected.ownerAlias)
    const descriptorFields = [
      'schemaVersion', 'targetKey', 'kind', 'ownerId', 'organizationId',
      'resourceType',
    ]
    if (!owner
      || !Object.isFrozen(actual)
      || !hasExactFields(actual, descriptorFields)
      || actual.schemaVersion !== 1
      || actual.targetKey !== expected.targetKey
      || actual.kind !== expected.kind
      || actual.ownerId !== owner.expectedUserId
      || actual.organizationId !== organizationId
      || actual.resourceType !== expected.resourceType) return null
    parsedTargets.push(freezeInput({ ...actual }))
  }
  return Object.freeze(parsedTargets)
}

function sameOrderedIds(actual, expected) {
  return isExactFrozenArray(actual, expected.length)
    && actual.every((value, index) => value === expected[index])
}

function targetIdFrom(values, targetKey) {
  const value = values?.[targetKey]
  return typeof value?.targetId === 'string' ? value.targetId : null
}

function validAttestedLineage(target, attestedByKey, guardSnapshots) {
  const guardId = targetKey => targetIdFrom(guardSnapshots, targetKey)
  const sameStepId = targetKey => targetIdFrom(attestedByKey, targetKey)
  let parentId = null
  let relatedIds = []

  switch (target.targetKey) {
    case 'classroom-primary':
    case 'question-written':
    case 'question-upload':
      break
    case 'membership-primary':
    case 'membership-secondary':
      parentId = guardId('classroom-primary')
      break
    case 'assignment-primary':
      parentId = guardId('classroom-primary')
      relatedIds = [guardId('question-written'), guardId('question-upload')]
      break
    case 'config-primary':
      parentId = sameStepId('assignment-primary')
      break
    case 'check-in-primary': {
      parentId = guardId('assignment-primary')
      if (target.targetId !== `${parentId}:${target.ownerId}`) return false
      break
    }
    case 'submission-primary':
      parentId = guardId('assignment-primary')
      relatedIds = [guardId('config-primary')]
      break
    case 'answer-written':
      parentId = sameStepId('submission-primary')
      relatedIds = [guardId('question-written')]
      break
    case 'answer-upload':
      parentId = sameStepId('submission-primary')
      relatedIds = [guardId('question-upload')]
      break
    case 'answer-storage': {
      parentId = guardId('answer-upload')
      const submissionId = guardId('submission-primary')
      relatedIds = [submissionId]
      const [ownerId, encodedSubmissionId, answerId, objectName, ...rest] =
        target.targetId.split('/')
      if (rest.length !== 0
        || ownerId !== target.ownerId
        || encodedSubmissionId !== submissionId
        || answerId !== parentId
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|pdf|png|webp)$/.test(objectName)) return false
      break
    }
    case 'proctor-connection': {
      parentId = guardId('submission-primary')
      relatedIds = [guardId('assignment-primary')]
      const [encodedSubmissionId, clientId, ...rest] = target.targetId.split(':')
      if (rest.length !== 0
        || encodedSubmissionId !== parentId
        || !UUID.test(clientId)) return false
      break
    }
    case 'proctor-event':
      parentId = guardId('submission-primary')
      relatedIds = [guardId('assignment-primary')]
      break
    default:
      return false
  }

  if ((parentId !== null && typeof parentId !== 'string')
    || relatedIds.some(value => typeof value !== 'string')) return false
  return target.parentId === parentId && sameOrderedIds(target.relatedIds, relatedIds)
}

function parseOperationAttestation(
  value,
  contractValue,
  preparedTargets,
  guardSnapshots,
  runIdentity,
) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, ['schemaVersion', 'stepId', 'status', 'targets'])
    || value.schemaVersion !== 1
    || value.stepId !== contractValue.stepId
    || value.status !== 'passed'
    || !isExactFrozenArray(value.targets, preparedTargets.length)) return null
  const notBefore = Date.parse(runIdentity.creationWindow.notBefore)
  const notAfter = Date.parse(runIdentity.creationWindow.notAfter)
  const parsed = []
  const targetIds = new Set()
  for (let index = 0; index < preparedTargets.length; index += 1) {
    const prepared = preparedTargets[index]
    const actual = value.targets[index]
    if (!Object.isFrozen(actual)
      || !hasExactFields(actual, ['targetKey', 'kind', 'matches'])
      || actual.targetKey !== prepared.targetKey
      || actual.kind !== prepared.kind
      || !isExactFrozenArray(actual.matches, 1)) return null
    const match = actual.matches[0]
    const createdAt = canonicalTimestamp(match?.createdAt)
    const targetIdentity = `${prepared.kind}\u0000${match?.targetId}`
    if (!Object.isFrozen(match)
      || !hasExactFields(match, [
        'targetId', 'createdAt', 'ownerId', 'organizationId', 'resourceType',
        'parentId', 'relatedIds',
      ])
      || !validTargetId(prepared.kind, match.targetId)
      || match.ownerId !== prepared.ownerId
      || match.organizationId !== prepared.organizationId
      || match.resourceType !== prepared.resourceType
      || !(match.parentId === null || typeof match.parentId === 'string')
      || !Array.isArray(match.relatedIds)
      || !isExactFrozenArray(match.relatedIds, match.relatedIds.length)
      || targetIds.has(targetIdentity)
      || !createdAt
      || createdAt.timestamp < notBefore
      || createdAt.timestamp > notAfter) return null
    targetIds.add(targetIdentity)
    parsed.push(Object.freeze({
      targetKey: prepared.targetKey,
      kind: prepared.kind,
      targetId: match.targetId,
      createdAt: createdAt.iso,
      ownerId: prepared.ownerId,
      parentId: match.parentId,
      relatedIds: match.relatedIds,
    }))
  }
  const attestedByKey = Object.freeze(Object.fromEntries(
    parsed.map(targetValue => [targetValue.targetKey, targetValue]),
  ))
  if (!parsed.every(targetValue => validAttestedLineage(
    targetValue,
    attestedByKey,
    guardSnapshots,
  ))) return null
  return Object.freeze(parsed)
}

function ledgerReference(kind, targetKey) {
  return Object.freeze({ schemaVersion: 1, targetKey, kind })
}

function ledgerPlan(runIdentity, namespace, targetValue) {
  return freezeInput({
    schemaVersion: 1,
    targetKey: targetValue.targetKey,
    kind: targetValue.kind,
    identity: runIdentity,
    namespace,
    ownerId: targetValue.ownerId,
    organizationId: targetValue.organizationId,
    resourceType: targetValue.resourceType,
  })
}

function ledgerCandidate(runIdentity, namespace, targetValue, attestedTarget) {
  return freezeInput({
    schemaVersion: 1,
    targetKey: targetValue.targetKey,
    kind: targetValue.kind,
    identity: runIdentity,
    targetId: attestedTarget.targetId,
    namespace,
    ownerId: targetValue.ownerId,
    organizationId: targetValue.organizationId,
    resourceType: targetValue.resourceType,
    createdAt: attestedTarget.createdAt,
  })
}

function parseLedgerRead(value, reference, runIdentity, namespace) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, ['status', 'state', 'snapshots'])
    || value.status !== 'passed'
    || !['unplanned', 'planned', 'uncertain', 'committed', 'deleted'].includes(value.state)
    || !Array.isArray(value.snapshots)
    || !isExactFrozenArray(value.snapshots, value.snapshots.length)) return null
  const snapshots = []
  for (const snapshot of value.snapshots) {
    if (!Object.isFrozen(snapshot)
      || !hasExactFields(snapshot, [
        'schemaVersion', 'targetKey', 'kind', 'identity', 'targetId', 'namespace',
        'ownerId', 'organizationId', 'resourceType', 'createdAt',
      ])
      || snapshot.schemaVersion !== 1
      || snapshot.targetKey !== reference.targetKey
      || snapshot.kind !== reference.kind
      || snapshot.namespace !== namespace
      || !hasExactFields(snapshot.identity, [
        'runId', 'sourceRevision', 'deploymentId', 'creationWindow',
      ])
      || snapshot.identity.runId !== runIdentity.runId
      || snapshot.identity.sourceRevision !== runIdentity.sourceRevision
      || snapshot.identity.deploymentId !== runIdentity.deploymentId
      || snapshot.identity.creationWindow?.notBefore !== runIdentity.creationWindow.notBefore
      || snapshot.identity.creationWindow?.notAfter !== runIdentity.creationWindow.notAfter) return null
    snapshots.push(snapshot)
  }
  return Object.freeze({ state: value.state, snapshots: Object.freeze(snapshots) })
}

function assignmentRevisionBinding(assignmentId, configRevisionId) {
  const match = typeof configRevisionId === 'string'
    ? CONFIG_REVISION_ID.exec(configRevisionId)
    : null
  if (!UUID.test(assignmentId)
    || !match
    || !configRevisionId.startsWith(`${assignmentId}:r`)) return null
  const revision = Number(match[1])
  if (!Number.isSafeInteger(revision)
    || revision < 1
    || revision > MAX_ASSIGNMENT_CONFIG_REVISION) return null
  return Object.freeze({ assignmentId, revision, configRevisionId })
}

function releaseMatchesAssignment(binding, releaseIdentity, releaseTargetId) {
  if (!binding || !releaseIdentity || releaseTargetId !== releaseIdentity.releaseId) return false
  const match = RELEASE_ID.exec(releaseTargetId)
  return match !== null
    && match[1] === binding.assignmentId.replaceAll('-', '')
    && Number(match[2]) === binding.revision
    && match[3] === releaseIdentity.artifactSha256.slice(0, 16)
    && releaseIdentity.releaseRevision === binding.revision
}

/**
 * Bind the browser-owned S5 harness steps to one frozen browser broker and one
 * private deterministic resource plan. The public request never carries a
 * credential or resource id. Creation targets are entered into the private
 * ledger before the browser can mutate. After mutation, the trusted
 * service-role planner must reconcile exactly one database/storage match and
 * supply its actual id and created-at value before the ledger can commit it.
 */
export function createSebStagingBrowserDataAdapter({
  readEnvironment,
  runIdentity: runIdentityInput,
  privateRunLedger,
  browserSessionCapability,
  privateResourcePlanCapability,
  resourcePlanTimeoutMs = DEFAULT_RESOURCE_PLAN_TIMEOUT_MS,
  clock,
} = {}) {
  const runIdentity = parseRunIdentity(runIdentityInput)
  const ledgerAttestation = captureCapability(privateRunLedger, LEDGER_METHODS)
  const browserAttestation = captureCapability(browserSessionCapability, BROWSER_METHODS)
  const resourcePlanAttestation = captureCapability(
    privateResourcePlanCapability,
    RESOURCE_PLAN_METHODS,
  )
  let initialEnvironment = null
  try {
    initialEnvironment = typeof readEnvironment === 'function' ? readEnvironment() : null
  } catch {
    blocked()
  }
  const now = typeof clock === 'function' ? clockTimestamp(clock) : null
  if (typeof readEnvironment !== 'function'
    || !hasOfficialStagingPolicy(initialEnvironment)
    || !runIdentity
    || !ledgerAttestation
    || !browserAttestation
    || !resourcePlanAttestation
    || !Number.isInteger(resourcePlanTimeoutMs)
    || resourcePlanTimeoutMs < MIN_RESOURCE_PLAN_TIMEOUT_MS
    || resourcePlanTimeoutMs > MAX_RESOURCE_PLAN_TIMEOUT_MS
    || typeof clock !== 'function'
    || now === null
    || now < Date.parse(runIdentity.creationWindow.notBefore)
    || now > Date.parse(runIdentity.creationWindow.notAfter)) blocked()

  const namespace = `qa:${runIdentity.runId}`
  const bindingCache = new Map()
  let organizationId = null
  let nextStepIndex = 0
  let boundReleaseIdentity = null
  let assignmentBinding = null
  let busy = false
  let journeyFailed = false
  let cleanupStarted = false
  let closed = false
  const pendingResourcePlanTasks = new Map()

  function currentEnvironment({ cleanup = false } = {}) {
    let environment = null
    try {
      environment = readEnvironment()
    } catch {
      blocked()
    }
    if (!hasOfficialStagingPolicy(environment, { cleanup })) blocked()
    return environment
  }

  function creationWindowIsActive() {
    const value = clockTimestamp(clock)
    return value !== null
      && value >= Date.parse(runIdentity.creationWindow.notBefore)
      && value <= Date.parse(runIdentity.creationWindow.notAfter)
  }

  function assertCapabilitiesStable() {
    if (!sameCapability(ledgerAttestation, LEDGER_METHODS)
      || !sameCapability(browserAttestation, BROWSER_METHODS)
      || !sameCapability(resourcePlanAttestation, RESOURCE_PLAN_METHODS)) blocked()
  }

  function ledgerCall(method, ...args) {
    assertCapabilitiesStable()
    const value = ledgerAttestation.methods[method].call(privateRunLedger, ...args)
    assertCapabilitiesStable()
    return value
  }

  async function ledgerCallAsync(method, ...args) {
    assertCapabilitiesStable()
    const value = await ledgerAttestation.methods[method].call(privateRunLedger, ...args)
    assertCapabilitiesStable()
    return value
  }

  async function browserCall(method, request) {
    assertCapabilitiesStable()
    currentEnvironment()
    const result = await browserAttestation.methods[method].call(
      browserSessionCapability,
      request,
    )
    currentEnvironment()
    assertCapabilitiesStable()
    if (!exactPassed(result)) blocked()
    return result
  }

  async function resourcePlanCall(method, request) {
    assertCapabilitiesStable()
    currentEnvironment()
    if (cleanupStarted || closed) blocked()
    if (pendingResourcePlanTasks.size > 0) blocked()
    const controller = new AbortController()
    const operation = Promise.resolve()
      .then(() => {
        currentEnvironment()
        assertCapabilitiesStable()
        if (cleanupStarted || closed || controller.signal.aborted) blocked()
        return resourcePlanAttestation.methods[method].call(
          privateResourcePlanCapability,
          request,
          Object.freeze({ signal: controller.signal }),
        )
      })
      .then(result => {
        currentEnvironment()
        assertCapabilitiesStable()
        if (cleanupStarted || closed || controller.signal.aborted) blocked()
        return result
      })
      .finally(() => pendingResourcePlanTasks.delete(operation))
    pendingResourcePlanTasks.set(operation, controller)

    let timeoutId = null
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort()
        reject(new SebStagingBrowserDataAdapterBlockedError())
      }, resourcePlanTimeoutMs)
    })
    try {
      return await Promise.race([operation, timeout])
    } catch {
      if (!controller.signal.aborted) controller.abort()
      blocked()
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId)
    }
  }

  async function readBinding(alias) {
    if (!ACCOUNT_ROLES.has(alias)) blocked()
    const response = await resourcePlanCall('readAccountBinding', freezeInput({
      schemaVersion: 1,
      targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
      namespace,
      alias,
      role: ACCOUNT_ROLES.get(alias),
    }))
    const parsed = parseBinding(response, alias, namespace)
    if (!parsed) blocked()
    const existing = bindingCache.get(alias)
    if (existing
      && (existing.role !== parsed.role || existing.expectedUserId !== parsed.expectedUserId)) blocked()
    if (!existing) bindingCache.set(alias, parsed)
    return bindingCache.get(alias)
  }

  function readLedger(reference) {
    const result = ledgerCall('readCleanupTarget', ledgerReference(
      reference.kind,
      reference.targetKey,
    ))
    return parseLedgerRead(result, reference, runIdentity, namespace)
  }

  async function reconcileReference(reference) {
    let state = readLedger(reference)
    if (!state) blocked()
    if (state.state === 'uncertain') {
      const result = await ledgerCallAsync(
        'reconcileTarget',
        ledgerReference(reference.kind, reference.targetKey),
      )
      if (!exactPassed(result)) blocked()
      state = readLedger(reference)
    }
    if (!state) blocked()
    return state
  }

  async function ensureCommittedGuard(reference, bindings) {
    const state = await reconcileReference(reference)
    if (state.state !== 'committed' || state.snapshots.length !== 1) blocked()
    const snapshot = state.snapshots[0]
    if (reference.kind === 'account') {
      const alias = reference.targetKey.slice('account-'.length)
      const binding = bindings.get(alias) ?? await readBinding(alias)
      bindings.set(alias, binding)
      if (snapshot.targetId !== binding.expectedUserId
        || snapshot.ownerId !== null
        || snapshot.organizationId !== null
        || snapshot.resourceType !== binding.role) blocked()
    } else if (reference.kind === 'personalOrganization') {
      const owner = bindings.get('teacher-primary') ?? await readBinding('teacher-primary')
      bindings.set('teacher-primary', owner)
      const [candidateOrganizationId, membershipId, ...rest] = snapshot.targetId.split(':')
      if (rest.length !== 0
        || !UUID.test(candidateOrganizationId)
        || !UUID.test(membershipId)
        || snapshot.ownerId !== owner.expectedUserId
        || snapshot.organizationId !== null
        || snapshot.resourceType !== 'personal') blocked()
      if (organizationId !== null && organizationId !== candidateOrganizationId) blocked()
      organizationId = candidateOrganizationId
    } else if (organizationId === null || snapshot.organizationId !== organizationId) {
      blocked()
    }
    return snapshot
  }

  async function resolveStepPlan(contractValue) {
    const bindings = new Map()
    const guardSnapshots = new Map()
    let binding = null
    if (contractValue.alias !== null) {
      binding = await readBinding(contractValue.alias)
      bindings.set(contractValue.alias, binding)
    } else {
      for (const alias of ACCOUNT_ROLES.keys()) {
        bindings.set(alias, await readBinding(alias))
      }
    }
    for (const reference of contractValue.guards) {
      guardSnapshots.set(
        reference.targetKey,
        await ensureCommittedGuard(reference, bindings),
      )
    }
    for (const expectedTarget of contractValue.targets) {
      if (!bindings.has(expectedTarget.ownerAlias)) {
        bindings.set(expectedTarget.ownerAlias, await readBinding(expectedTarget.ownerAlias))
      }
    }
    if (organizationId === null) blocked()
    const response = await resourcePlanCall('prepareStep', freezeInput({
      schemaVersion: 1,
      targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
      namespace,
      identity: runIdentity,
      stepId: contractValue.stepId,
      alias: contractValue.alias,
      role: contractValue.role,
      expectedUserId: binding?.expectedUserId ?? null,
    }))
    const targets = parsePreparedStep(
      response,
      contractValue,
      namespace,
      binding,
      bindings,
      organizationId,
    )
    if (!targets) blocked()

    const assignmentSnapshot = guardSnapshots.get('assignment-primary')
    const configSnapshot = guardSnapshots.get('config-primary')
    const releaseSnapshot = guardSnapshots.get('release-primary')
    if (configSnapshot || releaseSnapshot) {
      if (!assignmentSnapshot || !configSnapshot) blocked()
      const guardedBinding = assignmentRevisionBinding(
        assignmentSnapshot.targetId,
        configSnapshot.targetId,
      )
      if (!guardedBinding
        || (assignmentBinding
          && (assignmentBinding.assignmentId !== guardedBinding.assignmentId
            || assignmentBinding.revision !== guardedBinding.revision
            || assignmentBinding.configRevisionId !== guardedBinding.configRevisionId))) blocked()
      if (releaseSnapshot
        && !releaseMatchesAssignment(
          guardedBinding,
          boundReleaseIdentity,
          releaseSnapshot.targetId,
        )) blocked()
    } else if (assignmentSnapshot
      && assignmentBinding
      && assignmentSnapshot.targetId !== assignmentBinding.assignmentId) {
      blocked()
    }
    return Object.freeze({
      binding,
      targets,
      guardSnapshots: freezeInput(Object.fromEntries(guardSnapshots)),
    })
  }

  async function reconcileTargets(references) {
    let complete = true
    for (const reference of references) {
      try {
        const state = await reconcileReference(reference)
        if (!['committed', 'deleted'].includes(state.state)
          || (state.state === 'committed' && state.snapshots.length !== 1)
          || (state.state === 'deleted' && state.snapshots.length !== 0)) {
          complete = false
        }
      } catch {
        complete = false
      }
    }
    return complete
  }

  async function planMutationTargets(targets) {
    const uncertain = []
    try {
      for (const targetValue of targets) {
        const reference = ledgerReference(targetValue.kind, targetValue.targetKey)
        const existing = await reconcileReference(reference)
        if (existing.state !== 'unplanned' || existing.snapshots.length !== 0) blocked()
        if (!exactPassed(ledgerCall('planTarget', ledgerPlan(
          runIdentity,
          namespace,
          targetValue,
        )))) blocked()
        if (!exactPassed(ledgerCall('markUncertain', reference))) blocked()
        uncertain.push(reference)
      }
      return Object.freeze(uncertain)
    } catch {
      await reconcileTargets(uncertain)
      blocked()
    }
  }

  async function attestOperation(contractValue, preparedTargets, guardSnapshots) {
    const response = await resourcePlanCall('attestStep', freezeInput({
      schemaVersion: 1,
      targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
      namespace,
      identity: runIdentity,
      stepId: contractValue.stepId,
    }))
    const parsed = parseOperationAttestation(
      response,
      contractValue,
      preparedTargets,
      guardSnapshots,
      runIdentity,
    )
    if (!parsed) blocked()
    return parsed
  }

  async function executeNormalStep(contractValue, stepPlan) {
    if (contractValue.mutates) await planMutationTargets(stepPlan.targets)
    // Binding/guard/plan resolution crosses asynchronous boundaries.  The
    // creation window can expire while those private capabilities are running,
    // so authorize the actual browser mutation at the last possible instant.
    // This also covers mutating steps with no ledger targets of their own.
    if (contractValue.mutates && !creationWindowIsActive()) return false
    try {
      await browserCall('execute', freezeInput({
        targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
        namespace,
        alias: stepPlan.binding.alias,
        role: stepPlan.binding.role,
        expectedUserId: stepPlan.binding.expectedUserId,
        operationId: contractValue.stepId,
        payload: {},
      }))
      const attestedTargets = await attestOperation(
        contractValue,
        stepPlan.targets,
        stepPlan.guardSnapshots,
      )
      let assignmentBindingCandidate = null
      if (contractValue.stepId === 'create-seb-assignment-draft-with-quit-password') {
        const assignmentTarget = attestedTargets.find(
          value => value.targetKey === 'assignment-primary',
        )
        const configTarget = attestedTargets.find(
          value => value.targetKey === 'config-primary',
        )
        assignmentBindingCandidate = assignmentRevisionBinding(
          assignmentTarget?.targetId,
          configTarget?.targetId,
        )
        if (!assignmentBindingCandidate
          || (boundReleaseIdentity
            && !releaseMatchesAssignment(
              assignmentBindingCandidate,
              boundReleaseIdentity,
              boundReleaseIdentity.releaseId,
            ))) blocked()
      }
      for (let index = 0; index < stepPlan.targets.length; index += 1) {
        const targetValue = stepPlan.targets[index]
        const attestedTarget = attestedTargets[index]
        if (!exactPassed(ledgerCall(
          'commitTarget',
          ledgerReference(targetValue.kind, targetValue.targetKey),
          ledgerCandidate(runIdentity, namespace, targetValue, attestedTarget),
        ))) blocked()
        const committed = readLedger(targetValue)
        if (!committed
          || committed.state !== 'committed'
          || committed.snapshots.length !== 1
          || committed.snapshots[0].targetId !== attestedTarget.targetId
          || committed.snapshots[0].createdAt !== attestedTarget.createdAt) blocked()
      }
      if (assignmentBindingCandidate) assignmentBinding = assignmentBindingCandidate
      return true
    } catch {
      // Once the browser operation has started, its timeout/rejection does
      // not prove that the underlying runner has quiesced. Keep every planned
      // target uncertain. Aggregate cleanup must first close the browser
      // broker (which waits for any abort-ignoring runner), and only then may
      // the cleanup ledger reconcile these targets against database truth.
      return false
    }
  }

  function snapshotRequest(binding) {
    return freezeInput({
      targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
      namespace,
      alias: binding.alias,
      role: binding.role,
      expectedUserId: binding.expectedUserId,
    })
  }

  async function exerciseCrossAccountPair(targetBinding, sourceBinding) {
    let replaced = false
    let passed = false
    try {
      await browserCall('replaceCookies', freezeInput({
        targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
        namespace,
        alias: targetBinding.alias,
        sourceAlias: sourceBinding.alias,
      }))
      replaced = true
      await browserCall('probeUserScopedRead', freezeInput({
        targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
        namespace,
        contextAlias: targetBinding.alias,
        authenticatedAsAlias: sourceBinding.alias,
      }))
      passed = true
    } catch {
      passed = false
    } finally {
      if (replaced) {
        try {
          await browserCall('restoreCookies', snapshotRequest(targetBinding))
        } catch {
          passed = false
        }
      }
    }
    if (!passed) return false
    try {
      await browserCall('probeUserScopedRead', freezeInput({
        targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
        namespace,
        contextAlias: targetBinding.alias,
        authenticatedAsAlias: targetBinding.alias,
      }))
      return true
    } catch {
      return false
    }
  }

  async function executeCrossAccountStep(contractValue, stepPlan) {
    const bindings = new Map()
    try {
      for (const alias of ACCOUNT_ROLES.keys()) bindings.set(alias, await readBinding(alias))
      for (const binding of bindings.values()) {
        await browserCall('snapshotCookies', snapshotRequest(binding))
      }
      const teacherPassed = await exerciseCrossAccountPair(
        bindings.get('teacher-primary'),
        bindings.get('teacher-unrelated'),
      )
      const studentPassed = await exerciseCrossAccountPair(
        bindings.get('student-primary'),
        bindings.get('student-secondary'),
      )
      if (!teacherPassed || !studentPassed) return false
      const targets = await attestOperation(
        contractValue,
        stepPlan.targets,
        stepPlan.guardSnapshots,
      )
      return targets.length === 0
    } catch {
      return false
    }
  }

  async function executeStepInternal(request) {
    const contractValue = STEP_BY_ID.get(request?.stepId)
    if (busy
      || cleanupStarted
      || closed
      || journeyFailed
      || !contractValue
      || STEP_CONTRACTS[nextStepIndex]?.stepId !== contractValue.stepId
      || !exactStepRequest(request, contractValue, runIdentity)) {
      return redactedResult(request?.stepId, 'failed')
    }
    const parsedIdentity = parseRequestIdentity(request.identity, runIdentity)
    if (!parsedIdentity) return redactedResult(contractValue.stepId, 'failed')
    if (parsedIdentity.releaseIdentity) {
      if (boundReleaseIdentity
        && !sameReleaseIdentity(boundReleaseIdentity, parsedIdentity.releaseIdentity)) {
        return redactedResult(contractValue.stepId, 'failed')
      }
      if (!boundReleaseIdentity) boundReleaseIdentity = parsedIdentity.releaseIdentity
    }
    if (nextStepIndex >= RELEASE_REQUIRED_INDEX && !boundReleaseIdentity) {
      return redactedResult(contractValue.stepId, 'failed')
    }
    if (boundReleaseIdentity && !parsedIdentity.releaseIdentity) {
      return redactedResult(contractValue.stepId, 'failed')
    }
    if (contractValue.mutates && !creationWindowIsActive()) {
      return redactedResult(contractValue.stepId, 'failed')
    }

    busy = true
    let passed = false
    try {
      currentEnvironment()
      const stepPlan = await resolveStepPlan(contractValue)
      passed = contractValue.alias === null
        ? await executeCrossAccountStep(contractValue, stepPlan)
        : await executeNormalStep(contractValue, stepPlan)
      currentEnvironment()
    } catch {
      passed = false
    } finally {
      busy = false
    }
    if (passed) nextStepIndex += 1
    else journeyFailed = true
    return redactedResult(contractValue.stepId, passed ? 'passed' : 'failed')
  }

  async function executeStep(request) {
    try {
      return await executeStepInternal(request)
    } catch {
      return redactedResult(request?.stepId, 'failed')
    }
  }

  async function closeAll() {
    cleanupStarted = true
    if (closed) return Object.freeze({ status: 'passed' })

    for (const controller of pendingResourcePlanTasks.values()) controller.abort()
    if (pendingResourcePlanTasks.size > 0) {
      let timeoutId = null
      const settled = Promise.allSettled([...pendingResourcePlanTasks.keys()])
      const timeout = new Promise(resolve => {
        timeoutId = setTimeout(resolve, resourcePlanTimeoutMs)
      })
      try {
        await Promise.race([settled, timeout])
      } finally {
        if (timeoutId !== null) clearTimeout(timeoutId)
      }
    }

    if (busy || pendingResourcePlanTasks.size > 0) {
      return Object.freeze({ status: 'failed' })
    }
    try {
      currentEnvironment({ cleanup: true })
      assertCapabilitiesStable()
    } catch {
      return Object.freeze({ status: 'failed' })
    }
    closed = true
    return Object.freeze({ status: 'passed' })
  }

  return Object.freeze({ executeStep, closeAll })
}

export function listSebStagingBrowserDataStepContracts() {
  return Object.freeze(STEP_CONTRACTS.map(value => Object.freeze({
    stepId: value.stepId,
    phase: value.phase,
    actor: value.actor,
    mutates: value.mutates,
    alias: value.alias,
    role: value.role,
    targetKeys: Object.freeze(value.targets.map(targetValue => targetValue.targetKey)),
  })))
}
