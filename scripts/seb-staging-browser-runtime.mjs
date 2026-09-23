import { createServerClient as defaultCreateServerClient } from '@supabase/ssr'
import { chromium as defaultChromium } from 'playwright'

import { createSebStagingBrowserSessionBroker } from './seb-staging-browser-session.mjs'

const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const OFFICIAL_BROWSER_CHANNEL = 'chrome'
const QA_SCHEMA_VERSION = 1
const BLOCKED_MESSAGE = 'SEB Staging browser runtime blocked'
const SAFE_NAMESPACE = /^qa:seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const FORBIDDEN_NAMESPACE_TERMS = /(prod(?:uction)?|live|real|customer)/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SYNTHETIC_EMAIL = /^[a-z0-9][a-z0-9._-]{0,63}@qa\.staging\.korkru\.com$/
const SAFE_SECRET = /^[A-Za-z0-9._-]+$/
const MAX_SECRET_LENGTH = 4_096
const MAX_COOKIE_COUNT = 64
const MAX_COOKIE_NAME_LENGTH = 256
const MAX_COOKIE_VALUE_LENGTH = 16_384
const MAX_HEADER_COUNT = 128
const MAX_HEADER_VALUE_LENGTH = 8_192
const MIN_DEADLINE_MS = 25
const MAX_DEADLINE_MS = 120_000
const DEFAULT_BROKER_OPERATION_DEADLINE_MS = 30_000

const REQUIRED_ENVIRONMENT = Object.freeze({
  KORKRU_DEPLOYMENT_ENV: 'staging',
  EXAM_QA_ENVIRONMENT: 'staging',
  VERCEL_ENV: 'preview',
  NEXT_PUBLIC_SITE_URL: OFFICIAL_STAGING_SITE_ORIGIN,
  NEXT_PUBLIC_SUPABASE_URL: OFFICIAL_STAGING_SUPABASE_ORIGIN,
  EXAM_QA_DATA_POLICY: 'synthetic-only',
  EXAM_QA_COPY_PRODUCTION_DATA: 'false',
  EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
})
const RUNTIME_OPTION_FIELDS = Object.freeze(new Set([
  'namespace',
  'readEnvironment',
  'chromium',
  'createServerClient',
  'secretProvider',
  'sessionOperationRunner',
  'userScopedReadProbe',
  'runtimeDeadlinesMs',
  'brokerDeadlinesMs',
]))
const RUNTIME_DEADLINES = Object.freeze({
  secretProvider: 5_000,
  browserLaunch: 15_000,
  browserClose: 5_000,
  contextCreate: 10_000,
  authClient: 5_000,
  authGetUser: 10_000,
})
const RUNTIME_DEADLINE_FIELDS = Object.freeze(Object.keys(RUNTIME_DEADLINES))
const SECRET_REQUEST_FIELDS = Object.freeze([
  'schemaVersion',
  'targetOrigin',
  'supabaseOrigin',
  'namespace',
  'signal',
])
const SECRET_RESULT_FIELDS = Object.freeze([
  'schemaVersion',
  'targetOrigin',
  'supabaseOrigin',
  'namespace',
  'browserChannel',
  'vercelAutomationBypassSecret',
  'supabaseAnonKey',
])
const ATTESTATION_INPUT_FIELDS = Object.freeze(['namespace', 'cookies', 'signal'])
const BROKER_FACTORY_INPUT_FIELDS = Object.freeze([
  'targetOrigin',
  'namespace',
  'isolatedContexts',
  'signal',
])
const BROKER_CONTEXT_FIELDS = Object.freeze([
  'acceptDownloads',
  'baseURL',
  'serviceWorkers',
])
const COOKIE_FIELDS = Object.freeze(new Set([
  'name',
  'value',
  'domain',
  'path',
  'secure',
  'expires',
  'httpOnly',
  'sameSite',
  'partitionKey',
]))
const ACCOUNT_ROLES = Object.freeze(new Map([
  ['teacher-primary', 'teacher'],
  ['teacher-unrelated', 'teacher'],
  ['student-primary', 'student'],
  ['student-secondary', 'student'],
]))
const EXPECTED_QA_METADATA_FIELDS = Object.freeze([
  'qa_alias',
  'qa_fixture',
  'qa_namespace',
  'qa_role',
  'qa_schema_version',
])

export class SebStagingBrowserRuntimeBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingBrowserRuntimeBlockedError'
  }
}

function blocked() {
  throw new SebStagingBrowserRuntimeBlockedError()
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

function hasOnlyFields(value, fields) {
  return isDataRecord(value) && Object.keys(value).every(field => fields.has(field))
}

function isAbortSignal(value) {
  try {
    return value !== null
      && typeof value === 'object'
      && typeof value.aborted === 'boolean'
      && typeof value.addEventListener === 'function'
      && typeof value.removeEventListener === 'function'
  } catch {
    return false
  }
}

function parseRuntimeDeadlines(value) {
  if (value === undefined) return RUNTIME_DEADLINES
  if (!isDataRecord(value)) return null
  const fields = Object.keys(value)
  if (fields.some(field => !RUNTIME_DEADLINE_FIELDS.includes(field))) return null
  const parsed = { ...RUNTIME_DEADLINES }
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

function brokerOperationDeadline(value) {
  if (value === undefined) return DEFAULT_BROKER_OPERATION_DEADLINE_MS
  if (!isDataRecord(value)) return null
  if (value.operation === undefined) return DEFAULT_BROKER_OPERATION_DEADLINE_MS
  return Number.isInteger(value.operation)
    && value.operation >= 50
    && value.operation <= MAX_DEADLINE_MS
    ? value.operation
    : null
}

function parseEnvironment(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const snapshot = {}
  try {
    for (const [field, expected] of Object.entries(REQUIRED_ENVIRONMENT)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field)
      if (!descriptor
        || !Object.hasOwn(descriptor, 'value')
        || descriptor.value !== expected) {
        return null
      }
      snapshot[field] = expected
    }
  } catch {
    return null
  }
  return Object.freeze(snapshot)
}

function parseSecret(value, minimumLength) {
  return typeof value === 'string'
    && value.length >= minimumLength
    && value.length <= MAX_SECRET_LENGTH
    && SAFE_SECRET.test(value)
    ? value
    : null
}

function parseSecrets(value, namespace) {
  if (!hasExactFields(value, SECRET_RESULT_FIELDS)
    || value.schemaVersion !== QA_SCHEMA_VERSION
    || value.targetOrigin !== OFFICIAL_STAGING_SITE_ORIGIN
    || value.supabaseOrigin !== OFFICIAL_STAGING_SUPABASE_ORIGIN
    || value.namespace !== namespace
    || value.browserChannel !== OFFICIAL_BROWSER_CHANNEL) {
    return null
  }
  const bypassSecret = parseSecret(value.vercelAutomationBypassSecret, 20)
  const anonKey = parseSecret(value.supabaseAnonKey, 20)
  if (!bypassSecret || !anonKey || bypassSecret === anonKey) return null
  return Object.freeze({
    vercelAutomationBypassSecret: bypassSecret,
    supabaseAnonKey: anonKey,
  })
}

function sameSecrets(left, right) {
  return left?.vercelAutomationBypassSecret === right?.vercelAutomationBypassSecret
    && left?.supabaseAnonKey === right?.supabaseAnonKey
}

async function runCooperativeBoundary(
  deadlineMs,
  parentSignal,
  task,
  { acceptCompletedAfterAbort = false } = {},
) {
  if (parentSignal !== undefined && !isAbortSignal(parentSignal)) blocked()
  if (parentSignal?.aborted) blocked()
  const controller = new AbortController()
  let boundaryAborted = false
  const abortFromParent = () => {
    boundaryAborted = true
    controller.abort()
  }
  parentSignal?.addEventListener('abort', abortFromParent, { once: true })

  const timeoutHandle = setTimeout(() => {
    boundaryAborted = true
    controller.abort()
  }, deadlineMs)

  try {
    // Deliberately await the underlying operation even after abort. The outer
    // broker owns the user-visible deadline; keeping this promise pending makes
    // quiescence and late-resource cleanup observable to runtime closeAll().
    const value = await task(controller.signal)
    if (boundaryAborted && !acceptCompletedAfterAbort) blocked()
    return value
  } catch {
    if (!controller.signal.aborted) controller.abort()
    blocked()
  } finally {
    clearTimeout(timeoutHandle)
    parentSignal?.removeEventListener('abort', abortFromParent)
  }
}

function validNamespace(namespace) {
  return typeof namespace === 'string'
    && SAFE_NAMESPACE.test(namespace)
    && namespace !== 'qa:seb-s5-preview'
    && !FORBIDDEN_NAMESPACE_TERMS.test(namespace)
}

function validChromium(chromium) {
  try {
    return chromium !== null
      && typeof chromium === 'object'
      && typeof chromium.launch === 'function'
      && typeof chromium.name === 'function'
      && chromium.name() === 'chromium'
  } catch {
    return false
  }
}

function validRawBrowser(browser, chromium) {
  try {
    return browser !== null
      && typeof browser === 'object'
      && typeof browser.browserType === 'function'
      && browser.browserType() === chromium
      && typeof browser.newContext === 'function'
      && typeof browser.close === 'function'
      && typeof browser.isConnected === 'function'
      && browser.isConnected() === true
      && typeof browser.version === 'function'
      && typeof browser.version() === 'string'
      && browser.version().length > 0
      && browser.version().length <= 200
  } catch {
    return false
  }
}

function validRawContext(context) {
  try {
    return context !== null
      && typeof context === 'object'
      && typeof context.newPage === 'function'
      && typeof context.pages === 'function'
      && typeof context.cookies === 'function'
      && typeof context.clearCookies === 'function'
      && typeof context.addCookies === 'function'
      && typeof context.route === 'function'
      && typeof context.close === 'function'
  } catch {
    return false
  }
}

function parseRequestUrl(value) {
  try {
    const url = new URL(value)
    return !url.username && !url.password && (url.protocol === 'https:' || url.protocol === 'http:')
      ? url
      : null
  } catch {
    return null
  }
}

function sanitizedRequestHeaders(value) {
  if (!isDataRecord(value) || Object.keys(value).length > MAX_HEADER_COUNT) return null
  const headers = {}
  for (const [name, headerValue] of Object.entries(value)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)
      || typeof headerValue !== 'string'
      || headerValue.length > MAX_HEADER_VALUE_LENGTH) {
      return null
    }
    if (name.toLowerCase() !== 'x-vercel-protection-bypass') headers[name] = headerValue
  }
  return headers
}

async function installOriginBoundBypassRoute(context, bypassSecret) {
  await context.route('**/*', async route => {
    try {
      const request = route.request()
      const url = parseRequestUrl(request.url())
      const requestHeaders = typeof request.allHeaders === 'function'
        ? await request.allHeaders()
        : request.headers()
      const headers = sanitizedRequestHeaders(requestHeaders)
      if (!url || !headers) {
        if (typeof route.abort === 'function') await route.abort('blockedbyclient')
        return
      }
      if (url.origin === OFFICIAL_STAGING_SITE_ORIGIN) {
        if (typeof route.fetch !== 'function' || typeof route.fulfill !== 'function') {
          if (typeof route.abort === 'function') await route.abort('blockedbyclient')
          return
        }
        headers['x-vercel-protection-bypass'] = bypassSecret
        // A header override passed to route.continue() survives redirect hops in
        // Playwright. Fetch exactly one Staging hop instead, then fulfill the
        // browser request with that response. A 30x is consequently handled as
        // a fresh browser request, where this route re-evaluates its origin.
        const response = await route.fetch({ headers, maxRedirects: 0 })
        if (response === null
          || typeof response !== 'object'
          || typeof response.dispose !== 'function') {
          if (typeof route.abort === 'function') await route.abort('blockedbyclient')
          return
        }
        try {
          await route.fulfill({ response })
        } finally {
          // Playwright retains APIResponse bodies until explicitly disposed or
          // the context closes. Await disposal even when fulfill fails so an
          // exact-origin response cannot accumulate as hidden runtime state.
          await response.dispose()
        }
        return
      }
      if (typeof route.continue !== 'function') {
        if (typeof route.abort === 'function') await route.abort('blockedbyclient')
        return
      }
      await route.continue({ headers })
    } catch {
      try {
        if (typeof route.abort === 'function') await route.abort('blockedbyclient')
      } catch {
        // Browser routing failure is surfaced by navigation and the broker's
        // post-operation attestation; never expose request or secret details.
      }
    }
  })
}

function parseBrokerContextOptions(value) {
  if (!hasExactFields(value, BROKER_CONTEXT_FIELDS)
    || value.acceptDownloads !== false
    || value.baseURL !== OFFICIAL_STAGING_SITE_ORIGIN
    || value.serviceWorkers !== 'block') {
    return null
  }
  return Object.freeze({
    acceptDownloads: false,
    baseURL: OFFICIAL_STAGING_SITE_ORIGIN,
    serviceWorkers: 'block',
  })
}

function parseCookiePairs(cookies) {
  if (!Array.isArray(cookies) || cookies.length < 1 || cookies.length > MAX_COOKIE_COUNT) return null
  const names = new Set()
  const pairs = []
  for (const cookie of cookies) {
    if (!isDataRecord(cookie)
      || Object.keys(cookie).some(field => !COOKIE_FIELDS.has(field))
      || typeof cookie.name !== 'string'
      || cookie.name.length < 1
      || cookie.name.length > MAX_COOKIE_NAME_LENGTH
      || typeof cookie.value !== 'string'
      || cookie.value.length < 1
      || cookie.value.length > MAX_COOKIE_VALUE_LENGTH
      || names.has(cookie.name)
      || (cookie.domain !== 'staging.korkru.com' && cookie.domain !== '.staging.korkru.com')
      || typeof cookie.path !== 'string'
      || !cookie.path.startsWith('/')
      || cookie.secure !== true) {
      return null
    }
    names.add(cookie.name)
    pairs.push(Object.freeze({ name: cookie.name, value: cookie.value }))
  }
  return Object.freeze(pairs)
}

function parseSupabaseAuthUrl(input) {
  try {
    const raw = typeof input === 'string' || input instanceof URL ? input : input?.url
    const url = new URL(raw)
    if (url.username || url.password || url.origin !== OFFICIAL_STAGING_SUPABASE_ORIGIN) return null
    if (url.pathname === '/auth/v1/user' && url.search === '' && url.hash === '') return url
    if (url.pathname !== '/auth/v1/token' || url.hash !== '') return null
    const parameters = [...url.searchParams.entries()]
    return parameters.length === 1
      && parameters[0][0] === 'grant_type'
      && parameters[0][1] === 'refresh_token'
      ? url
      : null
  } catch {
    return null
  }
}

function exactUrl(value, expected) {
  try {
    const url = value instanceof URL ? value : new URL(value)
    return url.href === expected
  } catch {
    return false
  }
}

function validSupabaseClient(client, secrets, expectedAuth, expectedGetUser) {
  try {
    const auth = expectedAuth ?? client?.auth
    const getUser = expectedGetUser ?? auth?.getUser
    return client !== null
      && typeof client === 'object'
      && client.supabaseUrl === OFFICIAL_STAGING_SUPABASE_ORIGIN
      && client.supabaseKey === secrets.supabaseAnonKey
      && exactUrl(client.authUrl, `${OFFICIAL_STAGING_SUPABASE_ORIGIN}/auth/v1`)
      && client.auth === auth
      && auth !== null
      && typeof auth === 'object'
      && auth.getUser === getUser
      && typeof getUser === 'function'
  } catch {
    return false
  }
}

function sanitizeVerifiedUser(result, namespace) {
  if (!hasExactFields(result, ['data', 'error'])
    || result.error !== null
    || !hasExactFields(result.data, ['user'])) {
    return null
  }
  const user = result.data.user
  if (user === null
    || typeof user !== 'object'
    || typeof user.id !== 'string'
    || !UUID.test(user.id)
    || typeof user.email !== 'string'
    || !SYNTHETIC_EMAIL.test(user.email)
    || !isDataRecord(user.app_metadata)) {
    return null
  }
  const metadata = user.app_metadata
  const qaFields = Object.keys(metadata).filter(field => field.startsWith('qa_')).sort()
  if (qaFields.length !== EXPECTED_QA_METADATA_FIELDS.length
    || !qaFields.every((field, index) => field === EXPECTED_QA_METADATA_FIELDS[index])
    || !ACCOUNT_ROLES.has(metadata.qa_alias)
    || ACCOUNT_ROLES.get(metadata.qa_alias) !== metadata.role
    || metadata.qa_fixture !== 'seb-s5'
    || metadata.qa_namespace !== namespace
    || metadata.qa_role !== metadata.role
    || metadata.qa_schema_version !== QA_SCHEMA_VERSION) {
    return null
  }
  return Object.freeze({
    targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
    authenticatedUserId: user.id,
    authenticatedEmail: user.email,
    appMetadata: Object.freeze({
      role: metadata.role,
      qa_fixture: 'seb-s5',
      qa_namespace: namespace,
      qa_role: metadata.role,
      qa_alias: metadata.qa_alias,
      qa_schema_version: QA_SCHEMA_VERSION,
    }),
  })
}

function defaultSecretProvider(request) {
  if (!hasExactFields(request, SECRET_REQUEST_FIELDS) || request.signal.aborted) blocked()
  return {
    schemaVersion: QA_SCHEMA_VERSION,
    targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
    supabaseOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
    namespace: request.namespace,
    browserChannel: OFFICIAL_BROWSER_CHANNEL,
    vercelAutomationBypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }
}

/**
 * Compose the S5 browser broker with the only production-shaped runtime it may
 * use: installed Chrome, a context-private Vercel bypass header, and a
 * cookie-backed Supabase SSR `auth.getUser()` attestor. The returned value is
 * the frozen broker capability; browser, Page, cookies and credentials never
 * become runtime API fields.
 */
export function createSebStagingBrowserRuntime(options = {}) {
  if (!hasOnlyFields(options, RUNTIME_OPTION_FIELDS)) blocked()
  const {
    namespace,
    readEnvironment = () => process.env,
    chromium = defaultChromium,
    createServerClient = defaultCreateServerClient,
    secretProvider = defaultSecretProvider,
    sessionOperationRunner,
    userScopedReadProbe,
    runtimeDeadlinesMs,
    brokerDeadlinesMs,
  } = options
  const deadlines = parseRuntimeDeadlines(runtimeDeadlinesMs)
  const operationDeadline = brokerOperationDeadline(brokerDeadlinesMs)
  if (!validNamespace(namespace)
    || typeof readEnvironment !== 'function'
    || !validChromium(chromium)
    || typeof createServerClient !== 'function'
    || typeof secretProvider !== 'function'
    || typeof sessionOperationRunner !== 'function'
    || (userScopedReadProbe !== undefined && typeof userScopedReadProbe !== 'function')
    || !deadlines
    || operationDeadline === null
    || deadlines.contextCreate >= operationDeadline) {
    blocked()
  }

  let pinnedSecrets = null
  let runtimeCleanupStarted = false
  let runtimeCloseBusy = false
  let runtimeClosed = false
  const inFlightRuntimeWork = new Set()
  const activeBrokerCalls = new Set()
  const pendingRawBrowsers = new Set()
  const pendingRawContexts = new Set()

  function track(set, task) {
    const promise = Promise.resolve().then(task)
    set.add(promise)
    promise.then(
      () => set.delete(promise),
      () => set.delete(promise),
    )
    return promise
  }

  async function waitForQuiescence(set) {
    while (set.size > 0) await Promise.allSettled([...set])
  }

  function readBoundEnvironment() {
    let parsed = null
    try {
      parsed = parseEnvironment(readEnvironment())
    } catch {
      blocked()
    }
    if (!parsed) blocked()
    return parsed
  }

  async function readSecrets(parentSignal) {
    readBoundEnvironment()
    const request = Object.freeze({
      schemaVersion: QA_SCHEMA_VERSION,
      targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
      supabaseOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
      namespace,
      signal: parentSignal,
    })
    const candidate = await runCooperativeBoundary(
      deadlines.secretProvider,
      parentSignal,
      signal => secretProvider(Object.freeze({ ...request, signal })),
    )
    const parsed = parseSecrets(candidate, namespace)
    readBoundEnvironment()
    if (!parsed || (pinnedSecrets && !sameSecrets(parsed, pinnedSecrets))) blocked()
    if (!pinnedSecrets) pinnedSecrets = parsed
    return parsed
  }

  async function closeRawBrowser(browser, parentSignal) {
    if (browser === null || typeof browser !== 'object' || typeof browser.close !== 'function') return false
    try {
      await runCooperativeBoundary(deadlines.browserClose, parentSignal, async () => {
        await browser.close()
        return true
      }, { acceptCompletedAfterAbort: true })
      return typeof browser.isConnected !== 'function' || browser.isConnected() === false
    } catch {
      return false
    }
  }

  async function closeRawContext(context, parentSignal) {
    if (context === null || typeof context !== 'object' || typeof context.close !== 'function') return false
    try {
      await runCooperativeBoundary(deadlines.browserClose, parentSignal, async () => {
        await context.close()
        return true
      }, { acceptCompletedAfterAbort: true })
      return true
    } catch {
      return false
    }
  }

  async function retainAndCloseRawBrowser(browser) {
    pendingRawBrowsers.add(browser)
    if (await closeRawBrowser(browser)) {
      pendingRawBrowsers.delete(browser)
      return true
    }
    return false
  }

  async function retainAndCloseRawContext(context) {
    pendingRawContexts.add(context)
    if (await closeRawContext(context)) {
      pendingRawContexts.delete(context)
      return true
    }
    return false
  }

  async function drainPendingResources() {
    let success = true
    for (const context of [...pendingRawContexts]) {
      if (await closeRawContext(context)) pendingRawContexts.delete(context)
      else success = false
    }
    for (const browser of [...pendingRawBrowsers]) {
      if (await closeRawBrowser(browser)) pendingRawBrowsers.delete(browser)
      else success = false
    }
    return success
      && pendingRawContexts.size === 0
      && pendingRawBrowsers.size === 0
  }

  function makeBrowserFacade(rawBrowser) {
    let closed = false

    async function createContext(optionsForContext) {
      const parsedOptions = parseBrokerContextOptions(optionsForContext)
      if (closed || !parsedOptions || !validRawBrowser(rawBrowser, chromium)) blocked()
      let candidate = null
      try {
        candidate = await runCooperativeBoundary(
          deadlines.contextCreate,
          undefined,
          async signal => {
            readBoundEnvironment()
            const before = await readSecrets(signal)
            const created = await rawBrowser.newContext(parsedOptions)
            candidate = created
            if (!validRawContext(created)) blocked()
            await installOriginBoundBypassRoute(
              created,
              before.vercelAutomationBypassSecret,
            )
            const after = await readSecrets(signal)
            if (!sameSecrets(before, after) || !validRawBrowser(rawBrowser, chromium)) blocked()
            readBoundEnvironment()
            return created
          },
        )
        if (!validRawContext(candidate)) blocked()
        return candidate
      } catch {
        if (candidate) await retainAndCloseRawContext(candidate)
        blocked()
      }
    }

    function newContext(optionsForContext) {
      return track(inFlightRuntimeWork, () => createContext(optionsForContext))
    }

    async function closeBrowserFacade() {
      if (closed) return
      const didClose = await closeRawBrowser(rawBrowser)
      if (!didClose) blocked()
      closed = true
    }

    function close() {
      return track(inFlightRuntimeWork, closeBrowserFacade)
    }

    function isConnected() {
      return !closed && validRawBrowser(rawBrowser, chromium)
    }

    return Object.freeze({ newContext, close, isConnected })
  }

  async function createBrowser(request) {
    if (!hasExactFields(request, BROKER_FACTORY_INPUT_FIELDS)
      || request.targetOrigin !== OFFICIAL_STAGING_SITE_ORIGIN
      || request.namespace !== namespace
      || request.isolatedContexts !== true
      || !isAbortSignal(request.signal)
      || request.signal.aborted) {
      blocked()
    }
    readBoundEnvironment()
    const before = await readSecrets(request.signal)
    let rawBrowser = null
    try {
      const launchOptions = Object.freeze({
        channel: OFFICIAL_BROWSER_CHANNEL,
        headless: true,
      })
      rawBrowser = await runCooperativeBoundary(
        deadlines.browserLaunch,
        request.signal,
        async () => {
          const created = await chromium.launch(launchOptions)
          rawBrowser = created
          return created
        },
      )
      if (!validRawBrowser(rawBrowser, chromium)) blocked()
      const after = await readSecrets(request.signal)
      if (!sameSecrets(before, after)
        || !validChromium(chromium)
        || !validRawBrowser(rawBrowser, chromium)) {
        blocked()
      }
      readBoundEnvironment()
      return Object.freeze({
        targetOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
        namespace,
        browser: makeBrowserFacade(rawBrowser),
      })
    } catch {
      if (rawBrowser) await retainAndCloseRawBrowser(rawBrowser)
      blocked()
    }
  }

  function browserFactory(request) {
    return track(inFlightRuntimeWork, () => createBrowser(request))
  }

  async function attestBrowserSession(input) {
    if (!hasExactFields(input, ATTESTATION_INPUT_FIELDS)
      || input.namespace !== namespace
      || !isAbortSignal(input.signal)
      || input.signal.aborted) {
      blocked()
    }
    const cookiePairs = parseCookiePairs(input.cookies)
    if (!cookiePairs) blocked()
    readBoundEnvironment()
    const before = await readSecrets(input.signal)
    let setCookieAttempted = false
    let targetDriftAttempted = false
    let activeAuthSignal = input.signal

    const cookieAdapter = Object.freeze({
      getAll() {
        if (activeAuthSignal.aborted) blocked()
        return cookiePairs.map(cookie => ({ ...cookie }))
      },
      setAll() {
        setCookieAttempted = true
        blocked()
      },
    })
    const boundFetch = async (request, init = {}) => {
      const url = parseSupabaseAuthUrl(request)
      if (!url || activeAuthSignal.aborted) {
        targetDriftAttempted = true
        blocked()
      }
      const method = String(init?.method ?? request?.method ?? 'GET').toUpperCase()
      if ((url.pathname === '/auth/v1/user' && method !== 'GET')
        || (url.pathname === '/auth/v1/token' && method !== 'POST')
        || typeof globalThis.fetch !== 'function') {
        targetDriftAttempted = true
        blocked()
      }
      let response
      try {
        response = await globalThis.fetch(request, {
          ...init,
          redirect: 'error',
          signal: activeAuthSignal,
        })
      } catch {
        blocked()
      }
      try {
        if (response?.redirected === true
          || typeof response?.url !== 'string'
          || parseSupabaseAuthUrl(response.url) === null) {
          targetDriftAttempted = true
          blocked()
        }
      } catch {
        targetDriftAttempted = true
        blocked()
      }
      return response
    }
    const clientOptions = Object.freeze({
      cookies: cookieAdapter,
      global: Object.freeze({ fetch: boundFetch }),
    })

    let client = null
    try {
      client = await runCooperativeBoundary(
        deadlines.authClient,
        input.signal,
        async signal => {
          activeAuthSignal = signal
          const created = await createServerClient(
            OFFICIAL_STAGING_SUPABASE_ORIGIN,
            before.supabaseAnonKey,
            clientOptions,
          )
          client = created
          return created
        },
      )
      if (!validSupabaseClient(client, before)) blocked()
      const auth = client.auth
      const getUser = auth.getUser
      const afterClient = await readSecrets(input.signal)
      if (!sameSecrets(before, afterClient)
        || !validSupabaseClient(client, before, auth, getUser)) {
        blocked()
      }

      const verified = await runCooperativeBoundary(
        deadlines.authGetUser,
        input.signal,
        signal => {
          activeAuthSignal = signal
          return getUser.call(auth)
        },
      )
      await Promise.resolve()
      if (setCookieAttempted
        || targetDriftAttempted
        || !validSupabaseClient(client, before, auth, getUser)) {
        blocked()
      }
      const after = await readSecrets(input.signal)
      if (!sameSecrets(before, after)) blocked()
      readBoundEnvironment()
      const attestation = sanitizeVerifiedUser(verified, namespace)
      if (!attestation) blocked()
      return attestation
    } catch {
      blocked()
    }
  }

  function attestSession(input) {
    return track(inFlightRuntimeWork, () => attestBrowserSession(input))
  }

  let broker
  try {
    readBoundEnvironment()
    broker = createSebStagingBrowserSessionBroker({
      namespace,
      readEnvironment: readBoundEnvironment,
      browserFactory,
      attestSession,
      sessionOperationRunner,
      userScopedReadProbe,
      deadlinesMs: brokerDeadlinesMs,
    })
  } catch {
    blocked()
  }

  function callBroker(method, args) {
    if (runtimeCleanupStarted || runtimeClosed) {
      return Promise.reject(new SebStagingBrowserRuntimeBlockedError())
    }
    return track(activeBrokerCalls, () => broker[method](...args))
  }

  async function closeAll() {
    if (runtimeCloseBusy) blocked()
    if (runtimeClosed) return Object.freeze({ status: 'passed' })
    runtimeCleanupStarted = true
    runtimeCloseBusy = true
    let brokerResult = null
    let brokerClosed = false
    try {
      await waitForQuiescence(activeBrokerCalls)
      await waitForQuiescence(inFlightRuntimeWork)
      try {
        brokerResult = await broker.closeAll()
        brokerClosed = hasExactFields(brokerResult, ['status'])
          && brokerResult.status === 'passed'
      } catch {
        brokerClosed = false
      }
      await waitForQuiescence(inFlightRuntimeWork)
      const pendingClosed = await drainPendingResources()
      if (!brokerClosed || !pendingClosed) blocked()
      runtimeClosed = true
      return brokerResult
    } finally {
      runtimeCloseBusy = false
    }
  }

  const capability = {
    authenticate: (...args) => callBroker('authenticate', args),
    execute: (...args) => callBroker('execute', args),
    snapshotCookies: (...args) => callBroker('snapshotCookies', args),
    replaceCookies: (...args) => callBroker('replaceCookies', args),
    restoreCookies: (...args) => callBroker('restoreCookies', args),
    closeAll,
  }
  if (typeof broker.probeUserScopedRead === 'function') {
    capability.probeUserScopedRead = (...args) => callBroker('probeUserScopedRead', args)
  }
  return Object.freeze(capability)
}
