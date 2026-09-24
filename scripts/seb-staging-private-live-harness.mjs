import { createSebStagingCompositeAdapter } from './seb-staging-composite-adapter.mjs'
import { runSebStagingLiveHarness } from './seb-staging-live-runner.mjs'

const BLOCKED_MESSAGE = 'SEB Staging private live harness blocked'

export class SebStagingPrivateLiveHarnessBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingPrivateLiveHarnessBlockedError'
  }
}

function blocked() {
  throw new SebStagingPrivateLiveHarnessBlockedError()
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    return Reflect.ownKeys(value).every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      return typeof key === 'string'
        && descriptor !== undefined
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

function validExecutable(value) {
  return Object.isFrozen(value)
    && isRecord(value)
    && typeof value.executeStep === 'function'
}

function validPreflight(value) {
  return Object.isFrozen(value)
    && hasExactFields(value, ['attest', 'closeAll'])
    && typeof value.attest === 'function'
    && typeof value.closeAll === 'function'
}

function validEvidenceSink(value) {
  return Object.isFrozen(value)
    && hasExactFields(value, ['persistFinalEvidence', 'closeAll'])
    && typeof value.persistFinalEvidence === 'function'
    && typeof value.closeAll === 'function'
}

function exactStatus(value, expected) {
  return hasExactFields(value, ['status']) && value.status === expected
}

/**
 * Connect the closure-private S5 capabilities to the canonical live runner and
 * durable evidence sink. The trusted runner result never leaves this closure;
 * callers receive only the terminal run/evidence state.
 */
export function createSebStagingPrivateLiveHarness({
  plan,
  identity,
  preflightCapability,
  fixtureAdapter,
  browserDataCapability,
  nativeOperatorCapability,
  expiryControlCapability,
  runReservationCapability,
  evidenceSink,
} = {}) {
  if (!plan || !identity
    || !validPreflight(preflightCapability)
    || !validExecutable(fixtureAdapter)
    || !validExecutable(browserDataCapability)
    || !validExecutable(nativeOperatorCapability)
    || !validExecutable(expiryControlCapability)
    || !validExecutable(runReservationCapability)
    || !validEvidenceSink(evidenceSink)) blocked()

  let adapter
  try {
    adapter = createSebStagingCompositeAdapter({
      preflightCapability,
      fixtureAdapter,
      browserDataCapability,
      nativeOperatorCapability,
      expiryControlCapability,
      runReservationCapability,
    })
  } catch {
    blocked()
  }

  let attempted = false
  let busy = false

  async function run() {
    if (attempted || busy) return Object.freeze({ status: 'failed', runStatus: 'blocked' })
    attempted = true
    busy = true
    let runStatus = 'blocked'
    let evidencePersisted = false
    let evidenceClosed = false
    try {
      const result = await runSebStagingLiveHarness({ plan, identity, adapter })
      runStatus = typeof result?.status === 'string' ? result.status : 'blocked'
      const persisted = await evidenceSink.persistFinalEvidence({ plan, result })
      evidencePersisted = exactStatus(persisted, 'passed')
    } catch {
      runStatus = 'blocked'
    } finally {
      try {
        const closed = await evidenceSink.closeAll()
        evidenceClosed = exactStatus(closed, 'passed')
      } catch {
        evidenceClosed = false
      }
      busy = false
    }
    return Object.freeze({
      status: runStatus === 'complete' && evidencePersisted && evidenceClosed ? 'passed' : 'failed',
      runStatus,
    })
  }

  return Object.freeze({ run })
}
