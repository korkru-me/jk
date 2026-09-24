const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SHA256 = /^[a-f0-9]{64}$/
const RELEASE_ID = /^asr-[0-9a-f]{32}-r([1-9][0-9]{0,9})-([0-9a-f]{16})$/
const NAMESPACE = /^qa:seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const WINDOWS_VERSION = 'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser'
const BLOCKED_MESSAGE = 'SEB Staging private release material provider blocked'

export class SebStagingPrivateReleaseMaterialProviderBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingPrivateReleaseMaterialProviderBlockedError'
  }
}

function blocked() {
  throw new SebStagingPrivateReleaseMaterialProviderBlockedError()
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Reflect.ownKeys(value).every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return typeof key === 'string'
      && descriptor !== undefined
      && Object.hasOwn(descriptor, 'value')
      && descriptor.enumerable === true
  })
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
  return Number.isFinite(notBefore) && Number.isFinite(notAfter) && notAfter > notBefore
    ? Object.freeze({ runId: value.runId, sourceRevision: value.sourceRevision, deploymentId: value.deploymentId })
    : null
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

function parseRequest(value, identity) {
  if (!Object.isFrozen(value)
    || !hasExactFields(value, [
      'targetOrigin', 'namespace', 'assignmentId', 'releaseId', 'releaseRevision',
      'platform', 'versionString', 'buildNumber',
    ])
    || value.targetOrigin !== OFFICIAL_STAGING_SUPABASE_ORIGIN
    || value.namespace !== `qa:${identity.runId}`
    || !NAMESPACE.test(value.namespace)
    || typeof value.assignmentId !== 'string'
    || !UUID.test(value.assignmentId)
    || typeof value.releaseId !== 'string'
    || value.platform !== 'windows'
    || value.versionString !== '3.10.2'
    || value.buildNumber !== '920') return null
  const match = RELEASE_ID.exec(value.releaseId)
  if (!match
    || !Number.isInteger(value.releaseRevision)
    || Number(match[1]) !== value.releaseRevision) return null
  return Object.freeze({ ...value })
}

function validSignal(value) {
  try { return value instanceof AbortSignal && value.aborted === false } catch { return false }
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
    && !/[\u0000-\u0020\u007f]/u.test(value.serviceRoleKey)
      ? value.serviceRoleKey
      : null
}

function parseRow(value, request) {
  if (!hasExactFields(value, [
    'assignment_id', 'revision', 'release_id', 'config_key', 'browser_exam_keys',
  ])
    || value.assignment_id !== request.assignmentId
    || value.revision !== request.releaseRevision
    || value.release_id !== request.releaseId
    || typeof value.config_key !== 'string'
    || !SHA256.test(value.config_key)
    || !Array.isArray(value.browser_exam_keys)) return null
  const matches = value.browser_exam_keys.filter(entry => (
    hasExactFields(entry, ['platform', 'versionString', 'buildNumber', 'key'])
    && entry.platform === 'windows'
    && entry.versionString === request.versionString
    && entry.buildNumber === request.buildNumber
    && typeof entry.key === 'string'
    && SHA256.test(entry.key)
  ))
  if (matches.length !== 1) return null
  return Object.freeze({
    releaseId: request.releaseId,
    releaseRevision: request.releaseRevision,
    configKey: value.config_key.toLowerCase(),
    browserExamKey: matches[0].key.toLowerCase(),
    version: WINDOWS_VERSION,
  })
}

/** Read raw CK/BEK once through a service-role-only Staging boundary. */
export function createSebStagingPrivateReleaseMaterialProvider({
  runIdentity,
  readEnvironment,
  serviceRoleCredentialProvider,
  fetchImplementation = globalThis.fetch,
} = {}) {
  const identity = parseIdentity(runIdentity)
  let initialEnvironment = null
  try { initialEnvironment = typeof readEnvironment === 'function' ? readEnvironment() : null } catch { blocked() }
  if (!identity
    || typeof readEnvironment !== 'function'
    || !officialEnvironment(initialEnvironment)
    || typeof serviceRoleCredentialProvider !== 'function'
    || typeof fetchImplementation !== 'function') blocked()

  const namespace = `qa:${identity.runId}`
  let cached = null
  let cacheIdentity = null
  let busy = false

  function currentEnvironment() {
    let value = null
    try { value = readEnvironment() } catch { blocked() }
    if (!officialEnvironment(value)) blocked()
  }

  async function readReleaseMaterial(requestInput, options) {
    const request = parseRequest(requestInput, identity)
    const signal = hasExactFields(options, ['signal']) && validSignal(options.signal)
      ? options.signal
      : null
    if (!request || !signal || busy) blocked()
    const requestIdentity = `${request.assignmentId}\u0000${request.releaseId}\u0000${request.releaseRevision}`
    if (cached) {
      if (cacheIdentity !== requestIdentity) blocked()
      return cached
    }
    busy = true
    try {
      currentEnvironment()
      const credential = await serviceRoleCredentialProvider(Object.freeze({
        schemaVersion: 1,
        targetOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
        credentialKind: 'service-role',
        namespace,
        signal,
      }))
      let serviceRoleKey = parseCredential(credential, namespace)
      if (!serviceRoleKey || signal.aborted) blocked()
      const query = new URL('/rest/v1/assignment_seb_config_releases', OFFICIAL_STAGING_SUPABASE_ORIGIN)
      query.searchParams.set('select', 'assignment_id,revision,release_id,config_key,browser_exam_keys')
      query.searchParams.set('assignment_id', `eq.${request.assignmentId}`)
      query.searchParams.set('revision', `eq.${request.releaseRevision}`)
      query.searchParams.set('release_id', `eq.${request.releaseId}`)
      query.searchParams.set('limit', '2')
      let response
      try {
        response = await fetchImplementation(query, {
          method: 'GET',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            Accept: 'application/json',
          },
          signal,
          cache: 'no-store',
        })
      } finally {
        serviceRoleKey = ''
      }
      currentEnvironment()
      if (signal.aborted || !response || response.status !== 200) blocked()
      const body = await response.json()
      if (!Array.isArray(body) || body.length !== 1) blocked()
      const parsed = parseRow(body[0], request)
      if (!parsed) blocked()
      cached = parsed
      cacheIdentity = requestIdentity
      return cached
    } finally {
      busy = false
    }
  }

  return Object.freeze({ readReleaseMaterial })
}
