import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { open, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { XMLValidator } from 'fast-xml-parser'
import { inspectEnvFilePermission, parseEnvFile } from './check-seb-readiness-core.mjs'
import {
  ASSIGNMENT_SEB_BUCKET, ASSIGNMENT_SEB_UAT_ORIGIN, ASSIGNMENT_SEB_STAGING_SUPABASE_ORIGIN,
  WINDOWS_SEB_VERSION, WINDOWS_SEB_BUILD, SebArtifactOperatorError,
  assignmentSebArtifactIdentity, assignmentSebPlistHelpers, operatorEnvironmentBlockerFields, parseMultiPlatformNativeSebEvidence,
  validAssignmentId, validAssignmentRevision,
} from './seb-assignment-artifact-core.mjs'
import { verifyStoredAssignmentSebArtifactAndRegister } from '../lib/seb-assignment-release-registration.mjs'
import {
  WAITING_SEB_PROFILE_ID, SebWaitingArtifactError, createWaitingSebArtifactPolicy, freezeWaitingSebArtifact,
  materializeWaitingSebInitialArtifact, materializeWaitingSebTerminalArtifact, readFrozenWaitingSebArtifact,
} from './seb-waiting-artifact-core.mjs'

const SHA256 = /^[0-9a-f]{64}$/
const MAX_ARTIFACT = 2 * 1024 * 1024
const MAX_EVIDENCE = 24_000
const AUTH_ORIGINS = new Set([ASSIGNMENT_SEB_STAGING_SUPABASE_ORIGIN, 'https://accounts.google.com'])
const reconciliationReceipts = new WeakMap()
const fail = code => { throw new SebArtifactOperatorError(code) }

export function waitingOperatorEnvironmentBlockers(environment) {
  const blockers = [...operatorEnvironmentBlockerFields(environment)]
  for (const [field, expected] of [
    ['KORKRU_DEPLOYMENT_ENV', 'staging'], ['NEXT_PUBLIC_SITE_URL', ASSIGNMENT_SEB_UAT_ORIGIN],
    ['SEB_UAT_ISOLATED_PROJECT', 'true'], ['NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL', 'korkru-seb-uat.vercel.app'],
    ['SEB_EXAM_WAITING_ENABLED', 'true'],
  ]) if (environment[field] !== expected) blockers.push(field)
  return [...new Set(blockers)]
}

/** Strict flags; unknown options, repeated scalars and revision aliases fail. */
export function parseWaitingOperatorArguments(argv, mode) {
  if (!Array.isArray(argv) || !['prepare', 'enroll'].includes(mode)) fail('SEB_WAITING_OPERATOR_ARGUMENTS_INVALID')
  const required = mode === 'prepare' ? ['assignment', 'revision', 'template', 'output']
    : ['assignment', 'revision', 'artifact', 'native-final-sha256', 'manifest-output']
  const allowed = new Set([...required, 'env-file', ...(mode === 'prepare' ? ['admin-password-output'] : ['evidence-file', 'terminal-output'])])
  const values = {}, authOrigins = []
  let apply = false
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--apply') {
      if (apply) fail('SEB_WAITING_OPERATOR_ARGUMENTS_INVALID')
      apply = true; continue
    }
    if (typeof token !== 'string' || !token.startsWith('--')) fail('SEB_WAITING_OPERATOR_ARGUMENTS_INVALID')
    const key = token.slice(2), value = argv[++index]
    if (typeof value !== 'string' || !value || value.startsWith('--')) fail('SEB_WAITING_OPERATOR_ARGUMENTS_INVALID')
    if (key === 'auth-origin') {
      if (!AUTH_ORIGINS.has(value) || authOrigins.includes(value)) fail('SEB_WAITING_OPERATOR_AUTH_ORIGIN_INVALID')
      authOrigins.push(value); continue
    }
    if (!allowed.has(key) || Object.hasOwn(values, key)) fail('SEB_WAITING_OPERATOR_ARGUMENTS_INVALID')
    values[key] = value
  }
  if (required.some(key => !values[key])) fail('SEB_WAITING_OPERATOR_ARGUMENTS_INVALID')
  const revision = Number(values.revision)
  if (!validAssignmentId(values.assignment) || values.assignment !== values.assignment.toLowerCase()
    || !/^[1-9][0-9]{0,9}$/.test(values.revision) || !validAssignmentRevision(revision)) fail('SEB_OPERATOR_TARGET_INVALID')
  if (mode === 'enroll' && !SHA256.test(values['native-final-sha256'])) fail('SEB_WAITING_OPERATOR_NATIVE_FINAL_INVALID')
  // A single command may never overwrite its own template/final/evidence/env
  // or use one output for credentials, config bytes and public metadata.
  const inputs = ['template', 'artifact', 'env-file', 'evidence-file'].filter(key => values[key]).map(key => resolve(values[key]))
  const outputs = ['output', 'admin-password-output', 'terminal-output', 'manifest-output'].filter(key => values[key]).map(key => resolve(values[key]))
  if (new Set(outputs).size !== outputs.length || outputs.some(path => inputs.includes(path))) fail('SEB_WAITING_OPERATOR_OUTPUT_CONFLICT')
  return Object.freeze({ ...values, revision, apply, authOrigins: Object.freeze(authOrigins.sort()) })
}

/** No symlink following, bounded reads; credential-bearing inputs owner-only. */
export async function readWaitingOperatorFile(path, { privateFile = false, maxBytes = MAX_ARTIFACT } = {}) {
  let handle
  try {
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_ARTIFACT) fail('SEB_WAITING_OPERATOR_FILE_INVALID')
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.size < 1 || metadata.size > maxBytes) fail('SEB_WAITING_OPERATOR_FILE_INVALID')
    if (privateFile && inspectEnvFilePermission({ exists: true, mode: metadata.mode, platform: process.platform }).status === 'blocker') {
      fail('SEB_OPERATOR_ENV_FILE_PERMISSIONS')
    }
    const bytes = Buffer.alloc(maxBytes + 1)
    let offset = 0
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (!result.bytesRead) break
      offset += result.bytesRead
    }
    if (offset < 1 || offset > maxBytes) fail('SEB_WAITING_OPERATOR_FILE_INVALID')
    return bytes.subarray(0, offset)
  } finally { await handle?.close() }
}

export async function loadWaitingOperatorEnvironment(customPath, injected = process.env) {
  const envPath = customPath ? resolve(customPath) : new URL('../.env.qa.local', import.meta.url)
  let contents = ''
  try { contents = (await readWaitingOperatorFile(envPath, { privateFile: true, maxBytes: 128 * 1024 })).toString('utf8') }
  catch (error) {
    if (error instanceof SebArtifactOperatorError) throw error
    if (error?.code !== 'ENOENT' || customPath) fail('SEB_OPERATOR_ENV_FILE_INVALID')
  }
  const parsed = parseEnvFile(contents, injected)
  if (parsed.warnings.length) fail('SEB_OPERATOR_ENV_FILE_INVALID')
  return { ...parsed.values, ...injected }
}

export async function readWaitingNativeEvidenceFromStdin(stream) {
  if (stream.isTTY) fail('SEB_NATIVE_EVIDENCE_STDIN_REQUIRED')
  const chunks = []
  let size = 0
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > MAX_EVIDENCE) fail('SEB_NATIVE_EVIDENCE_INVALID')
    chunks.push(bytes)
  }
  if (!size) fail('SEB_NATIVE_EVIDENCE_STDIN_REQUIRED')
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)) }
  catch { fail('SEB_NATIVE_EVIDENCE_INVALID') }
}

export function waitingOperatorSafeError(error) {
  if ((error instanceof SebArtifactOperatorError || error instanceof SebWaitingArtifactError)
    && typeof error.code === 'string' && /^SEB_[A-Z0-9_]{1,100}$/.test(error.code)) return error.code
  if (error?.code === 'EEXIST') return 'SEB_OPERATOR_OUTPUT_EXISTS'
  if (error?.code === 'ENOENT') return 'SEB_OPERATOR_FILE_MISSING'
  return 'SEB_WAITING_OPERATOR_FAILED'
}

export function writeWaitingOperatorPrivateFile(path, bytes) {
  return writeFile(resolve(path), bytes, { flag: 'wx', mode: 0o600 })
}

/** Reserve before cloud mutation. Never truncate or follow an existing path. */
export async function reserveWaitingOperatorPrivateFile(path) {
  const handle = await open(resolve(path), 'wx', 0o600)
  let closed = false
  return Object.freeze({
    write: async bytes => { await handle.writeFile(bytes); await handle.sync() },
    close: async () => { if (!closed) { closed = true; await handle.close() } },
  })
}

/** Fixed ordinary exam pilot only. Read ID, never code or question values. */
export async function waitingOperatorAssignmentIsPasswordless(admin, assignmentId) {
  const result = await admin.from('assignments').select('id').eq('id', assignmentId)
    .eq('type', 'exam').eq('mode', 'online').eq('secure_browser_mode', 'seb_required')
    .eq('completion_rule', 'fixed').is('access_code', null).maybeSingle()
  if (result.error) fail('SEB_OPERATOR_CONTEXT_UNAVAILABLE')
  return result.data?.id === assignmentId
}

async function requirePasswordlessAssignment(check, assignmentId) {
  if (typeof check !== 'function') fail('SEB_OPERATOR_CONTEXT_UNAVAILABLE')
  if (await check(assignmentId) !== true) fail('SEB_WAITING_OPERATOR_ASSIGNMENT_UNSUPPORTED')
}

function reconciliationRequired(receipt) {
  const error = new SebArtifactOperatorError('SEB_WAITING_OPERATOR_RECONCILIATION_REQUIRED')
  reconciliationReceipts.set(error, Object.freeze(receipt))
  return error
}

export function waitingOperatorSafeFailure(error) {
  const recovery = error && reconciliationReceipts.get(error)
  return recovery
    ? { status: 'reconciliation_required', code: 'SEB_WAITING_OPERATOR_RECONCILIATION_REQUIRED', ...recovery }
    : { status: 'failed', code: waitingOperatorSafeError(error) }
}

function requireEnvironment(environment) {
  if (waitingOperatorEnvironmentBlockers(environment).length) fail('SEB_OPERATOR_ENVIRONMENT_BLOCKED')
}

function requireContext(context, options) {
  if (!context || context.assignmentId !== options.assignment || context.revision !== options.revision
    || typeof context.hashedQuitPassword !== 'string' || !SHA256.test(context.hashedQuitPassword)) fail('SEB_OPERATOR_REVISION_CONFLICT')
  if (context.existingRelease) fail('SEB_OPERATOR_RELEASE_EXISTS')
}

function policyFor(options, environment) {
  return createWaitingSebArtifactPolicy({ origin: environment.NEXT_PUBLIC_SITE_URL,
    assignmentId: options.assignment, revision: options.revision, authOrigins: [...options.authOrigins] })
}

function inspectTemplate(templateBytes) {
  const decoded = assignmentSebPlistHelpers.decode(templateBytes)
  if (XMLValidator.validate(decoded.xml) !== true) fail('SEB_ARTIFACT_POLICY_INVALID')
  const values = assignmentSebPlistHelpers.parse(decoded.xml)
  const admin = values.get('hashedAdminPassword'), quit = values.get('hashedQuitPassword')
  if (admin?.kind !== 'string' || quit?.kind !== 'string' || !SHA256.test(admin.value.toLowerCase())
    || !SHA256.test(quit.value.toLowerCase()) || admin.value.toLowerCase() === quit.value.toLowerCase()) fail('SEB_ARTIFACT_ADMIN_POLICY_INVALID')
}

/** I/O is supplied by the CLI. Tests use synthetic contexts/files only. */
export async function prepareWaitingSebOperator({ options, environment, templateBytes }, {
  readContext, checkPasswordlessAssignment, writePrivateFile = writeWaitingOperatorPrivateFile, randomBytes = nodeRandomBytes,
}) {
  requireEnvironment(environment)
  const policy = policyFor(options, environment)
  inspectTemplate(templateBytes)
  if (!options.apply) return Object.freeze({ status: 'ready', mode: 'dry-run', assignmentId: options.assignment,
    revision: options.revision, networkUsed: false, fileWritten: false, contextVerified: false, nativeProof: 'pending_w7' })
  const context = await readContext(options.assignment, options.revision)
  requireContext(context, options)
  await requirePasswordlessAssignment(checkPasswordlessAssignment, context.assignmentId)
  const entropy = randomBytes(24)
  if (!Buffer.isBuffer(entropy) || entropy.length !== 24) fail('SEB_WAITING_OPERATOR_ADMIN_ENTROPY_INVALID')
  const plaintextAdmin = entropy.toString('base64url')
  const hashedAdminPassword = createHash('sha256').update(plaintextAdmin).digest('hex')
  const bytes = materializeWaitingSebInitialArtifact(templateBytes, policy, context.hashedQuitPassword,
    { randomBytes, hashedAdminPassword })
  // Credential output is optional and never returned/printed. If either wx
  // write fails, operator resolves private partial output; nothing registers.
  if (options['admin-password-output']) await writePrivateFile(options['admin-password-output'], `${plaintextAdmin}\n`)
  await writePrivateFile(options.output, bytes)
  return Object.freeze({ status: 'prepared', assignmentId: context.assignmentId, revision: context.revision,
    profileId: WAITING_SEB_PROFILE_ID, nativeProof: 'pending_w7', next: 'FINAL_SAVE_AND_KEY_EVIDENCE_IN_NATIVE_SEB' })
}

async function ensureUploaded(admin, identity, bytes) {
  const bucket = admin.storage.from(ASSIGNMENT_SEB_BUCKET)
  const result = await bucket.upload(identity.storagePath, bytes, { contentType: 'application/seb', upsert: false })
  const stored = await bucket.download(identity.storagePath)
  if (stored.error || !stored.data) fail('SEB_OPERATOR_UPLOAD_FAILED')
  const storedBytes = Buffer.from(await stored.data.arrayBuffer())
  if (storedBytes.length !== identity.sizeBytes || createHash('sha256').update(storedBytes).digest('hex') !== identity.sha256) {
    fail('SEB_OPERATOR_UPLOAD_CONFLICT')
  }
  return result.error ? 'reused' : 'uploaded'
}

function safeRelease(response, expected, keyCount) {
  const row = Array.isArray(response) && response.length === 1 ? response[0] : null
  const releaseId = `asr-${expected.assignmentId.replaceAll('-', '')}-r${expected.revision}-${expected.artifactSha256.slice(0, 16)}`
  if (!row || row.assignment_id !== expected.assignmentId || row.revision !== expected.revision
    || row.release_id !== releaseId || row.artifact_storage_path !== expected.artifactPath
    || row.artifact_sha256 !== expected.artifactSha256 || row.artifact_size_bytes !== expected.artifactSizeBytes
    || row.security_mode !== 'test_plaintext' || row.browser_exam_key_count !== keyCount
    || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) fail('SEB_OPERATOR_REGISTRATION_FAILED')
  return Object.freeze({ releaseId, createdAt: row.created_at, browserExamKeyCount: keyCount })
}

/** Both frozen phases are downloaded and verified before the existing RPC.
 * Terminal bytes are not an exam-key registry entry or native W7 proof. */
export async function enrollWaitingSebOperator({ options, environment, artifactBytes, evidence }, {
  admin, readContext, checkPasswordlessAssignment, reservePrivateFile = reserveWaitingOperatorPrivateFile,
}) {
  requireEnvironment(environment)
  const policy = policyFor(options, environment)
  if (createHash('sha256').update(artifactBytes).digest('hex') !== options['native-final-sha256']) fail('SEB_WAITING_OPERATOR_NATIVE_FINAL_INVALID')
  const initialReceipt = freezeWaitingSebArtifact(artifactBytes, policy, { phase: 'initial' })
  if (!options.apply) return Object.freeze({ status: 'ready', mode: 'dry-run', assignmentId: options.assignment,
    revision: options.revision, networkUsed: false, mutationUsed: false, contextVerified: false,
    nativeEvidenceVerified: false, nativeProof: 'pending_w7' })
  const context = await readContext(options.assignment, options.revision)
  requireContext(context, options)
  await requirePasswordlessAssignment(checkPasswordlessAssignment, context.assignmentId)
  const initial = readFrozenWaitingSebArtifact(freezeWaitingSebArtifact(readFrozenWaitingSebArtifact(initialReceipt).bytes,
    policy, { phase: 'initial', expectedQuitHash: context.hashedQuitPassword }))
  const native = parseMultiPlatformNativeSebEvidence(evidence, context.assignmentId, context.revision)
  if (!native.browserExamKeys.some(entry => entry.platform === 'windows'
    && entry.versionString === WINDOWS_SEB_VERSION && entry.buildNumber === WINDOWS_SEB_BUILD)) fail('SEB_NATIVE_EVIDENCE_INVALID')
  const terminal = readFrozenWaitingSebArtifact(freezeWaitingSebArtifact(materializeWaitingSebTerminalArtifact(initial.bytes, policy, {
    expectedQuitHash: context.hashedQuitPassword, expectedInitialSha256: initial.sha256,
  }), policy, { phase: 'terminal', expectedQuitHash: context.hashedQuitPassword }))
  const initialIdentity = assignmentSebArtifactIdentity(initial.bytes, context.assignmentId, context.revision)
  const terminalIdentity = assignmentSebArtifactIdentity(terminal.bytes, context.assignmentId, context.revision)
  if (initialIdentity.sha256 === terminalIdentity.sha256) fail('SEB_WAITING_OPERATOR_NATIVE_FINAL_INVALID')
  const reference = identity => Object.freeze({ sha256: identity.sha256, sizeBytes: identity.sizeBytes, path: identity.storagePath })
  const expectedReleaseId = `asr-${context.assignmentId.replaceAll('-', '')}-r${context.revision}-${initial.sha256.slice(0, 16)}`
  const recovery = { assignmentId: context.assignmentId, revision: context.revision, releaseId: expectedReleaseId,
    initial: reference(initialIdentity), terminal: reference(terminalIdentity), nativeProof: 'pending_w7', registrationOutcome: 'unknown' }
  let manifestOutput, terminalOutput, registrationAttempted = false
  try {
    // Check both output paths up front. Existing user files remain untouched;
    // a failed reservation leaves only our private empty placeholder.
    manifestOutput = await reservePrivateFile(options['manifest-output'])
    if (options['terminal-output']) terminalOutput = await reservePrivateFile(options['terminal-output'])
    if (terminalOutput) await terminalOutput.write(terminal.bytes)
    const initialUpload = await ensureUploaded(admin, initialIdentity, initial.bytes)
    const terminalUpload = await ensureUploaded(admin, terminalIdentity, terminal.bytes)
    const input = { assignmentId: context.assignmentId, revision: context.revision,
      artifactPath: initialIdentity.storagePath, artifactSha256: initial.sha256, artifactSizeBytes: initial.sizeBytes,
      configKey: native.configKey, browserExamKeys: native.browserExamKeys, securityMode: 'test_plaintext' }
    registrationAttempted = true
    const registration = await verifyStoredAssignmentSebArtifactAndRegister(admin, input)
    if (registration.code !== 'ok' || registration.error) fail('SEB_OPERATOR_REGISTRATION_FAILED')
    const release = safeRelease(registration.data, input, native.browserExamKeys.length)
    recovery.registrationOutcome = 'registered'
    const manifest = [{ assignmentId: context.assignmentId, revision: context.revision, releaseId: release.releaseId,
      origin: policy.origin, profileId: WAITING_SEB_PROFILE_ID, authOrigins: [...policy.authOrigins],
      initial: reference(initialIdentity), terminal: reference(terminalIdentity) }]
    await manifestOutput.write(`${JSON.stringify(manifest)}\n`)
    return Object.freeze({ status: 'enrolled', assignmentId: context.assignmentId, revision: context.revision,
      releaseId: release.releaseId, initial: reference(initialIdentity), terminal: reference(terminalIdentity),
      uploadStatus: Object.freeze({ initial: initialUpload, terminal: terminalUpload }), profileId: WAITING_SEB_PROFILE_ID,
      nativeProof: 'pending_w7', manifestEnvironmentVariable: 'SEB_EXAM_WAITING_RELEASES' })
  } catch (error) {
    if (registrationAttempted) throw reconciliationRequired(recovery)
    throw error
  } finally {
    const closed = await Promise.allSettled([manifestOutput, terminalOutput].filter(Boolean).map(output => output.close()))
    if (closed.some(result => result.status === 'rejected')) {
      if (registrationAttempted) throw reconciliationRequired(recovery)
      fail('SEB_WAITING_OPERATOR_OUTPUT_CLOSE_FAILED')
    }
  }
}
