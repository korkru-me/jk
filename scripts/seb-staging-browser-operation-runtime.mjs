const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const BLOCKED_MESSAGE = 'SEB Staging browser operation runtime blocked'
const CLEANUP_ABORT_DEADLINE_MS = 5_000
const SAFE_NAMESPACE = /^qa:seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const FORBIDDEN_NAMESPACE_TERMS = /(prod(?:uction)?|live|real|customer)/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const OPERATION_SPECS = Object.freeze(new Map([
  ['create-subject-classroom', spec('teacher-primary', true)],
  ['create-synthetic-written-question', spec('teacher-primary', true)],
  ['create-synthetic-upload-question', spec('teacher-primary', true)],
  ['join-synthetic-student-to-classroom', spec('student-primary', true)],
  ['join-secondary-student-to-classroom', spec('student-secondary', true)],
  ['create-seb-assignment-draft-with-quit-password', spec('teacher-primary', true)],
  ['publish-seb-assignment', spec('teacher-primary', true)],
  ['reject-invalid-seb-challenge', spec('student-primary', false, true)],
  ['verify-seb-system-check', spec('student-primary', true, true)],
  ['reject-replayed-seb-challenge', spec('student-primary', false, true)],
  ['reject-invalid-seb-session', spec('student-primary', false, true)],
  ['start-revision-bound-attempt', spec('student-primary', true)],
  ['reject-replayed-seb-session', spec('student-primary', false, true)],
  ['autosave-synthetic-answer', spec('student-primary', true)],
  ['retry-autosave-after-transient-failure', spec('student-primary', true, false, true)],
  ['resume-same-attempt', spec('student-primary', false)],
  ['upload-synthetic-attachment', spec('student-primary', true)],
  ['retry-upload-after-transient-failure', spec('student-primary', true, false, true)],
  ['record-proctor-heartbeat', spec('student-primary', true)],
  ['student-denied-teacher-result', spec('student-primary', false)],
  ['submit-attempt', spec('student-primary', true)],
  ['teacher-read-submitted-result', spec('teacher-primary', false)],
  ['secondary-student-denied-primary-attempt', spec('student-secondary', false)],
  ['unrelated-teacher-denied-assignment-result', spec('teacher-unrelated', false)],
]))

const TICKET_METHODS = Object.freeze([
  'applyMarkers',
  'navigate',
  'applySecrets',
  'applyUploads',
  'beginMutation',
  'finish',
  'abort',
])
const PRIVATE_CAPABILITY_METHODS = Object.freeze(['issueOperationTicket'])
const NATIVE_CAPABILITY_METHODS = Object.freeze(['executeNativeOperation'])

function spec(alias, mutates, requiresNative = false, allowsRetry = false) {
  return Object.freeze({ alias, mutates, requiresNative, allowsRetry })
}

export class SebStagingBrowserOperationRuntimeBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingBrowserOperationRuntimeBlockedError'
  }
}

function blocked() {
  throw new SebStagingBrowserOperationRuntimeBlockedError()
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

function validNamespace(value) {
  return typeof value === 'string'
    && SAFE_NAMESPACE.test(value)
    && value !== 'qa:seb-s5-preview'
    && !FORBIDDEN_NAMESPACE_TERMS.test(value)
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

function validPage(value) {
  try {
    return value !== null
      && typeof value === 'object'
      && typeof value.url === 'function'
      && typeof value.locator === 'function'
      && typeof value.getByRole === 'function'
  } catch {
    return false
  }
}

function exactPassed(value) {
  return Object.isFrozen(value)
    && hasExactFields(value, ['status'])
    && value.status === 'passed'
}

function passed() {
  return Object.freeze({ status: 'passed' })
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

function parseRunnerInput(value, namespace) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, [
      'targetOrigin', 'namespace', 'alias', 'expectedUserId', 'operationId',
      'payload', 'page', 'signal',
    ])
    || value.targetOrigin !== OFFICIAL_STAGING_SITE_ORIGIN
    || value.namespace !== namespace
    || typeof value.operationId !== 'string'
    || !hasExactFields(value.payload, [])
    || !Object.isFrozen(value.payload)
    || typeof value.expectedUserId !== 'string'
    || !UUID.test(value.expectedUserId)
    || !validPage(value.page)
    || !validAbortSignal(value.signal)
    || value.signal.aborted) return null
  const operation = OPERATION_SPECS.get(value.operationId)
  if (!operation || operation.alias !== value.alias) return null
  return Object.freeze({
    alias: value.alias,
    expectedUserId: value.expectedUserId,
    operationId: value.operationId,
    operation,
    page: value.page,
    signal: value.signal,
  })
}

function parseTicket(value) {
  return captureCapability(value, TICKET_METHODS)
}

function exactTicketInput(page, signal) {
  return Object.freeze({ page, signal })
}

/**
 * Build the closure-private S5 browser operation runner. Resource ids, routes,
 * markers, fixture bytes and passwords remain inside the single-use ticket;
 * this runtime receives only a Page and a fixed operation id from the session
 * broker and returns one coarse status object.
 */
export function createSebStagingBrowserOperationRuntime(options = {}) {
  if (!hasOnlyFields(options, [
    'namespace', 'readEnvironment', 'privateOperationPlanCapability',
  ], ['nativeSebCapability'])) blocked()
  const {
    namespace,
    readEnvironment,
    privateOperationPlanCapability,
    nativeSebCapability,
  } = options
  const privateAttestation = captureCapability(
    privateOperationPlanCapability,
    PRIVATE_CAPABILITY_METHODS,
  )
  const nativeAttestation = nativeSebCapability === undefined
    ? null
    : captureCapability(nativeSebCapability, NATIVE_CAPABILITY_METHODS)
  let environment = null
  try {
    environment = typeof readEnvironment === 'function' ? readEnvironment() : null
  } catch {
    blocked()
  }
  if (!validNamespace(namespace)
    || typeof readEnvironment !== 'function'
    || !hasOfficialStagingPolicy(environment)
    || !privateAttestation
    || (nativeSebCapability !== undefined && !nativeAttestation)) blocked()

  let busy = false
  let cleanupStarted = false
  let closeBusy = false
  let closed = false
  const pending = new Set()
  const issuedTickets = new WeakSet()
  const openTickets = new Set()
  const abortAttempts = new Map()

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

  function assertCapabilitiesStable() {
    if (!sameCapability(privateAttestation, PRIVATE_CAPABILITY_METHODS)
      || (nativeAttestation
        && !sameCapability(nativeAttestation, NATIVE_CAPABILITY_METHODS))) blocked()
  }

  async function ticketCall(ticketAttestation, method, page, signal) {
    if (!sameCapability(ticketAttestation, TICKET_METHODS)
      || signal.aborted) blocked()
    const result = await ticketAttestation.methods[method].call(
      ticketAttestation.wrapper,
      exactTicketInput(page, signal),
    )
    if (!sameCapability(ticketAttestation, TICKET_METHODS)
      || signal.aborted
      || !exactPassed(result)) blocked()
    return result
  }

  async function abortOpenTicket(entry) {
    // The broker's signal is expected to be aborted on timeout. Cleanup must
    // therefore use a fresh, closure-private signal and remain retryable from
    // closeAll until the ticket itself confirms that its uncertainty record
    // has been reconciled.
    currentEnvironment({ cleanup: true })
    assertCapabilitiesStable()
    if (!openTickets.has(entry)
      || !sameCapability(entry.ticket, TICKET_METHODS)
      || abortAttempts.has(entry)) blocked()
    const cleanupController = new AbortController()
    const attempt = Promise.resolve().then(async () => {
      const result = await entry.ticket.methods.abort.call(
        entry.ticket.wrapper,
        exactTicketInput(entry.page, cleanupController.signal),
      )
      assertCapabilitiesStable()
      if (!sameCapability(entry.ticket, TICKET_METHODS)
        || cleanupController.signal.aborted
        || !exactPassed(result)) blocked()
      return true
    })
    abortAttempts.set(entry, attempt)
    attempt.then(
      () => {
        if (abortAttempts.get(entry) === attempt) abortAttempts.delete(entry)
      },
      () => {
        if (abortAttempts.get(entry) === attempt) abortAttempts.delete(entry)
      },
    )
    let timeoutHandle = null
    try {
      const completed = await Promise.race([
        attempt,
        new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => {
            cleanupController.abort()
            reject(new SebStagingBrowserOperationRuntimeBlockedError())
          }, CLEANUP_ABORT_DEADLINE_MS)
        }),
      ])
      if (completed !== true || cleanupController.signal.aborted) blocked()
      openTickets.delete(entry)
    } catch {
      blocked()
    } finally {
      if (timeoutHandle !== null) clearTimeout(timeoutHandle)
    }
  }

  async function issueTicket(parsed) {
    assertCapabilitiesStable()
    const request = Object.freeze({
      targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
      namespace,
      alias: parsed.alias,
      expectedUserId: parsed.expectedUserId,
      operationId: parsed.operationId,
    })
    const ticket = await privateAttestation.methods.issueOperationTicket.call(
      privateAttestation.wrapper,
      request,
      Object.freeze({ signal: parsed.signal }),
    )
    assertCapabilitiesStable()
    const ticketAttestation = parseTicket(ticket)
    if (!ticketAttestation || issuedTickets.has(ticket)) blocked()
    issuedTickets.add(ticket)
    return ticketAttestation
  }

  async function runNative(parsed) {
    if (!nativeAttestation) blocked()
    assertCapabilitiesStable()
    const result = await nativeAttestation.methods.executeNativeOperation.call(
      nativeAttestation.wrapper,
      Object.freeze({
        targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
        namespace,
        alias: parsed.alias,
        expectedUserId: parsed.expectedUserId,
        operationId: parsed.operationId,
        page: parsed.page,
        signal: parsed.signal,
      }),
    )
    assertCapabilitiesStable()
    if (!exactPassed(result) || parsed.signal.aborted) blocked()
  }

  async function runOperation(parsed) {
    // Install the native-SEB boundary before ticket issue and, critically,
    // before navigation. A /take navigation can create an attempt server-side;
    // installing or invalidating the SEB session afterwards would make a
    // negative-session test mutate before it proves rejection.
    if (parsed.operation.requiresNative && !nativeAttestation) blocked()
    let entry = null
    let finished = false
    try {
      if (parsed.operation.requiresNative) {
        if (cleanupStarted || closed) blocked()
        currentEnvironment()
        assertCapabilitiesStable()
        await runNative(parsed)
      }
      const ticket = await issueTicket(parsed)
      entry = Object.freeze({ ticket, page: parsed.page })
      openTickets.add(entry)
      await ticketCall(ticket, 'navigate', parsed.page, parsed.signal)
      await ticketCall(ticket, 'applyMarkers', parsed.page, parsed.signal)
      await ticketCall(ticket, 'applySecrets', parsed.page, parsed.signal)
      await ticketCall(ticket, 'applyUploads', parsed.page, parsed.signal)
      if (parsed.operation.mutates) {
        // Re-authorize writes at the last possible instant. The environment
        // can change while selectors, markers, secrets or uploads are being
        // prepared across asynchronous browser boundaries.
        if (cleanupStarted || closed) blocked()
        currentEnvironment()
        assertCapabilitiesStable()
        await ticketCall(ticket, 'beginMutation', parsed.page, parsed.signal)
      }
      await ticketCall(ticket, 'finish', parsed.page, parsed.signal)
      finished = true
      openTickets.delete(entry)
      return passed()
    } catch {
      if (!finished && entry) {
        try {
          await abortOpenTicket(entry)
        } catch {
          // Keep the ticket open. closeAll retries it and cannot report a pass
          // until the private capability confirms reconciliation.
        }
      }
      blocked()
    }
  }

  async function sessionOperationRunner(input) {
    const parsed = parseRunnerInput(input, namespace)
    if (!parsed || busy || cleanupStarted || closed || openTickets.size !== 0) blocked()
    busy = true
    const operation = Promise.resolve().then(async () => {
      currentEnvironment()
      assertCapabilitiesStable()
      const result = await runOperation(parsed)
      currentEnvironment()
      assertCapabilitiesStable()
      return result
    })
    pending.add(operation)
    try {
      return await operation
    } finally {
      pending.delete(operation)
      busy = false
    }
  }

  async function closeAll() {
    cleanupStarted = true
    if (closeBusy) return Object.freeze({ status: 'failed' })
    if (closed) return passed()
    if (busy || pending.size !== 0) return Object.freeze({ status: 'failed' })
    closeBusy = true
    try {
      try {
        currentEnvironment({ cleanup: true })
        assertCapabilitiesStable()
      } catch {
        return Object.freeze({ status: 'failed' })
      }
      for (const entry of [...openTickets]) {
        try {
          await abortOpenTicket(entry)
        } catch {
          // A later closeAll call may retry after the private cleanup boundary
          // becomes healthy again; until then this runtime is terminally gated.
        }
      }
      if (openTickets.size !== 0) return Object.freeze({ status: 'failed' })
      closed = true
      return passed()
    } finally {
      closeBusy = false
    }
  }

  return Object.freeze({ sessionOperationRunner, closeAll })
}

export function listSebStagingBrowserOperationContracts() {
  return Object.freeze([...OPERATION_SPECS.entries()].map(([operationId, value]) => (
    Object.freeze({ operationId, ...value })
  )))
}
