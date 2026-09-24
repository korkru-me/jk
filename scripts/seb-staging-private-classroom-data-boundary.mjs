const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const BLOCKED_MESSAGE = 'SEB Staging private classroom data boundary blocked'
const STEP_SPECS = Object.freeze(new Map([
  ['create-subject-classroom', Object.freeze({
    targetKey: 'classroom-primary',
    kind: 'classroom',
    resourceType: 'subject',
    table: 'classrooms',
  })],
  ['create-synthetic-written-question', Object.freeze({
    targetKey: 'question-written',
    kind: 'question',
    resourceType: 'essay',
    table: 'questions',
  })],
  ['create-synthetic-upload-question', Object.freeze({
    targetKey: 'question-upload',
    kind: 'question',
    resourceType: 'file_upload',
    table: 'questions',
  })],
  ['join-synthetic-student-to-classroom', Object.freeze({
    alias: 'student-primary',
    role: 'student',
    targetKey: 'membership-primary',
    kind: 'classroomMembership',
    resourceType: 'student',
    table: 'classroom_students',
  })],
  ['join-secondary-student-to-classroom', Object.freeze({
    alias: 'student-secondary',
    role: 'student',
    targetKey: 'membership-secondary',
    kind: 'classroomMembership',
    resourceType: 'student',
    table: 'classroom_students',
  })],
  ['create-seb-assignment-draft-with-quit-password', Object.freeze({
    targets: Object.freeze([
      Object.freeze({
        targetKey: 'assignment-primary',
        kind: 'assignment',
        resourceType: 'exam',
      }),
      Object.freeze({
        targetKey: 'config-primary',
        kind: 'configRevision',
        resourceType: 'seb_required',
      }),
    ]),
    table: 'assignments',
  })],
  ['publish-seb-assignment', Object.freeze({
    alias: 'teacher-primary',
    role: 'teacher',
    targets: Object.freeze([]),
    table: 'assignments',
  })],
  ['reject-invalid-seb-challenge', studentReadSpec()],
  ['verify-seb-system-check', studentReadSpec([{
    targetKey: 'check-in-primary', kind: 'checkIn', resourceType: 'windows',
  }], 'exam_seb_checkins')],
  ['reject-replayed-seb-challenge', studentReadSpec()],
  ['reject-invalid-seb-session', studentReadSpec()],
  ['start-revision-bound-attempt', studentReadSpec([
    { targetKey: 'submission-primary', kind: 'submission', resourceType: 'seb_required' },
    { targetKey: 'answer-written', kind: 'answer', resourceType: 'essay' },
    { targetKey: 'answer-upload', kind: 'answer', resourceType: 'file_upload' },
  ], 'submissions')],
  ['reject-replayed-seb-session', studentReadSpec()],
  ['autosave-synthetic-answer', studentReadSpec()],
  ['retry-autosave-after-transient-failure', studentReadSpec()],
  ['resume-same-attempt', studentReadSpec()],
  ['upload-synthetic-attachment', studentReadSpec([{
    targetKey: 'answer-storage', kind: 'answerStorageObject', resourceType: 'submission_file',
  }], 'storage')],
  ['retry-upload-after-transient-failure', studentReadSpec()],
  ['record-proctor-heartbeat', studentReadSpec([
    { targetKey: 'proctor-connection', kind: 'proctorConnection', resourceType: 'heartbeat' },
    { targetKey: 'proctor-event', kind: 'proctorEvent', resourceType: 'monitoring_started' },
  ], 'proctor')],
  ['student-denied-teacher-result', studentReadSpec()],
  ['submit-attempt', studentReadSpec()],
  ['teacher-read-submitted-result', readSpec('teacher-primary', 'teacher')],
  ['secondary-student-denied-primary-attempt', readSpec('student-secondary', 'student')],
  ['unrelated-teacher-denied-assignment-result', readSpec('teacher-unrelated', 'teacher')],
  ['verify-cross-account-boundaries', readSpec(null, null)],
]))

function readSpec(alias, role, targets = [], table = null) {
  return Object.freeze({
    alias,
    role,
    targets: Object.freeze(targets.map(target => Object.freeze(target))),
    table,
  })
}

function studentReadSpec(targets = [], table = null) {
  return readSpec('student-primary', 'student', targets, table)
}

const RUNTIME_STEP_IDS = new Set([
  'reject-invalid-seb-challenge', 'verify-seb-system-check',
  'reject-replayed-seb-challenge', 'reject-invalid-seb-session',
  'start-revision-bound-attempt', 'reject-replayed-seb-session',
  'autosave-synthetic-answer', 'retry-autosave-after-transient-failure',
  'resume-same-attempt', 'upload-synthetic-attachment',
  'retry-upload-after-transient-failure', 'record-proctor-heartbeat',
  'student-denied-teacher-result', 'submit-attempt',
  'teacher-read-submitted-result', 'secondary-student-denied-primary-attempt',
  'unrelated-teacher-denied-assignment-result', 'verify-cross-account-boundaries',
])
const ACCOUNT_REFERENCE = Object.freeze({
  schemaVersion: 1,
  targetKey: 'account-teacher-primary',
  kind: 'account',
})
const ACCOUNT_REFERENCES = Object.freeze(new Map([
  ['teacher-primary', ACCOUNT_REFERENCE],
  ['student-primary', Object.freeze({
    schemaVersion: 1,
    targetKey: 'account-student-primary',
    kind: 'account',
  })],
  ['student-secondary', Object.freeze({
    schemaVersion: 1,
    targetKey: 'account-student-secondary',
    kind: 'account',
  })],
  ['teacher-unrelated', Object.freeze({
    schemaVersion: 1,
    targetKey: 'account-teacher-unrelated',
    kind: 'account',
  })],
]))
const ORGANIZATION_REFERENCE = Object.freeze({
  schemaVersion: 1,
  targetKey: 'personal-organization-teacher-primary',
  kind: 'personalOrganization',
})
const CLASSROOM_REFERENCE = Object.freeze({
  schemaVersion: 1,
  targetKey: 'classroom-primary',
  kind: 'classroom',
})
const QUESTION_REFERENCES = Object.freeze([
  Object.freeze({ schemaVersion: 1, targetKey: 'question-written', kind: 'question' }),
  Object.freeze({ schemaVersion: 1, targetKey: 'question-upload', kind: 'question' }),
])
const ASSIGNMENT_REFERENCE = Object.freeze({
  schemaVersion: 1,
  targetKey: 'assignment-primary',
  kind: 'assignment',
})
const RELEASE_REFERENCE = Object.freeze({
  schemaVersion: 1,
  targetKey: 'release-primary',
  kind: 'release',
})
const CONFIG_REFERENCE = Object.freeze({
  schemaVersion: 1, targetKey: 'config-primary', kind: 'configRevision',
})
const CHECK_IN_REFERENCE = Object.freeze({
  schemaVersion: 1, targetKey: 'check-in-primary', kind: 'checkIn',
})
const SUBMISSION_REFERENCE = Object.freeze({
  schemaVersion: 1, targetKey: 'submission-primary', kind: 'submission',
})
const ANSWER_WRITTEN_REFERENCE = Object.freeze({
  schemaVersion: 1, targetKey: 'answer-written', kind: 'answer',
})
const ANSWER_UPLOAD_REFERENCE = Object.freeze({
  schemaVersion: 1, targetKey: 'answer-upload', kind: 'answer',
})
const ANSWER_STORAGE_REFERENCE = Object.freeze({
  schemaVersion: 1, targetKey: 'answer-storage', kind: 'answerStorageObject',
})
const LEDGER_METHODS = Object.freeze([
  'planTarget',
  'adoptDerivedTarget',
  'markUncertain',
  'commitTarget',
  'reconcileTarget',
  'readCleanupTarget',
  'markDeleted',
])
const DRIVER_FIELDS = Object.freeze([
  'supabaseUrl',
  'credentialKind',
  'enumerateDatabase',
  'deleteDatabase',
  'enumerateStorage',
  'deleteStorage',
  'close',
])
const UUID_PART = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const UUID = new RegExp(`^${UUID_PART}$`)
const UUID_PAIR = new RegExp(`^(${UUID_PART}):(${UUID_PART})$`)
const SAFE_NAMESPACE = /^qa:seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/

export class SebStagingPrivateClassroomDataBoundaryBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingPrivateClassroomDataBoundaryBlockedError'
  }
}

function blocked() {
  throw new SebStagingPrivateClassroomDataBoundaryBlockedError()
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

function hasOnlyFields(value, required) {
  return isDataRecord(value)
    && Object.keys(value).length === required.length
    && required.every(field => Object.hasOwn(value, field))
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

function validSignal(value) {
  try {
    return value instanceof AbortSignal && !value.aborted
  } catch {
    return false
  }
}

function exactOptions(value) {
  return Object.isFrozen(value)
    && hasExactFields(value, ['signal'])
    && validSignal(value.signal)
    ? value.signal
    : null
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
    ? Object.freeze({ timestamp, iso: new Date(timestamp).toISOString() })
    : null
}

function parseIdentity(value) {
  if (!hasExactFields(value, ['runId', 'sourceRevision', 'deploymentId', 'creationWindow'])
    || !hasExactFields(value.creationWindow, ['notBefore', 'notAfter'])) return null
  const notBefore = canonicalTimestamp(value.creationWindow.notBefore)
  const notAfter = canonicalTimestamp(value.creationWindow.notAfter)
  if (typeof value.runId !== 'string'
    || !SAFE_NAMESPACE.test(`qa:${value.runId}`)
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

function sameIdentity(value, identity) {
  return hasExactFields(value, ['runId', 'sourceRevision', 'deploymentId', 'creationWindow'])
    && hasExactFields(value.creationWindow, ['notBefore', 'notAfter'])
    && value.runId === identity.runId
    && value.sourceRevision === identity.sourceRevision
    && value.deploymentId === identity.deploymentId
    && value.creationWindow.notBefore === identity.creationWindow.notBefore
    && value.creationWindow.notAfter === identity.creationWindow.notAfter
}

function officialEnvironment(value, cleanup = false) {
  return isDataRecord(value)
    && value.KORKRU_DEPLOYMENT_ENV === 'staging'
    && value.EXAM_QA_ENVIRONMENT === 'staging'
    && value.VERCEL_ENV === 'preview'
    && value.NEXT_PUBLIC_SITE_URL === OFFICIAL_STAGING_SITE_ORIGIN
    && value.NEXT_PUBLIC_SUPABASE_URL === OFFICIAL_STAGING_SUPABASE_ORIGIN
    && value.EXAM_QA_DATA_POLICY === 'synthetic-only'
    && value.EXAM_QA_COPY_PRODUCTION_DATA === 'false'
    && (value.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'true'
      || (cleanup && value.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'false'))
}

function captureCapability(value, fields) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, fields)
    || !fields.every(field => typeof value[field] === 'function')) return null
  return Object.freeze({
    wrapper: value,
    methods: Object.freeze(Object.fromEntries(fields.map(field => [field, value[field]]))),
  })
}

function sameCapability(attestation, fields) {
  return attestation !== null
    && Object.isFrozen(attestation.wrapper)
    && hasExactFields(attestation.wrapper, fields)
    && fields.every(field => attestation.wrapper[field] === attestation.methods[field])
}

function captureDriver(value) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, DRIVER_FIELDS)
    || value.supabaseUrl !== OFFICIAL_STAGING_SUPABASE_ORIGIN
    || value.credentialKind !== 'service-role'
    || !DRIVER_FIELDS.slice(2).every(field => typeof value[field] === 'function')) return null
  return Object.freeze({
    wrapper: value,
    methods: Object.freeze(Object.fromEntries(
      DRIVER_FIELDS.slice(2).map(field => [field, value[field]]),
    )),
  })
}

function sameDriver(attestation) {
  return attestation !== null
    && Object.isFrozen(attestation.wrapper)
    && hasExactFields(attestation.wrapper, DRIVER_FIELDS)
    && attestation.wrapper.supabaseUrl === OFFICIAL_STAGING_SUPABASE_ORIGIN
    && attestation.wrapper.credentialKind === 'service-role'
    && DRIVER_FIELDS.slice(2).every(field => (
      attestation.wrapper[field] === attestation.methods[field]
    ))
}

function readSingleLedgerSnapshot(ledger, reference, validator) {
  const value = ledger.methods.readCleanupTarget.call(ledger.wrapper, reference)
  if (!Object.isFrozen(value)
    || !hasExactFields(value, ['status', 'state', 'snapshots'])
    || value.status !== 'passed'
    || value.state !== 'committed'
    || !Object.isFrozen(value.snapshots)
    || value.snapshots.length !== 1
    || !validator(value.snapshots[0])) blocked()
  return value.snapshots[0]
}

function validAccountSnapshot(value, identity, namespace, reference, role) {
  return Object.isFrozen(value)
    && hasExactFields(value, [
      'schemaVersion', 'targetKey', 'kind', 'identity', 'targetId', 'namespace',
      'ownerId', 'organizationId', 'resourceType', 'createdAt',
    ])
    && value.schemaVersion === 1
    && value.targetKey === reference.targetKey
    && value.kind === 'account'
    && sameIdentity(value.identity, identity)
    && UUID.test(value.targetId)
    && value.namespace === namespace
    && value.ownerId === null
    && value.organizationId === null
    && value.resourceType === role
    && canonicalTimestamp(value.createdAt) !== null
}

function validOrganizationSnapshot(value, identity, namespace, ownerId) {
  const ids = typeof value?.targetId === 'string' ? UUID_PAIR.exec(value.targetId) : null
  return Object.isFrozen(value)
    && hasExactFields(value, [
      'schemaVersion', 'targetKey', 'kind', 'identity', 'targetId', 'namespace',
      'ownerId', 'organizationId', 'resourceType', 'createdAt',
    ])
    && value.schemaVersion === 1
    && value.targetKey === ORGANIZATION_REFERENCE.targetKey
    && value.kind === 'personalOrganization'
    && sameIdentity(value.identity, identity)
    && ids !== null
    && value.namespace === namespace
    && value.ownerId === ownerId
    && value.organizationId === null
    && value.resourceType === 'personal'
    && canonicalTimestamp(value.createdAt) !== null
}

function validCommittedSnapshot(value, identity, namespace, reference) {
  return Object.isFrozen(value)
    && hasExactFields(value, [
      'schemaVersion', 'targetKey', 'kind', 'identity', 'targetId', 'namespace',
      'ownerId', 'organizationId', 'resourceType', 'createdAt',
    ])
    && value.schemaVersion === 1
    && value.targetKey === reference.targetKey
    && value.kind === reference.kind
    && sameIdentity(value.identity, identity)
    && value.namespace === namespace
    && canonicalTimestamp(value.createdAt) !== null
}

function exactBindingRequest(value, namespace) {
  const reference = ACCOUNT_REFERENCES.get(value?.alias)
  const role = value?.alias?.startsWith('teacher-') ? 'teacher' : 'student'
  return Object.isFrozen(value)
    && hasExactFields(value, ['schemaVersion', 'targetOrigin', 'namespace', 'alias', 'role'])
    && value.schemaVersion === 1
    && value.targetOrigin === OFFICIAL_STAGING_SITE_ORIGIN
    && value.namespace === namespace
    && reference !== undefined
    && value.role === role
}

function exactOperationRequest(value, identity, namespace, fields) {
  const spec = STEP_SPECS.get(value?.stepId)
  const alias = Object.hasOwn(spec ?? {}, 'alias') ? spec.alias : 'teacher-primary'
  return Object.isFrozen(value)
    && hasExactFields(value, fields)
    && value.schemaVersion === 1
    && value.targetOrigin === OFFICIAL_STAGING_SITE_ORIGIN
    && value.namespace === namespace
    && sameIdentity(value.identity, identity)
    && spec !== undefined
    && value.alias === alias
    && value.expectedUserId === (alias === null ? null : value.expectedUserId)
}

function validTarget(value, ownerId, organizationId, spec) {
  return Object.isFrozen(value)
    && hasExactFields(value, [
      'schemaVersion', 'targetKey', 'kind', 'ownerId', 'organizationId',
      'resourceType',
    ])
    && value.schemaVersion === 1
    && value.targetKey === spec.targetKey
    && value.kind === spec.kind
    && value.ownerId === ownerId
    && value.organizationId === organizationId
    && value.resourceType === spec.resourceType
}

function validTargets(value, ownerId, organizationId, specs) {
  return Object.isFrozen(value)
    && Array.isArray(value)
    && value.length === specs.length
    && value.every((target, index) => validTarget(
      target,
      ownerId,
      organizationId,
      specs[index],
    ))
}

/**
 * Service-role boundary for the concrete teacher setup selector slice. It
 * owns the raw query driver and returns only the resource-plan objects
 * expected by the public browser-data adapter.
 */
export function createSebStagingPrivateClassroomDataBoundary(options = {}) {
  if (!hasOnlyFields(options, [
    'namespace', 'identity', 'readEnvironment', 'privateRunLedger',
    'supabaseDriver',
  ])) blocked()
  const { namespace, identity: identityInput, readEnvironment, privateRunLedger, supabaseDriver } = options
  const identity = parseIdentity(identityInput)
  const ledger = captureCapability(privateRunLedger, LEDGER_METHODS)
  const driver = captureDriver(supabaseDriver)
  let initialEnvironment = null
  try { initialEnvironment = readEnvironment() } catch { blocked() }
  if (!identity
    || namespace !== `qa:${identity.runId}`
    || !SAFE_NAMESPACE.test(namespace)
    || typeof readEnvironment !== 'function'
    || !officialEnvironment(initialEnvironment)
    || !ledger
    || !driver) blocked()

  const bindings = new Map()
  let operation = null
  let answerMarker = null
  let busy = false
  let closeBusy = false
  let closed = false

  function assertStable(cleanup = false) {
    let value
    try { value = readEnvironment() } catch { blocked() }
    if (!officialEnvironment(value, cleanup)
      || !sameCapability(ledger, LEDGER_METHODS)
      || !sameDriver(driver)) blocked()
  }

  async function readAccountBinding(request, callOptions) {
    const signal = exactOptions(callOptions)
    if (!signal || busy || closed || !exactBindingRequest(request, namespace)) blocked()
    busy = true
    try {
      assertStable()
      const reference = ACCOUNT_REFERENCES.get(request.alias)
      const existing = bindings.get(request.alias)
      const account = readSingleLedgerSnapshot(
        ledger,
        reference,
        value => validAccountSnapshot(value, identity, namespace, reference, request.role),
      )
      const binding = freezeInput({
        schemaVersion: 1,
        targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
        namespace,
        alias: request.alias,
        role: request.role,
        expectedUserId: account.targetId,
      })
      if (existing && existing.expectedUserId !== binding.expectedUserId) blocked()
      if (!existing) bindings.set(request.alias, binding)
      return binding
    } finally {
      busy = false
    }
  }

  async function prepareOperation(request, callOptions) {
    const signal = exactOptions(callOptions)
    const spec = STEP_SPECS.get(request?.stepId)
    const alias = Object.hasOwn(spec ?? {}, 'alias') ? spec.alias : 'teacher-primary'
    const role = Object.hasOwn(spec ?? {}, 'role') ? spec.role : 'teacher'
    const binding = alias === null ? null : bindings.get(alias)
    const fields = [
      'schemaVersion', 'targetOrigin', 'namespace', 'identity', 'stepId', 'alias',
      'role', 'expectedUserId', 'marker',
    ]
    if (!signal
      || busy
      || closed
      || (alias !== null && !binding)
      || operation
      || !exactOperationRequest(request, identity, namespace, fields)
      || request.role !== role
      || request.expectedUserId !== (binding?.expectedUserId ?? null)
      || typeof request.marker !== 'string'
      || !/^SEB S5 seb-s5-[a-z0-9-]+ [a-f0-9]{24}$/.test(request.marker)) blocked()
    busy = true
    try {
      assertStable()
      const teacherBinding = bindings.get('teacher-primary')
      if (!teacherBinding) blocked()
      const organization = readSingleLedgerSnapshot(
        ledger,
        ORGANIZATION_REFERENCE,
        value => validOrganizationSnapshot(
          value,
          identity,
          namespace,
          teacherBinding.expectedUserId,
        ),
      )
      const organizationId = UUID_PAIR.exec(organization.targetId)[1]
      let classroomId = null
      let questionIds = []
      let assignmentId = null
      const createsAssignment = request.stepId === 'create-seb-assignment-draft-with-quit-password'
      const publishesAssignment = request.stepId === 'publish-seb-assignment'
      const isStudentJourney = spec.table === null
        || ['exam_seb_checkins', 'submissions', 'storage', 'proctor'].includes(spec.table)
      const needsClassroom = spec.kind === 'classroomMembership' || createsAssignment
      if (needsClassroom) {
        const classroom = readSingleLedgerSnapshot(
          ledger,
          CLASSROOM_REFERENCE,
          value => Object.isFrozen(value)
            && hasExactFields(value, [
              'schemaVersion', 'targetKey', 'kind', 'identity', 'targetId',
              'namespace', 'ownerId', 'organizationId', 'resourceType', 'createdAt',
            ])
            && value.schemaVersion === 1
            && value.targetKey === CLASSROOM_REFERENCE.targetKey
            && value.kind === CLASSROOM_REFERENCE.kind
            && sameIdentity(value.identity, identity)
            && UUID.test(value.targetId)
            && value.namespace === namespace
            && value.ownerId === teacherBinding.expectedUserId
            && value.organizationId === organizationId
            && value.resourceType === 'subject'
            && canonicalTimestamp(value.createdAt) !== null,
        )
        classroomId = classroom.targetId
      }
      if (createsAssignment) {
        questionIds = QUESTION_REFERENCES.map(reference => readSingleLedgerSnapshot(
          ledger,
          reference,
          value => Object.isFrozen(value)
            && hasExactFields(value, [
              'schemaVersion', 'targetKey', 'kind', 'identity', 'targetId',
              'namespace', 'ownerId', 'organizationId', 'resourceType', 'createdAt',
            ])
            && value.schemaVersion === 1
            && value.targetKey === reference.targetKey
            && value.kind === 'question'
            && sameIdentity(value.identity, identity)
            && UUID.test(value.targetId)
            && value.namespace === namespace
            && value.ownerId === teacherBinding.expectedUserId
            && value.organizationId === organizationId
            && ['essay', 'file_upload'].includes(value.resourceType)
            && canonicalTimestamp(value.createdAt) !== null,
        ).targetId)
      }
      if (publishesAssignment) {
        const assignment = readSingleLedgerSnapshot(
          ledger,
          ASSIGNMENT_REFERENCE,
          value => Object.isFrozen(value)
            && hasExactFields(value, [
              'schemaVersion', 'targetKey', 'kind', 'identity', 'targetId',
              'namespace', 'ownerId', 'organizationId', 'resourceType', 'createdAt',
            ])
            && value.schemaVersion === 1
            && value.targetKey === ASSIGNMENT_REFERENCE.targetKey
            && value.kind === ASSIGNMENT_REFERENCE.kind
            && sameIdentity(value.identity, identity)
            && UUID.test(value.targetId)
            && value.namespace === namespace
            && value.ownerId === teacherBinding.expectedUserId
            && value.organizationId === organizationId
            && value.resourceType === 'exam'
            && canonicalTimestamp(value.createdAt) !== null,
        )
        readSingleLedgerSnapshot(
          ledger,
          RELEASE_REFERENCE,
          value => Object.isFrozen(value)
            && hasExactFields(value, [
              'schemaVersion', 'targetKey', 'kind', 'identity', 'targetId',
              'namespace', 'ownerId', 'organizationId', 'resourceType', 'createdAt',
            ])
            && value.schemaVersion === 1
            && value.targetKey === RELEASE_REFERENCE.targetKey
            && value.kind === RELEASE_REFERENCE.kind
            && sameIdentity(value.identity, identity)
            && typeof value.targetId === 'string'
            && value.targetId.startsWith('asr-')
            && value.namespace === namespace
            && value.ownerId === teacherBinding.expectedUserId
            && value.organizationId === organizationId
            && value.resourceType === 'test_plaintext'
            && canonicalTimestamp(value.createdAt) !== null,
        )
        assignmentId = assignment.targetId
      }
      const committed = new Map()
      if (isStudentJourney) {
        for (const reference of [
          ASSIGNMENT_REFERENCE, CONFIG_REFERENCE, RELEASE_REFERENCE,
          CHECK_IN_REFERENCE, SUBMISSION_REFERENCE, ANSWER_WRITTEN_REFERENCE,
          ANSWER_UPLOAD_REFERENCE, ANSWER_STORAGE_REFERENCE,
        ]) {
          try {
            const snapshot = readSingleLedgerSnapshot(
              ledger,
              reference,
              value => validCommittedSnapshot(value, identity, namespace, reference),
            )
            committed.set(reference.targetKey, snapshot)
          } catch {
            // A guard created later in the journey is intentionally absent.
          }
        }
        const assignment = committed.get('assignment-primary')
        if (!assignment || !UUID.test(assignment.targetId)) blocked()
        assignmentId = assignment.targetId
      }
      const targetSpecs = spec.targets ?? [spec]
      const targets = freezeInput(targetSpecs.map(targetSpec => ({
        schemaVersion: 1,
        targetKey: targetSpec.targetKey,
        kind: targetSpec.kind,
        ownerId: binding?.expectedUserId ?? teacherBinding.expectedUserId,
        organizationId,
        resourceType: targetSpec.resourceType,
      })))
      operation = Object.freeze({
        marker: request.marker,
        target: targets[0],
        targets,
        stepId: request.stepId,
        spec,
        binding,
        organizationId,
        classroomId,
        assignmentId,
        questionIds: Object.freeze(questionIds),
        committed,
      })
      return freezeInput({
        schemaVersion: 1,
        targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
        namespace,
        stepId: request.stepId,
        alias,
        role,
        expectedUserId: binding?.expectedUserId ?? null,
        targets,
      })
    } finally {
      busy = false
    }
  }

  async function enumerateOperation(signal, { cleanup = false } = {}) {
    assertStable(cleanup)
    const binding = operation.binding
    const questionType = operation.spec.resourceType === 'essay'
      ? 'written'
      : operation.spec.resourceType
    const columns = operation.spec.table === 'classrooms'
      ? [
          'id', 'teacher_id', 'org_id', 'classroom_type', 'name', 'description',
          'created_at',
        ]
      : operation.spec.table === 'questions'
        ? [
          'id', 'created_by', 'org_id', 'question_type', 'title', 'question_text',
          'created_at',
        ]
        : ['id', 'classroom_id', 'student_id', 'joined_at']
    const predicates = operation.spec.table === 'classrooms'
      ? [
          { column: 'teacher_id', operator: 'eq', value: binding.expectedUserId },
          { column: 'org_id', operator: 'eq', value: operation.target.organizationId },
          { column: 'classroom_type', operator: 'eq', value: 'subject' },
          { column: 'name', operator: 'eq', value: operation.marker },
          { column: 'created_at', operator: 'gte', value: identity.creationWindow.notBefore },
          { column: 'created_at', operator: 'lte', value: identity.creationWindow.notAfter },
        ]
      : operation.spec.table === 'questions'
        ? [
          { column: 'created_by', operator: 'eq', value: binding.expectedUserId },
          { column: 'org_id', operator: 'eq', value: operation.target.organizationId },
          { column: 'question_type', operator: 'eq', value: questionType },
          { column: 'title', operator: 'eq', value: operation.marker },
          { column: 'created_at', operator: 'gte', value: identity.creationWindow.notBefore },
          { column: 'created_at', operator: 'lte', value: identity.creationWindow.notAfter },
        ]
        : [
            { column: 'classroom_id', operator: 'eq', value: operation.classroomId },
            { column: 'student_id', operator: 'eq', value: binding.expectedUserId },
            { column: 'joined_at', operator: 'gte', value: identity.creationWindow.notBefore },
            { column: 'joined_at', operator: 'lte', value: identity.creationWindow.notAfter },
          ]
    const result = await driver.methods.enumerateDatabase.call(
      driver.wrapper,
      freezeInput({
        schemaVersion: 1,
        operationId: `attest:${operation.stepId}`,
        table: operation.spec.table,
        columns,
        predicates,
        limit: 2,
      }),
      Object.freeze({ signal }),
    )
    assertStable(cleanup)
    if (!Object.isFrozen(result)
      || !hasExactFields(result, ['rows'])
      || !Object.isFrozen(result.rows)
      || result.rows.length > 1) blocked()
    if (result.rows.length === 0) return null
    const row = result.rows[0]
    const createdAt = canonicalTimestamp(
      operation.spec.table === 'classroom_students' ? row?.joined_at : row?.created_at,
    )
    const commonValid = Object.isFrozen(row)
      && hasExactFields(row, columns)
      && UUID.test(row.id)
      && createdAt
      && createdAt.timestamp >= Date.parse(identity.creationWindow.notBefore)
      && createdAt.timestamp <= Date.parse(identity.creationWindow.notAfter)
    const resourceValid = operation.spec.table === 'classrooms'
      ? row.org_id === operation.target.organizationId
        && row.teacher_id === binding.expectedUserId
        && row.classroom_type === 'subject'
        && row.name === operation.marker
        && row.description === `Synthetic-only SEB Staging fixture ${operation.marker}`
      : operation.spec.table === 'questions'
        ? row.org_id === operation.target.organizationId
          && row.created_by === binding.expectedUserId
          && row.question_type === questionType
          && row.title === operation.marker
          && typeof row.question_text === 'string'
          && row.question_text.includes(`Synthetic-only SEB Staging fixture ${operation.marker}`)
        : row.classroom_id === operation.classroomId
          && row.student_id === binding.expectedUserId
    if (!commonValid || !resourceValid) blocked()
    return Object.freeze({ row, createdAt: createdAt.iso })
  }

  async function enumerateAssignment(signal, { cleanup = false } = {}) {
    assertStable(cleanup)
    const binding = operation.binding
    const assignmentColumns = [
      'id', 'classroom_id', 'created_by', 'org_id', 'type', 'status', 'title',
      'description', 'secure_browser_mode', 'question_ids', 'created_at',
    ]
    const assignments = await driver.methods.enumerateDatabase.call(
      driver.wrapper,
      freezeInput({
        schemaVersion: 1,
        operationId: `attest:${operation.stepId}:assignment`,
        table: 'assignments',
        columns: assignmentColumns,
        predicates: [
          { column: 'created_by', operator: 'eq', value: binding.expectedUserId },
          { column: 'org_id', operator: 'eq', value: operation.target.organizationId },
          { column: 'type', operator: 'eq', value: 'exam' },
          { column: 'secure_browser_mode', operator: 'eq', value: 'seb_required' },
          { column: 'title', operator: 'eq', value: operation.marker },
          { column: 'created_at', operator: 'gte', value: identity.creationWindow.notBefore },
          { column: 'created_at', operator: 'lte', value: identity.creationWindow.notAfter },
        ],
        limit: 2,
      }),
      Object.freeze({ signal }),
    )
    assertStable(cleanup)
    if (!Object.isFrozen(assignments)
      || !hasExactFields(assignments, ['rows'])
      || !Object.isFrozen(assignments.rows)
      || assignments.rows.length > 1) blocked()
    if (assignments.rows.length === 0) return null
    const assignment = assignments.rows[0]
    const assignmentCreatedAt = canonicalTimestamp(assignment?.created_at)
    if (!Object.isFrozen(assignment)
      || !hasExactFields(assignment, assignmentColumns)
      || !UUID.test(assignment.id)
      || assignment.classroom_id !== operation.classroomId
      || assignment.created_by !== binding.expectedUserId
      || assignment.org_id !== operation.target.organizationId
      || assignment.type !== 'exam'
      || assignment.status !== 'draft'
      || assignment.title !== operation.marker
      || assignment.description !== `Synthetic-only SEB Staging fixture ${operation.marker}`
      || assignment.secure_browser_mode !== 'seb_required'
      || !Array.isArray(assignment.question_ids)
      || assignment.question_ids.length !== 2
      || !operation.questionIds.every(id => assignment.question_ids.includes(id))
      || !assignmentCreatedAt
      || assignmentCreatedAt.timestamp < Date.parse(identity.creationWindow.notBefore)
      || assignmentCreatedAt.timestamp > Date.parse(identity.creationWindow.notAfter)) blocked()

    const configColumns = ['assignment_id', 'revision', 'org_id', 'owner_id', 'created_at']
    const configs = await driver.methods.enumerateDatabase.call(
      driver.wrapper,
      freezeInput({
        schemaVersion: 1,
        operationId: `attest:${operation.stepId}:config`,
        table: 'assignment_seb_config_revisions',
        columns: configColumns,
        predicates: [
          { column: 'assignment_id', operator: 'eq', value: assignment.id },
          { column: 'owner_id', operator: 'eq', value: binding.expectedUserId },
          { column: 'org_id', operator: 'eq', value: operation.target.organizationId },
          { column: 'created_at', operator: 'gte', value: identity.creationWindow.notBefore },
          { column: 'created_at', operator: 'lte', value: identity.creationWindow.notAfter },
        ],
        limit: 2,
      }),
      Object.freeze({ signal }),
    )
    assertStable(cleanup)
    if (!Object.isFrozen(configs)
      || !hasExactFields(configs, ['rows'])
      || !Object.isFrozen(configs.rows)
      || configs.rows.length > 1) blocked()
    if (configs.rows.length === 0) return null
    const config = configs.rows[0]
    const configCreatedAt = canonicalTimestamp(config?.created_at)
    if (!Object.isFrozen(config)
      || !hasExactFields(config, configColumns)
      || config.assignment_id !== assignment.id
      || !Number.isInteger(config.revision)
      || config.revision < 1
      || config.revision > 9_999_999_999
      || config.org_id !== operation.target.organizationId
      || config.owner_id !== binding.expectedUserId
      || !configCreatedAt
      || configCreatedAt.timestamp < Date.parse(identity.creationWindow.notBefore)
      || configCreatedAt.timestamp > Date.parse(identity.creationWindow.notAfter)) blocked()
    return Object.freeze({
      assignment: Object.freeze({ row: assignment, createdAt: assignmentCreatedAt.iso }),
      config: Object.freeze({ row: config, createdAt: configCreatedAt.iso }),
    })
  }

  async function enumeratePublishedAssignment(signal, { cleanup = false } = {}) {
    assertStable(cleanup)
    const columns = ['id', 'created_by', 'org_id', 'type', 'status', 'secure_browser_mode']
    const result = await driver.methods.enumerateDatabase.call(
      driver.wrapper,
      freezeInput({
        schemaVersion: 1,
        operationId: `attest:${operation.stepId}:published`,
        table: 'assignments',
        columns,
        predicates: [
          { column: 'id', operator: 'eq', value: operation.assignmentId },
          { column: 'created_by', operator: 'eq', value: operation.binding.expectedUserId },
          { column: 'org_id', operator: 'eq', value: operation.organizationId },
          { column: 'type', operator: 'eq', value: 'exam' },
          { column: 'secure_browser_mode', operator: 'eq', value: 'seb_required' },
        ],
        limit: 2,
      }),
      Object.freeze({ signal }),
    )
    assertStable(cleanup)
    if (!Object.isFrozen(result)
      || !hasExactFields(result, ['rows'])
      || !Object.isFrozen(result.rows)
      || result.rows.length > 1) blocked()
    if (result.rows.length === 0) return null
    const row = result.rows[0]
    if (!Object.isFrozen(row)
      || !hasExactFields(row, columns)
      || row.id !== operation.assignmentId
      || row.created_by !== operation.binding.expectedUserId
      || row.org_id !== operation.organizationId
      || row.type !== 'exam'
      || row.secure_browser_mode !== 'seb_required'
      || !['draft', 'published'].includes(row.status)) blocked()
    return row
  }

  async function databaseRows(signal, table, columns, predicates, suffix, limit = 4) {
    const result = await driver.methods.enumerateDatabase.call(
      driver.wrapper,
      freezeInput({
        schemaVersion: 1,
        operationId: `attest:${operation.stepId}:${suffix}`,
        table,
        columns,
        predicates,
        limit,
      }),
      Object.freeze({ signal }),
    )
    assertStable()
    if (!Object.isFrozen(result)
      || !hasExactFields(result, ['rows'])
      || !Object.isFrozen(result.rows)
      || result.rows.length >= limit) blocked()
    return result.rows
  }

  function committedTarget(key, kind) {
    const value = operation.committed.get(key)
    if (!value || value.kind !== kind) blocked()
    return value
  }

  function targetMatch(targetSpec, row, createdAt, parentId = null, relatedIds = []) {
    const timestamp = canonicalTimestamp(createdAt)
    if (!timestamp) blocked()
    return freezeInput({
      targetKey: targetSpec.targetKey,
      kind: targetSpec.kind,
      matches: [{
        targetId: row.id,
        createdAt: timestamp.iso,
        ownerId: operation.binding.expectedUserId,
        organizationId: operation.organizationId,
        resourceType: targetSpec.resourceType,
        parentId,
        relatedIds,
      }],
    })
  }

  async function attestStudentOperation(signal) {
    const stepId = operation.stepId
    const studentId = operation.binding?.expectedUserId
    const assignmentId = operation.assignmentId
    if (!UUID.test(assignmentId)) blocked()
    if (['student-denied-teacher-result', 'secondary-student-denied-primary-attempt',
      'unrelated-teacher-denied-assignment-result', 'verify-cross-account-boundaries']
      .includes(stepId)) return []
    if (!studentId || !UUID.test(studentId)) blocked()

    if (stepId === 'verify-seb-system-check') {
      const columns = ['assignment_id', 'student_id', 'org_id', 'platform', 'verified_at']
      const rows = await databaseRows(signal, 'exam_seb_checkins', columns, [
        { column: 'assignment_id', operator: 'eq', value: assignmentId },
        { column: 'student_id', operator: 'eq', value: studentId },
        { column: 'org_id', operator: 'eq', value: operation.organizationId },
      ], 'check-in', 2)
      if (rows.length !== 1) blocked()
      const row = rows[0]
      if (!Object.isFrozen(row) || !hasExactFields(row, columns)
        || row.assignment_id !== assignmentId
        || row.student_id !== studentId
        || row.org_id !== operation.organizationId
        || row.platform !== 'windows') blocked()
      return [targetMatch(operation.spec.targets[0], {
        id: `${assignmentId}:${studentId}`,
      }, row.verified_at, assignmentId)]
    }

    if (stepId === 'start-revision-bound-attempt') {
      const submissionColumns = [
        'id', 'assignment_id', 'student_id', 'org_id', 'secure_browser_verified_at',
        'secure_browser_platform', 'seb_config_revision', 'status', 'submitted_at', 'created_at',
      ]
      const submissions = await databaseRows(signal, 'submissions', submissionColumns, [
        { column: 'assignment_id', operator: 'eq', value: assignmentId },
        { column: 'student_id', operator: 'eq', value: studentId },
        { column: 'org_id', operator: 'eq', value: operation.organizationId },
      ], 'submission', 2)
      if (submissions.length !== 1) blocked()
      const submission = submissions[0]
      if (!Object.isFrozen(submission) || !hasExactFields(submission, submissionColumns)
        || !UUID.test(submission.id)
        || submission.assignment_id !== assignmentId
        || submission.student_id !== studentId
        || submission.org_id !== operation.organizationId
        || submission.secure_browser_platform !== 'windows'
        || !canonicalTimestamp(submission.secure_browser_verified_at)
        || !Number.isInteger(submission.seb_config_revision)
        || !['in_progress', 'started'].includes(submission.status)
        || submission.submitted_at !== null) blocked()
      const answerColumns = ['id', 'submission_id', 'question_id', 'org_id', 'student_answer', 'created_at']
      const answers = await databaseRows(signal, 'submission_answers', answerColumns, [
        { column: 'submission_id', operator: 'eq', value: submission.id },
        { column: 'org_id', operator: 'eq', value: operation.organizationId },
      ], 'answers', 3)
      if (answers.length !== 2 || answers.some(row => (
        !Object.isFrozen(row) || !hasExactFields(row, answerColumns)
        || !UUID.test(row.id) || !UUID.test(row.question_id)
        || row.submission_id !== submission.id || row.org_id !== operation.organizationId
      ))) blocked()
      const questionIds = QUESTION_REFERENCES.map(reference => readSingleLedgerSnapshot(
        ledger,
        reference,
        value => validCommittedSnapshot(value, identity, namespace, reference),
      ).targetId)
      if (!questionIds.every(id => answers.some(row => row.question_id === id))) blocked()
      const essayQuestionId = questionIds[0]
      const uploadQuestionId = questionIds[1]
      const essay = answers.find(row => row.question_id === essayQuestionId)
      const upload = answers.find(row => row.question_id === uploadQuestionId)
      return [
        targetMatch(operation.spec.targets[0], submission, submission.created_at, assignmentId, questionIds),
        targetMatch(operation.spec.targets[1], essay, essay.created_at, submission.id, [essayQuestionId]),
        targetMatch(operation.spec.targets[2], upload, upload.created_at, submission.id, [uploadQuestionId]),
      ]
    }

    const submission = committedTarget('submission-primary', 'submission')
    if (stepId === 'upload-synthetic-attachment') {
      const uploadAnswer = committedTarget('answer-upload', 'answer')
      const rows = await databaseRows(
        signal,
        'submission_answers',
        ['id', 'submission_id', 'question_id', 'org_id', 'student_answer', 'created_at'],
        [
          { column: 'id', operator: 'eq', value: uploadAnswer.targetId },
          { column: 'submission_id', operator: 'eq', value: submission.targetId },
          { column: 'org_id', operator: 'eq', value: operation.organizationId },
        ],
        'upload-answer',
        2,
      )
      if (rows.length !== 1) blocked()
      let files
      try { files = JSON.parse(rows[0].student_answer) } catch { blocked() }
      if (!Array.isArray(files) || files.length !== 1
        || typeof files[0]?.url !== 'string'
        || typeof files[0]?.name !== 'string') blocked()
      const path = files[0].url.split('/submission-files/').at(-1)
      if (typeof path !== 'string' || !path.includes('/')) blocked()
      const storage = await driver.methods.enumerateStorage.call(
        driver.wrapper,
        freezeInput({
          schemaVersion: 1,
          operationId: `attest:${stepId}:storage`,
          bucketName: 'submission-files',
          path,
          limit: 2,
        }),
        Object.freeze({ signal }),
      )
      assertStable()
      if (!Object.isFrozen(storage) || !hasExactFields(storage, ['objects'])
        || !Object.isFrozen(storage.objects) || storage.objects.length !== 1) blocked()
      const object = storage.objects[0]
      if (!Object.isFrozen(object)
        || !hasExactFields(object, [
          'bucketName', 'path', 'ownerId', 'createdAt', 'sizeBytes', 'mimeType',
        ])
        || object.bucketName !== 'submission-files'
        || object.path !== path
        || object.ownerId !== studentId
        || object.sizeBytes <= 0
        || object.mimeType !== 'application/pdf') blocked()
      return [targetMatch(operation.spec.targets[0], {
        id: path,
      }, object.createdAt, uploadAnswer.targetId, [submission.targetId])]
    }

    if (stepId === 'record-proctor-heartbeat') {
      const connectionColumns = [
        'submission_id', 'client_instance_id', 'assignment_id', 'student_id', 'org_id', 'connected_at',
      ]
      const connections = await databaseRows(signal, 'exam_proctor_connections', connectionColumns, [
        { column: 'submission_id', operator: 'eq', value: submission.targetId },
        { column: 'assignment_id', operator: 'eq', value: assignmentId },
        { column: 'student_id', operator: 'eq', value: studentId },
        { column: 'org_id', operator: 'eq', value: operation.organizationId },
      ], 'proctor-connection', 2)
      const eventColumns = [
        'id', 'submission_id', 'assignment_id', 'student_id', 'org_id', 'event_type', 'created_at',
      ]
      const events = await databaseRows(signal, 'exam_proctor_events', eventColumns, [
        { column: 'submission_id', operator: 'eq', value: submission.targetId },
        { column: 'assignment_id', operator: 'eq', value: assignmentId },
        { column: 'student_id', operator: 'eq', value: studentId },
        { column: 'org_id', operator: 'eq', value: operation.organizationId },
        { column: 'event_type', operator: 'eq', value: 'monitoring_started' },
      ], 'proctor-event', 2)
      if (connections.length !== 1 || events.length !== 1
        || !UUID.test(events[0].id)
        || typeof connections[0].client_instance_id !== 'string') blocked()
      return [
        targetMatch(operation.spec.targets[0], {
          id: `${connections[0].submission_id}:${connections[0].client_instance_id}`,
        }, connections[0].connected_at, submission.targetId),
        targetMatch(operation.spec.targets[1], events[0], events[0].created_at, submission.targetId),
      ]
    }

    if (['autosave-synthetic-answer', 'retry-autosave-after-transient-failure',
      'resume-same-attempt'].includes(stepId)) {
      const answer = committedTarget('answer-written', 'answer')
      const columns = ['id', 'submission_id', 'question_id', 'org_id', 'student_answer', 'created_at']
      const rows = await databaseRows(signal, 'submission_answers', columns, [
        { column: 'id', operator: 'eq', value: answer.targetId },
        { column: 'submission_id', operator: 'eq', value: submission.targetId },
        { column: 'org_id', operator: 'eq', value: operation.organizationId },
      ], 'written-answer', 2)
      if (rows.length !== 1
        || rows[0].student_answer !== (stepId === 'resume-same-attempt'
          ? answerMarker
          : operation.marker)) blocked()
      if (stepId !== 'resume-same-attempt') answerMarker = operation.marker
    }

    if (stepId === 'submit-attempt' || stepId === 'teacher-read-submitted-result') {
      const columns = [
        'id', 'assignment_id', 'student_id', 'org_id', 'secure_browser_verified_at',
        'secure_browser_platform', 'seb_config_revision', 'status', 'submitted_at', 'created_at',
      ]
      const rows = await databaseRows(signal, 'submissions', columns, [
        { column: 'id', operator: 'eq', value: submission.targetId },
        { column: 'assignment_id', operator: 'eq', value: assignmentId },
        { column: 'student_id', operator: 'eq', value: submission.ownerId },
        { column: 'org_id', operator: 'eq', value: operation.organizationId },
      ], 'submitted', 2)
      if (rows.length !== 1 || rows[0].status !== 'submitted'
        || !canonicalTimestamp(rows[0].submitted_at)) blocked()
    }
    return []
  }

  async function attestOperation(request, callOptions) {
    const signal = exactOptions(callOptions)
    const binding = operation?.binding
    const multiple = operation?.targets?.length !== 1
    const targetSpec = operation?.targets?.length === 1
      ? (operation.spec.targets?.[0] ?? operation.spec)
      : null
    const fields = [
      'schemaVersion', 'targetOrigin', 'namespace', 'identity', 'stepId', 'alias',
      'expectedUserId', 'marker', multiple ? 'targets' : 'target',
    ]
    if (!signal
      || busy
      || closed
      || (operation?.spec?.alias !== null && !binding)
      || !operation
      || !exactOperationRequest(request, identity, namespace, fields)
      || request.expectedUserId !== (binding?.expectedUserId ?? null)
      || request.marker !== operation.marker
      || (multiple
        ? !validTargets(
          request.targets,
          binding?.expectedUserId ?? operation.targets[0]?.ownerId,
          operation.organizationId,
          operation.spec.targets,
        )
        : !validTarget(
          request.target,
          binding?.expectedUserId ?? operation.target?.ownerId,
          operation.target.organizationId,
          targetSpec,
        ))) blocked()
    busy = true
    try {
      if (RUNTIME_STEP_IDS.has(operation.stepId)) {
        const matches = await attestStudentOperation(signal)
        const response = freezeInput({
          schemaVersion: 1,
          stepId: operation.stepId,
          status: 'passed',
          targets: matches,
        })
        operation = null
        return response
      }
      if (operation.stepId === 'publish-seb-assignment') {
        const match = await enumeratePublishedAssignment(signal)
        if (!match || match.status !== 'published') blocked()
        operation = null
        return freezeInput({
          schemaVersion: 1,
          stepId: 'publish-seb-assignment',
          status: 'passed',
          targets: [],
        })
      }
      if (multiple) {
        const match = await enumerateAssignment(signal)
        if (!match) blocked()
        const response = freezeInput({
          schemaVersion: 1,
          stepId: operation.stepId,
          status: 'passed',
          targets: [
            {
              targetKey: operation.spec.targets[0].targetKey,
              kind: operation.spec.targets[0].kind,
              matches: [{
                targetId: match.assignment.row.id,
                createdAt: match.assignment.createdAt,
                ownerId: binding.expectedUserId,
                organizationId: operation.target.organizationId,
                resourceType: operation.spec.targets[0].resourceType,
                parentId: operation.classroomId,
                relatedIds: [...operation.questionIds],
              }],
            },
            {
              targetKey: operation.spec.targets[1].targetKey,
              kind: operation.spec.targets[1].kind,
              matches: [{
                targetId: `${match.config.row.assignment_id}:r${match.config.row.revision}`,
                createdAt: match.config.createdAt,
                ownerId: binding.expectedUserId,
                organizationId: operation.target.organizationId,
                resourceType: operation.spec.targets[1].resourceType,
                parentId: match.assignment.row.id,
                relatedIds: [],
              }],
            },
          ],
        })
        operation = null
        return response
      }
      const match = await enumerateOperation(signal)
      if (!match) blocked()
      const response = freezeInput({
        schemaVersion: 1,
        stepId: operation.stepId,
        status: 'passed',
        targets: [{
          targetKey: operation.spec.targetKey,
          kind: operation.spec.kind,
          matches: [{
            targetId: match.row.id,
            createdAt: match.createdAt,
            ownerId: binding.expectedUserId,
            organizationId: operation.target.organizationId,
            resourceType: operation.spec.resourceType,
            parentId: operation.classroomId,
            relatedIds: [],
          }],
        }],
      })
      operation = null
      return response
    } finally {
      busy = false
    }
  }

  async function abortOperation(request, callOptions) {
    const signal = exactOptions(callOptions)
    const binding = operation?.binding
    const multiple = operation?.targets?.length !== 1
    const targetSpec = operation?.targets?.length === 1
      ? (operation.spec.targets?.[0] ?? operation.spec)
      : null
    const fields = [
      'schemaVersion', 'targetOrigin', 'namespace', 'identity', 'stepId', 'alias',
      'expectedUserId', 'marker', multiple ? 'targets' : 'target',
    ]
    if (!signal
      || busy
      || closed
      || (operation?.spec?.alias !== null && !binding)
      || !operation
      || !exactOperationRequest(request, identity, namespace, fields)
      || request.expectedUserId !== (binding?.expectedUserId ?? null)
      || request.marker !== operation.marker
      || (multiple
        ? !validTargets(
          request.targets,
          binding?.expectedUserId ?? operation.targets[0]?.ownerId,
          operation.organizationId,
          operation.spec.targets,
        )
        : !validTarget(
          request.target,
          binding?.expectedUserId ?? operation.target?.ownerId,
          operation.target.organizationId,
          targetSpec,
        ))) blocked()
    busy = true
    try {
      // Zero exact matches means the browser failed before persistence. One
      // exact match is retained as an outer-ledger cleanup obligation. More
      // than one can never be safely attributed and is blocked by enumeration.
      if (RUNTIME_STEP_IDS.has(operation.stepId)) {
        // Student/read operations either use previously committed guards or
        // reconcile their concrete target rows through the outer run ledger.
      } else if (operation.stepId === 'publish-seb-assignment') {
        await enumeratePublishedAssignment(signal, { cleanup: true })
      } else if (multiple) await enumerateAssignment(signal, { cleanup: true })
      else await enumerateOperation(signal, { cleanup: true })
      return passed()
    } finally {
      busy = false
    }
  }

  async function closeAll() {
    if (closed) return passed()
    if (closeBusy || busy) return Object.freeze({ status: 'failed' })
    closeBusy = true
    try {
      try {
        assertStable(true)
        const controller = new AbortController()
        const result = await driver.methods.close.call(
          driver.wrapper,
          Object.freeze({ signal: controller.signal }),
        )
        if (!Object.isFrozen(result)
          || !hasExactFields(result, ['status'])
          || result.status !== 'passed'
          || !sameDriver(driver)) return Object.freeze({ status: 'failed' })
      } catch {
        return Object.freeze({ status: 'failed' })
      }
      bindings.clear()
      answerMarker = null
      operation = null
      closed = true
      return passed()
    } finally {
      closeBusy = false
    }
  }

  return Object.freeze({
    readAccountBinding,
    prepareOperation,
    attestOperation,
    abortOperation,
    closeAll,
  })
}
