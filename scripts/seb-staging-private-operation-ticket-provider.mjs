import { randomBytes } from 'node:crypto'

const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const CREATE_CLASSROOM_PATH = '/classrooms/new'
const CLASSROOM_LIST_PATH = '/classrooms'
const SUPPORTED_OPERATION = 'create-subject-classroom'
const SUPPORTED_ALIAS = 'teacher-primary'
const SUPPORTED_ROLE = 'teacher'
const TARGET_KEY = 'classroom-primary'
const TARGET_KIND = 'classroom'
const TARGET_RESOURCE_TYPE = 'subject'
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
    && value.alias === SUPPORTED_ALIAS
    && value.role === SUPPORTED_ROLE
}

function parseBindingResponse(value, namespace) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, [
      'schemaVersion', 'targetOrigin', 'namespace', 'alias', 'role', 'expectedUserId',
    ])
    || value.schemaVersion !== 1
    || value.targetOrigin !== OFFICIAL_STAGING_SITE_ORIGIN
    || value.namespace !== namespace
    || value.alias !== SUPPORTED_ALIAS
    || value.role !== SUPPORTED_ROLE
    || typeof value.expectedUserId !== 'string'
    || !UUID.test(value.expectedUserId)) return null
  return value
}

function exactPrepareRequest(value, namespace, identity, binding) {
  return Object.isFrozen(value)
    && hasExactFields(value, [
      'schemaVersion', 'targetOrigin', 'namespace', 'identity', 'stepId',
      'alias', 'role', 'expectedUserId',
    ])
    && value.schemaVersion === 1
    && value.targetOrigin === OFFICIAL_STAGING_SITE_ORIGIN
    && value.namespace === namespace
    && runIdentityMatches(value.identity, identity)
    && value.stepId === SUPPORTED_OPERATION
    && value.alias === SUPPORTED_ALIAS
    && value.role === SUPPORTED_ROLE
    && value.expectedUserId === binding.expectedUserId
}

function parsePreparedResponse(value, namespace, binding) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, [
      'schemaVersion', 'targetOrigin', 'namespace', 'stepId', 'alias', 'role',
      'expectedUserId', 'targets',
    ])
    || value.schemaVersion !== 1
    || value.targetOrigin !== OFFICIAL_STAGING_SITE_ORIGIN
    || value.namespace !== namespace
    || value.stepId !== SUPPORTED_OPERATION
    || value.alias !== SUPPORTED_ALIAS
    || value.role !== SUPPORTED_ROLE
    || value.expectedUserId !== binding.expectedUserId
    || !isExactFrozenArray(value.targets, 1)) return null
  const target = value.targets[0]
  if (!Object.isFrozen(target)
    || !hasExactFields(target, [
      'schemaVersion', 'targetKey', 'kind', 'ownerId', 'organizationId',
      'resourceType',
    ])
    || target.schemaVersion !== 1
    || target.targetKey !== TARGET_KEY
    || target.kind !== TARGET_KIND
    || target.ownerId !== binding.expectedUserId
    || typeof target.organizationId !== 'string'
    || !UUID.test(target.organizationId)
    || target.resourceType !== TARGET_RESOURCE_TYPE) return null
  return Object.freeze({ response: value, target })
}

function exactAttestRequest(value, namespace, identity) {
  return Object.isFrozen(value)
    && hasExactFields(value, [
      'schemaVersion', 'targetOrigin', 'namespace', 'identity', 'stepId',
    ])
    && value.schemaVersion === 1
    && value.targetOrigin === OFFICIAL_STAGING_SITE_ORIGIN
    && value.namespace === namespace
    && runIdentityMatches(value.identity, identity)
    && value.stepId === SUPPORTED_OPERATION
}

function parseAttestedResponse(value, plan, identity) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, ['schemaVersion', 'stepId', 'status', 'targets'])
    || value.schemaVersion !== 1
    || value.stepId !== SUPPORTED_OPERATION
    || value.status !== 'passed'
    || !isExactFrozenArray(value.targets, 1)) return null
  const target = value.targets[0]
  if (!Object.isFrozen(target)
    || !hasExactFields(target, ['targetKey', 'kind', 'matches'])
    || target.targetKey !== TARGET_KEY
    || target.kind !== TARGET_KIND
    || !isExactFrozenArray(target.matches, 1)) return null
  const match = target.matches[0]
  const createdAt = canonicalTimestamp(match?.createdAt)
  if (!Object.isFrozen(match)
    || !hasExactFields(match, [
      'targetId', 'createdAt', 'ownerId', 'organizationId', 'resourceType',
      'parentId', 'relatedIds',
    ])
    || typeof match.targetId !== 'string'
    || !UUID.test(match.targetId)
    || !createdAt
    || createdAt.timestamp < Date.parse(identity.creationWindow.notBefore)
    || createdAt.timestamp > Date.parse(identity.creationWindow.notAfter)
    || match.ownerId !== plan.target.ownerId
    || match.organizationId !== plan.target.organizationId
    || match.resourceType !== TARGET_RESOURCE_TYPE
    || match.parentId !== null
    || !isExactFrozenArray(match.relatedIds, 0)) return null
  return value
}

function exactIssueRequest(value, namespace, binding) {
  return Object.isFrozen(value)
    && hasExactFields(value, [
      'targetOrigin', 'namespace', 'alias', 'expectedUserId', 'operationId',
    ])
    && value.targetOrigin === OFFICIAL_STAGING_SITE_ORIGIN
    && value.namespace === namespace
    && value.alias === SUPPORTED_ALIAS
    && value.expectedUserId === binding.expectedUserId
    && value.operationId === SUPPORTED_OPERATION
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
 * This first concrete slice deliberately supports only
 * `create-subject-classroom`; every other operation fails before ticket issue
 * or browser mutation.
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

  let binding = null
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
      const parsed = parseBindingResponse(response, namespace)
      if (!parsed
        || (binding && binding.expectedUserId !== parsed.expectedUserId)) blocked()
      if (!binding) binding = parsed
      return binding
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
    if (!signal
      || !binding
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
          stepId: SUPPORTED_OPERATION,
          alias: SUPPORTED_ALIAS,
          role: SUPPORTED_ROLE,
          expectedUserId: binding.expectedUserId,
          marker,
        }),
        signal,
      )
      const prepared = parsePreparedResponse(response, namespace, binding)
      if (!prepared) blocked()
      plan = {
        state: 'PREPARED',
        marker,
        target: prepared.target,
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
          await page.goto(`${OFFICIAL_STAGING_SITE_ORIGIN}${CREATE_CLASSROOM_PATH}`, {
            waitUntil: 'domcontentloaded',
            timeout: boundaryTimeoutMs,
          })
        } catch {
          blocked()
        }
        if (signal.aborted || !pathIs(page.url(), CREATE_CLASSROOM_PATH)) blocked()
        const heading = page.getByRole('heading', {
          name: 'สร้างห้องเรียนใหม่',
          exact: true,
        })
        await waitForVisible(heading)
      })
    }

    async function applyMarkers(ticketInput) {
      return runTicketMethod('NAVIGATED', 'MARKED', ticketInput, async ({ page }) => {
        if (!pathIs(page.url(), CREATE_CLASSROOM_PATH)) blocked()
        const nameInput = page.locator('#cls-name')
        const descriptionInput = page.locator('#cls-desc')
        if (!exactLocator(nameInput, ['fill'])
          || !exactLocator(descriptionInput, ['fill'])) blocked()
        try {
          await nameInput.fill(plan.marker, { timeout: boundaryTimeoutMs })
          await descriptionInput.fill(
            `Synthetic-only SEB Staging fixture ${plan.marker}`,
            { timeout: boundaryTimeoutMs },
          )
        } catch {
          blocked()
        }
      })
    }

    async function applySecrets(ticketInput) {
      return runTicketMethod('MARKED', 'SECRETS_APPLIED', ticketInput, async () => {
        // This operation has no secret input. Future operations must delegate
        // here to privateMaterialCapability rather than return secret material.
      })
    }

    async function applyUploads(ticketInput) {
      return runTicketMethod('SECRETS_APPLIED', 'UPLOADS_APPLIED', ticketInput, async () => {
        // This operation has no upload. Future operations must delegate here
        // without ever returning fixture bytes or a filesystem path.
      })
    }

    async function beginMutation(ticketInput) {
      return runTicketMethod('UPLOADS_APPLIED', 'MUTATION_STARTED', ticketInput, async ({ page, signal }) => {
        currentEnvironment()
        if (!creationWindowIsActive() || !pathIs(page.url(), CREATE_CLASSROOM_PATH)) blocked()
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
        currentEnvironment()
        if (!creationWindowIsActive() || signal.aborted) blocked()
        const confirmButton = page.getByRole('button', {
          name: 'ยืนยันสร้างห้องเรียน',
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
      return runTicketMethod('MUTATION_STARTED', 'FINISHED', ticketInput, async ({ page, signal }) => {
        try {
          await page.waitForURL(
            url => url.origin === OFFICIAL_STAGING_SITE_ORIGIN
              && url.pathname === CLASSROOM_LIST_PATH,
            { timeout: boundaryTimeoutMs },
          )
        } catch {
          blocked()
        }
        if (signal.aborted || !pathIs(page.url(), CLASSROOM_LIST_PATH)) blocked()
        const marker = page.getByText(plan.marker, { exact: true })
        await waitForVisible(marker)
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
    if (!signal
      || !binding
      || !plan
      || plan.state !== 'PREPARED'
      || plan.ticket !== null
      || resourceBusy
      || cleanupStarted
      || closed
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
      || !exactAttestRequest(request, namespace, identity)) blocked()
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
          stepId: SUPPORTED_OPERATION,
          alias: SUPPORTED_ALIAS,
          expectedUserId: binding.expectedUserId,
          marker: plan.marker,
          target: plan.target,
        }),
        signal,
      )
      const attested = parseAttestedResponse(response, plan, identity)
      if (!attested) blocked()
      plan.state = 'ATTESTED'
      return attested
    } catch {
      if (plan?.state === 'ATTESTING') plan.state = 'FINISHED'
      blocked()
    } finally {
      resourceBusy = false
    }
  }

  async function reconcilePlan(signal, { allowCleanup = false } = {}) {
    if (!plan || !binding || !validAbortSignal(signal) || signal.aborted) blocked()
    const result = await boundaryCall(
      dataAttestation,
      DATA_BOUNDARY_METHODS,
      'abortOperation',
      freezeInput({
        schemaVersion: 1,
        targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
        namespace,
        identity,
        stepId: SUPPORTED_OPERATION,
        alias: SUPPORTED_ALIAS,
        expectedUserId: binding.expectedUserId,
        marker: plan.marker,
        target: plan.target,
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
      binding = null
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
