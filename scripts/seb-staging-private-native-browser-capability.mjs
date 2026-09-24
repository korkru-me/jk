import { createHash } from 'node:crypto'

const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SHA256 = /^[a-f0-9]{64}$/
const RELEASE_ID = /^asr-[0-9a-f]{32}-r([1-9][0-9]{0,9})-([0-9a-f]{16})$/
const WINDOWS_VERSION = 'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser'
const BINDING_NAME = '__korkruSebS5SecurityHashes'
const BLOCKED_MESSAGE = 'SEB Staging private native browser capability blocked'
const LEDGER_METHODS = Object.freeze([
  'planTarget', 'adoptDerivedTarget', 'markUncertain', 'commitTarget',
  'reconcileTarget', 'readCleanupTarget', 'markDeleted',
])
const OPERATION_SPECS = Object.freeze(new Map([
  ['reject-invalid-seb-challenge', Object.freeze({ alias: 'student-primary', mode: 'invalid', session: false })],
  ['verify-seb-system-check', Object.freeze({ alias: 'student-primary', mode: 'valid', session: false })],
  ['reject-replayed-seb-challenge', Object.freeze({ alias: 'student-primary', mode: 'invalid', session: false })],
  ['reject-invalid-seb-session', Object.freeze({ alias: 'student-primary', mode: 'invalid', session: true })],
  ['reject-replayed-seb-session', Object.freeze({ alias: 'student-primary', mode: 'invalid', session: true })],
]))

export class SebStagingPrivateNativeBrowserCapabilityBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingPrivateNativeBrowserCapabilityBlockedError'
  }
}

function blocked() {
  throw new SebStagingPrivateNativeBrowserCapabilityBlockedError()
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

function parseIdentity(value) {
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

function validSignal(value) {
  try {
    return value instanceof AbortSignal && value.aborted === false
  } catch {
    return false
  }
}

function validPage(value) {
  try {
    return value !== null
      && typeof value === 'object'
      && typeof value.exposeFunction === 'function'
      && typeof value.addInitScript === 'function'
      && typeof value.context === 'function'
  } catch {
    return false
  }
}

function parseOperation(value, identity, expectedStudentId) {
  const spec = OPERATION_SPECS.get(value?.operationId)
  if (!spec
    || !Object.isFrozen(value)
    || !hasExactFields(value, [
      'targetOrigin', 'namespace', 'alias', 'expectedUserId', 'operationId', 'page', 'signal',
    ])
    || value.targetOrigin !== OFFICIAL_STAGING_SITE_ORIGIN
    || value.namespace !== `qa:${identity.runId}`
    || value.alias !== spec.alias
    || value.expectedUserId !== expectedStudentId
    || !validPage(value.page)
    || !validSignal(value.signal)) return null
  return Object.freeze({ spec, operationId: value.operationId, page: value.page, signal: value.signal })
}

function parseReleaseMaterial(value, expected) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, [
      'releaseId', 'releaseRevision', 'configKey', 'browserExamKey', 'version',
    ])
    || value.releaseId !== expected.releaseId
    || value.releaseRevision !== expected.releaseRevision
    || typeof value.configKey !== 'string'
    || !SHA256.test(value.configKey)
    || typeof value.browserExamKey !== 'string'
    || !SHA256.test(value.browserExamKey)
    || value.version !== WINDOWS_VERSION) return null
  return Object.freeze({
    configKey: value.configKey.toLowerCase(),
    browserExamKey: value.browserExamKey.toLowerCase(),
    version: value.version,
  })
}

function requestHash(url, key) {
  const parsed = new URL(url)
  if (parsed.origin !== OFFICIAL_STAGING_SITE_ORIGIN) blocked()
  parsed.hash = ''
  return createHash('sha256').update(`${parsed.toString()}${key}`, 'utf8').digest('hex')
}

function invalidHash(value) {
  return `${value[0] === '0' ? '1' : '0'}${value.slice(1)}`
}

function initSebBridge({ bindingName, version }) {
  const update = async callback => {
    try {
      const hashes = await window[bindingName](window.location.href)
      window.SafeExamBrowser.security.configKey = hashes.configKey
      window.SafeExamBrowser.security.browserExamKey = hashes.browserExamKey
    } finally {
      callback()
    }
  }
  Object.defineProperty(window, 'SafeExamBrowser', {
    configurable: true,
    value: {
      version,
      security: {
        configKey: '',
        browserExamKey: '',
        updateKeys: update,
      },
    },
  })
}

/**
 * Install a closure-private SEB JavaScript bridge before navigation. Raw CK
 * and BEK never enter the browser context: the page receives only request
 * hashes for its current exact Staging URL. Negative session steps remove only
 * the assignment's SEB cookie, preserving the authenticated user session.
 */
export function createSebStagingPrivateNativeBrowserCapability({
  runIdentity,
  readEnvironment,
  privateRunLedger,
  releaseMaterialProvider,
} = {}) {
  const identity = parseIdentity(runIdentity)
  const ledger = captureCapability(privateRunLedger, LEDGER_METHODS)
  const material = captureCapability(releaseMaterialProvider, ['readReleaseMaterial'])
  let environment = null
  try { environment = typeof readEnvironment === 'function' ? readEnvironment() : null } catch { blocked() }
  if (!identity || typeof readEnvironment !== 'function' || !officialEnvironment(environment)
    || !ledger || !material) blocked()

  const initializedPages = new WeakSet()
  const pageStates = new WeakMap()
  const attempted = new Set()
  let busy = false

  function currentEnvironment() {
    let value = null
    try { value = readEnvironment() } catch { blocked() }
    if (!officialEnvironment(value)) blocked()
  }

  async function initializePage(page) {
    if (initializedPages.has(page)) return
    await page.exposeFunction(BINDING_NAME, requestUrl => {
      const state = pageStates.get(page)
      if (!state || typeof requestUrl !== 'string') blocked()
      const configKey = requestHash(requestUrl, state.configKey)
      const browserExamKey = requestHash(requestUrl, state.browserExamKey)
      return Object.freeze({
        configKey: state.mode === 'valid' ? configKey : invalidHash(configKey),
        browserExamKey: state.mode === 'valid' ? browserExamKey : invalidHash(browserExamKey),
      })
    })
    await page.addInitScript(initSebBridge, Object.freeze({
      bindingName: BINDING_NAME,
      version: WINDOWS_VERSION,
    }))
    initializedPages.add(page)
  }

  async function executeNativeOperation(input) {
    if (busy) return Object.freeze({ status: 'failed' })
    busy = true
    try {
      currentEnvironment()
      if (!sameCapability(ledger, LEDGER_METHODS)
        || !sameCapability(material, ['readReleaseMaterial'])) blocked()
      const studentId = exactCommittedTarget(ledger, 'account-student-primary', 'account')
      const assignmentId = exactCommittedTarget(ledger, 'assignment-primary', 'assignment')
      const releaseId = exactCommittedTarget(ledger, 'release-primary', 'release')
      if (!UUID.test(studentId ?? '') || !UUID.test(assignmentId ?? '')) blocked()
      const releaseMatch = RELEASE_ID.exec(releaseId ?? '')
      if (!releaseMatch) blocked()
      const parsed = parseOperation(input, identity, studentId)
      if (!parsed || attempted.has(parsed.operationId)) blocked()
      attempted.add(parsed.operationId)
      const raw = await material.methods.readReleaseMaterial.call(
        material.wrapper,
        Object.freeze({
          targetOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
          namespace: `qa:${identity.runId}`,
          assignmentId,
          releaseId,
          releaseRevision: Number(releaseMatch[1]),
          platform: 'windows',
          versionString: '3.10.2',
          buildNumber: '920',
        }),
        Object.freeze({ signal: parsed.signal }),
      )
      const release = parseReleaseMaterial(raw, {
        releaseId,
        releaseRevision: Number(releaseMatch[1]),
      })
      if (!release || parsed.signal.aborted) blocked()
      pageStates.set(parsed.page, Object.freeze({
        mode: parsed.spec.mode,
        configKey: release.configKey,
        browserExamKey: release.browserExamKey,
      }))
      await initializePage(parsed.page)
      if (parsed.spec.session) {
        const context = parsed.page.context()
        if (!context || typeof context.clearCookies !== 'function') blocked()
        await context.clearCookies({ name: `korkru-seb-${assignmentId}` })
      }
      currentEnvironment()
      if (parsed.signal.aborted) blocked()
      return Object.freeze({ status: 'passed' })
    } catch {
      return Object.freeze({ status: 'failed' })
    } finally {
      busy = false
    }
  }

  return Object.freeze({ executeNativeOperation })
}
