import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { buildSebStagingMockHarnessPlan } from './seb-staging-mock-harness-core.mjs'
import { createSebStagingLivePreflight } from './seb-staging-live-preflight.mjs'
import { createSebStagingPrivateRunLedger } from './seb-staging-private-run-ledger.mjs'
import {
  createSebStagingSupabaseLedgerReconciliationAttestation,
  createSebStagingSupabaseNarrowDriverFactory,
} from './seb-staging-supabase-narrow-driver.mjs'
import {
  createSebStagingResourceCleanupParticipants,
  createSebStagingResourceCleanupTopology,
} from './seb-staging-resource-cleanup-participants.mjs'
import { createSebStagingResourceCleanupRuntime } from './seb-staging-resource-cleanup-runtime.mjs'
import { createSebStagingAggregateCleanupCapability } from './seb-staging-aggregate-cleanup.mjs'
import { createSebStagingRunReservation } from './seb-staging-run-reservation.mjs'
import { createSebStagingPrivateReleaseMaterialProvider } from './seb-staging-private-release-material-provider.mjs'
import { createSebStagingPrivateNativeBrowserCapability } from './seb-staging-private-native-browser-capability.mjs'
import { createSebStagingPrivateClassroomStack } from './seb-staging-private-classroom-stack.mjs'
import { createSebStagingFixtureAdapter } from './seb-staging-fixture-adapter.mjs'
import { createSebStagingPrivateNativeArtifactExchange } from './seb-staging-private-native-artifact-exchange.mjs'
import { createSebStagingPrivateNativeOperatorCapability } from './seb-staging-private-native-operator-capability.mjs'
import { createSebStagingPrivateExpiryControl } from './seb-staging-private-expiry-control.mjs'
import { createSebStagingDurableEvidenceSink } from './seb-staging-durable-evidence-sink.mjs'
import { createSebStagingPrivateLiveHarness } from './seb-staging-private-live-harness.mjs'

const SITE_ORIGIN = 'https://staging.korkru.com'
const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const PROJECT_REF = 'dyuxkrzeveknqgtuzpbh'
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const BLOCKED_MESSAGE = 'SEB Staging private live stack blocked'

export class SebStagingPrivateLiveStackBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingPrivateLiveStackBlockedError'
  }
}
function blocked() {
  throw new SebStagingPrivateLiveStackBlockedError()
}

function record(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return (prototype === Object.prototype || prototype === null)
      && Reflect.ownKeys(value).every(key => {
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

function exact(value, fields) {
  if (!record(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...fields].sort()
  return actual.length === expected.length
    && actual.every((field, index) => field === expected[index])
}

function validIdentity(value) {
  if (!Object.isFrozen(value)
    || !exact(value, ['runId', 'sourceRevision', 'deploymentId', 'creationWindow'])
    || !exact(value.creationWindow, ['notBefore', 'notAfter'])
    || !SAFE_RUN_ID.test(value.runId)
    || value.runId === 'seb-s5-preview'
    || !SOURCE_REVISION.test(value.sourceRevision)
    || !DEPLOYMENT_ID.test(value.deploymentId)) return false
  const notBefore = Date.parse(value.creationWindow.notBefore)
  const notAfter = Date.parse(value.creationWindow.notAfter)
  return Number.isFinite(notBefore) && Number.isFinite(notAfter) && notAfter > notBefore
}

function exactPassed(value) {
  return Object.isFrozen(value) && exact(value, ['status']) && value.status === 'passed'
}

function serviceClient(serviceRoleKey) {
  return createSupabaseClient(SUPABASE_ORIGIN, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

function createPrivateServiceBoundaries(serviceRoleCredentialProvider, namespace) {
  async function readKey(signal) {
    const value = await serviceRoleCredentialProvider(Object.freeze({
      schemaVersion: 1,
      targetOrigin: SUPABASE_ORIGIN,
      credentialKind: 'service-role',
      namespace,
      signal,
    }))
    if (!exact(value, [
      'schemaVersion', 'targetOrigin', 'credentialKind', 'namespace', 'serviceRoleKey',
    ])
      || value.schemaVersion !== 1
      || value.targetOrigin !== SUPABASE_ORIGIN
      || value.credentialKind !== 'service-role'
      || value.namespace !== namespace
      || typeof value.serviceRoleKey !== 'string'
      || value.serviceRoleKey.length < 20) blocked()
    return value.serviceRoleKey
  }

  async function fixtureAdminFactory(request) {
    if (!Object.isFrozen(request)
      || request.targetOrigin !== SUPABASE_ORIGIN
      || request.credentialKind !== 'service-role'
      || !(request.signal instanceof AbortSignal)
      || request.signal.aborted) blocked()
    let key = await readKey(request.signal)
    const client = serviceClient(key)
    key = ''
    return Object.freeze({ targetOrigin: SUPABASE_ORIGIN, credentialKind: 'service-role', client })
  }

  async function reservationClientFactory(request) {
    if (!Object.isFrozen(request)
      || !exact(request, ['targetOrigin', 'credentialKind'])
      || request.targetOrigin !== SUPABASE_ORIGIN
      || request.credentialKind !== 'service-role') blocked()
    const signal = new AbortController().signal
    let key = await readKey(signal)
    const client = serviceClient(key)
    key = ''
    return Object.freeze({ targetOrigin: SUPABASE_ORIGIN, credentialKind: 'service-role', client })
  }

  async function preflightAdminFactory(request, signal) {
    if (!Object.isFrozen(request)
      || !exact(request, ['schemaVersion', 'targetOrigin', 'projectRef', 'access'])
      || request.schemaVersion !== 1
      || request.targetOrigin !== SUPABASE_ORIGIN
      || request.projectRef !== PROJECT_REF
      || request.access !== 'read-only-schema-probe'
      || !(signal instanceof AbortSignal)
      || signal.aborted) blocked()
    let key = await readKey(signal)
    const client = serviceClient(key)
    key = ''
    return Object.freeze({
      targetOrigin: SUPABASE_ORIGIN,
      projectRef: PROJECT_REF,
      client,
      close: async () => Object.freeze({ status: 'passed' }),
    })
  }

  return Object.freeze({ fixtureAdminFactory, reservationClientFactory, preflightAdminFactory })
}

/**
 * Compose the complete private S5 runtime. The returned surface is one coarse
 * run method; all credentials, clients, browser handles, native keys and exact
 * fixture identifiers remain inside the closure.
 */
export async function createSebStagingPrivateLiveStack({
  runIdentity,
  readEnvironment,
  serviceRoleCredentialProvider,
  browserSecretProvider,
  sessionSecretProvider,
  automationKeyProvider,
  readVercelToken,
  readProtectionBypass,
  nativeTemplatePath,
  nativeExchangeDirectory,
  evidenceDirectory,
  onNativeRequestReady = async () => {},
  fetchImplementation = globalThis.fetch,
  clock = () => new Date(),
  randomBytes = nodeRandomBytes,
  userScopedReadProbe = undefined,
} = {}) {
  let initialEnvironment
  try { initialEnvironment = typeof readEnvironment === 'function' ? readEnvironment() : null } catch { blocked() }
  if (!validIdentity(runIdentity)
    || !record(initialEnvironment)
    || typeof serviceRoleCredentialProvider !== 'function'
    || typeof browserSecretProvider !== 'function'
    || !Object.isFrozen(sessionSecretProvider)
    || !exact(sessionSecretProvider, ['readSessionSecret'])
    || typeof sessionSecretProvider.readSessionSecret !== 'function'
    || typeof automationKeyProvider !== 'function'
    || typeof readVercelToken !== 'function'
    || typeof readProtectionBypass !== 'function'
    || typeof nativeTemplatePath !== 'string'
    || typeof nativeExchangeDirectory !== 'string'
    || typeof evidenceDirectory !== 'string'
    || typeof onNativeRequestReady !== 'function'
    || typeof fetchImplementation !== 'function'
    || typeof clock !== 'function'
    || typeof randomBytes !== 'function'
    || (userScopedReadProbe !== undefined && typeof userScopedReadProbe !== 'function')) blocked()

  const namespace = `qa:${runIdentity.runId}`
  const plan = buildSebStagingMockHarnessPlan({
    environment: initialEnvironment,
    mode: 'execute',
    runId: runIdentity.runId,
    writeConfirmation: 'CONFIRM_SYNTHETIC_SEB_STAGING_WRITE',
  })
  if (!plan.executionAuthorized) blocked()

  let classroom = null
  let cleanupRuntime = null
  let evidenceSink = null
  try {
    const reconciliationClient = createSebStagingSupabaseLedgerReconciliationAttestation({
      readEnvironment,
      namespace,
      serviceRoleCredentialProvider,
      fetchImplementation,
    })
    const privateRunLedger = createSebStagingPrivateRunLedger({
      schemaVersion: 1,
      identity: runIdentity,
      namespace,
      readEnvironment,
      reconciliationClient,
      reconciliationTimeoutMs: 5_000,
      clock,
    })
    const topology = createSebStagingResourceCleanupTopology(runIdentity)
    const narrowFactory = createSebStagingSupabaseNarrowDriverFactory({
      readEnvironment,
      serviceRoleCredentialProvider,
      fetchImplementation,
    })
    cleanupRuntime = createSebStagingResourceCleanupRuntime({
      readEnvironment,
      topology,
      serviceRoleCredentialProvider: narrowFactory.serviceRoleCredentialProvider,
      createServiceRoleClient: narrowFactory.createServiceRoleClient,
    })
    const participants = createSebStagingResourceCleanupParticipants({
      readEnvironment,
      topology,
      privateRunLedger,
      answerStorageClient: cleanupRuntime.answerStorageClient,
      artifactStorageClient: cleanupRuntime.artifactStorageClient,
      databaseClient: cleanupRuntime.databaseClient,
      personalOrganizationsClient: cleanupRuntime.personalOrganizationsClient,
    })
    const boundaries = createPrivateServiceBoundaries(serviceRoleCredentialProvider, namespace)
    const runReservationCapability = createSebStagingRunReservation({
      readEnvironment,
      identity: runIdentity,
      serviceRoleClientFactory: boundaries.reservationClientFactory,
      randomBytes,
    })
    const aggregateCleanup = createSebStagingAggregateCleanupCapability({
      readEnvironment,
      ...participants,
      runReservation: runReservationCapability,
    })
    let cleanupComplete = false
    const resourceCleanupCapability = Object.freeze({
      async cleanupRun(request) {
        if (cleanupComplete) return Object.freeze({ status: 'passed' })
        const resources = await aggregateCleanup.cleanupRun(request)
        if (!exactPassed(resources)) return Object.freeze({ status: 'failed' })
        const runtime = await cleanupRuntime.closeAll()
        cleanupComplete = exactPassed(runtime)
        return Object.freeze({ status: cleanupComplete ? 'passed' : 'failed' })
      },
    })

    const releaseMaterialProvider = createSebStagingPrivateReleaseMaterialProvider({
      runIdentity,
      readEnvironment,
      serviceRoleCredentialProvider,
      fetchImplementation,
    })
    const nativeSebCapability = createSebStagingPrivateNativeBrowserCapability({
      runIdentity,
      readEnvironment,
      privateRunLedger,
      releaseMaterialProvider,
    })
    classroom = await createSebStagingPrivateClassroomStack({
      runIdentity,
      readEnvironment,
      privateRunLedger,
      serviceRoleCredentialProvider,
      secretProvider: browserSecretProvider,
      userScopedReadProbe,
      clock,
      nativeSebCapability,
      fetchImplementation,
    })
    const fixtureAdapter = createSebStagingFixtureAdapter({
      readEnvironment,
      runId: runIdentity.runId,
      runIdentity,
      privateRunLedger,
      adminClientFactory: boundaries.fixtureAdminFactory,
      browserSessionCapability: classroom.browserSessionCapability,
      browserDataLifecycleCapability: classroom.browserDataLifecycleCapability,
      resourceCleanupCapability,
      randomBytes,
      clock,
    })
    const nativeArtifactProvider = createSebStagingPrivateNativeArtifactExchange({
      runIdentity,
      readEnvironment,
      serviceRoleCredentialProvider,
      automationKeyProvider,
      templatePath: nativeTemplatePath,
      exchangeDirectory: nativeExchangeDirectory,
      onRequestReady: onNativeRequestReady,
    })
    const nativeOperatorCapability = createSebStagingPrivateNativeOperatorCapability({
      runIdentity,
      readEnvironment,
      privateRunLedger,
      serviceRoleCredentialProvider,
      nativeArtifactProvider,
    })
    const expiryControlCapability = createSebStagingPrivateExpiryControl({
      runIdentity,
      readEnvironment,
      privateRunLedger,
      sessionSecretProvider,
      clock,
    })
    const preflightCapability = createSebStagingLivePreflight({
      readVercelToken,
      readProtectionBypass,
      fetchImpl: fetchImplementation,
      adminClientFactory: boundaries.preflightAdminFactory,
    })
    evidenceSink = await createSebStagingDurableEvidenceSink({
      readEnvironment,
      outputDirectory: evidenceDirectory,
      clock,
      randomBytes,
    })
    return createSebStagingPrivateLiveHarness({
      plan,
      identity: Object.freeze({
        runId: runIdentity.runId,
        sourceRevision: runIdentity.sourceRevision,
        deploymentId: runIdentity.deploymentId,
      }),
      preflightCapability,
      fixtureAdapter,
      browserDataCapability: classroom.browserDataCapability,
      nativeOperatorCapability,
      expiryControlCapability,
      runReservationCapability,
      evidenceSink,
    })
  } catch {
    try { await classroom?.closeAll() } catch { /* redacted */ }
    try { await cleanupRuntime?.closeAll() } catch { /* redacted */ }
    try { await evidenceSink?.closeAll() } catch { /* redacted */ }
    blocked()
  }
}
