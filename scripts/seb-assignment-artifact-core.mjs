import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { XMLParser } from 'fast-xml-parser'
import { inspectExamStagingReadiness } from './check-exam-staging-readiness-core.mjs'
import { verifyStoredAssignmentSebArtifactAndRegister } from '../lib/seb-assignment-release-registration.mjs'

export const ASSIGNMENT_SEB_BUCKET = 'assignment-seb-configs'
export const ASSIGNMENT_SEB_STAGING_ORIGIN = 'https://staging.korkru.com'
export const ASSIGNMENT_SEB_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
export const WINDOWS_SEB_VERSION = '3.10.2'
export const WINDOWS_SEB_BUILD = '920'

const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024
const MAX_REVISION = 2_147_483_646
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256_PATTERN = /^[0-9a-f]{64}$/i
const SAFE_METADATA_PATTERN = /^[A-Za-z0-9.+-]{1,40}$/
const PLIST_PARSER = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  processEntities: false,
  parseTagValue: false,
  trimValues: true,
})

export class SebArtifactOperatorError extends Error {
  constructor(code) {
    super(code)
    this.name = 'SebArtifactOperatorError'
    this.code = code
  }
}

function fail(code) {
  throw new SebArtifactOperatorError(code)
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

export function validAssignmentId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function validAssignmentRevision(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_REVISION
}

/** Value-redacting guard shared by both operator commands. */
export function inspectAssignmentSebOperatorEnvironment(environment) {
  const base = inspectExamStagingReadiness(environment)
  const checks = [...base.checks]
  checks.push(environment.NEXT_PUBLIC_SITE_URL === ASSIGNMENT_SEB_STAGING_ORIGIN
    ? { status: 'pass', field: 'assignment SEB site', message: 'ตรงกับ isolated Staging' }
    : { status: 'blocker', field: 'assignment SEB site', message: 'ต้องเป็น canonical isolated Staging เท่านั้น' })
  checks.push(environment.NEXT_PUBLIC_SUPABASE_URL === ASSIGNMENT_SEB_STAGING_SUPABASE_ORIGIN
    ? { status: 'pass', field: 'assignment SEB database', message: 'ตรงกับ allowlisted Staging project' }
    : { status: 'blocker', field: 'assignment SEB database', message: 'ต้องเป็น Supabase Staging project ที่ allowlist ไว้เท่านั้น' })
  checks.push(environment.SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS === 'true'
    ? { status: 'pass', field: 'test-only assignment SEB gate', message: 'เปิดใช้เฉพาะรอบ Staging นี้' }
    : { status: 'blocker', field: 'test-only assignment SEB gate', message: 'ยังไม่เปิด test-only plaintext gate' })
  return { ready: checks.every(check => check.status !== 'blocker'), checks }
}

export function operatorEnvironmentBlockerFields(environment) {
  return inspectAssignmentSebOperatorEnvironment(environment).checks
    .filter(check => check.status === 'blocker')
    .map(check => check.field)
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function scalarMatches(xml, key) {
  const escaped = escapePattern(key)
  const pattern = new RegExp(
    `<key>\\s*${escaped}\\s*</key>\\s*(<(?:string|data|integer)>[\\s\\S]*?</(?:string|data|integer)>|<(?:string|data|integer|true|false)\\s*/>)`,
    'g',
  )
  return [...xml.matchAll(pattern)]
}

function significantNodeKeys(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return []
  return Object.keys(node).filter(key => key !== ':@' && key !== '#text')
}

function textNodeValue(children) {
  if (!Array.isArray(children) || children.length === 0) return ''
  if (
    children.length !== 1
    || !children[0]
    || typeof children[0] !== 'object'
    || Object.keys(children[0]).some(key => key !== '#text')
    || typeof children[0]['#text'] !== 'string'
  ) fail('SEB_ARTIFACT_POLICY_INVALID')
  return children[0]['#text']
}

/** Parse only the real top-level plist dictionary; comments/nested decoys never count. */
function parseTopLevelPlistScalars(xml) {
  const doctypes = [...xml.matchAll(/<!DOCTYPE[\s\S]*?>/gi)].map(match => match[0])
  const standardApplePlistDoctype = /^<!DOCTYPE\s+plist\s+PUBLIC\s+"-\/\/Apple(?: Computer)?\/\/DTD PLIST 1\.0\/\/EN"\s+"https?:\/\/www\.apple\.com\/DTDs\/PropertyList-1\.0\.dtd"\s*>$/i
  if (
    doctypes.length > 1
    || (doctypes.length === 1 && !standardApplePlistDoctype.test(doctypes[0]))
    || /<!ENTITY/i.test(xml)
  ) fail('SEB_ARTIFACT_POLICY_INVALID')

  let document
  try {
    document = PLIST_PARSER.parse(xml)
  } catch {
    fail('SEB_ARTIFACT_POLICY_INVALID')
  }
  if (!Array.isArray(document)) fail('SEB_ARTIFACT_POLICY_INVALID')

  const documentNodes = document.filter(node => significantNodeKeys(node).length > 0)
  const plistNodes = documentNodes.filter(node => significantNodeKeys(node)[0] === 'plist')
  const invalidDocumentNode = documentNodes.some(node => {
    const keys = significantNodeKeys(node)
    return keys.length !== 1 || (keys[0] !== '?xml' && keys[0] !== 'plist')
  })
  if (invalidDocumentNode || plistNodes.length !== 1) fail('SEB_ARTIFACT_POLICY_INVALID')

  const plistChildren = plistNodes[0].plist
  if (!Array.isArray(plistChildren)) fail('SEB_ARTIFACT_POLICY_INVALID')
  const significantChildren = plistChildren.filter(node => significantNodeKeys(node).length > 0)
  if (
    significantChildren.length !== 1
    || significantNodeKeys(significantChildren[0]).length !== 1
    || significantNodeKeys(significantChildren[0])[0] !== 'dict'
    || !Array.isArray(significantChildren[0].dict)
  ) fail('SEB_ARTIFACT_POLICY_INVALID')

  const entries = significantChildren[0].dict.filter(node => significantNodeKeys(node).length > 0)
  if (entries.length % 2 !== 0) fail('SEB_ARTIFACT_POLICY_INVALID')
  const values = new Map()

  for (let index = 0; index < entries.length; index += 2) {
    const keyNode = entries[index]
    const valueNode = entries[index + 1]
    if (
      significantNodeKeys(keyNode).length !== 1
      || significantNodeKeys(keyNode)[0] !== 'key'
    ) fail('SEB_ARTIFACT_POLICY_INVALID')
    const key = textNodeValue(keyNode.key)
    if (!key || values.has(key)) fail('SEB_ARTIFACT_POLICY_INVALID')

    const valueKeys = significantNodeKeys(valueNode)
    if (valueKeys.length !== 1) fail('SEB_ARTIFACT_POLICY_INVALID')
    const kind = valueKeys[0]
    if (kind === 'true' || kind === 'false') {
      if (!Array.isArray(valueNode[kind]) || valueNode[kind].length !== 0) {
        fail('SEB_ARTIFACT_POLICY_INVALID')
      }
      values.set(key, { kind: 'boolean', value: kind === 'true' })
      continue
    }
    if (kind === 'string' || kind === 'data' || kind === 'integer') {
      values.set(key, { kind, value: textNodeValue(valueNode[kind]) })
      continue
    }
    values.set(key, { kind: 'complex', value: null })
  }

  return values
}

function readScalar(xml, key) {
  const parsed = parseTopLevelPlistScalars(xml).get(key)
  if (!parsed || parsed.kind === 'complex') fail('SEB_ARTIFACT_POLICY_INVALID')
  const matches = scalarMatches(xml, key)
  if (matches.length !== 1) fail('SEB_ARTIFACT_POLICY_INVALID')
  const tag = matches[0][1]
  const boolean = tag.match(/^<(true|false)\s*\/>$/)
  if (boolean) {
    const value = boolean[1] === 'true'
    if (parsed.kind !== 'boolean' || parsed.value !== value) fail('SEB_ARTIFACT_POLICY_INVALID')
    return { kind: 'boolean', value, match: matches[0] }
  }
  const emptyScalar = tag.match(/^<(string|data|integer)\s*\/>$/)
  if (emptyScalar) {
    if (parsed.kind !== emptyScalar[1] || parsed.value !== '') fail('SEB_ARTIFACT_POLICY_INVALID')
    return { kind: emptyScalar[1], value: '', match: matches[0] }
  }
  const scalar = tag.match(/^<(string|data|integer)>([\s\S]*?)<\/\1>$/)
  if (!scalar) fail('SEB_ARTIFACT_POLICY_INVALID')
  if (parsed.kind !== scalar[1] || parsed.value !== scalar[2].trim()) {
    fail('SEB_ARTIFACT_POLICY_INVALID')
  }
  return { kind: scalar[1], value: parsed.value, match: matches[0] }
}

function replaceScalar(xml, key, replacementTag) {
  const scalar = readScalar(xml, key)
  const full = scalar.match[0]
  const next = full.slice(0, full.length - scalar.match[1].length) + replacementTag
  return xml.slice(0, scalar.match.index) + next + xml.slice(scalar.match.index + full.length)
}

function assertScalar(xml, key, kind, expected) {
  const scalar = readScalar(xml, key)
  if (scalar.kind !== kind || scalar.value !== expected) fail('SEB_ARTIFACT_POLICY_INVALID')
}

function decodePlaintextArtifact(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  if (buffer.length < 1 || buffer.length > MAX_ARTIFACT_BYTES) fail('SEB_ARTIFACT_SIZE_INVALID')
  const gzipWrapped = buffer[0] === 0x1f && buffer[1] === 0x8b
  let decoded = buffer
  let containerKind = 'raw_xml'
  if (gzipWrapped) {
    try {
      decoded = gunzipSync(buffer, { maxOutputLength: MAX_ARTIFACT_BYTES })
    } catch {
      fail('SEB_ARTIFACT_NOT_PLAINTEXT_XML')
    }
    containerKind = 'gzip_xml'
    if (decoded.subarray(0, 4).equals(Buffer.from('plnd'))) {
      const innerGzip = decoded.subarray(4)
      if (innerGzip[0] !== 0x1f || innerGzip[1] !== 0x8b) {
        fail('SEB_ARTIFACT_NOT_PLAINTEXT_XML')
      }
      try {
        decoded = gunzipSync(innerGzip, { maxOutputLength: MAX_ARTIFACT_BYTES })
      } catch {
        fail('SEB_ARTIFACT_NOT_PLAINTEXT_XML')
      }
      containerKind = 'plnd'
    }
  }
  if (decoded.length < 1 || decoded.length > MAX_ARTIFACT_BYTES) fail('SEB_ARTIFACT_SIZE_INVALID')
  const xml = decoded.toString('utf8')
  if (
    xml.includes('\uFFFD')
    || !/^\s*<\?xml\s/i.test(xml)
    || !/<plist(?:\s|>)/i.test(xml)
    || !/<dict(?:\s|>)/i.test(xml)
  ) fail('SEB_ARTIFACT_NOT_PLAINTEXT_XML')
  return { xml, containerKind }
}

function asPlaintextXml(bytes) {
  return decodePlaintextArtifact(bytes).xml
}

function assertCommonStagingPolicy(xml) {
  assertScalar(xml, 'startURL', 'string', `${ASSIGNMENT_SEB_STAGING_ORIGIN}/assignments`)
  assertScalar(xml, 'quitURL', 'string', `${ASSIGNMENT_SEB_STAGING_ORIGIN}/exam/quit`)
  assertScalar(xml, 'sebConfigPurpose', 'integer', '0')
  assertScalar(xml, 'allowQuit', 'boolean', true)
  assertScalar(xml, 'downloadAndOpenSebConfig', 'boolean', false)
  assertScalar(xml, 'examSessionReconfigureAllow', 'boolean', false)

  const adminHash = readScalar(xml, 'hashedAdminPassword')
  if (adminHash.kind !== 'string' || !SHA256_PATTERN.test(adminHash.value)) {
    fail('SEB_ARTIFACT_ADMIN_POLICY_INVALID')
  }
  return adminHash.value.toLowerCase()
}

export function inspectAssignmentSebPlaintextArtifact(bytes, expectedQuitHash) {
  const xml = asPlaintextXml(bytes)
  const adminHash = assertCommonStagingPolicy(xml)
  assertScalar(xml, 'sendBrowserExamKey', 'boolean', true)

  const quitHash = readScalar(xml, 'hashedQuitPassword')
  if (
    quitHash.kind !== 'string'
    || !SHA256_PATTERN.test(quitHash.value)
    || quitHash.value.toLowerCase() === adminHash
    || (expectedQuitHash && quitHash.value.toLowerCase() !== expectedQuitHash.toLowerCase())
  ) fail('SEB_ARTIFACT_REVISION_MISMATCH')

  const salt = readScalar(xml, 'examKeySalt')
  if (salt.kind !== 'data' || !/^[A-Za-z0-9+/]{43}=$/.test(salt.value)) {
    fail('SEB_ARTIFACT_SALT_INVALID')
  }

  return Object.freeze({
    plaintext: true,
    sendsBrowserExamKey: true,
    startUrlReady: true,
    quitUrlReady: true,
    revisionHashReady: true,
  })
}

/** Validate a local plaintext template without accepting it as a final release. */
export function inspectAssignmentSebPlaintextTemplate(bytes) {
  const xml = asPlaintextXml(bytes)
  const adminHash = assertCommonStagingPolicy(xml)

  const quitHash = readScalar(xml, 'hashedQuitPassword')
  if (
    quitHash.kind !== 'string'
    || !SHA256_PATTERN.test(quitHash.value)
    || quitHash.value.toLowerCase() === adminHash
  ) {
    fail('SEB_ARTIFACT_REVISION_INVALID')
  }
  const sendsKey = readScalar(xml, 'sendBrowserExamKey')
  if (sendsKey.kind !== 'boolean') fail('SEB_ARTIFACT_POLICY_INVALID')
  const salt = readScalar(xml, 'examKeySalt')
  if (salt.kind !== 'data' || !/^[A-Za-z0-9+/]{43}=$/.test(salt.value)) {
    fail('SEB_ARTIFACT_SALT_INVALID')
  }
  const staleBrowserKey = readScalar(xml, 'browserExamKey')
  if (staleBrowserKey.kind !== 'string') fail('SEB_ARTIFACT_POLICY_INVALID')

  return Object.freeze({
    plaintext: true,
    startUrlReady: true,
    quitUrlReady: true,
  })
}

/**
 * Create a Staging-only seed. No CK or BEK is calculated here: native Windows
 * SEB must save the final file and provide both values afterwards.
 */
export function materializeAssignmentSebPlaintextSeed(
  templateBytes,
  hashedQuitPassword,
  randomBytes = nodeRandomBytes,
) {
  if (typeof hashedQuitPassword !== 'string' || !SHA256_PATTERN.test(hashedQuitPassword)) {
    fail('SEB_ARTIFACT_REVISION_INVALID')
  }
  const decodedTemplate = decodePlaintextArtifact(templateBytes)
  let xml = decodedTemplate.xml
  inspectAssignmentSebPlaintextTemplate(templateBytes)

  xml = replaceScalar(xml, 'hashedQuitPassword', `<string>${hashedQuitPassword.toLowerCase()}</string>`)
  xml = replaceScalar(xml, 'sendBrowserExamKey', '<true />')
  xml = replaceScalar(xml, 'examKeySalt', `<data>${randomBytes(32).toString('base64')}</data>`)
  // A BEK copied from a template would describe different bytes/build. The
  // native tool derives the real value only after the final Windows save.
  xml = replaceScalar(xml, 'browserExamKey', '<string></string>')

  const xmlBytes = Buffer.from(xml, 'utf8')
  let bytes = xmlBytes
  if (decodedTemplate.containerKind === 'gzip_xml') {
    bytes = gzipSync(xmlBytes, { level: 9 })
  } else if (decodedTemplate.containerKind === 'plnd') {
    const innerGzip = gzipSync(xmlBytes, { level: 9 })
    if (innerGzip.length + 4 > MAX_ARTIFACT_BYTES) fail('SEB_ARTIFACT_SIZE_INVALID')
    bytes = gzipSync(Buffer.concat([Buffer.from('plnd'), innerGzip]), { level: 9 })
  }
  if (bytes.length > MAX_ARTIFACT_BYTES) fail('SEB_ARTIFACT_SIZE_INVALID')
  inspectAssignmentSebPlaintextArtifact(bytes, hashedQuitPassword)
  return bytes
}

export function assignmentSebArtifactIdentity(bytes, assignmentId, revision) {
  if (!validAssignmentId(assignmentId) || !validAssignmentRevision(revision)) {
    fail('SEB_ARTIFACT_IDENTITY_INVALID')
  }
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  if (buffer.length < 1 || buffer.length > MAX_ARTIFACT_BYTES) fail('SEB_ARTIFACT_SIZE_INVALID')
  const sha256 = createHash('sha256').update(buffer).digest('hex')
  return Object.freeze({
    assignmentId,
    revision,
    sha256,
    sizeBytes: buffer.length,
    storagePath: `assignments/${assignmentId}/r${revision}/${sha256}.seb`,
  })
}

export function parseNativeSebEvidence(raw, assignmentId, revision) {
  let value
  try {
    if (typeof raw === 'string' && raw.length > 24_000) fail('SEB_NATIVE_EVIDENCE_INVALID')
    value = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    fail('SEB_NATIVE_EVIDENCE_INVALID')
  }
  if (!exactKeys(value, ['schemaVersion', 'assignmentId', 'revision', 'configKey', 'browserExamKeys'])) {
    fail('SEB_NATIVE_EVIDENCE_INVALID')
  }
  if (
    value.schemaVersion !== 1
    || value.assignmentId !== assignmentId
    || value.revision !== revision
    || typeof value.configKey !== 'string'
    || !SHA256_PATTERN.test(value.configKey)
    || !Array.isArray(value.browserExamKeys)
    || value.browserExamKeys.length !== 1
  ) fail('SEB_NATIVE_EVIDENCE_INVALID')

  const entry = value.browserExamKeys[0]
  if (
    !exactKeys(entry, ['platform', 'versionString', 'buildNumber', 'key'])
    || entry.platform !== 'windows'
    || entry.versionString !== WINDOWS_SEB_VERSION
    || entry.buildNumber !== WINDOWS_SEB_BUILD
    || !SAFE_METADATA_PATTERN.test(entry.versionString)
    || !SAFE_METADATA_PATTERN.test(entry.buildNumber)
    || typeof entry.key !== 'string'
    || !SHA256_PATTERN.test(entry.key)
  ) fail('SEB_NATIVE_EVIDENCE_INVALID')

  return Object.freeze({
    configKey: value.configKey.toLowerCase(),
    browserExamKeys: Object.freeze([Object.freeze({
      platform: 'windows',
      versionString: WINDOWS_SEB_VERSION,
      buildNumber: WINDOWS_SEB_BUILD,
      key: entry.key.toLowerCase(),
    })]),
  })
}

export async function readAssignmentSebOperatorContext(admin, assignmentId, expectedRevision) {
  if (!validAssignmentId(assignmentId) || !validAssignmentRevision(expectedRevision)) {
    fail('SEB_OPERATOR_TARGET_INVALID')
  }

  const [assignmentResult, revisionResult, activeResult, releaseResult] = await Promise.all([
    admin.from('assignments')
      .select('id, org_id, created_by, mode, type, status, secure_browser_mode')
      .eq('id', assignmentId)
      .maybeSingle(),
    admin.from('assignment_seb_config_revisions')
      .select('assignment_id, revision, org_id, owner_id, hashed_quit_password')
      .eq('assignment_id', assignmentId)
      .order('revision', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('submissions')
      .select('id')
      .eq('assignment_id', assignmentId)
      .eq('status', 'in_progress')
      .limit(1)
      .maybeSingle(),
    admin.from('assignment_seb_config_releases')
      .select('assignment_id, revision, artifact_storage_path, artifact_sha256, artifact_size_bytes, security_mode')
      .eq('assignment_id', assignmentId)
      .eq('revision', expectedRevision)
      .maybeSingle(),
  ])

  if (assignmentResult.error || revisionResult.error || activeResult.error || releaseResult.error) {
    fail('SEB_OPERATOR_CONTEXT_UNAVAILABLE')
  }
  const assignment = assignmentResult.data
  const revisionRow = revisionResult.data
  if (
    !assignment
    || assignment.mode !== 'online'
    || assignment.type !== 'exam'
    || assignment.status !== 'draft'
    || assignment.secure_browser_mode !== 'seb_required'
  ) fail('SEB_OPERATOR_ASSIGNMENT_NOT_ELIGIBLE')
  if (
    !revisionRow
    || revisionRow.revision !== expectedRevision
    || revisionRow.assignment_id !== assignmentId
    || revisionRow.org_id !== assignment.org_id
    || revisionRow.owner_id !== assignment.created_by
    || typeof revisionRow.hashed_quit_password !== 'string'
    || !SHA256_PATTERN.test(revisionRow.hashed_quit_password)
  ) fail('SEB_OPERATOR_REVISION_CONFLICT')
  if (activeResult.data) fail('SEB_OPERATOR_ACTIVE_ATTEMPT')

  return Object.freeze({
    assignmentId,
    revision: expectedRevision,
    hashedQuitPassword: revisionRow.hashed_quit_password.toLowerCase(),
    existingRelease: releaseResult.data ?? null,
  })
}

async function ensureArtifactUploaded(admin, identity, bytes) {
  const upload = await admin.storage.from(ASSIGNMENT_SEB_BUCKET).upload(
    identity.storagePath,
    bytes,
    { contentType: 'application/seb', upsert: false },
  )
  if (!upload.error) return 'uploaded'

  // An uncertain retry may find the exact immutable object already present.
  // Reuse it only after byte-for-byte digest verification; never overwrite.
  const existing = await admin.storage.from(ASSIGNMENT_SEB_BUCKET).download(identity.storagePath)
  if (existing.error || !existing.data) fail('SEB_OPERATOR_UPLOAD_FAILED')
  const existingBytes = Buffer.from(await existing.data.arrayBuffer())
  const existingIdentity = assignmentSebArtifactIdentity(
    existingBytes,
    identity.assignmentId,
    identity.revision,
  )
  if (
    existingIdentity.sha256 !== identity.sha256
    || existingIdentity.sizeBytes !== identity.sizeBytes
  ) fail('SEB_OPERATOR_UPLOAD_CONFLICT')
  return 'reused'
}

function parseSafeRegistrationResponse(raw, expected, expectedKeyCount) {
  if (!Array.isArray(raw) || raw.length !== 1 || !raw[0] || typeof raw[0] !== 'object') {
    fail('SEB_OPERATOR_REGISTRATION_FAILED')
  }
  const row = raw[0]
  if (
    row.assignment_id !== expected.assignmentId
    || row.revision !== expected.revision
    || row.artifact_storage_path !== expected.artifactPath
    || row.artifact_sha256 !== expected.artifactSha256
    || row.artifact_size_bytes !== expected.artifactSizeBytes
    || row.security_mode !== 'test_plaintext'
    || row.browser_exam_key_count !== expectedKeyCount
    || typeof row.release_id !== 'string'
    || typeof row.created_at !== 'string'
  ) fail('SEB_OPERATOR_REGISTRATION_FAILED')
  return Object.freeze({
    assignmentId: row.assignment_id,
    revision: row.revision,
    releaseId: row.release_id,
    artifactSha256: row.artifact_sha256,
    artifactSizeBytes: row.artifact_size_bytes,
    securityMode: row.security_mode,
    browserExamKeyCount: row.browser_exam_key_count,
    createdAt: row.created_at,
  })
}

export async function enrollAssignmentSebStagingArtifact({
  admin,
  context,
  artifactBytes,
  evidence,
  environment,
}) {
  if (!inspectAssignmentSebOperatorEnvironment(environment).ready) {
    fail('SEB_OPERATOR_ENVIRONMENT_BLOCKED')
  }
  if (context.existingRelease) fail('SEB_OPERATOR_RELEASE_EXISTS')
  inspectAssignmentSebPlaintextArtifact(artifactBytes, context.hashedQuitPassword)
  const identity = assignmentSebArtifactIdentity(artifactBytes, context.assignmentId, context.revision)
  const nativeEvidence = parseNativeSebEvidence(evidence, context.assignmentId, context.revision)
  const uploadStatus = await ensureArtifactUploaded(admin, identity, artifactBytes)

  const input = {
    assignmentId: context.assignmentId,
    revision: context.revision,
    artifactPath: identity.storagePath,
    artifactSha256: identity.sha256,
    artifactSizeBytes: identity.sizeBytes,
    configKey: nativeEvidence.configKey,
    browserExamKeys: nativeEvidence.browserExamKeys,
    securityMode: 'test_plaintext',
  }
  const registration = await verifyStoredAssignmentSebArtifactAndRegister(admin, input)
  if (registration.code !== 'ok' || registration.error) fail('SEB_OPERATOR_REGISTRATION_FAILED')
  return Object.freeze({
    uploadStatus,
    release: parseSafeRegistrationResponse(
      registration.data,
      input,
      nativeEvidence.browserExamKeys.length,
    ),
  })
}

export function parseOperatorArguments(argv, mode) {
  const required = mode === 'prepare'
    ? ['assignment', 'revision', 'template', 'output']
    : mode === 'enroll'
      ? ['assignment', 'revision', 'artifact']
      : fail('SEB_OPERATOR_ARGUMENTS_INVALID')
  const allowed = new Set([...required, 'env-file'])
  const values = {}
  let apply = false
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--apply') {
      if (apply) fail('SEB_OPERATOR_ARGUMENTS_INVALID')
      apply = true
      continue
    }
    if (!token.startsWith('--')) fail('SEB_OPERATOR_ARGUMENTS_INVALID')
    const key = token.slice(2)
    if (!allowed.has(key) || Object.hasOwn(values, key)) fail('SEB_OPERATOR_ARGUMENTS_INVALID')
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) fail('SEB_OPERATOR_ARGUMENTS_INVALID')
    values[key] = value
    index += 1
  }
  if (required.some(key => !values[key])) fail('SEB_OPERATOR_ARGUMENTS_INVALID')
  const revision = Number(values.revision)
  if (!validAssignmentId(values.assignment) || !validAssignmentRevision(revision)) {
    fail('SEB_OPERATOR_TARGET_INVALID')
  }
  return Object.freeze({ ...values, revision, apply })
}
