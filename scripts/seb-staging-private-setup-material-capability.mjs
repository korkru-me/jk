import { randomBytes } from 'node:crypto'

const SITE_ORIGIN = 'https://staging.korkru.com'
const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const BLOCKED_MESSAGE = 'SEB Staging private setup material capability blocked'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const CLASS_CODE = /^[A-Z0-9]{6}$/
const MEMBERSHIP_OPERATIONS = Object.freeze(new Map([
  ['join-synthetic-student-to-classroom', 'student-primary'],
  ['join-secondary-student-to-classroom', 'student-secondary'],
]))
const ASSIGNMENT_OPERATION = 'create-seb-assignment-draft-with-quit-password'
const UPLOAD_OPERATION = 'upload-synthetic-attachment'
const SYNTHETIC_UPLOAD_NAME = 'seb-s5-synthetic-answer.pdf'
const LEDGER_METHODS = Object.freeze([
  'planTarget', 'adoptDerivedTarget', 'markUncertain', 'commitTarget',
  'reconcileTarget', 'readCleanupTarget', 'markDeleted',
])
const DRIVER_FIELDS = Object.freeze([
  'supabaseUrl', 'credentialKind', 'enumerateDatabase', 'deleteDatabase',
  'enumerateStorage', 'deleteStorage', 'close',
])

export class SebStagingPrivateSetupMaterialCapabilityBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingPrivateSetupMaterialCapabilityBlockedError'
  }
}

function blocked() {
  throw new SebStagingPrivateSetupMaterialCapabilityBlockedError()
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exact(value, fields) {
  return record(value)
    && Object.keys(value).sort().join('\0') === [...fields].sort().join('\0')
}

function passed() {
  return Object.freeze({ status: 'passed' })
}

function environmentIsStaging(value, cleanup = false) {
  return record(value)
    && value.KORKRU_DEPLOYMENT_ENV === 'staging'
    && value.EXAM_QA_ENVIRONMENT === 'staging'
    && value.VERCEL_ENV === 'preview'
    && value.NEXT_PUBLIC_SITE_URL === SITE_ORIGIN
    && value.NEXT_PUBLIC_SUPABASE_URL === SUPABASE_ORIGIN
    && value.EXAM_QA_DATA_POLICY === 'synthetic-only'
    && value.EXAM_QA_COPY_PRODUCTION_DATA === 'false'
    && (value.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'true'
      || (cleanup && value.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'false'))
}

function capture(value, fields) {
  if (!Object.isFrozen(value)
    || !exact(value, fields)
    || !fields.every(field => typeof value[field] === 'function')) blocked()
  return Object.freeze({
    wrapper: value,
    methods: Object.freeze(Object.fromEntries(fields.map(field => [field, value[field]]))),
  })
}

function captureDriver(value) {
  if (!Object.isFrozen(value)
    || !exact(value, DRIVER_FIELDS)
    || value.supabaseUrl !== SUPABASE_ORIGIN
    || value.credentialKind !== 'service-role'
    || !DRIVER_FIELDS.slice(2).every(field => typeof value[field] === 'function')) blocked()
  return Object.freeze({
    wrapper: value,
    methods: Object.freeze(Object.fromEntries(
      DRIVER_FIELDS.slice(2).map(field => [field, value[field]]),
    )),
  })
}

function stable(capability, fields) {
  return Object.isFrozen(capability.wrapper)
    && exact(capability.wrapper, fields)
    && fields.every(field => capability.wrapper[field] === capability.methods[field])
}

function stableDriver(capability) {
  return Object.isFrozen(capability.wrapper)
    && exact(capability.wrapper, DRIVER_FIELDS)
    && capability.wrapper.supabaseUrl === SUPABASE_ORIGIN
    && capability.wrapper.credentialKind === 'service-role'
    && DRIVER_FIELDS.slice(2).every(
      field => capability.wrapper[field] === capability.methods[field],
    )
}

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze))
  if (!record(value) || Object.getPrototypeOf(value) !== Object.prototype) return value
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, freeze(child)]),
  ))
}

function validSignal(value) {
  try { return value instanceof AbortSignal && !value.aborted } catch { return false }
}

/**
 * Keeps the classroom join code inside a service-role/private browser closure.
 * The public operation result remains the coarse `{ status: 'passed' }` shape.
 */
export function createSebStagingPrivateSetupMaterialCapability(options = {}) {
  if (!exact(options, [
    'namespace', 'identity', 'readEnvironment', 'privateRunLedger', 'supabaseDriver',
  ])) blocked()
  const { namespace, identity, readEnvironment } = options
  const ledger = capture(options.privateRunLedger, LEDGER_METHODS)
  const driver = captureDriver(options.supabaseDriver)
  if (typeof namespace !== 'string'
    || namespace !== `qa:${identity?.runId ?? ''}`
    || typeof readEnvironment !== 'function'
    || driver.wrapper.supabaseUrl !== SUPABASE_ORIGIN
    || driver.wrapper.credentialKind !== 'service-role') blocked()
  try {
    if (!environmentIsStaging(readEnvironment())) blocked()
  } catch {
    blocked()
  }

  let busy = false
  let closed = false
  let closeBusy = false

  function assertStable(cleanup = false) {
    let current
    try { current = readEnvironment() } catch { blocked() }
    if (!environmentIsStaging(current, cleanup)
      || !stable(ledger, LEDGER_METHODS)
      || !stableDriver(driver)) blocked()
  }

  function classroomSnapshot() {
    const result = ledger.methods.readCleanupTarget.call(
      ledger.wrapper,
      Object.freeze({ schemaVersion: 1, targetKey: 'classroom-primary', kind: 'classroom' }),
    )
    if (!Object.isFrozen(result)
      || !exact(result, ['status', 'state', 'snapshots'])
      || result.status !== 'passed'
      || result.state !== 'committed'
      || !Array.isArray(result.snapshots)
      || !Object.isFrozen(result.snapshots)
      || result.snapshots.length !== 1) blocked()
    const snapshot = result.snapshots[0]
    if (!Object.isFrozen(snapshot)
      || !exact(snapshot, [
        'schemaVersion', 'targetKey', 'kind', 'identity', 'targetId', 'namespace',
        'ownerId', 'organizationId', 'resourceType', 'createdAt',
      ])
      || snapshot.schemaVersion !== 1
      || snapshot.targetKey !== 'classroom-primary'
      || snapshot.kind !== 'classroom'
      || snapshot.namespace !== namespace
      || snapshot.identity?.runId !== identity.runId
      || !UUID.test(snapshot.targetId)
      || !UUID.test(snapshot.ownerId)
      || !UUID.test(snapshot.organizationId)
      || snapshot.resourceType !== 'subject') blocked()
    return snapshot
  }

  async function applySecretInputs(request, callOptions) {
    const signal = callOptions?.signal
    const membershipAlias = MEMBERSHIP_OPERATIONS.get(request?.operationId)
    const alias = request?.operationId === ASSIGNMENT_OPERATION
      ? 'teacher-primary'
      : membershipAlias
    if (busy
      || closed
      || !validSignal(signal)
      || !Object.isFrozen(callOptions)
      || !exact(callOptions, ['signal'])
      || !Object.isFrozen(request)
      || !exact(request, [
        'schemaVersion', 'targetOrigin', 'namespace', 'identity', 'operationId',
        'alias', 'expectedUserId', 'page',
      ])
      || request.schemaVersion !== 1
      || request.targetOrigin !== SITE_ORIGIN
      || request.namespace !== namespace
      || request.identity?.runId !== identity.runId
      || alias === undefined
      || request.alias !== alias
      || !UUID.test(request.expectedUserId)
      || typeof request.page?.locator !== 'function') blocked()
    busy = true
    try {
      assertStable()
      if (request.operationId === ASSIGNMENT_OPERATION) {
        let password
        try { password = randomBytes(24).toString('base64url') } catch { blocked() }
        if (password.length < 20 || password.length > 64) blocked()
        const passwordInput = request.page.locator('#create-seb-quit-password')
        const confirmationInput = request.page.locator('#create-seb-quit-confirmation')
        if (!passwordInput || typeof passwordInput.fill !== 'function'
          || !confirmationInput || typeof confirmationInput.fill !== 'function') blocked()
        await passwordInput.fill(password)
        await confirmationInput.fill(password)
        if (signal.aborted) blocked()
        return passed()
      }
      const classroom = classroomSnapshot()
      const result = await driver.methods.enumerateDatabase.call(
        driver.wrapper,
        freeze({
          schemaVersion: 1,
          operationId: `material:${request.operationId}`,
          table: 'classrooms',
          columns: [
            'id', 'teacher_id', 'org_id', 'classroom_type', 'class_code',
          ],
          predicates: [
            { column: 'id', operator: 'eq', value: classroom.targetId },
            { column: 'teacher_id', operator: 'eq', value: classroom.ownerId },
            { column: 'org_id', operator: 'eq', value: classroom.organizationId },
            { column: 'classroom_type', operator: 'eq', value: 'subject' },
          ],
          limit: 1,
        }),
        Object.freeze({ signal }),
      )
      assertStable()
      if (!Object.isFrozen(result)
        || !exact(result, ['rows'])
        || !Object.isFrozen(result.rows)
        || result.rows.length !== 1) blocked()
      const row = result.rows[0]
      if (!Object.isFrozen(row)
        || !exact(row, ['id', 'teacher_id', 'org_id', 'classroom_type', 'class_code'])
        || row.id !== classroom.targetId
        || row.teacher_id !== classroom.ownerId
        || row.org_id !== classroom.organizationId
        || row.classroom_type !== 'subject'
        || !CLASS_CODE.test(row.class_code)) blocked()
      const input = request.page.locator('input[placeholder="รหัส 6 หลัก เช่น AB3X7Y"]')
      if (!input || typeof input.fill !== 'function') blocked()
      await input.fill(row.class_code)
      if (signal.aborted) blocked()
      return passed()
    } catch {
      blocked()
    } finally {
      busy = false
    }
  }

  async function applySyntheticUpload(request, callOptions) {
    const signal = callOptions?.signal
    if (busy
      || closed
      || !validSignal(signal)
      || !Object.isFrozen(callOptions)
      || !exact(callOptions, ['signal'])
      || !Object.isFrozen(request)
      || !exact(request, [
        'schemaVersion', 'targetOrigin', 'namespace', 'identity', 'operationId',
        'alias', 'expectedUserId', 'page',
      ])
      || request.schemaVersion !== 1
      || request.targetOrigin !== SITE_ORIGIN
      || request.namespace !== namespace
      || request.identity?.runId !== identity.runId
      || request.operationId !== UPLOAD_OPERATION
      || request.alias !== 'student-primary'
      || !UUID.test(request.expectedUserId)
      || typeof request.page?.locator !== 'function') blocked()
    busy = true
    try {
      assertStable()
      const input = request.page.locator('input[aria-label="เลือกไฟล์คำตอบ"]')
      if (!input || typeof input.setInputFiles !== 'function') blocked()
      const bytes = Buffer.from(
        '%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
        'utf8',
      )
      await input.setInputFiles({
        name: SYNTHETIC_UPLOAD_NAME,
        mimeType: 'application/pdf',
        buffer: bytes,
      })
      bytes.fill(0)
      if (signal.aborted) blocked()
      assertStable()
      return passed()
    } catch {
      blocked()
    } finally {
      busy = false
    }
  }

  async function closeAll() {
    if (closed) return passed()
    if (busy || closeBusy) return Object.freeze({ status: 'failed' })
    closeBusy = true
    try {
      assertStable(true)
      const result = await driver.methods.close.call(
        driver.wrapper,
        Object.freeze({ signal: new AbortController().signal }),
      )
      if (!Object.isFrozen(result) || !exact(result, ['status']) || result.status !== 'passed') {
        return Object.freeze({ status: 'failed' })
      }
      closed = true
      return passed()
    } catch {
      return Object.freeze({ status: 'failed' })
    } finally {
      closeBusy = false
    }
  }

  return Object.freeze({ applySecretInputs, applySyntheticUpload, closeAll })
}
