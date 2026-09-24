import { createSebStagingBrowserDataAdapter } from './seb-staging-browser-data-adapter.mjs'
import { createSebStagingBrowserOperationRuntime } from './seb-staging-browser-operation-runtime.mjs'
import { createSebStagingBrowserRuntime } from './seb-staging-browser-runtime.mjs'
import { createSebStagingPrivateOperationTicketProvider } from './seb-staging-private-operation-ticket-provider.mjs'

const BLOCKED_MESSAGE = 'SEB Staging private browser data stack blocked'

const REQUIRED_OPTIONS = Object.freeze([
  'runIdentity',
  'readEnvironment',
  'privateRunLedger',
  'privateDataBoundary',
  'privateMaterialCapability',
  'clock',
  'secretProvider',
  'userScopedReadProbe',
])

const OPTIONAL_OPTIONS = Object.freeze([
  'nativeSebCapability',
  'chromium',
  'createServerClient',
  'resourcePlanTimeoutMs',
  'boundaryTimeoutMs',
  'runtimeDeadlinesMs',
  'brokerDeadlinesMs',
])

export class SebStagingPrivateBrowserDataStackBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingPrivateBrowserDataStackBlockedError'
  }
}

function blocked() {
  throw new SebStagingPrivateBrowserDataStackBlockedError()
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

function hasOnlyFields(value, required, optional = []) {
  if (!isDataRecord(value)) return false
  const fields = Object.keys(value)
  const allowed = new Set([...required, ...optional])
  return required.every(field => Object.hasOwn(value, field))
    && fields.every(field => allowed.has(field))
}

function exactPassed(value) {
  return Object.isFrozen(value)
    && isDataRecord(value)
    && Object.keys(value).length === 1
    && value.status === 'passed'
}

function passed() {
  return Object.freeze({ status: 'passed' })
}

/**
 * Assemble the only public browser-data capability used by the live harness.
 * The Page, runtime credentials, secret inputs, private data boundary and raw
 * ledger never leave this closure. Cleanup is ordered from the browser edge
 * inward and advances only after each child confirms a coarse passed result.
 */
export function createSebStagingPrivateBrowserDataStack(options = {}) {
  if (!hasOnlyFields(options, REQUIRED_OPTIONS, OPTIONAL_OPTIONS)) blocked()
  const {
    runIdentity,
    readEnvironment,
    privateRunLedger,
    privateDataBoundary,
    privateMaterialCapability,
    clock,
    secretProvider,
    userScopedReadProbe,
    nativeSebCapability,
    chromium,
    createServerClient,
    resourcePlanTimeoutMs,
    boundaryTimeoutMs,
    runtimeDeadlinesMs,
    brokerDeadlinesMs,
  } = options
  const namespace = `qa:${runIdentity?.runId ?? ''}`

  let provider
  let operationRuntime
  let browserRuntime
  let browserDataAdapter
  try {
    provider = createSebStagingPrivateOperationTicketProvider({
      schemaVersion: 1,
      namespace,
      identity: runIdentity,
      readEnvironment,
      privateDataBoundary,
      privateMaterialCapability,
      clock,
      ...(boundaryTimeoutMs === undefined ? {} : { boundaryTimeoutMs }),
    })
    operationRuntime = createSebStagingBrowserOperationRuntime({
      namespace,
      readEnvironment,
      privateOperationPlanCapability: provider.operationPlanCapability,
      ...(nativeSebCapability === undefined ? {} : { nativeSebCapability }),
    })
    browserRuntime = createSebStagingBrowserRuntime({
      namespace,
      readEnvironment,
      secretProvider,
      sessionOperationRunner: operationRuntime.sessionOperationRunner,
      userScopedReadProbe,
      ...(chromium === undefined ? {} : { chromium }),
      ...(createServerClient === undefined ? {} : { createServerClient }),
      ...(runtimeDeadlinesMs === undefined ? {} : { runtimeDeadlinesMs }),
      ...(brokerDeadlinesMs === undefined ? {} : { brokerDeadlinesMs }),
    })
    browserDataAdapter = createSebStagingBrowserDataAdapter({
      readEnvironment,
      runIdentity,
      privateRunLedger,
      browserSessionCapability: browserRuntime,
      privateResourcePlanCapability: provider.resourcePlanCapability,
      clock,
      ...(resourcePlanTimeoutMs === undefined ? {} : { resourcePlanTimeoutMs }),
    })
  } catch {
    blocked()
  }

  let cleanupStarted = false
  let closeBusy = false
  let closed = false
  let closeIndex = 0
  const cleanupParticipants = Object.freeze([
    browserRuntime,
    browserDataAdapter,
    operationRuntime,
    provider,
  ])

  async function executeStep(request) {
    if (cleanupStarted || closed) {
      return Object.freeze({
        stepId: typeof request?.stepId === 'string' ? request.stepId : 'invalid-step',
        status: 'failed',
      })
    }
    return browserDataAdapter.executeStep(request)
  }

  function authenticate(request) {
    if (cleanupStarted || closed) {
      return Promise.reject(new SebStagingPrivateBrowserDataStackBlockedError())
    }
    return browserRuntime.authenticate(request)
  }

  async function closeAll() {
    cleanupStarted = true
    if (closed) return passed()
    if (closeBusy) return Object.freeze({ status: 'failed' })
    closeBusy = true
    try {
      while (closeIndex < cleanupParticipants.length) {
        let result
        try {
          result = await cleanupParticipants[closeIndex].closeAll()
        } catch {
          return Object.freeze({ status: 'failed' })
        }
        if (!exactPassed(result)) return Object.freeze({ status: 'failed' })
        closeIndex += 1
      }
      closed = true
      return passed()
    } finally {
      closeBusy = false
    }
  }

  const browserDataCapability = Object.freeze({ executeStep })
  // These two views stay inside the private live composition.  The fixture
  // adapter needs authentication and lifecycle shutdown, but neither view
  // exposes the browser, Page, cookies, credentials, or raw operation plan.
  const browserSessionCapability = Object.freeze({ authenticate, closeAll })
  const browserDataLifecycleCapability = Object.freeze({ executeStep, closeAll })
  return Object.freeze({
    browserDataCapability,
    browserSessionCapability,
    browserDataLifecycleCapability,
    closeAll,
  })
}
