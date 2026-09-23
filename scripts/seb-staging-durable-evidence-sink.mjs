import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import {
  lstat,
  mkdir,
  open,
  realpath,
} from 'node:fs/promises'
import { resolve } from 'node:path'

import { createSebStagingDirectoryRelativeIo } from './seb-staging-directory-relative-io.mjs'
import { inspectSebStagingMockHarnessEvidence } from './seb-staging-mock-harness-core.mjs'
import { inspectTrustedSebStagingLiveHarnessResult } from './seb-staging-live-runner.mjs'

const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const FORBIDDEN_RUN_ID_TERMS = /(prod(?:uction)?|live|real|customer)/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const RELEASE_ID = /^asr-[0-9a-f]{32}-r([1-9][0-9]{0,9})-([0-9a-f]{16})$/
const SHA256 = /^[a-f0-9]{64}$/
const MAX_ASSIGNMENT_CONFIG_REVISION = 2_147_483_646
const TERMINAL_STATUSES = new Set(['complete', 'failed', 'cleanup-failed', 'blocked'])
const STEP_STATES = new Set(['pending', 'passed', 'failed'])
const BLOCKED_MESSAGE = 'SEB Staging durable evidence sink blocked'

export class SebStagingDurableEvidenceSinkBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingDurableEvidenceSinkBlockedError'
  }
}

function blocked() {
  throw new SebStagingDurableEvidenceSinkBlockedError()
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
  const actual = Object.keys(value).sort()
  const expected = [...fields].sort()
  return actual.length === expected.length
    && actual.every((field, index) => field === expected[index])
}

function hasOfficialStagingPolicy(environment) {
  return isDataRecord(environment)
    && environment.KORKRU_DEPLOYMENT_ENV === 'staging'
    && environment.EXAM_QA_ENVIRONMENT === 'staging'
    && environment.VERCEL_ENV === 'preview'
    && environment.NEXT_PUBLIC_SITE_URL === OFFICIAL_STAGING_SITE_ORIGIN
    && environment.NEXT_PUBLIC_SUPABASE_URL === OFFICIAL_STAGING_SUPABASE_ORIGIN
    && environment.EXAM_QA_DATA_POLICY === 'synthetic-only'
    && environment.EXAM_QA_COPY_PRODUCTION_DATA === 'false'
    && (
      environment.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'true'
      || environment.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'false'
    )
}

function canonicalTimestamp(value) {
  let timestamp
  try {
    const raw = typeof value === 'function' ? value() : null
    timestamp = raw instanceof Date ? raw.getTime() : new Date(raw).getTime()
  } catch {
    return null
  }
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function parseIdentity(value, runId) {
  const runOnly = hasExactFields(value, ['runId', 'sourceRevision', 'deploymentId'])
  const releaseBound = hasExactFields(value, [
    'runId',
    'sourceRevision',
    'deploymentId',
    'releaseId',
    'releaseRevision',
    'artifactSha256',
  ])
  if (!runOnly && !releaseBound) return null
  if (value.runId !== runId
    || !SAFE_RUN_ID.test(value.runId)
    || FORBIDDEN_RUN_ID_TERMS.test(value.runId)
    || typeof value.sourceRevision !== 'string'
    || !SOURCE_REVISION.test(value.sourceRevision)
    || typeof value.deploymentId !== 'string'
    || !DEPLOYMENT_ID.test(value.deploymentId)) {
    return null
  }

  const identity = {
    runId: value.runId,
    sourceRevision: value.sourceRevision,
    deploymentId: value.deploymentId,
  }
  if (releaseBound) {
    const match = typeof value.releaseId === 'string' ? RELEASE_ID.exec(value.releaseId) : null
    if (match === null
      || !Number.isInteger(value.releaseRevision)
      || value.releaseRevision < 1
      || value.releaseRevision > MAX_ASSIGNMENT_CONFIG_REVISION
      || Number(match[1]) !== value.releaseRevision
      || typeof value.artifactSha256 !== 'string'
      || !SHA256.test(value.artifactSha256)
      || match[2] !== value.artifactSha256.slice(0, 16)) {
      return null
    }
    identity.releaseId = value.releaseId
    identity.releaseRevision = value.releaseRevision
    identity.artifactSha256 = value.artifactSha256
  }
  return Object.freeze(identity)
}

function parseStepEvidence(value, plan) {
  if (!isDataRecord(value) || !Array.isArray(plan?.steps)) return null
  const expectedIds = plan.steps.map(step => step.id)
  const actualIds = Object.keys(value)
  if (actualIds.length !== expectedIds.length
    || actualIds.some((id, index) => id !== expectedIds[index])) {
    return null
  }
  const parsed = {}
  for (const id of expectedIds) {
    if (!STEP_STATES.has(value[id])) return null
    parsed[id] = value[id]
  }
  return Object.freeze(parsed)
}

function parseFinalResult(input, plan) {
  if (inspectTrustedSebStagingLiveHarnessResult(input) !== input) return null
  if (!hasExactFields(input, [
    'schemaVersion',
    'identity',
    'status',
    'stepEvidence',
    'bindingSha256',
  ])
    || input.schemaVersion !== 1
    || !TERMINAL_STATUSES.has(input.status)
    || typeof input.bindingSha256 !== 'string'
    || !SHA256.test(input.bindingSha256)
    || typeof plan?.fixture?.namespace !== 'string') {
    return null
  }
  const runId = plan.fixture.namespace.startsWith('qa:')
    ? plan.fixture.namespace.slice(3)
    : ''
  const identity = parseIdentity(input.identity, runId)
  const stepEvidence = parseStepEvidence(input.stepEvidence, plan)
  if (!identity || !stepEvidence) return null

  let inspection
  try {
    inspection = inspectSebStagingMockHarnessEvidence(plan, stepEvidence)
  } catch {
    return null
  }
  const cleanupState = stepEvidence[plan.cleanupStepId]
  const mutationAttempted = plan.steps.some(step => (
    step.id !== plan.cleanupStepId
      && step.mutates === true
      && stepEvidence[step.id] !== 'pending'
  ))
  const journeyFailed = plan.steps.some(step => (
    step.id !== plan.cleanupStepId && stepEvidence[step.id] === 'failed'
  ))
  const cleanupSatisfied = cleanupState === 'passed'
  if (mutationAttempted
    && input.status !== 'cleanup-failed'
    && !cleanupSatisfied) return null
  const statusMatches = input.status === 'complete'
    ? inspection?.status === 'complete'
      && Object.hasOwn(identity, 'releaseId')
      && cleanupSatisfied
    : input.status === 'cleanup-failed'
      ? mutationAttempted && cleanupState === 'failed'
      : input.status === 'failed'
        ? journeyFailed && cleanupState !== 'failed'
        : inspection?.status !== 'complete'
          && (!mutationAttempted || cleanupSatisfied)
  if (!statusMatches) return null

  const expectedBinding = sha256(JSON.stringify({
    schemaVersion: 1,
    identity,
    status: input.status,
    stepEvidence,
  }))
  if (input.bindingSha256 !== expectedBinding) return null
  return Object.freeze({
    identity,
    status: input.status,
    stepEvidence,
    bindingSha256: expectedBinding,
  })
}

function redactedIdentity(identity) {
  const redacted = {
    runId: identity.runId,
    sourceRevision: identity.sourceRevision,
    deploymentId: identity.deploymentId,
  }
  if (Object.hasOwn(identity, 'releaseId')) {
    redacted.releaseRevision = identity.releaseRevision
    redacted.releaseCommitmentSha256 = sha256(JSON.stringify({
      releaseId: identity.releaseId,
      releaseRevision: identity.releaseRevision,
      artifactSha256: identity.artifactSha256,
    }))
  }
  return Object.freeze(redacted)
}

function buildDocument(result, completedAt) {
  const core = Object.freeze({
    schemaVersion: 1,
    environment: 'staging',
    siteOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
    supabaseOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
    completedAt,
    identity: redactedIdentity(result.identity),
    status: result.status,
    stepEvidence: result.stepEvidence,
    bindingSha256: result.bindingSha256,
  })
  return Object.freeze({
    ...core,
    evidenceSha256: sha256(JSON.stringify(core)),
  })
}

function validStoredDocument(value, expectedResult) {
  if (!hasExactFields(value, [
    'schemaVersion',
    'environment',
    'siteOrigin',
    'supabaseOrigin',
    'completedAt',
    'identity',
    'status',
    'stepEvidence',
    'bindingSha256',
    'evidenceSha256',
  ])
    || value.schemaVersion !== 1
    || value.environment !== 'staging'
    || value.siteOrigin !== OFFICIAL_STAGING_SITE_ORIGIN
    || value.supabaseOrigin !== OFFICIAL_STAGING_SUPABASE_ORIGIN
    || typeof value.completedAt !== 'string'
    || new Date(value.completedAt).toISOString() !== value.completedAt
    || value.bindingSha256 !== expectedResult.bindingSha256
    || value.status !== expectedResult.status
    || JSON.stringify(value.identity) !== JSON.stringify(redactedIdentity(expectedResult.identity))
    || JSON.stringify(value.stepEvidence) !== JSON.stringify(expectedResult.stepEvidence)
    || typeof value.evidenceSha256 !== 'string'
    || !SHA256.test(value.evidenceSha256)) {
    return false
  }
  const { evidenceSha256, ...core } = value
  return evidenceSha256 === sha256(JSON.stringify(core))
}

function publicResult(status) {
  return Object.freeze({ status })
}

function isPrivateDirectoryStat(value) {
  if (typeof process.getuid !== 'function') return false
  const currentUid = process.getuid()
  return Number.isSafeInteger(currentUid)
    && value.isDirectory()
    && !value.isSymbolicLink()
    && String(value.uid) === String(currentUid)
    && typeof value.mode === 'bigint'
    && (value.mode & 0o077n) === 0n
}

/**
 * Persist one terminal S5 run result as an immutable, redacted local record.
 * The final filename is run-bound and is created with a hard link, so a
 * second process cannot overwrite or equivocate about an existing run.
 */
export async function createSebStagingDurableEvidenceSink({
  readEnvironment,
  outputDirectory,
  clock,
  randomBytes = nodeRandomBytes,
} = {}) {
  let initialEnvironment
  try {
    initialEnvironment = typeof readEnvironment === 'function' ? readEnvironment() : null
  } catch {
    blocked()
  }
  if (typeof readEnvironment !== 'function'
    || !hasOfficialStagingPolicy(initialEnvironment)
    || typeof outputDirectory !== 'string'
    || outputDirectory.length === 0
    || outputDirectory.length > 1_024
    || resolve(outputDirectory) !== outputDirectory
    || typeof clock !== 'function'
    || typeof randomBytes !== 'function') {
    blocked()
  }

  await mkdir(outputDirectory, { recursive: true, mode: 0o700 })
  const stat = await lstat(outputDirectory, { bigint: true })
  const canonicalDirectory = await realpath(outputDirectory)
  if (!isPrivateDirectoryStat(stat)) blocked()
  const directoryIdentity = Object.freeze({
    dev: String(stat.dev),
    ino: String(stat.ino),
  })

  let busy = false
  let closed = false
  let closingStarted = false
  const orphanedTemporaryFiles = new Map()
  const uncertainTemporaryNames = new Set()
  const unclosedHandles = new Set()
  let directoryHandle = null
  let directoryIo = null

  function environmentIsExact() {
    try {
      return hasOfficialStagingPolicy(readEnvironment())
    } catch {
      return false
    }
  }

  function sameDirectoryStat(value) {
    return isPrivateDirectoryStat(value)
      && String(value.dev) === directoryIdentity.dev
      && String(value.ino) === directoryIdentity.ino
  }

  async function directoryIsExact() {
    try {
      if (!directoryHandle || !unclosedHandles.has(directoryHandle)) return false
      const [pathStat, canonicalStat, currentRealPath, handleStat] = await Promise.all([
        lstat(outputDirectory, { bigint: true }),
        lstat(canonicalDirectory, { bigint: true }),
        realpath(outputDirectory),
        directoryHandle.stat({ bigint: true }),
      ])
      return currentRealPath === canonicalDirectory
        && sameDirectoryStat(pathStat)
        && sameDirectoryStat(canonicalStat)
        && sameDirectoryStat(handleStat)
    } catch {
      return false
    }
  }

  async function trackedOpen(path, flags, mode = undefined) {
    const handle = mode === undefined
      ? await open(path, flags)
      : await open(path, flags, mode)
    unclosedHandles.add(handle)
    return handle
  }

  async function closeTracked(handle) {
    if (!handle || !unclosedHandles.has(handle)) return true
    try {
      await handle.close()
      unclosedHandles.delete(handle)
      return true
    } catch {
      return false
    }
  }

  async function cleanupOrphans() {
    if (orphanedTemporaryFiles.size === 0) {
      return uncertainTemporaryNames.size === 0
    }
    let passed = true
    for (const [name, ownership] of [...orphanedTemporaryFiles]) {
      const cleanup = await directoryIo.unlinkOwned(ownership)
      if (cleanup.status === 'unlinked') {
        orphanedTemporaryFiles.delete(name)
      } else {
        passed = false
      }
    }
    return passed
      && orphanedTemporaryFiles.size === 0
      && uncertainTemporaryNames.size === 0
  }

  async function readExistingDocument(finalName) {
    try {
      const read = await directoryIo.readRegularFile(finalName)
      return read.status === 'read'
        ? JSON.parse(read.bytes.toString('utf8'))
        : null
    } catch {
      return null
    }
  }

  try {
    directoryHandle = await trackedOpen(
      canonicalDirectory,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
    )
    if (!await directoryIsExact()) throw new Error(BLOCKED_MESSAGE)
    directoryIo = await createSebStagingDirectoryRelativeIo({
      directoryHandle,
      directoryIdentity,
    })
    if (!directoryIo || !await directoryIsExact()) throw new Error(BLOCKED_MESSAGE)
  } catch {
    if (directoryHandle) await closeTracked(directoryHandle)
    blocked()
  }

  async function persistFinalEvidence({ plan, result } = {}) {
    if (busy
      || closed
      || closingStarted
      || !directoryHandle
      || !unclosedHandles.has(directoryHandle)
      || directoryIo.hasUnresolvedObligations()
      || !environmentIsExact()) return publicResult('failed')
    busy = true
    let temporaryName = null
    let temporaryOwnership = null
    let outcome = 'failed'
    try {
      if (!await cleanupOrphans()
        || !await directoryIsExact()) throw new Error(BLOCKED_MESSAGE)
      const parsed = parseFinalResult(result, plan)
      const completedAt = canonicalTimestamp(clock)
      if (!parsed || !completedAt) throw new Error(BLOCKED_MESSAGE)
      const document = buildDocument(parsed, completedAt)
      const bytes = `${JSON.stringify(document, null, 2)}\n`
      let nonce
      try {
        nonce = randomBytes(16)
      } catch {
        throw new Error(BLOCKED_MESSAGE)
      }
      if (!(nonce instanceof Uint8Array) || nonce.byteLength !== 16) {
        throw new Error(BLOCKED_MESSAGE)
      }
      const nonceHex = Buffer.from(nonce).toString('hex')
      const finalName = `${parsed.identity.runId}.json`
      temporaryName = `.${parsed.identity.runId}.${nonceHex}.tmp`
      const created = await directoryIo.createOwnedFile(
        temporaryName,
        Buffer.from(bytes, 'utf8'),
      )
      temporaryOwnership = created.ownership ?? null
      if (created.status !== 'created') {
        if (created.status === 'failed' && temporaryOwnership === null) {
          uncertainTemporaryNames.add(temporaryName)
        }
        throw new Error(BLOCKED_MESSAGE)
      }
      if (!temporaryOwnership || !await directoryIsExact()) {
        throw new Error(BLOCKED_MESSAGE)
      }

      let existing = null
      const publication = await directoryIo.linkOwned(temporaryOwnership, finalName)
      if (publication.status === 'exists') {
        existing = await readExistingDocument(finalName)
        if (!existing || !validStoredDocument(existing, parsed)) {
          throw new Error(BLOCKED_MESSAGE)
        }
      } else if (publication.status !== 'linked') {
        throw new Error(BLOCKED_MESSAGE)
      }
      const removed = await directoryIo.unlinkOwned(temporaryOwnership)
      if (removed.status !== 'unlinked') {
        orphanedTemporaryFiles.set(temporaryName, temporaryOwnership)
        temporaryOwnership = null
        throw new Error(BLOCKED_MESSAGE)
      }
      orphanedTemporaryFiles.delete(temporaryName)
      temporaryOwnership = null
      if (!existing) {
        existing = await readExistingDocument(finalName)
        if (!existing || !validStoredDocument(existing, parsed)) {
          throw new Error(BLOCKED_MESSAGE)
        }
      }
      if (!await directoryIsExact()) throw new Error(BLOCKED_MESSAGE)
      outcome = 'passed'
    } catch {
      outcome = 'failed'
    } finally {
      if (temporaryOwnership) {
        const cleanup = await directoryIo.unlinkOwned(temporaryOwnership)
        if (cleanup.status !== 'unlinked') {
          orphanedTemporaryFiles.set(temporaryName, temporaryOwnership)
        } else {
          orphanedTemporaryFiles.delete(temporaryName)
        }
      }
      if (orphanedTemporaryFiles.size !== 0
        || uncertainTemporaryNames.size !== 0
        || directoryIo.hasUnresolvedObligations()) outcome = 'failed'
      busy = false
    }
    return publicResult(outcome)
  }

  async function closeAll() {
    if (closed) return publicResult('passed')
    if (busy) return publicResult('failed')
    closingStarted = true
    let passed = true
    const helpersQuiescent = await directoryIo.awaitQuiescence()
    if (!helpersQuiescent) passed = false
    if (helpersQuiescent && !await cleanupOrphans()) passed = false
    if (!await directoryIsExact()) passed = false
    if (directoryHandle && !await closeTracked(directoryHandle)) passed = false
    if (unclosedHandles.size !== 0
      || orphanedTemporaryFiles.size !== 0
      || uncertainTemporaryNames.size !== 0
      || directoryIo.hasUnresolvedObligations()) passed = false
    if (passed) closed = true
    return publicResult(passed ? 'passed' : 'failed')
  }

  return Object.freeze({ persistFinalEvidence, closeAll })
}
