const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const LOGIN_URL = `${OFFICIAL_STAGING_SITE_ORIGIN}/login`
const DASHBOARD_URL = `${OFFICIAL_STAGING_SITE_ORIGIN}/dashboard`
const BLOCKED_MESSAGE = 'SEB Staging browser session blocked'
const QA_SCHEMA_VERSION = 1
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SAFE_NAMESPACE = /^qa:seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const FORBIDDEN_NAMESPACE_TERMS = /(prod(?:uction)?|live|real|customer)/
const SYNTHETIC_EMAIL = /^[a-z0-9][a-z0-9._-]{0,63}@qa\.staging\.korkru\.com$/
const MAX_COOKIE_COUNT = 64
const MAX_COOKIE_NAME_LENGTH = 256
const MAX_COOKIE_VALUE_LENGTH = 16_384
const MIN_DEADLINE_MS = 50
const MAX_DEADLINE_MS = 120_000

const ACCOUNT_ROLES = Object.freeze(new Map([
  ['teacher-primary', 'teacher'],
  ['teacher-unrelated', 'teacher'],
  ['student-primary', 'student'],
  ['student-secondary', 'student'],
]))
const OPERATION_ALIASES = Object.freeze(new Map([
  ['create-subject-classroom', 'teacher-primary'],
  ['create-synthetic-written-question', 'teacher-primary'],
  ['create-synthetic-upload-question', 'teacher-primary'],
  ['join-synthetic-student-to-classroom', 'student-primary'],
  ['join-secondary-student-to-classroom', 'student-secondary'],
  ['create-seb-assignment-draft-with-quit-password', 'teacher-primary'],
  ['publish-seb-assignment', 'teacher-primary'],
  ['reject-invalid-seb-challenge', 'student-primary'],
  ['verify-seb-system-check', 'student-primary'],
  ['reject-replayed-seb-challenge', 'student-primary'],
  ['reject-invalid-seb-session', 'student-primary'],
  ['start-revision-bound-attempt', 'student-primary'],
  ['reject-replayed-seb-session', 'student-primary'],
  ['autosave-synthetic-answer', 'student-primary'],
  ['retry-autosave-after-transient-failure', 'student-primary'],
  ['resume-same-attempt', 'student-primary'],
  ['upload-synthetic-attachment', 'student-primary'],
  ['retry-upload-after-transient-failure', 'student-primary'],
  ['record-proctor-heartbeat', 'student-primary'],
  ['student-denied-teacher-result', 'student-primary'],
  ['submit-attempt', 'student-primary'],
  ['teacher-read-submitted-result', 'teacher-primary'],
  ['secondary-student-denied-primary-attempt', 'student-secondary'],
  ['unrelated-teacher-denied-assignment-result', 'teacher-unrelated'],
]))
const EXPECTED_QA_METADATA_FIELDS = Object.freeze([
  'qa_alias',
  'qa_fixture',
  'qa_namespace',
  'qa_role',
  'qa_schema_version',
])
const DEFAULT_DEADLINES_MS = Object.freeze({
  browserFactory: 10_000,
  attestation: 10_000,
  operation: 30_000,
  probe: 10_000,
  close: 10_000,
  action: 15_000,
  navigation: 30_000,
})
const DEADLINE_FIELDS = Object.freeze(Object.keys(DEFAULT_DEADLINES_MS))

export class SebStagingBrowserSessionBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingBrowserSessionBlockedError'
  }
}

function blocked() {
  throw new SebStagingBrowserSessionBlockedError()
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
  try {
    const actual = Object.keys(value).sort()
    const expected = [...fields].sort()
    return actual.length === expected.length
      && actual.every((field, index) => field === expected[index])
  } catch {
    return false
  }
}

function parseDeadlines(value) {
  if (value === undefined) return DEFAULT_DEADLINES_MS
  if (!isDataRecord(value)) return null
  const fields = Object.keys(value)
  if (fields.some(field => !DEADLINE_FIELDS.includes(field))) return null
  const parsed = { ...DEFAULT_DEADLINES_MS }
  for (const [field, deadline] of Object.entries(value)) {
    if (!Number.isInteger(deadline)
      || deadline < MIN_DEADLINE_MS
      || deadline > MAX_DEADLINE_MS) {
      return null
    }
    parsed[field] = deadline
  }
  return Object.freeze(parsed)
}

function hasOfficialStagingPolicy(environment, { cleanup = false } = {}) {
  return isDataRecord(environment)
    && environment.KORKRU_DEPLOYMENT_ENV === 'staging'
    && environment.EXAM_QA_ENVIRONMENT === 'staging'
    && environment.VERCEL_ENV === 'preview'
    && environment.NEXT_PUBLIC_SITE_URL === OFFICIAL_STAGING_SITE_ORIGIN
    && environment.NEXT_PUBLIC_SUPABASE_URL === OFFICIAL_STAGING_SUPABASE_ORIGIN
    && environment.EXAM_QA_DATA_POLICY === 'synthetic-only'
    && environment.EXAM_QA_COPY_PRODUCTION_DATA === 'false'
    && (cleanup
      ? environment.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'true'
        || environment.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'false'
      : environment.EXAM_QA_ALLOW_SYNTHETIC_WRITES === 'true')
}

function parseAbsoluteUrl(value) {
  if (typeof value !== 'string' || value.length > 2_048) return null
  try {
    const url = new URL(value)
    if (url.username || url.password || url.origin !== OFFICIAL_STAGING_SITE_ORIGIN) return null
    return url
  } catch {
    return null
  }
}

function bindingFieldsAreValid(request, namespace) {
  return request.targetOrigin === OFFICIAL_STAGING_SITE_ORIGIN
    && request.namespace === namespace
    && ACCOUNT_ROLES.has(request.alias)
    && ACCOUNT_ROLES.get(request.alias) === request.role
    && typeof request.expectedUserId === 'string'
    && UUID.test(request.expectedUserId)
}

function parseBindingRequest(request, namespace, { credentials = false } = {}) {
  const fields = [
    'targetOrigin',
    'namespace',
    'alias',
    'role',
    'expectedUserId',
    ...(credentials ? ['credentials'] : []),
  ]
  if (!hasExactFields(request, fields) || !bindingFieldsAreValid(request, namespace)) return null

  const parsed = {
    targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
    namespace,
    alias: request.alias,
    role: request.role,
    expectedUserId: request.expectedUserId,
  }
  if (credentials) {
    if (!hasExactFields(request.credentials, ['email', 'password'])
      || typeof request.credentials.email !== 'string'
      || !SYNTHETIC_EMAIL.test(request.credentials.email)
      || typeof request.credentials.password !== 'string'
      || request.credentials.password.length < 20
      || request.credentials.password.length > 256) {
      return null
    }
    parsed.email = request.credentials.email
    parsed.password = request.credentials.password
  }
  return parsed
}

function parseExecuteRequest(request, namespace) {
  if (!hasExactFields(request, [
    'targetOrigin',
    'namespace',
    'alias',
    'role',
    'expectedUserId',
    'operationId',
    'payload',
  ])
    || !bindingFieldsAreValid(request, namespace)
    || OPERATION_ALIASES.get(request.operationId) !== request.alias
    || !hasExactFields(request.payload, [])) {
    return null
  }
  return Object.freeze({
    binding: Object.freeze({
      targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
      namespace,
      alias: request.alias,
      role: request.role,
      expectedUserId: request.expectedUserId,
    }),
    operationId: request.operationId,
    // S5 foundation operations intentionally accept no public parameters.
    // Exact resource targets stay in the trusted runner's private ledger.
    payload: Object.freeze({}),
  })
}

function parseAliasRequest(request, namespace, fields) {
  if (!hasExactFields(request, ['targetOrigin', 'namespace', ...fields])
    || request.targetOrigin !== OFFICIAL_STAGING_SITE_ORIGIN
    || request.namespace !== namespace) {
    return null
  }
  for (const field of fields) {
    if (!ACCOUNT_ROLES.has(request[field])) return null
  }
  return Object.freeze({ ...request })
}

function sameBinding(left, right, { includeEmail = false } = {}) {
  return left?.targetOrigin === right?.targetOrigin
    && left?.namespace === right?.namespace
    && left?.alias === right?.alias
    && left?.role === right?.role
    && left?.expectedUserId === right?.expectedUserId
    && (!includeEmail || left?.email === right?.email)
}

function exactPassedResult(value) {
  return hasExactFields(value, ['status']) && value.status === 'passed'
}

function passedResult() {
  return Object.freeze({ status: 'passed' })
}

function isBrowserLike(value) {
  try {
    return value !== null
      && typeof value === 'object'
      && typeof value.newContext === 'function'
      && typeof value.close === 'function'
  } catch {
    return false
  }
}

function validateBrowser(value) {
  try {
    return isBrowserLike(value)
      && (typeof value.isConnected !== 'function' || value.isConnected() === true)
  } catch {
    return false
  }
}

function validateContext(value) {
  try {
    return value !== null
      && typeof value === 'object'
      && typeof value.newPage === 'function'
      && typeof value.pages === 'function'
      && typeof value.cookies === 'function'
      && typeof value.clearCookies === 'function'
      && typeof value.addCookies === 'function'
      && typeof value.close === 'function'
  } catch {
    return false
  }
}

function validatePage(value) {
  try {
    return value !== null
      && typeof value === 'object'
      && typeof value.goto === 'function'
      && typeof value.reload === 'function'
      && typeof value.url === 'function'
      && typeof value.locator === 'function'
      && typeof value.getByRole === 'function'
      && typeof value.waitForURL === 'function'
      && typeof value.evaluate === 'function'
      && (typeof value.isClosed !== 'function' || value.isClosed() === false)
  } catch {
    return false
  }
}

function validateResponse(response, expectedUrl = null) {
  try {
    if (response === null
      || typeof response !== 'object'
      || typeof response.ok !== 'function'
      || response.ok() !== true
      || typeof response.url !== 'function') {
      return false
    }
    const url = parseAbsoluteUrl(response.url())
    return url !== null && (expectedUrl === null || url.href === expectedUrl)
  } catch {
    return false
  }
}

function validateExactPage(page, expectedPath = null) {
  try {
    const url = parseAbsoluteUrl(page.url())
    return url !== null
      && (expectedPath === null || `${url.pathname}${url.search}${url.hash}` === expectedPath)
  } catch {
    return false
  }
}

function assertNotAborted(signal) {
  if (!(signal instanceof AbortSignal) || signal.aborted) blocked()
}

async function exactVisibleLocator(page, selector, expectedType = null, signal) {
  assertNotAborted(signal)
  const locator = page.locator(selector)
  if (!locator || typeof locator.count !== 'function' || typeof locator.isVisible !== 'function') {
    blocked()
  }
  const count = await locator.count()
  assertNotAborted(signal)
  if (count !== 1) blocked()
  const visible = await locator.isVisible()
  assertNotAborted(signal)
  if (visible !== true) blocked()
  if (expectedType !== null) {
    if (typeof locator.getAttribute !== 'function') blocked()
    const type = await locator.getAttribute('type')
    assertNotAborted(signal)
    if (type !== expectedType) blocked()
  }
  return locator
}

async function assertStagingMarker(page, signal) {
  const root = await exactVisibleLocator(
    page,
    'html[data-deployment-environment="staging"]',
    null,
    signal,
  )
  assertNotAborted(signal)
  if (typeof root.getAttribute !== 'function') blocked()
  const rootEnvironment = await root.getAttribute('data-deployment-environment')
  assertNotAborted(signal)
  if (rootEnvironment !== 'staging') blocked()

  const marker = page.getByRole('status', {
    name: 'ระบบทดสอบ Staging',
    exact: true,
  })
  if (!marker
    || typeof marker.count !== 'function'
    || typeof marker.isVisible !== 'function'
    || typeof marker.textContent !== 'function') blocked()
  const markerCount = await marker.count()
  assertNotAborted(signal)
  if (markerCount !== 1) blocked()
  const markerVisible = await marker.isVisible()
  assertNotAborted(signal)
  if (markerVisible !== true) blocked()
  const markerText = await marker.textContent()
  assertNotAborted(signal)
  if (markerText?.trim() !== 'STAGING · ระบบทดสอบ') blocked()
}

function sanitizeAttestation(attestation, binding) {
  if (!hasExactFields(attestation, [
    'targetOrigin',
    'authenticatedUserId',
    'authenticatedEmail',
    'appMetadata',
  ])
    || attestation.targetOrigin !== OFFICIAL_STAGING_SITE_ORIGIN
    || attestation.authenticatedUserId !== binding.expectedUserId
    || attestation.authenticatedEmail !== binding.email
    || !isDataRecord(attestation.appMetadata)) {
    return null
  }

  const appMetadata = attestation.appMetadata
  const actualQaFields = Object.keys(appMetadata)
    .filter(field => field.startsWith('qa_'))
    .sort()
  if (actualQaFields.length !== EXPECTED_QA_METADATA_FIELDS.length
    || !actualQaFields.every((field, index) => field === EXPECTED_QA_METADATA_FIELDS[index])
    || appMetadata.role !== binding.role
    || appMetadata.qa_fixture !== 'seb-s5'
    || appMetadata.qa_namespace !== binding.namespace
    || appMetadata.qa_role !== binding.role
    || appMetadata.qa_alias !== binding.alias
    || appMetadata.qa_schema_version !== QA_SCHEMA_VERSION) {
    return null
  }

  return Object.freeze({
    targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
    authenticatedUserId: binding.expectedUserId,
    appMetadata: Object.freeze({
      role: binding.role,
      qa_fixture: 'seb-s5',
      qa_namespace: binding.namespace,
      qa_role: binding.role,
      qa_alias: binding.alias,
      qa_schema_version: QA_SCHEMA_VERSION,
    }),
  })
}

function cloneCookie(cookie) {
  if (!isDataRecord(cookie)
    || typeof cookie.name !== 'string'
    || cookie.name.length < 1
    || cookie.name.length > MAX_COOKIE_NAME_LENGTH
    || typeof cookie.value !== 'string'
    || cookie.value.length < 1
    || cookie.value.length > MAX_COOKIE_VALUE_LENGTH
    || (cookie.domain !== 'staging.korkru.com' && cookie.domain !== '.staging.korkru.com')
    || typeof cookie.path !== 'string'
    || !cookie.path.startsWith('/')
    || cookie.secure !== true) {
    return null
  }

  const clone = {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: true,
  }
  if (typeof cookie.expires === 'number' && Number.isFinite(cookie.expires)) {
    clone.expires = cookie.expires
  }
  if (typeof cookie.httpOnly === 'boolean') clone.httpOnly = cookie.httpOnly
  if (cookie.sameSite === 'Strict' || cookie.sameSite === 'Lax' || cookie.sameSite === 'None') {
    clone.sameSite = cookie.sameSite
  }
  if (typeof cookie.partitionKey === 'string' && cookie.partitionKey.length <= 2_048) {
    clone.partitionKey = cookie.partitionKey
  }
  return Object.freeze(clone)
}

function parseCookieSnapshot(cookies) {
  if (!Array.isArray(cookies) || cookies.length < 1 || cookies.length > MAX_COOKIE_COUNT) return null
  const identities = new Set()
  const snapshot = []
  for (const cookie of cookies) {
    const clone = cloneCookie(cookie)
    const identity = clone ? `${clone.name}\u0000${clone.domain}\u0000${clone.path}` : null
    if (!clone || identities.has(identity)) return null
    identities.add(identity)
    snapshot.push(clone)
  }
  return Object.freeze(snapshot)
}

function copyCookieSnapshot(snapshot, { freeze = false } = {}) {
  const copy = snapshot.map(cookie => {
    const cloned = { ...cookie }
    return freeze ? Object.freeze(cloned) : cloned
  })
  return freeze ? Object.freeze(copy) : copy
}

/**
 * Build a browser broker bound to one exact synthetic S5 namespace. Public
 * callers can select only a fixed operation id with an exact empty payload;
 * raw Playwright Page/Context objects are passed solely to the trusted,
 * closure-private runner and optional read probe. The attestor receives
 * closure-private cookies so it can call Supabase `auth.getUser()` instead of
 * trusting cookie or JWT claims offline.
 */
export function createSebStagingBrowserSessionBroker({
  namespace,
  readEnvironment,
  browserFactory,
  attestSession,
  sessionOperationRunner,
  userScopedReadProbe,
  deadlinesMs,
} = {}) {
  const boundNamespace = typeof namespace === 'string'
    && SAFE_NAMESPACE.test(namespace)
    && namespace !== 'qa:seb-s5-preview'
    && !FORBIDDEN_NAMESPACE_TERMS.test(namespace)
    ? namespace
    : null
  const deadlines = parseDeadlines(deadlinesMs)
  let initialEnvironment = null
  try {
    initialEnvironment = typeof readEnvironment === 'function' ? readEnvironment() : null
  } catch {
    blocked()
  }
  if (!boundNamespace
    || !deadlines
    || typeof readEnvironment !== 'function'
    || !hasOfficialStagingPolicy(initialEnvironment)
    || typeof browserFactory !== 'function'
    || typeof attestSession !== 'function'
    || typeof sessionOperationRunner !== 'function'
    || (userScopedReadProbe !== undefined && typeof userScopedReadProbe !== 'function')) {
    blocked()
  }

  let browser = null
  let browserQuarantined = false
  let browserStarting = false
  let busy = false
  let cleanupStarted = false
  let closed = false
  const sessions = new Map()
  const cookieSnapshots = new Map()
  const orphanedContexts = new Set()
  const lateBrowsers = new Set()
  const pendingTasks = new Set()
  let nextTaskId = 1

  async function runTrackedTask(kind, deadlineMs, task, { resource = null } = {}) {
    const controller = new AbortController()
    let settleTask
    const entry = {
      id: nextTaskId,
      kind,
      resource,
      controller,
      settled: new Promise(resolve => {
        settleTask = resolve
      }),
    }
    nextTaskId += 1
    pendingTasks.add(entry)

    const trackedTask = Promise.resolve()
      .then(async () => {
        assertNotAborted(controller.signal)
        const value = await task(controller.signal)
        assertNotAborted(controller.signal)
        return value
      })
      .finally(() => {
        pendingTasks.delete(entry)
        settleTask()
      })

    let timeoutHandle = null
    const timeout = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort()
        reject(new SebStagingBrowserSessionBlockedError())
      }, deadlineMs)
    })
    try {
      return await Promise.race([trackedTask, timeout])
    } catch (error) {
      if (!controller.signal.aborted) controller.abort()
      throw error
    } finally {
      if (timeoutHandle !== null) clearTimeout(timeoutHandle)
    }
  }

  function hasPendingResourceTask(kind, resource) {
    return [...pendingTasks].some(entry => entry.kind === kind && entry.resource === resource)
  }

  function abortPendingTasks() {
    for (const entry of pendingTasks) entry.controller.abort()
  }

  async function waitForPendingQuiescence() {
    const expiresAt = Date.now() + deadlines.close
    while (pendingTasks.size > 0) {
      const entries = [...pendingTasks]
      for (const entry of entries) entry.controller.abort()
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) return false
      let timeoutHandle = null
      const settled = await Promise.race([
        Promise.all(entries.map(entry => entry.settled)).then(() => true),
        new Promise(resolve => {
          timeoutHandle = setTimeout(() => resolve(false), remaining)
        }),
      ])
      if (timeoutHandle !== null) clearTimeout(timeoutHandle)
      if (!settled) return false
    }
    return true
  }

  function currentEnvironment({ cleanup = false } = {}) {
    let environment = null
    try {
      environment = readEnvironment()
    } catch {
      blocked()
    }
    if (!hasOfficialStagingPolicy(environment, { cleanup })) blocked()
    return environment
  }

  async function tryCloseContext(context) {
    if (!validateContext(context)) return false
    if (hasPendingResourceTask('context-close', context)) return false
    try {
      await runTrackedTask('context-close', deadlines.close, async signal => {
        await context.close()
        assertNotAborted(signal)
        return true
      }, { resource: context })
      return true
    } catch {
      return false
    }
  }

  async function tryCloseBrowser(targetBrowser) {
    if (!isBrowserLike(targetBrowser)) return false
    if (hasPendingResourceTask('browser-close', targetBrowser)) return false
    try {
      await runTrackedTask('browser-close', deadlines.close, async signal => {
        await targetBrowser.close()
        assertNotAborted(signal)
        return true
      }, { resource: targetBrowser })
      return true
    } catch {
      return false
    }
  }

  async function retainAndCloseLateBrowser(targetBrowser) {
    if (!isBrowserLike(targetBrowser)) return
    lateBrowsers.add(targetBrowser)
    closed = false
    const didClose = await tryCloseBrowser(targetBrowser)
    if (didClose) lateBrowsers.delete(targetBrowser)
  }

  async function retainAndCloseLateContext(context) {
    if (!validateContext(context)) return
    orphanedContexts.add(context)
    closed = false
    const didClose = await tryCloseContext(context)
    if (didClose) orphanedContexts.delete(context)
  }

  async function ensureBrowser() {
    currentEnvironment()
    if (browser !== null) {
      if (browserQuarantined || !validateBrowser(browser)) blocked()
      return browser
    }
    if (browserStarting) blocked()
    browserStarting = true
    let candidateBrowser = null
    let candidateHandled = false
    let accepted = false
    try {
      const attested = await runTrackedTask('browser-factory', deadlines.browserFactory, async signal => {
        assertNotAborted(signal)
        const result = await browserFactory(Object.freeze({
          targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
          namespace: boundNamespace,
          isolatedContexts: true,
          signal,
        }))
        if (signal.aborted) {
          await retainAndCloseLateBrowser(result?.browser)
          blocked()
        }
        return result
      })
      candidateBrowser = attested?.browser
      if (!hasExactFields(attested, ['targetOrigin', 'namespace', 'browser'])
        || attested.targetOrigin !== OFFICIAL_STAGING_SITE_ORIGIN
        || attested.namespace !== boundNamespace
        || !validateBrowser(candidateBrowser)) {
        if (isBrowserLike(candidateBrowser)) {
          candidateHandled = true
          browser = candidateBrowser
          browserQuarantined = true
          const didClose = await tryCloseBrowser(candidateBrowser)
          if (didClose) {
            browser = null
            browserQuarantined = false
          }
        }
        blocked()
      }
      currentEnvironment()
      browser = candidateBrowser
      browserQuarantined = false
      accepted = true
      return browser
    } catch {
      if (!accepted && !candidateHandled && isBrowserLike(candidateBrowser)) {
        browser = candidateBrowser
        browserQuarantined = true
        const didClose = await tryCloseBrowser(candidateBrowser)
        if (didClose) {
          browser = null
          browserQuarantined = false
        }
      }
      blocked()
    } finally {
      browserStarting = false
    }
  }

  function assertSinglePage(session) {
    let pages = null
    try {
      pages = session.context.pages()
    } catch {
      blocked()
    }
    if (!validateContext(session.context)
      || !validatePage(session.page)
      || !Array.isArray(pages)
      || pages.length !== 1
      || pages[0] !== session.page) {
      blocked()
    }
  }

  async function createSession(binding) {
    const activeBrowser = await ensureBrowser()
    let context = null
    try {
      context = await runTrackedTask('context-create', deadlines.operation, async signal => {
        const candidate = await activeBrowser.newContext(Object.freeze({
          acceptDownloads: false,
          baseURL: OFFICIAL_STAGING_SITE_ORIGIN,
          serviceWorkers: 'block',
        }))
        if (signal.aborted) {
          await retainAndCloseLateContext(candidate)
          blocked()
        }
        return candidate
      }, { resource: activeBrowser })
      if (!validateContext(context) || context.pages().length !== 0) blocked()
      const page = await runTrackedTask('page-create', deadlines.operation, async signal => {
        const candidate = await context.newPage()
        assertNotAborted(signal)
        return candidate
      }, { resource: context })
      if (!validatePage(page)) blocked()
      if (typeof page.setDefaultTimeout === 'function') page.setDefaultTimeout(deadlines.action)
      if (typeof page.setDefaultNavigationTimeout === 'function') {
        page.setDefaultNavigationTimeout(deadlines.navigation)
      }
      const storedBinding = { ...binding }
      delete storedBinding.password
      const session = {
        binding: Object.freeze(storedBinding),
        context,
        page,
        cookieState: 'native',
        replacedFrom: null,
        quarantined: false,
      }
      assertSinglePage(session)
      sessions.set(binding.alias, session)
      return session
    } catch {
      if (context) {
        orphanedContexts.add(context)
        if (await tryCloseContext(context)) orphanedContexts.delete(context)
      }
      blocked()
    }
  }

  async function discardSession(alias) {
    const session = sessions.get(alias)
    if (!session) return true
    session.quarantined = true
    const didClose = await tryCloseContext(session.context)
    if (didClose) {
      if (sessions.get(alias) === session) sessions.delete(alias)
      cookieSnapshots.delete(alias)
      return true
    }
    return false
  }

  function existingSession(binding) {
    const session = sessions.get(binding.alias)
    if (!session) return null
    if (session.quarantined
      || !sameBinding(session.binding, binding, {
        includeEmail: typeof binding.email === 'string',
      })) {
      blocked()
    }
    assertSinglePage(session)
    return session
  }

  async function attestBrowserSession(session, expectedBinding) {
    assertSinglePage(session)
    if (!validateExactPage(session.page)) blocked()
    await runTrackedTask('staging-marker', deadlines.action, signal => (
      assertStagingMarker(session.page, signal)
    ), { resource: session.context })
    return runTrackedTask('attestation', deadlines.attestation, async signal => {
      assertNotAborted(signal)
      const rawCookies = await session.context.cookies([OFFICIAL_STAGING_SITE_ORIGIN])
      assertNotAborted(signal)
      const cookies = parseCookieSnapshot(rawCookies)
      if (!cookies) blocked()
      assertNotAborted(signal)
      const privateCookies = copyCookieSnapshot(cookies, { freeze: true })
      assertNotAborted(signal)
      const attestation = await attestSession(Object.freeze({
        namespace: boundNamespace,
        cookies: privateCookies,
        signal,
      }))
      assertNotAborted(signal)
      const sanitized = sanitizeAttestation(attestation, expectedBinding)
      if (!sanitized) blocked()
      currentEnvironment()
      return sanitized
    }, { resource: session.context })
  }

  async function reloadAndAttest(session, binding) {
    const response = await runTrackedTask('page-reload', deadlines.navigation, async signal => {
      const result = await session.page.reload({ waitUntil: 'domcontentloaded' })
      assertNotAborted(signal)
      return result
    }, { resource: session.context })
    if (!validateResponse(response) || !validateExactPage(session.page)) blocked()
    return attestBrowserSession(session, binding)
  }

  async function authenticate(request) {
    const binding = parseBindingRequest(request, boundNamespace, { credentials: true })
    if (busy || cleanupStarted || closed || !binding) blocked()
    busy = true
    let session = null
    let success = false
    const credentials = {
      email: binding.email,
      password: binding.password,
    }
    try {
      currentEnvironment()
      session = existingSession(binding) ?? await createSession(binding)
      cookieSnapshots.delete(binding.alias)
      session.cookieState = 'native'
      session.replacedFrom = null
      await runTrackedTask('auth-clear-cookies', deadlines.action, async signal => {
        await session.context.clearCookies()
        assertNotAborted(signal)
      }, { resource: session.context })

      const response = await runTrackedTask('auth-goto', deadlines.navigation, async signal => {
        const result = await session.page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' })
        assertNotAborted(signal)
        return result
      }, { resource: session.context })
      if (!validateResponse(response, LOGIN_URL)
        || !validateExactPage(session.page, '/login')) {
        blocked()
      }
      await runTrackedTask('auth-storage-clear', deadlines.action, async signal => {
        await session.page.evaluate(() => {
          window.localStorage.clear()
          window.sessionStorage.clear()
        })
        assertNotAborted(signal)
      }, { resource: session.context })
      await runTrackedTask('auth-staging-marker', deadlines.action, signal => (
        assertStagingMarker(session.page, signal)
      ), { resource: session.context })

      const email = await runTrackedTask('auth-email-control', deadlines.action, signal => (
        exactVisibleLocator(session.page, '#email', 'email', signal)
      ), { resource: session.context })
      const password = await runTrackedTask('auth-password-control', deadlines.action, signal => (
        exactVisibleLocator(session.page, '#password', 'password', signal)
      ), { resource: session.context })
      const submit = await runTrackedTask('auth-submit-control', deadlines.action, signal => (
        exactVisibleLocator(session.page, 'button[type="submit"]', 'submit', signal)
      ), { resource: session.context })
      if (typeof email.fill !== 'function'
        || typeof password.fill !== 'function'
        || typeof submit.click !== 'function') {
        blocked()
      }
      await runTrackedTask('auth-email-fill', deadlines.action, async signal => {
        await email.fill(credentials.email)
        assertNotAborted(signal)
      }, { resource: session.context })
      await runTrackedTask('auth-password-fill', deadlines.action, async signal => {
        await password.fill(credentials.password)
        assertNotAborted(signal)
      }, { resource: session.context })
      await runTrackedTask('auth-submit-click', deadlines.navigation, async signal => {
        await submit.click()
        assertNotAborted(signal)
      }, { resource: session.context })
      await runTrackedTask('auth-wait-for-dashboard', deadlines.navigation, async signal => {
        await session.page.waitForURL(DASHBOARD_URL, { waitUntil: 'domcontentloaded' })
        assertNotAborted(signal)
      }, { resource: session.context })
      if (!validateExactPage(session.page, '/dashboard')) blocked()

      const attestation = await attestBrowserSession(session, binding)
      success = true
      return attestation
    } catch {
      blocked()
    } finally {
      credentials.email = ''
      credentials.password = ''
      if (!success && session) await discardSession(binding?.alias)
      busy = false
    }
  }

  async function execute(request) {
    const parsed = parseExecuteRequest(request, boundNamespace)
    if (busy || cleanupStarted || closed || !parsed) blocked()
    busy = true
    let session = null
    let success = false
    try {
      currentEnvironment()
      session = existingSession(parsed.binding)
      if (!session || session.cookieState !== 'native') blocked()
      await attestBrowserSession(session, session.binding)
      const operationResult = await runTrackedTask('operation-runner', deadlines.operation, async signal => {
        assertNotAborted(signal)
        const result = await sessionOperationRunner(Object.freeze({
          targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
          namespace: boundNamespace,
          alias: session.binding.alias,
          expectedUserId: session.binding.expectedUserId,
          operationId: parsed.operationId,
          payload: parsed.payload,
          page: session.page,
          signal,
        }))
        assertNotAborted(signal)
        return result
      }, { resource: session.context })
      if (!exactPassedResult(operationResult)
        || !validateExactPage(session.page)) {
        blocked()
      }
      await attestBrowserSession(session, session.binding)
      success = true
      return passedResult()
    } catch {
      blocked()
    } finally {
      if (!success && session) await discardSession(parsed?.binding.alias)
      busy = false
    }
  }

  async function snapshotCookies(request) {
    const binding = parseBindingRequest(request, boundNamespace)
    if (busy || cleanupStarted || closed || !binding) blocked()
    busy = true
    let session = null
    let success = false
    try {
      currentEnvironment()
      session = existingSession(binding)
      if (!session
        || session.cookieState !== 'native'
        || cookieSnapshots.has(binding.alias)) {
        blocked()
      }
      await attestBrowserSession(session, session.binding)
      const snapshot = await runTrackedTask('cookie-snapshot', deadlines.operation, async signal => {
        const cookies = await session.context.cookies([OFFICIAL_STAGING_SITE_ORIGIN])
        assertNotAborted(signal)
        return parseCookieSnapshot(cookies)
      }, { resource: session.context })
      if (!snapshot) blocked()
      cookieSnapshots.set(binding.alias, snapshot)
      success = true
      return passedResult()
    } catch {
      blocked()
    } finally {
      if (!success && session) await discardSession(binding?.alias)
      busy = false
    }
  }

  async function replaceCookies(request) {
    const aliases = parseAliasRequest(request, boundNamespace, ['alias', 'sourceAlias'])
    if (busy
      || cleanupStarted
      || closed
      || !aliases
      || aliases.alias === aliases.sourceAlias) {
      blocked()
    }
    busy = true
    let target = null
    let source = null
    let success = false
    try {
      currentEnvironment()
      target = sessions.get(aliases.alias)
      source = sessions.get(aliases.sourceAlias)
      const targetSnapshot = cookieSnapshots.get(aliases.alias)
      const sourceSnapshot = cookieSnapshots.get(aliases.sourceAlias)
      if (!target
        || !source
        || target.quarantined
        || source.quarantined
        || !targetSnapshot
        || !sourceSnapshot
        || target.cookieState !== 'native'
        || source.cookieState !== 'native') {
        blocked()
      }
      assertSinglePage(target)
      assertSinglePage(source)
      await attestBrowserSession(target, target.binding)
      await attestBrowserSession(source, source.binding)
      await runTrackedTask('cookie-replace', deadlines.operation, async signal => {
        await target.context.clearCookies()
        assertNotAborted(signal)
        await target.context.addCookies(copyCookieSnapshot(sourceSnapshot))
        assertNotAborted(signal)
      }, { resource: target.context })
      await reloadAndAttest(target, source.binding)
      target.cookieState = 'replaced'
      target.replacedFrom = source.binding.alias
      success = true
      return passedResult()
    } catch {
      blocked()
    } finally {
      if (!success) {
        if (target) await discardSession(target.binding.alias)
        if (source) await discardSession(source.binding.alias)
      }
      busy = false
    }
  }

  async function restoreCookies(request) {
    const binding = parseBindingRequest(request, boundNamespace)
    if (busy || cleanupStarted || closed || !binding) blocked()
    busy = true
    let session = null
    let success = false
    try {
      currentEnvironment()
      session = existingSession(binding)
      const snapshot = cookieSnapshots.get(binding.alias)
      if (!session
        || !snapshot
        || session.cookieState !== 'replaced'
        || !ACCOUNT_ROLES.has(session.replacedFrom)) {
        blocked()
      }
      await runTrackedTask('cookie-restore', deadlines.operation, async signal => {
        await session.context.clearCookies()
        assertNotAborted(signal)
        await session.context.addCookies(copyCookieSnapshot(snapshot))
        assertNotAborted(signal)
      }, { resource: session.context })
      await reloadAndAttest(session, session.binding)
      session.cookieState = 'native'
      session.replacedFrom = null
      success = true
      return passedResult()
    } catch {
      blocked()
    } finally {
      if (!success && session) await discardSession(binding?.alias)
      busy = false
    }
  }

  async function probeUserScopedRead(request) {
    const aliases = parseAliasRequest(
      request,
      boundNamespace,
      ['contextAlias', 'authenticatedAsAlias'],
    )
    if (busy || cleanupStarted || closed || !aliases || !userScopedReadProbe) blocked()
    busy = true
    let session = null
    let success = false
    try {
      currentEnvironment()
      session = sessions.get(aliases.contextAlias)
      const authenticatedAs = sessions.get(aliases.authenticatedAsAlias)
      if (!session || !authenticatedAs || session.quarantined || authenticatedAs.quarantined) blocked()
      const activeAlias = session.cookieState === 'native'
        ? session.binding.alias
        : session.replacedFrom
      if (activeAlias !== authenticatedAs.binding.alias) blocked()
      await attestBrowserSession(session, authenticatedAs.binding)
      const probeResult = await runTrackedTask('read-probe', deadlines.probe, async signal => {
        assertNotAborted(signal)
        const result = await userScopedReadProbe(Object.freeze({
          targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
          namespace: boundNamespace,
          contextAlias: session.binding.alias,
          authenticatedAsAlias: authenticatedAs.binding.alias,
          authenticatedUserId: authenticatedAs.binding.expectedUserId,
          page: session.page,
          signal,
        }))
        assertNotAborted(signal)
        return result
      }, { resource: session.context })
      if (!exactPassedResult(probeResult)
        || !validateExactPage(session.page)) {
        blocked()
      }
      await attestBrowserSession(session, authenticatedAs.binding)
      success = true
      return passedResult()
    } catch {
      blocked()
    } finally {
      if (!success && session) await discardSession(aliases?.contextAlias)
      busy = false
    }
  }

  async function closeAll() {
    if (busy || browserStarting) blocked()
    if (closed
      && sessions.size === 0
      && orphanedContexts.size === 0
      && lateBrowsers.size === 0
      && browser === null
      && pendingTasks.size === 0) {
      return passedResult()
    }
    cleanupStarted = true
    busy = true
    let environmentFailed = false
    let cleanupFailed = false
    try {
      try {
        currentEnvironment({ cleanup: true })
      } catch {
        environmentFailed = true
      }

      const closeKnownResources = async () => {
        for (const [alias, session] of [...sessions.entries()]) {
          session.quarantined = true
          const didClose = await tryCloseContext(session.context)
          if (didClose) {
            if (sessions.get(alias) === session) sessions.delete(alias)
            cookieSnapshots.delete(alias)
          } else {
            cleanupFailed = true
          }
        }
        for (const context of [...orphanedContexts]) {
          if (await tryCloseContext(context)) {
            orphanedContexts.delete(context)
          } else {
            cleanupFailed = true
          }
        }
        if (sessions.size === 0 && orphanedContexts.size === 0 && browser !== null) {
          const didClose = await tryCloseBrowser(browser)
          if (didClose) {
            browser = null
            browserQuarantined = false
          } else {
            browserQuarantined = true
            cleanupFailed = true
          }
        }
        for (const lateBrowser of [...lateBrowsers]) {
          if (await tryCloseBrowser(lateBrowser)) {
            lateBrowsers.delete(lateBrowser)
          } else {
            cleanupFailed = true
          }
        }
      }

      abortPendingTasks()
      await closeKnownResources()
      await waitForPendingQuiescence()
      await closeKnownResources()
      const quiescent = await waitForPendingQuiescence()

      if (!environmentFailed
        && !cleanupFailed
        && quiescent
        && pendingTasks.size === 0
        && sessions.size === 0
        && orphanedContexts.size === 0
        && lateBrowsers.size === 0
        && browser === null) {
        closed = true
        return passedResult()
      }
      closed = false
      blocked()
    } finally {
      busy = false
    }
  }

  const capability = {
    authenticate,
    execute,
    snapshotCookies,
    replaceCookies,
    restoreCookies,
    closeAll,
  }
  if (userScopedReadProbe) capability.probeUserScopedRead = probeUserScopedRead
  return Object.freeze(capability)
}
