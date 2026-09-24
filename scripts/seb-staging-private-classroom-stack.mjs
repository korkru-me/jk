import { createSebStagingPrivateBrowserDataStack } from './seb-staging-private-browser-data-stack.mjs'
import { createSebStagingPrivateClassroomDataBoundary } from './seb-staging-private-classroom-data-boundary.mjs'
import { createSebStagingSupabaseNarrowDriver } from './seb-staging-supabase-narrow-driver.mjs'

const BLOCKED_MESSAGE = 'SEB Staging private classroom stack blocked'
const REQUIRED_OPTIONS = Object.freeze([
  'runIdentity',
  'readEnvironment',
  'privateRunLedger',
  'serviceRoleCredentialProvider',
  'secretProvider',
  'userScopedReadProbe',
  'clock',
])
const OPTIONAL_OPTIONS = Object.freeze([
  'fetchImplementation',
  'chromium',
  'createServerClient',
  'nativeSebCapability',
  'boundaryTimeoutMs',
  'resourcePlanTimeoutMs',
  'runtimeDeadlinesMs',
  'brokerDeadlinesMs',
])

export class SebStagingPrivateClassroomStackBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingPrivateClassroomStackBlockedError'
  }
}

function blocked() {
  throw new SebStagingPrivateClassroomStackBlockedError()
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

function hasOnlyFields(value, required, optional) {
  if (!isDataRecord(value)) return false
  const allowed = new Set([...required, ...optional])
  return required.every(field => Object.hasOwn(value, field))
    && Object.keys(value).every(field => allowed.has(field))
}

function createNoMaterialCapability() {
  const unexpected = async () => blocked()
  return Object.freeze({
    applySecretInputs: unexpected,
    applySyntheticUpload: unexpected,
    closeAll: async () => Object.freeze({ status: 'passed' }),
  })
}

/**
 * Create the first end-to-end private browser-data slice. The dedicated raw
 * Supabase driver and its service-role credential stay inside this async
 * factory; callers receive only the same redacted executeStep/closeAll stack
 * used by the composite live runner.
 */
export async function createSebStagingPrivateClassroomStack(options = {}) {
  if (!hasOnlyFields(options, REQUIRED_OPTIONS, OPTIONAL_OPTIONS)) blocked()
  const namespace = `qa:${options.runIdentity?.runId ?? ''}`
  let driver = null
  let boundary = null
  try {
    driver = await createSebStagingSupabaseNarrowDriver({
      readEnvironment: options.readEnvironment,
      namespace,
      serviceRoleCredentialProvider: options.serviceRoleCredentialProvider,
      ...(options.fetchImplementation === undefined
        ? {}
        : { fetchImplementation: options.fetchImplementation }),
      ...(options.boundaryTimeoutMs === undefined
        ? {}
        : { boundaryTimeoutMs: options.boundaryTimeoutMs }),
    })
    boundary = createSebStagingPrivateClassroomDataBoundary({
      namespace,
      identity: options.runIdentity,
      readEnvironment: options.readEnvironment,
      privateRunLedger: options.privateRunLedger,
      supabaseDriver: driver,
    })
    return createSebStagingPrivateBrowserDataStack({
      runIdentity: options.runIdentity,
      readEnvironment: options.readEnvironment,
      privateRunLedger: options.privateRunLedger,
      privateDataBoundary: boundary,
      privateMaterialCapability: createNoMaterialCapability(),
      clock: options.clock,
      secretProvider: options.secretProvider,
      userScopedReadProbe: options.userScopedReadProbe,
      ...(options.nativeSebCapability === undefined
        ? {}
        : { nativeSebCapability: options.nativeSebCapability }),
      ...(options.chromium === undefined ? {} : { chromium: options.chromium }),
      ...(options.createServerClient === undefined
        ? {}
        : { createServerClient: options.createServerClient }),
      ...(options.resourcePlanTimeoutMs === undefined
        ? {}
        : { resourcePlanTimeoutMs: options.resourcePlanTimeoutMs }),
      ...(options.boundaryTimeoutMs === undefined
        ? {}
        : { boundaryTimeoutMs: options.boundaryTimeoutMs }),
      ...(options.runtimeDeadlinesMs === undefined
        ? {}
        : { runtimeDeadlinesMs: options.runtimeDeadlinesMs }),
      ...(options.brokerDeadlinesMs === undefined
        ? {}
        : { brokerDeadlinesMs: options.brokerDeadlinesMs }),
    })
  } catch {
    if (boundary) {
      try { await boundary.closeAll() } catch { /* redacted */ }
    } else if (driver) {
      try {
        await driver.close(Object.freeze({ signal: new AbortController().signal }))
      } catch { /* redacted */ }
    }
    blocked()
  }
}
