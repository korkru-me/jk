import { signSebClaimsCore, verifySebClaimsCore } from '../lib/seb-claims-core.mjs'

const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const RELEASE_ID = /^asr-[0-9a-f]{32}-r([1-9][0-9]{0,9})-([0-9a-f]{16})$/
const SHA256 = /^[a-f0-9]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const BLOCKED_MESSAGE = 'SEB Staging private expiry control blocked'
const WINDOWS_VERSION = 'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser'
const EXPIRY_STEPS = Object.freeze(new Map([
  ['reject-expired-seb-challenge', Object.freeze({ phase: 'negative-session', actor: 'staging-qa-control', kind: 'seb_challenge' })],
  ['reject-expired-seb-session', Object.freeze({ phase: 'negative-session', actor: 'staging-qa-control', kind: 'seb_session' })],
]))
const LEDGER_METHODS = Object.freeze([
  'planTarget', 'adoptDerivedTarget', 'markUncertain', 'commitTarget',
  'reconcileTarget', 'readCleanupTarget', 'markDeleted',
])

export class SebStagingPrivateExpiryControlBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingPrivateExpiryControlBlockedError'
  }
}

function blocked() {
  throw new SebStagingPrivateExpiryControlBlockedError()
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

function parseRequest(request, identity) {
  const spec = EXPIRY_STEPS.get(request?.stepId)
  if (!spec
    || !hasExactFields(request, ['schemaVersion', 'stepId', 'phase', 'actor', 'mutates', 'identity'])
    || request.schemaVersion !== 1
    || request.phase !== spec.phase
    || request.actor !== spec.actor
    || request.mutates !== false
    || !hasExactFields(request.identity, [
      'runId', 'sourceRevision', 'deploymentId', 'releaseId', 'releaseRevision', 'artifactSha256',
    ])
    || request.identity.runId !== identity.runId
    || request.identity.sourceRevision !== identity.sourceRevision
    || request.identity.deploymentId !== identity.deploymentId
    || typeof request.identity.releaseId !== 'string'
    || typeof request.identity.artifactSha256 !== 'string'
    || !SHA256.test(request.identity.artifactSha256)) return null
  const match = RELEASE_ID.exec(request.identity.releaseId)
  if (!match
    || !Number.isInteger(request.identity.releaseRevision)
    || Number(match[1]) !== request.identity.releaseRevision
    || match[2] !== request.identity.artifactSha256.slice(0, 16)) return null
  return Object.freeze({
    stepId: request.stepId,
    kind: spec.kind,
    releaseId: request.identity.releaseId,
    releaseRevision: request.identity.releaseRevision,
  })
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
    && value.EXAM_QA_SEB_TIME_CONTROL === 'true'
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

function exactCommittedTarget(ledger, targetKey, kind) {
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
    || value.snapshots[0]?.kind !== kind
    || typeof value.snapshots[0]?.targetId !== 'string') return null
  return value.snapshots[0].targetId
}

function clockNow(clock) {
  let value
  try { value = clock() } catch { return null }
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isSafeInteger(timestamp) ? timestamp : null
}

function claimsFor(kind, studentId, assignmentId, releaseId, releaseRevision, now) {
  const issuedAt = now - 10 * 60_000
  const expiresAt = now - 1
  if (kind === 'seb_challenge') {
    return Object.freeze({
      kind,
      userId: studentId,
      assignmentId,
      configRevision: releaseId,
      assignmentConfigRevision: releaseRevision,
      purpose: 'system_check',
      nonce: '0123456789abcdef0123456789abcdef',
      issuedAt,
      expiresAt,
    })
  }
  return Object.freeze({
    kind,
    userId: studentId,
    assignmentId,
    configRevision: releaseId,
    assignmentConfigRevision: releaseRevision,
    platform: 'windows',
    version: WINDOWS_VERSION,
    issuedAt,
    expiresAt,
  })
}

/**
 * Create the server-side-only expiry seam. It signs one synthetic claim in a
 * private closure, proves that the production verifier accepts it immediately
 * before expiry, then proves rejection at the real expiry boundary. No token,
 * secret, claim, identifier or clock value leaves the capability.
 */
export function createSebStagingPrivateExpiryControl({
  runIdentity,
  readEnvironment,
  privateRunLedger,
  sessionSecretProvider,
  clock,
} = {}) {
  const identity = parseRunIdentity(runIdentity)
  const ledger = captureCapability(privateRunLedger, LEDGER_METHODS)
  const secret = captureCapability(sessionSecretProvider, ['readSessionSecret'])
  let environment = null
  try { environment = typeof readEnvironment === 'function' ? readEnvironment() : null } catch { blocked() }
  if (!identity
    || typeof readEnvironment !== 'function'
    || !officialEnvironment(environment)
    || !ledger
    || !secret
    || typeof clock !== 'function') blocked()

  const attempted = new Set()
  let busy = false

  function currentEnvironment() {
    let value = null
    try { value = readEnvironment() } catch { blocked() }
    if (!officialEnvironment(value)) blocked()
  }

  async function executeStep(request) {
    const parsed = parseRequest(request, identity)
    if (!parsed || busy || attempted.has(parsed.stepId)) {
      return Object.freeze({ stepId: parsed?.stepId ?? 'invalid-step', status: 'failed' })
    }
    busy = true
    attempted.add(parsed.stepId)
    try {
      currentEnvironment()
      if (!sameCapability(ledger, LEDGER_METHODS)
        || !sameCapability(secret, ['readSessionSecret'])) blocked()
      const assignmentId = exactCommittedTarget(ledger, 'assignment-primary', 'assignment')
      const studentId = exactCommittedTarget(ledger, 'account-student-primary', 'account')
      const now = clockNow(clock)
      if (!UUID.test(assignmentId ?? '') || !UUID.test(studentId ?? '') || now === null) blocked()
      const rawSecret = await secret.methods.readSessionSecret.call(
        secret.wrapper,
        Object.freeze({
          targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
          namespace: `qa:${identity.runId}`,
          purpose: 'offline-expiry-verification',
        }),
      )
      if (typeof rawSecret !== 'string' || rawSecret.length < 32 || rawSecret.length > 8_192) blocked()
      const claims = claimsFor(
        parsed.kind,
        studentId,
        assignmentId,
        parsed.releaseId,
        parsed.releaseRevision,
        now,
      )
      const token = signSebClaimsCore(claims, rawSecret)
      const acceptedBeforeExpiry = verifySebClaimsCore(token, rawSecret, claims.expiresAt - 1)
      const rejectedAtExpiry = verifySebClaimsCore(token, rawSecret, claims.expiresAt)
      currentEnvironment()
      if (!acceptedBeforeExpiry || rejectedAtExpiry !== null) blocked()
      return Object.freeze({ stepId: parsed.stepId, status: 'passed' })
    } catch {
      return Object.freeze({ stepId: parsed?.stepId ?? 'invalid-step', status: 'failed' })
    } finally {
      busy = false
    }
  }

  return Object.freeze({ executeStep })
}
