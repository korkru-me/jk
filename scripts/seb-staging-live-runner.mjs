import { createHash } from 'node:crypto'

import { inspectSebStagingMockHarnessEvidence } from './seb-staging-mock-harness-core.mjs'

const RUN_IDENTITY_FIELDS = Object.freeze([
  'runId',
  'sourceRevision',
  'deploymentId',
])
const RELEASE_IDENTITY_FIELDS = Object.freeze([
  'releaseId',
  'releaseRevision',
  'artifactSha256',
])
const FULL_IDENTITY_FIELDS = Object.freeze([...RUN_IDENTITY_FIELDS, ...RELEASE_IDENTITY_FIELDS])
const REGISTER_RELEASE_STEP_ID = 'register-assignment-seb-release'
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const FORBIDDEN_RUN_ID_TERMS = /(prod(?:uction)?|live|real|customer)/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const RELEASE_ID = /^asr-[0-9a-f]{32}-r([1-9][0-9]{0,9})-([0-9a-f]{16})$/
const ARTIFACT_SHA256 = /^[a-f0-9]{64}$/
const MAX_ASSIGNMENT_CONFIG_REVISION = 2_147_483_646

function isDataRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(descriptor => (
    Object.hasOwn(descriptor, 'value')
    && descriptor.enumerable === true
  ))
}

function hasExactFields(value, expectedFields) {
  if (!isDataRecord(value)) return false
  const fields = Object.keys(value).sort()
  return fields.length === expectedFields.length
    && fields.every((field, index) => field === [...expectedFields].sort()[index])
}

function parseReleaseIdentity(identity) {
  if (!hasExactFields(identity, RELEASE_IDENTITY_FIELDS)) return null
  const { releaseId, releaseRevision, artifactSha256 } = identity
  const releaseMatch = typeof releaseId === 'string' ? RELEASE_ID.exec(releaseId) : null
  const valid = Number.isInteger(releaseRevision)
    && releaseRevision >= 1
    && releaseRevision <= MAX_ASSIGNMENT_CONFIG_REVISION
    && typeof artifactSha256 === 'string'
    && ARTIFACT_SHA256.test(artifactSha256)
    && releaseMatch !== null
    && Number(releaseMatch[1]) === releaseRevision
    && releaseMatch[2] === artifactSha256.slice(0, 16)
  return valid
    ? Object.freeze({ releaseId, releaseRevision, artifactSha256 })
    : null
}

function parseIdentityManifest(identity, plan) {
  const hasRunOnlyIdentity = hasExactFields(identity, RUN_IDENTITY_FIELDS)
  const hasFullIdentity = hasExactFields(identity, FULL_IDENTITY_FIELDS)
  if (!hasRunOnlyIdentity && !hasFullIdentity) return null

  const { runId, sourceRevision, deploymentId } = identity
  const valid = typeof runId === 'string'
    && SAFE_RUN_ID.test(runId)
    && !FORBIDDEN_RUN_ID_TERMS.test(runId)
    && plan?.fixture?.namespace === `qa:${runId}`
    && typeof sourceRevision === 'string'
    && SOURCE_REVISION.test(sourceRevision)
    && typeof deploymentId === 'string'
    && DEPLOYMENT_ID.test(deploymentId)

  if (!valid) return null
  const runIdentity = Object.freeze({
    runId,
    sourceRevision,
    deploymentId,
  })
  const declaredReleaseIdentity = hasFullIdentity
    ? parseReleaseIdentity({
        releaseId: identity.releaseId,
        releaseRevision: identity.releaseRevision,
        artifactSha256: identity.artifactSha256,
      })
    : null
  if (hasFullIdentity && !declaredReleaseIdentity) return null
  return Object.freeze({ runIdentity, declaredReleaseIdentity })
}

function normalizeIdentityManifest(identity, plan) {
  try {
    return parseIdentityManifest(identity, plan)
  } catch {
    return null
  }
}

function validAdapter(adapter) {
  return adapter !== null
    && typeof adapter === 'object'
    && typeof adapter.executeStep === 'function'
}

function adapterStepResult(result, expectedStepId) {
  if (!isDataRecord(result) || result.stepId !== expectedStepId) {
    return Object.freeze({ state: 'failed', releaseIdentity: null })
  }
  const state = result.status === 'passed' ? 'passed' : 'failed'
  const releaseIdentity = expectedStepId === REGISTER_RELEASE_STEP_ID && state === 'passed'
    ? parseReleaseIdentity(result.releaseIdentity)
    : null
  return Object.freeze({ state, releaseIdentity })
}

async function executeAdapterStep(adapter, step, identity) {
  const request = Object.freeze({
    schemaVersion: 1,
    stepId: step.id,
    phase: step.phase,
    actor: step.actor,
    mutates: step.mutates,
    identity,
  })
  try {
    const result = await adapter.executeStep(request)
    return adapterStepResult(result, step.id)
  } catch {
    return Object.freeze({ state: 'failed', releaseIdentity: null })
  }
}

function sameReleaseIdentity(left, right) {
  return left?.releaseId === right?.releaseId
    && left?.releaseRevision === right?.releaseRevision
    && left?.artifactSha256 === right?.artifactSha256
}

function bindReleaseIdentity(runIdentity, releaseIdentity) {
  return Object.freeze({ ...runIdentity, ...releaseIdentity })
}

function makePendingEvidence(plan) {
  return Object.fromEntries(plan.steps.map(step => [step.id, 'pending']))
}

function immutableEvidence(evidence) {
  return Object.freeze(Object.fromEntries(Object.entries(evidence)))
}

function evidenceBinding(identity, status, evidence) {
  return createHash('sha256').update(JSON.stringify({
    schemaVersion: 1,
    identity,
    status,
    stepEvidence: evidence,
  })).digest('hex')
}

function result(identity, status, evidence) {
  const frozenEvidence = immutableEvidence(evidence)
  const output = {
    schemaVersion: 1,
    identity,
    status,
    stepEvidence: frozenEvidence,
  }
  return Object.freeze({
    ...output,
    bindingSha256: evidenceBinding(identity, status, frozenEvidence),
  })
}

function blockedResult(evidence = {}) {
  return result(null, 'blocked', evidence)
}

function safeInspect(plan, evidence) {
  try {
    return inspectSebStagingMockHarnessEvidence(plan, evidence)
  } catch {
    return null
  }
}

/**
 * Execute one issued Phase S5 plan through a caller-owned adapter. This module
 * creates no client and performs no network operation itself. The adapter must
 * retain all runtime credentials and payloads privately and return only the
 * exact step id plus a passed/failed state.
 */
export async function runSebStagingLiveHarness({ plan, identity, adapter } = {}) {
  const initialInspection = safeInspect(plan, {})
  if (!initialInspection || initialInspection.status === 'blocked') return blockedResult()

  const stepEvidence = makePendingEvidence(plan)
  const normalized = normalizeIdentityManifest(identity, plan)
  if (!normalized) return blockedResult(stepEvidence)
  const { runIdentity, declaredReleaseIdentity } = normalized
  let activeIdentity = declaredReleaseIdentity
    ? bindReleaseIdentity(runIdentity, declaredReleaseIdentity)
    : runIdentity

  if (initialInspection.status === 'inspect-only') {
    return result(activeIdentity, 'inspect-only', stepEvidence)
  }
  if (!validAdapter(adapter)) return blockedResult(stepEvidence)

  const stepById = new Map(plan.steps.map(step => [step.id, step]))
  const cleanupStep = stepById.get(plan.cleanupStepId)
  let failed = false
  let mutationAttempted = false
  let cleanupAttempted = false

  while (!failed) {
    const inspection = safeInspect(plan, stepEvidence)
    if (!inspection) return result(activeIdentity, 'blocked', stepEvidence)
    if (inspection.status === 'complete') break
    if (inspection.status !== 'ready' || inspection.nextStepIds.length === 0) {
      return result(activeIdentity, 'blocked', stepEvidence)
    }

    const stepId = inspection.nextStepIds[0]
    const step = stepById.get(stepId)
    if (!step || stepEvidence[stepId] !== 'pending') {
      return result(activeIdentity, 'blocked', stepEvidence)
    }

    if (step.id === plan.cleanupStepId) cleanupAttempted = true
    else if (step.mutates) mutationAttempted = true

    const execution = await executeAdapterStep(adapter, step, activeIdentity)
    let state = execution.state
    if (stepId === REGISTER_RELEASE_STEP_ID && state === 'passed') {
      const matchesDeclared = !declaredReleaseIdentity
        || sameReleaseIdentity(execution.releaseIdentity, declaredReleaseIdentity)
      if (!execution.releaseIdentity || !matchesDeclared) {
        state = 'failed'
      } else {
        activeIdentity = bindReleaseIdentity(runIdentity, execution.releaseIdentity)
      }
    }
    stepEvidence[stepId] = state
    if (state === 'failed') failed = true
  }

  // A mutating adapter can fail after a partial write. Cleanup is therefore a
  // mandatory emergency action even when the core cannot infer that a failed
  // mutation created data. The core is still consulted immediately beforehand,
  // and only the issued plan's exact run-on-failure cleanup step may execute.
  if (mutationAttempted && !cleanupAttempted && stepEvidence[plan.cleanupStepId] === 'pending') {
    const cleanupInspection = safeInspect(plan, stepEvidence)
    const cleanupIsExact = cleanupStep?.id === plan.cleanupStepId
      && cleanupStep?.runOnFailure === true
      && cleanupStep?.phase === 'cleanup'
    const normallyScheduled = cleanupInspection?.nextStepIds?.[0] === plan.cleanupStepId
    const emergencyCleanup = failed && cleanupIsExact
    if (!cleanupInspection || (!normallyScheduled && !emergencyCleanup)) {
      return result(activeIdentity, 'blocked', stepEvidence)
    }

    cleanupAttempted = true
    const cleanupExecution = await executeAdapterStep(
      adapter,
      cleanupStep,
      activeIdentity,
    )
    stepEvidence[plan.cleanupStepId] = cleanupExecution.state
  }

  const cleanupState = stepEvidence[plan.cleanupStepId]
  if (cleanupState === 'failed') {
    return result(activeIdentity, 'cleanup-failed', stepEvidence)
  }
  if (failed) return result(activeIdentity, 'failed', stepEvidence)

  const finalInspection = safeInspect(plan, stepEvidence)
  const hasFinalReleaseIdentity = hasExactFields(activeIdentity, FULL_IDENTITY_FIELDS)
  return finalInspection?.status === 'complete' && hasFinalReleaseIdentity
    ? result(activeIdentity, 'complete', stepEvidence)
    : result(activeIdentity, 'blocked', stepEvidence)
}
