/**
 * OFFLINE LAB ONLY. Not imported by the application or its access gate.
 * See docs/SEB_PHASE1.md for the deliberately restricted plist subset and sources.
 */
import { createHash, createHmac, createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'

export const MAX_BYTES = 1024 * 1024
// Account for header/tag/PKCS7 and outer gzip overhead separately from plaintext limits.
const MAX_RNC_BYTES = MAX_BYTES + 82
const MAX_FILE_BYTES = MAX_RNC_BYTES + 1024
const MAX_DEPTH = 16
const MAX_NODES = 10000
const KEY = /^[A-Za-z][A-Za-z0-9_]*$/
const plainObject = value => value !== null && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
export const sha256 = value => createHash('sha256').update(value).digest('hex')

function checkedString(value) {
  // XML 1.0 disallows these characters. Reject unpaired surrogates as well.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(value) || !value.isWellFormed()) {
    throw new Error('Unsupported XML string')
  }
  return value
}

function walk(value, encode, depth = 0, state = { nodes: 0, bytes: 0, ancestors: new Set() }) {
  if (depth > MAX_DEPTH || ++state.nodes > MAX_NODES) throw new Error('Config exceeds structural limits')
  state.bytes += typeof value === 'string' ? Buffer.byteLength(value) : Buffer.isBuffer(value) ? value.length : 8
  if (state.bytes > MAX_BYTES) throw new Error('Config exceeds size limit')
  if (typeof value === 'string') return encode.string(checkedString(value))
  if (typeof value === 'boolean') return encode.boolean(value)
  if (typeof value === 'number') {
    // Real values differ across SEB builds (.NET G15). Do not claim universal serialization.
    if (!Number.isSafeInteger(value)) throw new Error('Only safe integers are supported by this lab')
    return encode.integer(Object.is(value, -0) ? 0 : value)
  }
  if (Buffer.isBuffer(value)) return encode.data(value)
  if (!Array.isArray(value) && !plainObject(value)) throw new Error('Unsupported plist value')
  if (Object.getOwnPropertySymbols(value).length) throw new Error('Symbol properties are unsupported')
  if (state.ancestors.has(value)) throw new Error('Cyclic config')
  state.ancestors.add(value)
  let result
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new Error('Sparse/custom arrays are unsupported')
    // Native serializers handle dictionaries in arrays, but nested arrays inconsistently.
    const items = Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (!descriptor || !('value' in descriptor)) throw new Error('Array accessors are unsupported')
      if (Array.isArray(descriptor.value)) throw new Error('Nested arrays are outside this lab subset')
      return descriptor.value
    })
    result = encode.array(items.map(item => walk(item, encode, depth + 1, state)))
  } else {
    const keys = Object.keys(value)
    if (keys.some(key => !KEY.test(key))) throw new Error('Only ASCII setting names are supported')
    if (new Set(keys.map(key => key.toLowerCase())).size !== keys.length) {
      throw new Error('Case-colliding setting names are unsupported')
    }
    keys.sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0)
    result = encode.dict(keys.flatMap(key => {
      // Never invoke accessors while serializing untrusted values.
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !('value' in descriptor)) throw new Error('Config accessors are unsupported')
      const child = descriptor.value
      if (encode.skipMetadata && key === 'originatorVersion') return []
      if (encode.skipMetadata && plainObject(child) && Object.keys(child).length === 0) return []
      const serialized = walk(child, encode, depth + 1, state)
      if (encode.skipMetadata && plainObject(child) && serialized === '{}') return []
      return [[key, serialized]]
    }))
  }
  state.ancestors.delete(value)
  return result
}

function bounded(value) {
  if (Buffer.byteLength(value, 'utf8') > MAX_BYTES) throw new Error('Config exceeds size limit')
  return value
}

/** SEB-JSON is NOT JSON.stringify: SEB leaves strings/backslashes unescaped. */
export function configKeyText(settings) {
  if (!plainObject(settings)) throw new Error('Config root must be a dictionary')
  return bounded(walk(settings, {
    skipMetadata: true,
    string: value => `"${value}"`, boolean: String, integer: String,
    data: value => `"${value.toString('base64')}"`,
    array: values => `[${values.join(',')}]`,
    dict: entries => `{${entries.map(([key, value]) => `"${key}":${value}`).join(',')}}`,
  }))
}

export const configKey = settings => sha256(configKeyText(settings))
const xmlEscape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;').replaceAll('\r', '&#13;')

export function toPlist(settings) {
  if (!plainObject(settings)) throw new Error('Config root must be a dictionary')
  const body = walk(settings, {
    string: value => `<string>${xmlEscape(value)}</string>`,
    boolean: value => value ? '<true/>' : '<false/>',
    integer: value => `<integer>${value}</integer>`,
    data: value => `<data>${value.toString('base64')}</data>`,
    array: values => `<array>${values.join('')}</array>`,
    dict: entries => `<dict>${entries.map(([key, value]) => `<key>${key}</key>${value}`).join('')}</dict>`,
  })
  return bounded(`<?xml version="1.0" encoding="UTF-8"?><plist version="1.0">${body}</plist>`)
}

function checkPassword(password) {
  // Current SEB implementations have Unicode password compatibility differences.
  // This prototype uses printable ASCII; do not normalize/trim passwords silently.
  if (typeof password !== 'string' || !/^[\x20-\x7e]{1,128}$/.test(password)) {
    throw new Error('Lab passwords must be 1–128 printable ASCII characters')
  }
}

export function passwordHash(password) {
  checkPassword(password)
  return sha256(password)
}

/** RNCryptor v3; deterministic entropy injection is ONLY for published test vectors. */
export function encryptRnc(plaintext, password, entropy = randomBytes) {
  checkPassword(password)
  if (!Buffer.isBuffer(plaintext) || plaintext.length > MAX_BYTES) throw new Error('Invalid plaintext size')
  const encSalt = entropy(8), macSalt = entropy(8), iv = entropy(16)
  if (![encSalt, macSalt, iv].every(Buffer.isBuffer) || encSalt.length !== 8 || macSalt.length !== 8 || iv.length !== 16) {
    throw new Error('Invalid encryption entropy')
  }
  const encKey = pbkdf2Sync(password, encSalt, 10000, 32, 'sha1')
  const macKey = pbkdf2Sync(password, macSalt, 10000, 32, 'sha1')
  try {
    const cipher = createCipheriv('aes-256-cbc', encKey, iv)
    const message = Buffer.concat([Buffer.from([3, 1]), encSalt, macSalt, iv, cipher.update(plaintext), cipher.final()])
    return Buffer.concat([message, createHmac('sha256', macKey).update(message).digest()])
  } finally {
    encKey.fill(0)
    macKey.fill(0)
  }
}

export function decryptRnc(message, password) {
  checkPassword(password)
  if (!Buffer.isBuffer(message) || message.length < 82 || message.length > MAX_RNC_BYTES
    || message[0] !== 3 || message[1] !== 1 || (message.length - 66) % 16 !== 0) {
    throw new Error('Unsupported RNCryptor message')
  }
  const macKey = pbkdf2Sync(password, message.subarray(10, 18), 10000, 32, 'sha1')
  try {
    const mac = createHmac('sha256', macKey).update(message.subarray(0, -32)).digest()
    if (!timingSafeEqual(mac, message.subarray(-32))) throw new Error('Password or encrypted data is invalid')
  } finally { macKey.fill(0) }
  // Authenticate before decrypting; no plaintext or padding oracle on failed authentication.
  const encKey = pbkdf2Sync(password, message.subarray(2, 10), 10000, 32, 'sha1')
  try {
    const decipher = createDecipheriv('aes-256-cbc', encKey, message.subarray(18, 34))
    return Buffer.concat([decipher.update(message.subarray(34, -32)), decipher.final()])
  } finally { encKey.fill(0) }
}

export function encodeExamFile(settings, settingsPassword) {
  if (settings.sebConfigPurpose !== 0) throw new Error('Only starting-exam configs are allowed in this lab')
  const encrypted = encryptRnc(gzipSync(Buffer.from(toPlist(settings))), settingsPassword)
  return gzipSync(Buffer.concat([Buffer.from('pswd'), encrypted]))
}

export function decodeExamFile(file, settingsPassword) {
  if (!Buffer.isBuffer(file) || file.length > MAX_FILE_BYTES) throw new Error('Invalid file size')
  const inner = gunzipSync(file, { maxOutputLength: MAX_RNC_BYTES + 4 })
  if (inner.subarray(0, 4).toString() !== 'pswd') throw new Error('Only pswd exam files are supported')
  const plain = gunzipSync(decryptRnc(inner.subarray(4), settingsPassword), { maxOutputLength: MAX_BYTES })
  return plain.toString('utf8')
}

export function requestHash(url, key) {
  const parsed = new URL(url)
  if (!/^https?:$/.test(parsed.protocol) || !/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid hash inputs')
  parsed.hash = ''
  return sha256(parsed.href + key)
}

export function matchesConfigProof(url, key, received) {
  if (typeof received !== 'string' || !/^[a-f0-9]{64}$/i.test(received)) return false
  return timingSafeEqual(Buffer.from(requestHash(url, key), 'hex'), Buffer.from(received, 'hex'))
}

/** Synthetic editor/format fixtures, NOT a production lockdown template. */
export function labSettings({ startUrl, quitPassword, adminPassword, salt }) {
  const url = new URL(startUrl)
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.hash) throw new Error('Invalid start URL')
  if (!Buffer.isBuffer(salt) || salt.length !== 32) throw new Error('Expected a 32-byte exam salt')
  return {
    sebConfigPurpose: 0,
    startURL: url.href,
    hashedQuitPassword: passwordHash(quitPassword),
    hashedAdminPassword: passwordHash(adminPassword),
    examKeySalt: salt,
    allowQuit: true,
    allowPreferencesWindow: true,
    showSettingsInApp: true,
    sendBrowserExamKey: false,
    browserWindowWebView: 3,
    quitURL: '',
    quitURLRestart: false,
    allowWlan: true,
    // Keep this desktop FORMAT lab recoverable. It is never accepted by production.
    browserViewMode: 0,
    allowSwitchToApplications: true,
    allowScreenCapture: true,
    allowScreenSharing: true,
    allowWindowCapture: true,
    screenSharingMacEnforceBlocked: false,
    enableAppSwitcherCheck: false,
    prohibitedProcesses: [],
    permittedProcesses: [],
    URLFilterEnable: false,
  }
}
