import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import {
  enrollAssignmentSebStagingArtifact,
  inspectAssignmentSebOperatorEnvironment,
  readAssignmentSebOperatorContext,
} from './seb-assignment-artifact-core.mjs'

const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SHA256 = /^[a-f0-9]{64}$/
const RELEASE_ID = /^asr-[0-9a-f]{32}-r([1-9][0-9]{0,9})-([0-9a-f]{16})$/
const CONFIG_REVISION = new RegExp(`^(${UUID.source.slice(1, -1)}):r([1-9][0-9]{0,9})$`)
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024
const BLOCKED_MESSAGE = 'SEB Staging private native operator capability blocked'
const LEDGER_METHODS = Object.freeze([
  'planTarget', 'adoptDerivedTarget', 'markUncertain', 'commitTarget',
  'reconcileTarget', 'readCleanupTarget', 'markDeleted',
])

export class SebStagingPrivateNativeOperatorCapabilityBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingPrivateNativeOperatorCapabilityBlockedError'
  }
}

function blocked() {
  throw new SebStagingPrivateNativeOperatorCapabilityBlockedError()
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

function parseRunIdentity(value) {
  if (!hasExactFields(value, ['runId', 'sourceRevision', 'deploymentId', 'creationWindow'])
    || !hasExactFields(value.creationWindow, ['notBefore', 'notAfter'])
    || typeof value.runId !== 'string'
    || !SAFE_RUN_ID.test(value.runId)
    || value.runId === 'seb-s5-preview'
    || typeof value.sourceRevision !== 'string'
    || !SOURCE_REVISION.test(value.sourceRevision)
    || typeof value.deploymentId !== 'string'
    || !DEPLOYMENT_ID.test(value.deploymentId)) return null
  const notBefore = Date.parse(value.creationWindow.notBefore)
  const notAfter = Date.parse(value.creationWindow.notAfter)
  if (!Number.isFinite(notBefore) || !Number.isFinite(notAfter) || notAfter <= notBefore) return null
  return Object.freeze({
    runId: value.runId,
    sourceRevision: value.sourceRevision,
    deploymentId: value.deploymentId,
    creationWindow: Object.freeze({
      notBefore: new Date(notBefore).toISOString(),
      notAfter: new Date(notAfter).toISOString(),
    }),
  })
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
  return hasExactFields(value, ['status']) && value.status === 'passed'
}

function readCommitted(ledger, targetKey, kind) {
  const value = ledger.methods.readCleanupTarget.call(
    ledger.wrapper,
    Object.freeze({ schemaVersion: 1, targetKey, kind }),
  )
  if (!hasExactFields(value, ['status', 'state', 'snapshots'])
    || value.status !== 'passed'
    || value.state !== 'committed'
    || !Array.isArray(value.snapshots)
    || value.snapshots.length !== 1
    || value.snapshots[0]?.targetKey !== targetKey
    || value.snapshots[0]?.kind !== kind) return null
  return value.snapshots[0]
}

function readUnplanned(ledger, targetKey, kind) {
  const value = ledger.methods.readCleanupTarget.call(
    ledger.wrapper,
    Object.freeze({ schemaVersion: 1, targetKey, kind }),
  )
  return hasExactFields(value, ['status', 'state', 'snapshots'])
    && value.status === 'passed'
    && value.state === 'unplanned'
    && Array.isArray(value.snapshots)
    && value.snapshots.length === 0
}

function officialEnvironment(value) {
  return isRecord(value)
    && value.KORKRU_DEPLOYMENT_ENV === 'staging'
    && value.EXAM_QA_ENVIRONMENT === 'staging'
    && value.VERCEL_ENV === 'preview'
    && value.NEXT_PUBLIC_SITE_URL === OFFICIAL_STAGING_SITE_ORIGIN
    && value.NEXT_PUBLIC_SUPABASE_URL === OFFICIAL_STAGING_SUPABASE_ORIGIN
    && value.EXAM_QA_DATA_POLICY === 'synthetic-only'
    && value.EXAM_QA_COPY_PRODUCTION_DATA === 'false'
    && value.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'true'
    && value.SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS === 'true'
    && inspectAssignmentSebOperatorEnvironment(value).ready === true
}

function exactRequest(value, identity) {
  return hasExactFields(value, ['schemaVersion', 'stepId', 'phase', 'actor', 'mutates', 'identity'])
    && value.schemaVersion === 1
    && value.stepId === 'register-assignment-seb-release'
    && value.phase === 'teacher-setup'
    && value.actor === 'native-operator'
    && value.mutates === true
    && hasExactFields(value.identity, ['runId', 'sourceRevision', 'deploymentId'])
    && value.identity.runId === identity.runId
    && value.identity.sourceRevision === identity.sourceRevision
    && value.identity.deploymentId === identity.deploymentId
}

function parseCredential(value, namespace) {
  return hasExactFields(value, [
    'schemaVersion', 'targetOrigin', 'credentialKind', 'namespace', 'serviceRoleKey',
  ])
    && value.schemaVersion === 1
    && value.targetOrigin === OFFICIAL_STAGING_SUPABASE_ORIGIN
    && value.credentialKind === 'service-role'
    && value.namespace === namespace
    && typeof value.serviceRoleKey === 'string'
    && value.serviceRoleKey.length >= 20
    && value.serviceRoleKey.length <= 8_192
      ? value.serviceRoleKey
      : null
}

function parseArtifact(value) {
  if (!hasExactFields(value, ['artifactBytes', 'evidence'])) return null
  let bytes
  try { bytes = Buffer.from(value.artifactBytes) } catch { return null }
  return bytes.length >= 1 && bytes.length <= MAX_ARTIFACT_BYTES && value.evidence !== null
    ? Object.freeze({ bytes, evidence: value.evidence })
    : null
}

function ledgerPlan(identity, namespace, target, ownerId, organizationId) {
  return Object.freeze({
    schemaVersion: 1,
    targetKey: target.targetKey,
    kind: target.kind,
    identity,
    namespace,
    ownerId,
    organizationId,
    resourceType: target.resourceType,
  })
}

function ledgerCandidate(identity, namespace, target, ownerId, organizationId, targetId, createdAt) {
  return Object.freeze({
    ...ledgerPlan(identity, namespace, target, ownerId, organizationId),
    targetId,
    createdAt,
  })
}

/** Enroll one manually finalized Windows .seb artifact into the exact S5 run. */
export function createSebStagingPrivateNativeOperatorCapability({
  runIdentity,
  readEnvironment,
  privateRunLedger,
  serviceRoleCredentialProvider,
  nativeArtifactProvider,
  createClient = createSupabaseClient,
  readContext = readAssignmentSebOperatorContext,
  enrollArtifact = enrollAssignmentSebStagingArtifact,
} = {}) {
  const identity = parseRunIdentity(runIdentity)
  const ledger = captureCapability(privateRunLedger, LEDGER_METHODS)
  const artifacts = captureCapability(nativeArtifactProvider, ['readNativeArtifact'])
  let initialEnvironment = null
  try { initialEnvironment = typeof readEnvironment === 'function' ? readEnvironment() : null } catch { blocked() }
  if (!identity || typeof readEnvironment !== 'function' || !officialEnvironment(initialEnvironment)
    || !ledger || !artifacts || typeof serviceRoleCredentialProvider !== 'function'
    || typeof createClient !== 'function' || typeof readContext !== 'function'
    || typeof enrollArtifact !== 'function') blocked()

  const namespace = `qa:${identity.runId}`
  let attempted = false
  let busy = false

  function currentEnvironment() {
    let value = null
    try { value = readEnvironment() } catch { blocked() }
    if (!officialEnvironment(value)) blocked()
    return value
  }

  function ledgerCall(method, ...args) {
    if (!sameCapability(ledger, LEDGER_METHODS)) blocked()
    const result = ledger.methods[method].call(ledger.wrapper, ...args)
    if (!sameCapability(ledger, LEDGER_METHODS)) blocked()
    return result
  }

  async function executeStep(request) {
    if (busy || attempted || !exactRequest(request, identity)) {
      return Object.freeze({ stepId: 'register-assignment-seb-release', status: 'failed' })
    }
    busy = true
    attempted = true
    const targets = Object.freeze([
      Object.freeze({ targetKey: 'release-primary', kind: 'release', resourceType: 'test_plaintext' }),
      Object.freeze({ targetKey: 'assignment-artifact', kind: 'assignmentArtifact', resourceType: 'seb' }),
    ])
    try {
      const environment = currentEnvironment()
      const assignment = readCommitted(ledger, 'assignment-primary', 'assignment')
      const config = readCommitted(ledger, 'config-primary', 'configRevision')
      const configMatch = CONFIG_REVISION.exec(config?.targetId ?? '')
      if (!assignment || !configMatch
        || assignment.targetId !== configMatch[1]
        || !UUID.test(assignment.ownerId ?? '')
        || !UUID.test(assignment.organizationId ?? '')) blocked()
      const revision = Number(configMatch[2])
      for (const target of targets) {
        if (!readUnplanned(ledger, target.targetKey, target.kind)) blocked()
        if (!exactPassed(ledgerCall('planTarget', ledgerPlan(
          identity, namespace, target, assignment.ownerId, assignment.organizationId,
        )))) blocked()
        if (!exactPassed(ledgerCall('markUncertain', Object.freeze({
          schemaVersion: 1, targetKey: target.targetKey, kind: target.kind,
        })))) blocked()
      }
      const controller = new AbortController()
      const artifactRaw = await artifacts.methods.readNativeArtifact.call(
        artifacts.wrapper,
        Object.freeze({
          targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
          namespace,
          assignmentId: assignment.targetId,
          revision,
        }),
        Object.freeze({ signal: controller.signal }),
      )
      const artifact = parseArtifact(artifactRaw)
      if (!artifact) blocked()
      const credential = await serviceRoleCredentialProvider(Object.freeze({
        schemaVersion: 1,
        targetOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
        credentialKind: 'service-role',
        namespace,
        signal: controller.signal,
      }))
      let serviceRoleKey = parseCredential(credential, namespace)
      if (!serviceRoleKey) blocked()
      const admin = createClient(
        OFFICIAL_STAGING_SUPABASE_ORIGIN,
        serviceRoleKey,
        { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
      )
      serviceRoleKey = ''
      const context = await readContext(admin, assignment.targetId, revision)
      const result = await enrollArtifact({
        admin,
        context,
        artifactBytes: artifact.bytes,
        evidence: artifact.evidence,
        environment,
      })
      currentEnvironment()
      const release = result?.release
      if (!release
        || release.assignmentId !== assignment.targetId
        || release.revision !== revision
        || typeof release.releaseId !== 'string'
        || !RELEASE_ID.test(release.releaseId)
        || typeof release.artifactSha256 !== 'string'
        || !SHA256.test(release.artifactSha256)
        || release.securityMode !== 'test_plaintext'
        || typeof release.createdAt !== 'string'
        || !Number.isFinite(Date.parse(release.createdAt))) blocked()
      const storagePath = `assignments/${assignment.targetId}/r${revision}/${release.artifactSha256}.seb`
      const candidates = [
        [targets[0], release.releaseId],
        [targets[1], storagePath],
      ]
      for (const [target, targetId] of candidates) {
        const candidate = ledgerCandidate(
          identity, namespace, target, assignment.ownerId, assignment.organizationId,
          targetId, new Date(release.createdAt).toISOString(),
        )
        if (!exactPassed(ledgerCall(
          'commitTarget',
          Object.freeze({ schemaVersion: 1, targetKey: target.targetKey, kind: target.kind }),
          candidate,
        ))) blocked()
      }
      return Object.freeze({
        stepId: 'register-assignment-seb-release',
        status: 'passed',
        releaseIdentity: Object.freeze({
          releaseId: release.releaseId,
          releaseRevision: revision,
          artifactSha256: release.artifactSha256,
        }),
      })
    } catch {
      return Object.freeze({ stepId: 'register-assignment-seb-release', status: 'failed' })
    } finally {
      busy = false
    }
  }

  return Object.freeze({ executeStep })
}
