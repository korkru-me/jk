const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const BLOCKED_MESSAGE = 'SEB Staging private classroom data boundary blocked'
const STEP_ID = 'create-subject-classroom'
const ACCOUNT_REFERENCE = Object.freeze({
  schemaVersion: 1,
  targetKey: 'account-teacher-primary',
  kind: 'account',
})
const ORGANIZATION_REFERENCE = Object.freeze({
  schemaVersion: 1,
  targetKey: 'personal-organization-teacher-primary',
  kind: 'personalOrganization',
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

function validAccountSnapshot(value, identity, namespace) {
  return Object.isFrozen(value)
    && hasExactFields(value, [
      'schemaVersion', 'targetKey', 'kind', 'identity', 'targetId', 'namespace',
      'ownerId', 'organizationId', 'resourceType', 'createdAt',
    ])
    && value.schemaVersion === 1
    && value.targetKey === ACCOUNT_REFERENCE.targetKey
    && value.kind === 'account'
    && sameIdentity(value.identity, identity)
    && UUID.test(value.targetId)
    && value.namespace === namespace
    && value.ownerId === null
    && value.organizationId === null
    && value.resourceType === 'teacher'
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

function exactBindingRequest(value, namespace) {
  return Object.isFrozen(value)
    && hasExactFields(value, ['schemaVersion', 'targetOrigin', 'namespace', 'alias', 'role'])
    && value.schemaVersion === 1
    && value.targetOrigin === OFFICIAL_STAGING_SITE_ORIGIN
    && value.namespace === namespace
    && value.alias === 'teacher-primary'
    && value.role === 'teacher'
}

function exactOperationRequest(value, identity, namespace, fields) {
  return Object.isFrozen(value)
    && hasExactFields(value, fields)
    && value.schemaVersion === 1
    && value.targetOrigin === OFFICIAL_STAGING_SITE_ORIGIN
    && value.namespace === namespace
    && sameIdentity(value.identity, identity)
    && value.stepId === STEP_ID
    && value.alias === 'teacher-primary'
    && value.expectedUserId !== undefined
}

function validTarget(value, ownerId, organizationId) {
  return Object.isFrozen(value)
    && hasExactFields(value, [
      'schemaVersion', 'targetKey', 'kind', 'ownerId', 'organizationId',
      'resourceType',
    ])
    && value.schemaVersion === 1
    && value.targetKey === 'classroom-primary'
    && value.kind === 'classroom'
    && value.ownerId === ownerId
    && value.organizationId === organizationId
    && value.resourceType === 'subject'
}

/**
 * Classroom-only service-role boundary for the first concrete S5 selector
 * slice. It owns the raw query driver and returns only the resource-plan
 * objects expected by the public browser-data adapter.
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

  let binding = null
  let operation = null
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
    if (!signal || busy || closed || binding || !exactBindingRequest(request, namespace)) blocked()
    busy = true
    try {
      assertStable()
      const account = readSingleLedgerSnapshot(
        ledger,
        ACCOUNT_REFERENCE,
        value => validAccountSnapshot(value, identity, namespace),
      )
      binding = freezeInput({
        schemaVersion: 1,
        targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
        namespace,
        alias: 'teacher-primary',
        role: 'teacher',
        expectedUserId: account.targetId,
      })
      return binding
    } finally {
      busy = false
    }
  }

  async function prepareOperation(request, callOptions) {
    const signal = exactOptions(callOptions)
    const fields = [
      'schemaVersion', 'targetOrigin', 'namespace', 'identity', 'stepId', 'alias',
      'role', 'expectedUserId', 'marker',
    ]
    if (!signal
      || busy
      || closed
      || !binding
      || operation
      || !exactOperationRequest(request, identity, namespace, fields)
      || request.role !== 'teacher'
      || request.expectedUserId !== binding.expectedUserId
      || typeof request.marker !== 'string'
      || !/^SEB S5 seb-s5-[a-z0-9-]+ [a-f0-9]{24}$/.test(request.marker)) blocked()
    busy = true
    try {
      assertStable()
      const organization = readSingleLedgerSnapshot(
        ledger,
        ORGANIZATION_REFERENCE,
        value => validOrganizationSnapshot(
          value,
          identity,
          namespace,
          binding.expectedUserId,
        ),
      )
      const organizationId = UUID_PAIR.exec(organization.targetId)[1]
      const target = freezeInput({
        schemaVersion: 1,
        targetKey: 'classroom-primary',
        kind: 'classroom',
        ownerId: binding.expectedUserId,
        organizationId,
        resourceType: 'subject',
      })
      operation = Object.freeze({ marker: request.marker, target })
      return freezeInput({
        schemaVersion: 1,
        targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
        namespace,
        stepId: STEP_ID,
        alias: 'teacher-primary',
        role: 'teacher',
        expectedUserId: binding.expectedUserId,
        targets: [target],
      })
    } finally {
      busy = false
    }
  }

  async function enumerateClassroom(signal, { cleanup = false } = {}) {
    assertStable(cleanup)
    const result = await driver.methods.enumerateDatabase.call(
      driver.wrapper,
      freezeInput({
        schemaVersion: 1,
        operationId: `attest:${STEP_ID}`,
        table: 'classrooms',
        columns: [
          'id', 'teacher_id', 'org_id', 'classroom_type', 'name', 'description',
          'created_at',
        ],
        predicates: [
          { column: 'teacher_id', operator: 'eq', value: binding.expectedUserId },
          { column: 'org_id', operator: 'eq', value: operation.target.organizationId },
          { column: 'classroom_type', operator: 'eq', value: 'subject' },
          { column: 'name', operator: 'eq', value: operation.marker },
          { column: 'created_at', operator: 'gte', value: identity.creationWindow.notBefore },
          { column: 'created_at', operator: 'lte', value: identity.creationWindow.notAfter },
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
    const createdAt = canonicalTimestamp(row?.created_at)
    if (!Object.isFrozen(row)
      || !hasExactFields(row, [
        'id', 'teacher_id', 'org_id', 'classroom_type', 'name', 'description',
        'created_at',
      ])
      || !UUID.test(row.id)
      || row.teacher_id !== binding.expectedUserId
      || row.org_id !== operation.target.organizationId
      || row.classroom_type !== 'subject'
      || row.name !== operation.marker
      || row.description !== `Synthetic-only SEB Staging fixture ${operation.marker}`
      || !createdAt
      || createdAt.timestamp < Date.parse(identity.creationWindow.notBefore)
      || createdAt.timestamp > Date.parse(identity.creationWindow.notAfter)) blocked()
    return Object.freeze({ row, createdAt: createdAt.iso })
  }

  async function attestOperation(request, callOptions) {
    const signal = exactOptions(callOptions)
    const fields = [
      'schemaVersion', 'targetOrigin', 'namespace', 'identity', 'stepId', 'alias',
      'expectedUserId', 'marker', 'target',
    ]
    if (!signal
      || busy
      || closed
      || !binding
      || !operation
      || !exactOperationRequest(request, identity, namespace, fields)
      || request.expectedUserId !== binding.expectedUserId
      || request.marker !== operation.marker
      || !validTarget(
        request.target,
        binding.expectedUserId,
        operation.target.organizationId,
      )) blocked()
    busy = true
    try {
      const match = await enumerateClassroom(signal)
      if (!match) blocked()
      return freezeInput({
        schemaVersion: 1,
        stepId: STEP_ID,
        status: 'passed',
        targets: [{
          targetKey: 'classroom-primary',
          kind: 'classroom',
          matches: [{
            targetId: match.row.id,
            createdAt: match.createdAt,
            ownerId: binding.expectedUserId,
            organizationId: operation.target.organizationId,
            resourceType: 'subject',
            parentId: null,
            relatedIds: [],
          }],
        }],
      })
    } finally {
      busy = false
    }
  }

  async function abortOperation(request, callOptions) {
    const signal = exactOptions(callOptions)
    const fields = [
      'schemaVersion', 'targetOrigin', 'namespace', 'identity', 'stepId', 'alias',
      'expectedUserId', 'marker', 'target',
    ]
    if (!signal
      || busy
      || closed
      || !binding
      || !operation
      || !exactOperationRequest(request, identity, namespace, fields)
      || request.expectedUserId !== binding.expectedUserId
      || request.marker !== operation.marker
      || !validTarget(
        request.target,
        binding.expectedUserId,
        operation.target.organizationId,
      )) blocked()
    busy = true
    try {
      // Zero exact matches means the browser failed before persistence. One
      // exact match is retained as an outer-ledger cleanup obligation. More
      // than one can never be safely attributed and is blocked by enumeration.
      await enumerateClassroom(signal, { cleanup: true })
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
      binding = null
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
