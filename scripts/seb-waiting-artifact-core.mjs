import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { XMLBuilder, XMLValidator } from 'fast-xml-parser'
import {
  ASSIGNMENT_SEB_STAGING_ORIGIN,
  ASSIGNMENT_SEB_UAT_ORIGIN,
  assignmentSebPlistHelpers,
  validAssignmentId,
  validAssignmentRevision,
} from './seb-assignment-artifact-core.mjs'

export const WAITING_SEB_PROFILE_ID = 'waiting-room-completion-experimental-v1'

const MAX_BYTES = 2 * 1024 * 1024
const SHA256 = /^[0-9a-f]{64}$/i
const SITE_ORIGINS = new Set([ASSIGNMENT_SEB_STAGING_ORIGIN, ASSIGNMENT_SEB_UAT_ORIGIN])
const policies = new WeakSet()
const frozenArtifacts = new WeakMap()
const xmlBuilder = new XMLBuilder({ preserveOrder: true, ignoreAttributes: false, processEntities: false })

export class SebWaitingArtifactError extends Error {
  constructor(code) {
    super(code)
    this.name = 'SebWaitingArtifactError'
    this.code = code
  }
}

function fail(code = 'SEB_WAITING_ARTIFACT_POLICY_INVALID') {
  throw new SebWaitingArtifactError(code)
}

function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return (prototype === Object.prototype || prototype === null)
    && Reflect.ownKeys(value).every(key => typeof key === 'string'
      && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function canonicalOrigin(value) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.hostname.includes('*')
      && url.origin === value ? value : null
  } catch { return null }
}

function rule(expression) {
  return Object.freeze({ active: true, regex: true, expression, action: 1 })
}

/**
 * The native default is deny. A catch-all block rule would also defeat every
 * explicit allow, because Windows processes its block rules first.
 * Provider origins are explicit; even they receive only the listed auth paths.
 */
export function createWaitingSebArtifactPolicy(input) {
  if (!record(input) || Object.keys(input).some(key => ![
    'origin', 'assignmentId', 'revision', 'authOrigins',
  ].includes(key))) fail('SEB_WAITING_ARTIFACT_CONTEXT_INVALID')
  const { origin, assignmentId, revision, authOrigins = [] } = input
  if (!SITE_ORIGINS.has(origin) || !validAssignmentId(assignmentId)
    || !validAssignmentRevision(revision) || !Array.isArray(authOrigins)
    || authOrigins.length > 8 || authOrigins.some(value => !canonicalOrigin(value) || value === origin)
    || new Set(authOrigins).size !== authOrigins.length) fail('SEB_WAITING_ARTIFACT_CONTEXT_INVALID')

  const canonicalAssignmentId = assignmentId.toLowerCase()
  const routeBase = `/exam/${canonicalAssignmentId}/r/${revision}`
  const base = `${origin}${routeBase}`
  const site = escapeRegex(origin)
  const route = escapeRegex(base)
  const query = '(?:\\?[^#]*)?'
  const assets = [
    rule(`^${site}/_next/static/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9._-]+\\.(?:js|css|woff2?|ttf|otf)${query}$`),
    rule(`^${site}/(?:icon\\.png|apple-icon\\.png|favicon\\.ico|brand/deer-mark\\.(?:svg|png))$`),
    rule(`^blob:${site}/[0-9a-fA-F-]{36}$`),
    rule('^data:image/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$'),
  ]
  const canonicalAuthOrigins = Object.freeze([...authOrigins].sort())
  const authPaths = '(?:auth/v1/(?:authorize|callback|verify|token)|o/oauth2/(?:v2/auth|auth)|(?:v3/signin|signin/oauth)(?:/[A-Za-z0-9_-]+)*|CheckCookie|ListAccounts|AccountChooser|ServiceLogin)'
  const rules = Object.freeze([
    rule(`^${route}/(?:entry|login|profile|waiting|system-check|take|submitted)${query}$`),
    // No .seb extension or query: denials remain ordinary HTTP navigation.
    rule(`^${route}/completion$`),
    rule(`^${route}/api(?:/[A-Za-z0-9_-]+)*${query}$`),
    // Native filters decode URLs; the server must validate the exact src and
    // snapshot membership, and enforce GET/HEAD vs the bounded POST upload.
    rule(`^${route}/resource\\?src=[^#\\r\\n]+$`),
    rule(`^${route}/resource/upload$`),
    rule(`^${site}/auth/callback${query}$`),
    ...canonicalAuthOrigins.map(value => rule(`^${escapeRegex(value)}/${authPaths}${query}$`)),
    ...assets,
  ])
  const terminalRules = Object.freeze([
    rule(`^${route}/submitted$`),
    rule(`^${route}/quit$`),
    ...assets,
  ])
  const policy = Object.freeze({
    profileId: WAITING_SEB_PROFILE_ID,
    experimental: true,
    nativeProof: 'pending_w7',
    origin,
    assignmentId: canonicalAssignmentId,
    revision,
    routeBase,
    entryUrl: `${base}/entry`,
    completionUrl: `${base}/completion`,
    submittedUrl: `${base}/submitted`,
    quitUrl: `${base}/quit`,
    authOrigins: canonicalAuthOrigins,
    rules,
    terminalRules,
  })
  policies.add(policy)
  return policy
}

function requirePolicy(policy) {
  if (!policy || !policies.has(policy)) fail('SEB_WAITING_ARTIFACT_CONTEXT_INVALID')
}

function decode(bytes) {
  try {
    const decoded = assignmentSebPlistHelpers.decode(bytes)
    if (XMLValidator.validate(decoded.xml) !== true) fail()
    return { ...decoded, values: assignmentSebPlistHelpers.parse(decoded.xml) }
  } catch { fail() }
}

function scalar(values, key, kind, expected) {
  const value = values.get(key)
  if (!value || value.kind !== kind || (expected !== undefined && value.value !== expected)) fail()
  return value.value
}

function hashes(values, { expectedQuitHash, expectedAdminHash } = {}) {
  const quitHash = scalar(values, 'hashedQuitPassword', 'string')
  const adminHash = scalar(values, 'hashedAdminPassword', 'string')
  if (!SHA256.test(quitHash) || !SHA256.test(adminHash)
    || quitHash.toLowerCase() === adminHash.toLowerCase()
    || (expectedQuitHash !== undefined && (typeof expectedQuitHash !== 'string' || !SHA256.test(expectedQuitHash)
      || quitHash.toLowerCase() !== expectedQuitHash.toLowerCase()))
    || (expectedAdminHash !== undefined && (typeof expectedAdminHash !== 'string' || !SHA256.test(expectedAdminHash)
      || adminHash.toLowerCase() !== expectedAdminHash.toLowerCase()))) fail('SEB_WAITING_ARTIFACT_REVISION_MISMATCH')
  return { quitHash: quitHash.toLowerCase(), adminHash: adminHash.toLowerCase() }
}

function inspect(bytes, policy, phase, expected = {}) {
  requirePolicy(policy)
  const { xml, values, containerKind } = decode(bytes)
  hashes(values, expected)
  const terminal = phase === 'terminal'
  scalar(values, 'sebConfigPurpose', 'integer', '0')
  scalar(values, 'startURL', 'string', terminal ? policy.submittedUrl : policy.entryUrl)
  scalar(values, 'quitURL', 'string', terminal ? policy.quitUrl : '')
  scalar(values, 'quitURLRestart', 'boolean', false)
  scalar(values, 'quitURLConfirm', 'boolean', true)
  scalar(values, 'allowQuit', 'boolean', true)
  scalar(values, 'sendBrowserExamKey', 'boolean', true)
  scalar(values, 'downloadAndOpenSebConfig', 'boolean', !terminal)
  scalar(values, 'examSessionReconfigureAllow', 'boolean', !terminal)
  scalar(values, 'examSessionReconfigureConfigURL', 'string', terminal ? '' : policy.completionUrl)
  scalar(values, 'URLFilterEnable', 'boolean', true)
  scalar(values, 'URLFilterEnableContentFilter', 'boolean', true)
  scalar(values, 'startURLAppendQueryParameter', 'boolean', false)
  scalar(values, 'allowDownloads', 'boolean', false)
  scalar(values, 'allowUploads', 'boolean', !terminal)
  scalar(values, 'allowDeveloperConsole', 'boolean', false)
  scalar(values, 'browserWindowAllowAddressBar', 'boolean', false)
  scalar(values, 'newBrowserWindowAllowAddressBar', 'boolean', false)
  scalar(values, 'allowBrowsingBackForward', 'boolean', false)
  scalar(values, 'restartExamUseStartURL', 'boolean', false)
  scalar(values, 'restartExamURL', 'string', '')
  scalar(values, 'examSessionClearCookiesOnStart', 'boolean', !terminal)
  scalar(values, 'examSessionClearCookiesOnEnd', 'boolean', terminal)
  const salt = scalar(values, 'examKeySalt', 'data')
  if (!/^[A-Za-z0-9+/]{43}=$/.test(salt)
    || Buffer.from(salt, 'base64').length !== 32
    || Buffer.from(salt, 'base64').toString('base64') !== salt) fail('SEB_WAITING_ARTIFACT_SALT_INVALID')
  const cachedBek = scalar(values, 'browserExamKey', 'string')
  if (cachedBek !== '' && !SHA256.test(cachedBek)) fail()
  let actualRules
  try { actualRules = assignmentSebPlistHelpers.readUrlFilterRules(xml) } catch { fail() }
  if (JSON.stringify(actualRules) !== JSON.stringify(terminal ? policy.terminalRules : policy.rules)) fail()
  return Object.freeze({
    profileId: WAITING_SEB_PROFILE_ID,
    experimental: true,
    nativeProof: 'pending_w7',
    phase,
    assignmentId: policy.assignmentId,
    revision: policy.revision,
    origin: policy.origin,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: Buffer.byteLength(bytes),
    containerKind,
    entryPassword: false,
    teacherHashVerified: expected.expectedQuitHash !== undefined,
  })
}

export function inspectWaitingSebInitialArtifact(bytes, policy, expected = {}) {
  return inspect(bytes, policy, 'initial', expected)
}

export function inspectWaitingSebTerminalArtifact(bytes, policy, expected = {}) {
  return inspect(bytes, policy, 'terminal', expected)
}

function serialize(values) {
  const dictionary = [...values].map(([key, value]) => {
    let tag
    if (value.kind === 'boolean') tag = value.value ? '<true/>' : '<false/>'
    else if (value.kind === 'complex') tag = xmlBuilder.build([value.node])
    else tag = `<${value.kind}>${value.value}</${value.kind}>`
    return `<key>${escapeXml(key)}</key>${tag}`
  }).join('')
  return `<?xml version="1.0" encoding="utf-8"?>\n<plist version="1.0"><dict>${dictionary}</dict></plist>`
}

function set(values, key, value) {
  const kind = typeof value === 'boolean' ? 'boolean' : 'string'
  values.set(key, { kind, value: kind === 'string' ? escapeXml(value) : value })
}

function setRules(values, rules) {
  values.set('URLFilterRules', { kind: 'complex', node: { array: rules.map(item => ({
    dict: [
      { key: [{ '#text': 'active' }] }, { true: [] },
      { key: [{ '#text': 'regex' }] }, { true: [] },
      { key: [{ '#text': 'expression' }] }, { string: [{ '#text': escapeXml(item.expression) }] },
      { key: [{ '#text': 'action' }] }, { integer: [{ '#text': '1' }] },
    ],
  })) } })
}

function encode(values, containerKind) {
  const xml = Buffer.from(serialize(values), 'utf8')
  if (xml.length > MAX_BYTES) fail('SEB_WAITING_ARTIFACT_SIZE_INVALID')
  let bytes = xml
  if (containerKind === 'gzip_xml') bytes = gzipSync(xml, { level: 9 })
  else if (containerKind === 'plnd') bytes = gzipSync(Buffer.concat([
    Buffer.from('plnd'), gzipSync(xml, { level: 9 }),
  ]), { level: 9 })
  if (bytes.length > MAX_BYTES) fail('SEB_WAITING_ARTIFACT_SIZE_INVALID')
  return bytes
}

function applyPhase(values, policy, terminal) {
  values.set('sebConfigPurpose', { kind: 'integer', value: '0' })
  const updates = {
    startURL: terminal ? policy.submittedUrl : policy.entryUrl,
    quitURL: terminal ? policy.quitUrl : '',
    quitURLRestart: false,
    quitURLConfirm: true,
    allowQuit: true,
    sendBrowserExamKey: true,
    downloadAndOpenSebConfig: !terminal,
    examSessionReconfigureAllow: !terminal,
    examSessionReconfigureConfigURL: terminal ? '' : policy.completionUrl,
    URLFilterEnable: true,
    URLFilterEnableContentFilter: true,
    startURLAppendQueryParameter: false,
    allowDownloads: false,
    allowUploads: !terminal,
    allowDeveloperConsole: false,
    browserWindowAllowAddressBar: false,
    newBrowserWindowAllowAddressBar: false,
    allowBrowsingBackForward: false,
    restartExamUseStartURL: false,
    restartExamURL: '',
    examSessionClearCookiesOnStart: !terminal,
    examSessionClearCookiesOnEnd: terminal,
    browserExamKey: '',
  }
  for (const [key, value] of Object.entries(updates)) set(values, key, value)
  setRules(values, terminal ? policy.terminalRules : policy.rules)
}

/** Creates candidate bytes only. Native final save/key enrollment is still W7.
 * @param {Buffer | Uint8Array} templateBytes
 * @param {object} policy
 * @param {string} hashedQuitPassword
 * @param {{ randomBytes?: (size: number) => Buffer, hashedAdminPassword?: string }} options
 */
export function materializeWaitingSebInitialArtifact(templateBytes, policy, hashedQuitPassword, {
  randomBytes = nodeRandomBytes,
  hashedAdminPassword,
} = {}) {
  requirePolicy(policy)
  if (typeof hashedQuitPassword !== 'string' || !SHA256.test(hashedQuitPassword)) fail('SEB_WAITING_ARTIFACT_REVISION_MISMATCH')
  const { values, containerKind } = decode(templateBytes)
  const oldAdminHash = scalar(values, 'hashedAdminPassword', 'string')
  const adminEntropy = hashedAdminPassword === undefined ? randomBytes(32) : null
  if (adminEntropy !== null && (!Buffer.isBuffer(adminEntropy) || adminEntropy.length !== 32)) fail('SEB_WAITING_ARTIFACT_ADMIN_INVALID')
  const freshAdminHash = hashedAdminPassword ?? createHash('sha256').update(adminEntropy).digest('hex')
  if (typeof freshAdminHash !== 'string' || !SHA256.test(freshAdminHash)
    || freshAdminHash.toLowerCase() === oldAdminHash.toLowerCase()
    || freshAdminHash.toLowerCase() === hashedQuitPassword.toLowerCase()) fail('SEB_WAITING_ARTIFACT_ADMIN_INVALID')
  // Every new waiting revision gets a new admin credential. Never inherit a
  // template/r2 administrator hash, even if all student-facing settings match.
  set(values, 'hashedAdminPassword', freshAdminHash.toLowerCase())
  set(values, 'hashedQuitPassword', hashedQuitPassword.toLowerCase())
  hashes(values, { expectedQuitHash: hashedQuitPassword })
  const salt = randomBytes(32)
  if (!Buffer.isBuffer(salt) || salt.length !== 32) fail('SEB_WAITING_ARTIFACT_SALT_INVALID')
  values.set('examKeySalt', { kind: 'data', value: salt.toString('base64') })
  applyPhase(values, policy, false)
  const bytes = encode(values, containerKind)
  inspectWaitingSebInitialArtifact(bytes, policy, { expectedQuitHash: hashedQuitPassword })
  return bytes
}

/** Deterministic transform; never derives or registers native CK/BEK values. */
export function materializeWaitingSebTerminalArtifact(initialBytes, policy, {
  expectedQuitHash,
  expectedInitialSha256,
} = {}) {
  const initial = inspectWaitingSebInitialArtifact(initialBytes, policy, { expectedQuitHash })
  if (expectedInitialSha256 !== undefined && expectedInitialSha256 !== initial.sha256) fail('SEB_WAITING_ARTIFACT_DIGEST_MISMATCH')
  const { values, containerKind } = decode(initialBytes)
  const retained = hashes(values, { expectedQuitHash })
  applyPhase(values, policy, true)
  const bytes = encode(values, containerKind)
  inspectWaitingSebTerminalArtifact(bytes, policy, {
    expectedQuitHash: retained.quitHash,
    expectedAdminHash: retained.adminHash,
  })
  return bytes
}

/** Buffers cannot be frozen, so only private copies back the public receipt. */
export function freezeWaitingSebArtifact(bytes, policy, { phase, ...expected } = {}) {
  if (phase !== 'initial' && phase !== 'terminal') fail('SEB_WAITING_ARTIFACT_PHASE_INVALID')
  const retained = Buffer.from(bytes)
  const receipt = inspect(retained, policy, phase, expected)
  frozenArtifacts.set(receipt, retained)
  return receipt
}

export function readFrozenWaitingSebArtifact(receipt) {
  const retained = receipt && frozenArtifacts.get(receipt)
  if (!retained) fail('SEB_WAITING_ARTIFACT_RECEIPT_INVALID')
  const bytes = Buffer.from(retained)
  if (bytes.length !== receipt.sizeBytes
    || createHash('sha256').update(bytes).digest('hex') !== receipt.sha256) fail('SEB_WAITING_ARTIFACT_DIGEST_MISMATCH')
  return Object.freeze({ bytes, sha256: receipt.sha256, sizeBytes: receipt.sizeBytes })
}
