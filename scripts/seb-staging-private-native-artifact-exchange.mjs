import {
  constants as fsConstants,
  lstat,
  mkdir,
  open,
  readFile,
  unlink,
} from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes as nodeRandomBytes,
} from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import {
  materializeAssignmentSebPlaintextSeed,
  parseNativeSebEvidence,
  readAssignmentSebOperatorContext,
} from './seb-assignment-artifact-core.mjs'

const SITE_ORIGIN = 'https://staging.korkru.com'
const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SHA256 = /^[a-f0-9]{64}$/
const REQUEST_ID = /^seb-s5-native-[a-z0-9]{24}$/
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024
const MAX_EVIDENCE_BYTES = 24_000
const BLOCKED_MESSAGE = 'SEB Staging private native artifact exchange blocked'

export class SebStagingPrivateNativeArtifactExchangeBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingPrivateNativeArtifactExchangeBlockedError'
  }
}

function blocked() {
  throw new SebStagingPrivateNativeArtifactExchangeBlockedError()
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

function parseIdentity(value) {
  if (!exact(value, ['runId', 'sourceRevision', 'deploymentId', 'creationWindow'])
    || !exact(value.creationWindow, ['notBefore', 'notAfter'])
    || typeof value.runId !== 'string'
    || !SAFE_RUN_ID.test(value.runId)
    || value.runId === 'seb-s5-preview'
    || typeof value.sourceRevision !== 'string'
    || !SOURCE_REVISION.test(value.sourceRevision)
    || typeof value.deploymentId !== 'string'
    || !DEPLOYMENT_ID.test(value.deploymentId)) return null
  const notBefore = Date.parse(value.creationWindow.notBefore)
  const notAfter = Date.parse(value.creationWindow.notAfter)
  return Number.isFinite(notBefore) && Number.isFinite(notAfter) && notAfter > notBefore
    ? Object.freeze({ runId: value.runId, sourceRevision: value.sourceRevision, deploymentId: value.deploymentId })
    : null
}

function officialEnvironment(value) {
  return record(value)
    && value.KORKRU_DEPLOYMENT_ENV === 'staging'
    && value.EXAM_QA_ENVIRONMENT === 'staging'
    && value.VERCEL_ENV === 'preview'
    && value.NEXT_PUBLIC_SITE_URL === SITE_ORIGIN
    && value.NEXT_PUBLIC_SUPABASE_URL === SUPABASE_ORIGIN
    && value.EXAM_QA_DATA_POLICY === 'synthetic-only'
    && value.EXAM_QA_COPY_PRODUCTION_DATA === 'false'
    && value.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'true'
    && value.SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS === 'true'
}

function validSignal(value) {
  try { return value instanceof AbortSignal && value.aborted === false } catch { return false }
}

function parseRequest(value, identity) {
  return Object.isFrozen(value)
    && exact(value, ['targetOrigin', 'namespace', 'assignmentId', 'revision'])
    && value.targetOrigin === SITE_ORIGIN
    && value.namespace === `qa:${identity.runId}`
    && UUID.test(value.assignmentId)
    && Number.isInteger(value.revision)
    && value.revision >= 1
    && value.revision <= 2_147_483_646
      ? Object.freeze({ assignmentId: value.assignmentId, revision: value.revision })
      : null
}

function parseCredential(value, namespace) {
  return exact(value, [
    'schemaVersion', 'targetOrigin', 'credentialKind', 'namespace', 'serviceRoleKey',
  ])
    && value.schemaVersion === 1
    && value.targetOrigin === SUPABASE_ORIGIN
    && value.credentialKind === 'service-role'
    && value.namespace === namespace
    && typeof value.serviceRoleKey === 'string'
    && value.serviceRoleKey.length >= 20
    && value.serviceRoleKey.length <= 8_192
      ? value.serviceRoleKey
      : null
}

function parseAutomationKey(value, namespace) {
  if (!exact(value, ['schemaVersion', 'namespace', 'keyBase64'])
    || value.schemaVersion !== 1
    || value.namespace !== namespace
    || typeof value.keyBase64 !== 'string') return null
  let key
  try { key = Buffer.from(value.keyBase64, 'base64') } catch { return null }
  return key.length === 32 ? key : null
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function encrypt(key, bytes, randomBytes) {
  const iv = randomBytes(12)
  if (!Buffer.isBuffer(iv) || iv.length !== 12) blocked()
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()])
  const tag = cipher.getAuthTag()
  return Object.freeze({ iv, tag, ciphertext })
}

function decrypt(key, envelope) {
  let iv
  let tag
  let ciphertext
  try {
    iv = Buffer.from(envelope.iv, 'base64')
    tag = Buffer.from(envelope.tag, 'base64')
    ciphertext = Buffer.from(envelope.ciphertext, 'base64')
  } catch {
    blocked()
  }
  if (iv.length !== 12 || tag.length !== 16
    || ciphertext.length < 1 || ciphertext.length > MAX_EVIDENCE_BYTES) blocked()
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    blocked()
  } finally {
    iv.fill(0)
    tag.fill(0)
    ciphertext.fill(0)
  }
}

async function ensurePrivateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const metadata = await lstat(directory)
  if (!metadata.isDirectory() || metadata.isSymbolicLink()
    || (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0)) blocked()
}

async function writeExclusive(path, contents) {
  const handle = await open(path, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o600)
  try {
    await handle.writeFile(contents)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function readNoFollow(path) {
  const metadata = await lstat(path)
  if (!metadata.isFile() || metadata.isSymbolicLink()
    || metadata.size < 1 || metadata.size > MAX_EVIDENCE_BYTES) blocked()
  const handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
  try { return await handle.readFile('utf8') } finally { await handle.close() }
}

async function waitForEvidence(path, signal, timeoutMs, pollIntervalMs, sleep) {
  const deadline = Date.now() + timeoutMs
  while (!signal.aborted && Date.now() < deadline) {
    try { return await readNoFollow(path) } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await sleep(pollIntervalMs)
  }
  blocked()
}

/**
 * Materialize the exact assignment seed, exchange only AES-GCM ciphertext with
 * a Windows runner, and return the native evidence inside the operator closure.
 */
export function createSebStagingPrivateNativeArtifactExchange({
  runIdentity,
  readEnvironment,
  serviceRoleCredentialProvider,
  automationKeyProvider,
  templatePath,
  exchangeDirectory,
  onRequestReady = async () => {},
  createClient = createSupabaseClient,
  readContext = readAssignmentSebOperatorContext,
  randomBytes = nodeRandomBytes,
  timeoutMs = 30 * 60_000,
  pollIntervalMs = 500,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
} = {}) {
  const identity = parseIdentity(runIdentity)
  let environment = null
  try { environment = typeof readEnvironment === 'function' ? readEnvironment() : null } catch { blocked() }
  if (!identity || typeof readEnvironment !== 'function' || !officialEnvironment(environment)
    || typeof serviceRoleCredentialProvider !== 'function'
    || typeof automationKeyProvider !== 'function'
    || typeof templatePath !== 'string' || !isAbsolute(templatePath)
    || typeof exchangeDirectory !== 'string' || !isAbsolute(exchangeDirectory)
    || typeof onRequestReady !== 'function'
    || typeof createClient !== 'function' || typeof readContext !== 'function'
    || typeof randomBytes !== 'function'
    || !Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 45 * 60_000
    || !Number.isInteger(pollIntervalMs) || pollIntervalMs < 25 || pollIntervalMs > 5_000
    || typeof sleep !== 'function') blocked()

  const namespace = `qa:${identity.runId}`
  let attempted = false
  let busy = false

  function currentEnvironment() {
    let current
    try { current = readEnvironment() } catch { blocked() }
    if (!officialEnvironment(current)) blocked()
  }

  async function readNativeArtifact(requestInput, options) {
    const request = parseRequest(requestInput, identity)
    const signal = exact(options, ['signal']) && validSignal(options.signal) ? options.signal : null
    if (!request || !signal || attempted || busy) blocked()
    attempted = true
    busy = true
    let key = null
    let seedBytes = null
    let compressed = null
    let succeeded = false
    const requestPath = join(exchangeDirectory, 'request.json')
    const evidencePath = join(exchangeDirectory, 'evidence.enc.json')
    try {
      currentEnvironment()
      await ensurePrivateDirectory(exchangeDirectory)
      const credential = await serviceRoleCredentialProvider(Object.freeze({
        schemaVersion: 1,
        targetOrigin: SUPABASE_ORIGIN,
        credentialKind: 'service-role',
        namespace,
        signal,
      }))
      let serviceRoleKey = parseCredential(credential, namespace)
      if (!serviceRoleKey || signal.aborted) blocked()
      const admin = createClient(SUPABASE_ORIGIN, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      })
      serviceRoleKey = ''
      const context = await readContext(admin, request.assignmentId, request.revision)
      if (context?.assignmentId !== request.assignmentId
        || context?.revision !== request.revision
        || typeof context?.hashedQuitPassword !== 'string'
        || !SHA256.test(context.hashedQuitPassword)
        || context.existingRelease) blocked()
      const templateBytes = await readFile(templatePath)
      seedBytes = materializeAssignmentSebPlaintextSeed(
        templateBytes,
        context.hashedQuitPassword,
        randomBytes,
      )
      if (seedBytes.length < 1 || seedBytes.length > MAX_ARTIFACT_BYTES) blocked()
      const keyResponse = await automationKeyProvider(Object.freeze({
        schemaVersion: 1,
        namespace,
        purpose: 'windows-native-evidence-exchange',
      }))
      key = parseAutomationKey(keyResponse, namespace)
      if (!key || signal.aborted) blocked()
      compressed = gzipSync(seedBytes, { level: 9 })
      const encrypted = encrypt(key, compressed, randomBytes)
      const requestId = `seb-s5-native-${randomBytes(12).toString('hex')}`
      if (!REQUEST_ID.test(requestId)) blocked()
      const requestPayload = Object.freeze({
        schemaVersion: 1,
        requestId,
        assignmentId: request.assignmentId,
        revision: request.revision,
        seedSha256: sha256(seedBytes),
        payloadIv: encrypted.iv.toString('base64'),
        payloadTag: encrypted.tag.toString('base64'),
        payloadCiphertext: encrypted.ciphertext.toString('base64'),
      })
      await writeExclusive(requestPath, `${JSON.stringify(requestPayload)}\n`)
      encrypted.iv.fill(0)
      encrypted.tag.fill(0)
      encrypted.ciphertext.fill(0)
      await onRequestReady(Object.freeze({ requestId }))
      const rawEnvelope = await waitForEvidence(
        evidencePath, signal, timeoutMs, pollIntervalMs, sleep,
      )
      let envelope
      try { envelope = JSON.parse(rawEnvelope) } catch { blocked() }
      if (!exact(envelope, ['schemaVersion', 'requestId', 'seedSha256', 'iv', 'tag', 'ciphertext'])
        || envelope.schemaVersion !== 1
        || envelope.requestId !== requestId
        || envelope.seedSha256 !== requestPayload.seedSha256) blocked()
      const evidenceBytes = decrypt(key, envelope)
      let evidence
      try { evidence = JSON.parse(evidenceBytes.toString('utf8')) } catch { blocked() } finally {
        evidenceBytes.fill(0)
      }
      parseNativeSebEvidence(evidence, request.assignmentId, request.revision)
      currentEnvironment()
      await unlink(evidencePath)
      await unlink(requestPath)
      succeeded = true
      return Object.freeze({ artifactBytes: seedBytes, evidence })
    } catch {
      blocked()
    } finally {
      busy = false
      if (key) key.fill(0)
      if (compressed) compressed.fill(0)
      // The caller owns the returned artifact buffer on success. Failed
      // exchanges wipe their in-memory copy regardless of filesystem state.
      if (!succeeded && seedBytes) seedBytes.fill(0)
    }
  }

  return Object.freeze({ readNativeArtifact })
}
