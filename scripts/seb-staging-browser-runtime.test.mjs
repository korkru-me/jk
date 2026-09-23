import { describe, expect, it, vi } from 'vitest'

import {
  SebStagingBrowserRuntimeBlockedError,
  createSebStagingBrowserRuntime,
} from './seb-staging-browser-runtime.mjs'

const SITE_ORIGIN = 'https://staging.korkru.com'
const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const NAMESPACE = 'qa:seb-s5-runtime-1'
const OTHER_NAMESPACE = 'qa:seb-s5-runtime-2'
const BYPASS_SECRET = 'bypass-SENTINEL-never-expose-1234567890'
const OTHER_BYPASS_SECRET = 'bypass-SENTINEL-rotated-never-expose-1234'
const ANON_KEY = 'anon.SENTINEL.never.expose.1234567890'
const OTHER_ANON_KEY = 'anon.SENTINEL.rotated.never.expose.1234'
const PASSWORD = 'Login-SENTINEL-never-expose-1234567890!'
const COOKIE_VALUE = 'cookie-SENTINEL-never-expose-1234567890'
const SECRET_SENTINELS = Object.freeze([
  BYPASS_SECRET,
  OTHER_BYPASS_SECRET,
  ANON_KEY,
  OTHER_ANON_KEY,
  PASSWORD,
  COOKIE_VALUE,
])
const FAST_RUNTIME_DEADLINES = Object.freeze({
  secretProvider: 50,
  browserLaunch: 50,
  browserClose: 50,
  contextCreate: 50,
  authClient: 50,
  authGetUser: 50,
})
const FAST_BROKER_DEADLINES = Object.freeze({
  browserFactory: 150,
  attestation: 150,
  operation: 150,
  probe: 150,
  close: 150,
  action: 150,
  navigation: 150,
})

function uuid(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

function validEnvironment(overrides = {}) {
  return {
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: SITE_ORIGIN,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_ORIGIN,
    EXAM_QA_DATA_POLICY: 'synthetic-only',
    EXAM_QA_COPY_PRODUCTION_DATA: 'false',
    EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
    ...overrides,
  }
}

function account(overrides = {}) {
  return {
    id: uuid(1),
    alias: 'teacher-primary',
    role: 'teacher',
    email: 'runtime-teacher@qa.staging.korkru.com',
    password: PASSWORD,
    namespace: NAMESPACE,
    ...overrides,
  }
}

function authenticationRequest(value, overrides = {}) {
  return {
    targetOrigin: SITE_ORIGIN,
    namespace: value.namespace,
    alias: value.alias,
    role: value.role,
    expectedUserId: value.id,
    credentials: {
      email: value.email,
      password: value.password,
    },
    ...overrides,
  }
}

function executeRequest(value) {
  return {
    targetOrigin: SITE_ORIGIN,
    namespace: value.namespace,
    alias: value.alias,
    role: value.role,
    expectedUserId: value.id,
    operationId: 'create-subject-classroom',
    payload: {},
  }
}

function assertNoSecret(value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  for (const sentinel of SECRET_SENTINELS) expect(serialized).not.toContain(sentinel)
}

class FakeResponse {
  constructor(url) {
    this.value = url
  }

  ok() {
    return true
  }

  url() {
    return this.value
  }
}

class FakeLocator {
  constructor(page, selector, { marker = false } = {}) {
    this.page = page
    this.selector = selector
    this.marker = marker
  }

  async count() {
    return 1
  }

  async isVisible() {
    return true
  }

  async getAttribute(name) {
    if (this.selector === 'html[data-deployment-environment="staging"]'
      && name === 'data-deployment-environment') return 'staging'
    if (name !== 'type') return null
    if (this.selector === '#email') return 'email'
    if (this.selector === '#password') return 'password'
    if (this.selector === 'button[type="submit"]') return 'submit'
    return null
  }

  async textContent() {
    return this.marker ? 'STAGING · ระบบทดสอบ' : ''
  }

  async fill(value) {
    if (this.selector === '#email') this.page.email = value
    if (this.selector === '#password') this.page.password = value
  }

  async click() {
    if (this.selector !== 'button[type="submit"]') return
    this.page.contextValue.login(this.page.email, this.page.password)
    this.page.currentUrl = `${SITE_ORIGIN}/dashboard`
  }
}

class FakePage {
  constructor(context) {
    this.contextValue = context
    this.currentUrl = 'about:blank'
    this.email = ''
    this.password = ''
    this.closed = false
  }

  async goto(url) {
    this.currentUrl = url
    return new FakeResponse(url)
  }

  async reload() {
    return new FakeResponse(this.currentUrl)
  }

  url() {
    return this.currentUrl
  }

  locator(selector) {
    return new FakeLocator(this, selector)
  }

  getByRole() {
    return new FakeLocator(this, 'status', { marker: true })
  }

  async waitForURL(url) {
    if (this.currentUrl !== url) throw new Error('unexpected URL')
  }

  async evaluate() {}

  isClosed() {
    return this.closed
  }

  setDefaultTimeout() {}

  setDefaultNavigationTimeout() {}
}

class FakeContext {
  constructor(options, value, behavior = {}) {
    this.options = options
    this.value = value
    this.cookieList = []
    this.pageList = []
    this.closed = false
    this.closeCalls = 0
    this.closeFailuresRemaining = behavior.contextCloseFailures ?? 0
    this.routes = []
    this.webSocketRoutes = []
  }

  pages() {
    return this.pageList
  }

  async newPage() {
    const page = new FakePage(this)
    this.pageList.push(page)
    return page
  }

  async cookies() {
    return this.cookieList.map(cookie => ({ ...cookie }))
  }

  async clearCookies() {
    this.cookieList = []
  }

  async addCookies(cookies) {
    this.cookieList = cookies.map(cookie => ({ ...cookie }))
  }

  async route(pattern, handler) {
    this.routes.push({ pattern, handler })
  }

  async routeWebSocket(pattern, handler) {
    this.webSocketRoutes.push({ pattern, handler })
  }

  login(email, password) {
    if (email !== this.value.email || password !== this.value.password) {
      throw new Error('invalid login')
    }
    this.cookieList = [{
      name: 'sb-auth-token',
      value: COOKIE_VALUE,
      domain: 'staging.korkru.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    }]
  }

  async close() {
    this.closeCalls += 1
    if (this.closeFailuresRemaining > 0) {
      this.closeFailuresRemaining -= 1
      throw new Error('context close failed')
    }
    this.closed = true
    for (const page of this.pageList) page.closed = true
  }
}

class FakeBrowser {
  constructor(browserType, value, behavior = {}) {
    this.ownerType = behavior.returnedBrowserType ?? browserType
    this.value = value
    this.contexts = []
    this.newContextCalls = []
    this.connected = true
    this.closeCalls = 0
    this.behavior = behavior
    this.closeFailuresRemaining = this.behavior.browserCloseFailures ?? 0
  }

  browserType() {
    return this.ownerType
  }

  version() {
    return '140.0.0.0'
  }

  isConnected() {
    return this.connected
  }

  async newContext(options) {
    this.newContextCalls.push(options)
    if (this.behavior.contextGate) await this.behavior.contextGate.promise
    if (this.behavior.contextDelayMs) {
      await new Promise(resolve => setTimeout(resolve, this.behavior.contextDelayMs))
    }
    const context = new FakeContext(options, this.value, this.behavior)
    this.contexts.push(context)
    return context
  }

  async close() {
    this.closeCalls += 1
    if (this.closeFailuresRemaining > 0) {
      this.closeFailuresRemaining -= 1
      throw new Error('browser close failed')
    }
    this.connected = false
  }
}

class FakeChromium {
  constructor(value, options = {}) {
    this.value = value
    this.options = options
    this.launchCalls = []
    this.apiRequestContextCalls = []
    this.request = {
      newContext: async requestOptions => {
        this.apiRequestContextCalls.push(requestOptions)
        return {}
      },
    }
    this.otherType = { name: () => 'firefox' }
    this.browser = new FakeBrowser(this, value, {
      ...options,
      returnedBrowserType: options.channelMismatch ? this.otherType : this,
    })
  }

  name() {
    return 'chromium'
  }

  async launch(options) {
    this.launchCalls.push(options)
    if (this.options.launchGate) await this.options.launchGate.promise
    if (this.options.launchDelayMs) {
      await new Promise(resolve => setTimeout(resolve, this.options.launchDelayMs))
    }
    return this.browser
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function validSecretResult(namespace = NAMESPACE, overrides = {}) {
  return {
    schemaVersion: 1,
    targetOrigin: SITE_ORIGIN,
    supabaseOrigin: SUPABASE_ORIGIN,
    namespace,
    browserChannel: 'chrome',
    vercelAutomationBypassSecret: BYPASS_SECRET,
    supabaseAnonKey: ANON_KEY,
    ...overrides,
  }
}

function createHarness({
  value = account(),
  environment,
  chromiumOptions,
  secretProviderOverride,
  createServerClientGate,
  getUserGate,
  clientMode = 'normal',
  clientResultOverride,
  sessionOperationRunner,
  userScopedReadProbe,
  runtimeDeadlinesMs = FAST_RUNTIME_DEADLINES,
  brokerDeadlinesMs = FAST_BROKER_DEADLINES,
} = {}) {
  const state = { environment: environment ?? validEnvironment() }
  const readEnvironment = vi.fn(() => state.environment)
  const chromium = new FakeChromium(value, chromiumOptions)
  let providerCall = 0
  const secretProvider = vi.fn(async request => {
    providerCall += 1
    return secretProviderOverride
      ? secretProviderOverride({ request, callIndex: providerCall, state })
      : validSecretResult(value.namespace)
  })
  const clients = []
  const createServerClient = vi.fn((origin, key, options) => {
    const auth = {}
    const client = {
      supabaseUrl: clientMode === 'wrong-origin' ? 'https://example.supabase.co' : origin,
      supabaseKey: key,
      authUrl: new URL(`${origin}/auth/v1`),
      auth,
    }
    auth.getUser = vi.fn(async () => {
      if (getUserGate) await getUserGate.promise
      if (clientMode === 'set-cookie') {
        options.cookies.setAll([{ name: 'should-not-write', value: 'blocked', options: {} }], {})
      }
      if (clientMode === 'client-drift') client.supabaseUrl = 'https://example.supabase.co'
      if (clientMode === 'external-fetch') {
        await options.global.fetch('https://example.com/auth/v1/user')
      }
      if (clientMode === 'throw-secret') throw new Error(BYPASS_SECRET)
      const cookies = await options.cookies.getAll()
      expect(cookies).toEqual([{ name: 'sb-auth-token', value: COOKIE_VALUE }])
      if (clientMode === 'delayed') {
        await new Promise(resolve => setTimeout(resolve, 80))
      }
      if (clientResultOverride) return clientResultOverride({ value, client })
      return {
        data: {
          user: {
            id: value.id,
            email: value.email,
            app_metadata: {
              role: value.role,
              qa_fixture: 'seb-s5',
              qa_namespace: value.namespace,
              qa_role: value.role,
              qa_alias: value.alias,
              qa_schema_version: 1,
              provider: 'email',
              providers: ['email'],
            },
          },
        },
        error: null,
      }
    })
    clients.push({ client, origin, key, options })
    return createServerClientGate
      ? createServerClientGate.promise.then(() => client)
      : client
  })
  const runner = vi.fn(sessionOperationRunner ?? (async () => ({ status: 'passed' })))
  const probe = userScopedReadProbe ? vi.fn(userScopedReadProbe) : undefined
  const broker = createSebStagingBrowserRuntime({
    namespace: value.namespace,
    readEnvironment,
    chromium,
    createServerClient,
    secretProvider,
    sessionOperationRunner: runner,
    userScopedReadProbe: probe,
    runtimeDeadlinesMs,
    brokerDeadlinesMs,
  })
  return {
    value,
    state,
    readEnvironment,
    chromium,
    secretProvider,
    createServerClient,
    clients,
    runner,
    probe,
    broker,
  }
}

async function authenticate(harness) {
  return harness.broker.authenticate(authenticationRequest(harness.value))
}

async function expectPending(promise, waitMs = 70) {
  let settled = false
  promise.then(
    () => { settled = true },
    () => { settled = true },
  )
  await new Promise(resolve => setTimeout(resolve, waitMs))
  expect(settled).toBe(false)
}

describe('SEB Staging browser runtime', () => {
  it('composes installed Chrome, an injected bypass header, and verified Supabase SSR auth', async () => {
    const harness = createHarness()

    const result = await authenticate(harness)
    expect(result).toEqual({
      targetOrigin: SITE_ORIGIN,
      authenticatedUserId: harness.value.id,
      appMetadata: {
        role: 'teacher',
        qa_fixture: 'seb-s5',
        qa_namespace: NAMESPACE,
        qa_role: 'teacher',
        qa_alias: 'teacher-primary',
        qa_schema_version: 1,
      },
    })
    expect(Object.isFrozen(harness.broker)).toBe(true)
    expect(Object.keys(harness.broker).sort()).toEqual([
      'authenticate',
      'closeAll',
      'execute',
      'replaceCookies',
      'restoreCookies',
      'snapshotCookies',
    ])
    expect(harness.chromium.launchCalls).toHaveLength(1)
    expect(harness.chromium.launchCalls[0]).toEqual({ channel: 'chrome', headless: true })
    expect(Object.isFrozen(harness.chromium.launchCalls[0])).toBe(true)
    expect(harness.chromium.browser.contexts).toHaveLength(1)
    expect(harness.chromium.browser.contexts[0].options).toEqual({
      acceptDownloads: false,
      baseURL: SITE_ORIGIN,
      serviceWorkers: 'block',
    })
    expect(Object.keys(harness.chromium.browser.contexts[0].options).sort()).toEqual([
      'acceptDownloads',
      'baseURL',
      'serviceWorkers',
    ])
    assertNoSecret(harness.chromium.browser.contexts[0].options)
    expect(harness.chromium.browser.contexts[0].webSocketRoutes).toHaveLength(0)
    expect(harness.chromium.apiRequestContextCalls).toHaveLength(0)
    expect(harness.chromium.browser.contexts[0].routes).toHaveLength(1)
    expect(harness.chromium.browser.contexts[0].routes[0].pattern).toBe('**/*')
    const routeHandler = harness.chromium.browser.contexts[0].routes[0].handler
    const stagingRoute = fakeRoute(`${SITE_ORIGIN}/dashboard`, {
      Accept: 'text/html',
      'X-Vercel-Protection-Bypass': 'caller-value-must-be-replaced',
    })
    await routeHandler(stagingRoute.route)
    expect(stagingRoute.fetchWith).toEqual({
      headers: {
        Accept: 'text/html',
        'x-vercel-protection-bypass': BYPASS_SECRET,
      },
      maxRedirects: 0,
    })
    expect(stagingRoute.continueWith).toBeNull()
    expect(stagingRoute.fulfillWith).toEqual({ response: stagingRoute.response })
    expect(stagingRoute.response.dispose).toHaveBeenCalledTimes(1)
    const externalRoute = fakeRoute('https://accounts.google.com/login', {
      Accept: 'text/html',
      'x-vercel-protection-bypass': BYPASS_SECRET,
    })
    await routeHandler(externalRoute.route)
    expect(externalRoute.continueWith).toEqual({ headers: { Accept: 'text/html' } })
    expect(externalRoute.fetchWith).toBeNull()
    expect(harness.createServerClient).toHaveBeenCalledTimes(1)
    expect(harness.clients[0].origin).toBe(SUPABASE_ORIGIN)
    expect(harness.clients[0].key).toBe(ANON_KEY)
    expect(Object.keys(harness.clients[0].options).sort()).toEqual(['cookies', 'global'])
    expect(typeof harness.clients[0].options.global.fetch).toBe('function')
    expect(harness.secretProvider.mock.calls.length).toBeGreaterThanOrEqual(7)
    for (const [request] of harness.secretProvider.mock.calls) {
      expect(Object.keys(request).sort()).toEqual([
        'namespace',
        'schemaVersion',
        'signal',
        'supabaseOrigin',
        'targetOrigin',
      ])
      expect(request).toMatchObject({
        schemaVersion: 1,
        targetOrigin: SITE_ORIGIN,
        supabaseOrigin: SUPABASE_ORIGIN,
        namespace: NAMESPACE,
      })
      expect(request.signal).toBeInstanceOf(AbortSignal)
      expect(Object.isFrozen(request)).toBe(true)
    }
    assertNoSecret(result)
    assertNoSecret(harness.broker)

    const execution = await harness.broker.execute(executeRequest(harness.value))
    expect(execution).toEqual({ status: 'passed' })
    assertNoSecret(execution)
    await expect(harness.broker.closeAll()).resolves.toEqual({ status: 'passed' })
    expect(harness.chromium.browser.closeCalls).toBe(1)
  })

  it('never propagates the bypass header through a cross-origin redirect', async () => {
    const harness = createHarness()
    await authenticate(harness)
    const routeHandler = harness.chromium.browser.contexts[0].routes[0].handler
    const redirectResponse = Object.freeze({
      status: 302,
      headers: Object.freeze({ location: 'https://accounts.google.com/login' }),
      dispose: vi.fn(async () => {}),
    })
    const stagingRedirect = fakeRoute(`${SITE_ORIGIN}/redirect-to-google`, {
      Accept: 'text/html',
    }, { response: redirectResponse })

    await routeHandler(stagingRedirect.route)

    expect(stagingRedirect.fetchWith).toEqual({
      headers: {
        Accept: 'text/html',
        'x-vercel-protection-bypass': BYPASS_SECRET,
      },
      maxRedirects: 0,
    })
    expect(stagingRedirect.continueWith).toBeNull()
    expect(stagingRedirect.fulfillWith).toEqual({ response: redirectResponse })
    expect(redirectResponse.dispose).toHaveBeenCalledTimes(1)

    // The fulfilled 30x becomes a fresh browser request. Even if a browser or
    // caller tries to carry the prior header forward, the external-origin hop
    // is continued only after the bypass header is removed.
    const externalHop = fakeRoute('https://accounts.google.com/login', {
      Accept: 'text/html',
      'X-Vercel-Protection-Bypass': BYPASS_SECRET,
    })
    await routeHandler(externalHop.route)
    expect(externalHop.fetchWith).toBeNull()
    expect(externalHop.fulfillWith).toBeNull()
    expect(externalHop.continueWith).toEqual({ headers: { Accept: 'text/html' } })
    assertNoSecret(externalHop.continueWith)

    await expect(harness.broker.closeAll()).resolves.toEqual({ status: 'passed' })
  })

  it('disposes an exact-origin response and aborts when fulfill fails', async () => {
    const harness = createHarness()
    await authenticate(harness)
    const routeHandler = harness.chromium.browser.contexts[0].routes[0].handler
    const response = Object.freeze({
      status: 200,
      dispose: vi.fn(async () => {}),
    })
    const failedFulfill = fakeRoute(`${SITE_ORIGIN}/dashboard`, {
      Accept: 'text/html',
    }, {
      response,
      fulfillError: new Error(BYPASS_SECRET),
    })

    await routeHandler(failedFulfill.route)

    expect(failedFulfill.fetchWith).toEqual({
      headers: {
        Accept: 'text/html',
        'x-vercel-protection-bypass': BYPASS_SECRET,
      },
      maxRedirects: 0,
    })
    expect(failedFulfill.fulfillWith).toEqual({ response })
    expect(response.dispose).toHaveBeenCalledTimes(1)
    expect(failedFulfill.aborted).toBe(true)
    expect(failedFulfill.continueWith).toBeNull()

    await expect(harness.broker.closeAll()).resolves.toEqual({ status: 'passed' })
  })

  it('exposes the broker read probe only when a fixed private probe is injected', () => {
    const withoutProbe = createHarness()
    expect(withoutProbe.broker).not.toHaveProperty('probeUserScopedRead')

    const withProbe = createHarness({
      userScopedReadProbe: async () => ({ status: 'passed' }),
    })
    expect(typeof withProbe.broker.probeUserScopedRead).toBe('function')
    expect(Object.isFrozen(withProbe.broker)).toBe(true)
  })

  it.each([
    ['wrong deployment', validEnvironment({ KORKRU_DEPLOYMENT_ENV: 'production' })],
    ['wrong site', validEnvironment({ NEXT_PUBLIC_SITE_URL: 'https://www.korkru.com' })],
    ['wrong Supabase project', validEnvironment({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' })],
    ['writes disabled', validEnvironment({ EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'false' })],
  ])('blocks %s before exposing a capability', (_label, environment) => {
    expect(() => createHarness({ environment })).toThrow(SebStagingBrowserRuntimeBlockedError)
  })

  it.each([
    ['reserved namespace', { namespace: 'qa:seb-s5-preview' }],
    ['production-like namespace', { namespace: 'qa:seb-s5-production' }],
  ])('blocks malformed construction for %s', (_label, change) => {
    const value = account({ namespace: change.namespace })
    expect(() => createHarness({ value })).toThrow(SebStagingBrowserRuntimeBlockedError)
  })

  it('binds public requests to the one namespace selected at construction', async () => {
    const harness = createHarness()

    await expect(harness.broker.authenticate(authenticationRequest(harness.value, {
      namespace: OTHER_NAMESPACE,
    }))).rejects.toBeInstanceOf(Error)
    expect(harness.chromium.launchCalls).toHaveLength(0)
  })

  it('rejects unknown constructor fields and invalid runtime deadline schemas', () => {
    const value = account()
    const chromium = new FakeChromium(value)
    const dependencies = {
      namespace: NAMESPACE,
      readEnvironment: () => validEnvironment(),
      chromium,
      createServerClient: () => ({}),
      secretProvider: () => validSecretResult(),
      sessionOperationRunner: async () => ({ status: 'passed' }),
    }
    expect(() => createSebStagingBrowserRuntime({ ...dependencies, unexpected: true }))
      .toThrow(SebStagingBrowserRuntimeBlockedError)
    expect(() => createSebStagingBrowserRuntime({
      ...dependencies,
      runtimeDeadlinesMs: { browserLaunch: 24 },
    })).toThrow(SebStagingBrowserRuntimeBlockedError)
    expect(() => createSebStagingBrowserRuntime({
      ...dependencies,
      runtimeDeadlinesMs: { unknown: 50 },
    })).toThrow(SebStagingBrowserRuntimeBlockedError)
  })

  it.each([
    ['extra field', result => ({ ...result, extra: 'blocked' })],
    ['wrong target', result => ({ ...result, targetOrigin: 'https://www.korkru.com' })],
    ['wrong Supabase target', result => ({ ...result, supabaseOrigin: 'https://example.supabase.co' })],
    ['wrong namespace', result => ({ ...result, namespace: OTHER_NAMESPACE })],
    ['wrong browser channel', result => ({ ...result, browserChannel: 'chromium' })],
    ['short bypass', result => ({ ...result, vercelAutomationBypassSecret: 'short' })],
    ['matching keys', result => ({ ...result, supabaseAnonKey: BYPASS_SECRET })],
  ])('fails closed on secret-provider %s without launching Chrome', async (_label, mutate) => {
    const harness = createHarness({
      secretProviderOverride: () => mutate(validSecretResult()),
    })
    let error
    try {
      await authenticate(harness)
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(Error)
    assertNoSecret(String(error))
    expect(harness.chromium.launchCalls).toHaveLength(0)
  })

  it('closes Chrome and blocks when the provider drifts after launch', async () => {
    const harness = createHarness({
      secretProviderOverride: ({ callIndex }) => validSecretResult(NAMESPACE, callIndex >= 2
        ? { vercelAutomationBypassSecret: OTHER_BYPASS_SECRET }
        : {}),
    })

    await expect(authenticate(harness)).rejects.toBeInstanceOf(Error)
    expect(harness.chromium.browser.closeCalls).toBe(1)
    expect(harness.chromium.browser.connected).toBe(false)
  })

  it('bounds a stalled secret provider and never launches Chrome with a late value', async () => {
    const harness = createHarness({
      secretProviderOverride: async () => {
        await new Promise(resolve => setTimeout(resolve, 80))
        return validSecretResult()
      },
      runtimeDeadlinesMs: { ...FAST_RUNTIME_DEADLINES, secretProvider: 25 },
    })
    let error
    try {
      await authenticate(harness)
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(Error)
    assertNoSecret(String(error))
    expect(harness.chromium.launchCalls).toHaveLength(0)
    await new Promise(resolve => setTimeout(resolve, 90))
    expect(harness.chromium.launchCalls).toHaveLength(0)
  })

  it('closes and rejects a browser whose reported type does not match the launched Chrome type', async () => {
    const harness = createHarness({ chromiumOptions: { channelMismatch: true } })

    await expect(authenticate(harness)).rejects.toBeInstanceOf(Error)
    expect(harness.chromium.launchCalls[0]).toEqual({ channel: 'chrome', headless: true })
    expect(harness.chromium.browser.closeCalls).toBe(1)
  })

  it('closes a browser which arrives after the launch deadline', async () => {
    const harness = createHarness({
      chromiumOptions: { launchDelayMs: 80 },
      runtimeDeadlinesMs: { ...FAST_RUNTIME_DEADLINES, browserLaunch: 25 },
    })

    await expect(authenticate(harness)).rejects.toBeInstanceOf(Error)
    await vi.waitFor(() => expect(harness.chromium.browser.closeCalls).toBeGreaterThanOrEqual(1))
    expect(harness.chromium.browser.connected).toBe(false)
  })

  it('keeps immediate closeAll pending until an ignored-abort late launch is closed', async () => {
    const launchGate = deferred()
    const harness = createHarness({
      chromiumOptions: { launchGate },
      runtimeDeadlinesMs: { ...FAST_RUNTIME_DEADLINES, browserLaunch: 25 },
      brokerDeadlinesMs: { ...FAST_BROKER_DEADLINES, browserFactory: 50 },
    })
    const authentication = authenticate(harness).catch(error => error)
    await vi.waitFor(() => expect(harness.chromium.launchCalls).toHaveLength(1))

    const close = harness.broker.closeAll()
    await expectPending(close)
    launchGate.resolve()

    const authenticationError = await authentication
    expect(authenticationError).toBeInstanceOf(Error)
    assertNoSecret(String(authenticationError))
    await expect(close).resolves.toEqual({ status: 'passed' })
    expect(harness.chromium.browser.closeCalls).toBe(1)
    expect(harness.chromium.browser.connected).toBe(false)
    assertNoSecret(await close)
  })

  it('keeps a failed late-browser close retryable across closeAll calls', async () => {
    const launchGate = deferred()
    const harness = createHarness({
      chromiumOptions: { launchGate, browserCloseFailures: 2 },
      runtimeDeadlinesMs: { ...FAST_RUNTIME_DEADLINES, browserLaunch: 25 },
      brokerDeadlinesMs: { ...FAST_BROKER_DEADLINES, browserFactory: 50 },
    })
    const authentication = authenticate(harness).catch(error => error)
    await vi.waitFor(() => expect(harness.chromium.launchCalls).toHaveLength(1))
    const firstClose = harness.broker.closeAll()
    await expectPending(firstClose)
    launchGate.resolve()

    expect(await authentication).toBeInstanceOf(Error)
    let firstCloseError
    try {
      await firstClose
    } catch (error) {
      firstCloseError = error
    }
    expect(firstCloseError).toBeInstanceOf(Error)
    assertNoSecret(String(firstCloseError))
    expect(harness.chromium.browser.closeCalls).toBe(2)
    expect(harness.chromium.browser.connected).toBe(true)

    await expect(harness.broker.closeAll()).resolves.toEqual({ status: 'passed' })
    expect(harness.chromium.browser.closeCalls).toBe(3)
    expect(harness.chromium.browser.connected).toBe(false)
  })

  it('keeps immediate closeAll pending until an ignored-abort late context is closed', async () => {
    const contextGate = deferred()
    const harness = createHarness({
      chromiumOptions: { contextGate },
      runtimeDeadlinesMs: { ...FAST_RUNTIME_DEADLINES, contextCreate: 25 },
      brokerDeadlinesMs: { ...FAST_BROKER_DEADLINES, operation: 50 },
    })
    const authentication = authenticate(harness).catch(error => error)
    await vi.waitFor(() => expect(harness.chromium.browser.newContextCalls).toHaveLength(1))

    const close = harness.broker.closeAll()
    await expectPending(close)
    contextGate.resolve()

    expect(await authentication).toBeInstanceOf(Error)
    await expect(close).resolves.toEqual({ status: 'passed' })
    expect(harness.chromium.browser.contexts).toHaveLength(1)
    expect(harness.chromium.browser.contexts[0].closed).toBe(true)
    expect(harness.chromium.browser.closeCalls).toBe(1)
  })

  it('keeps a failed late-context close retryable across closeAll calls', async () => {
    const contextGate = deferred()
    const harness = createHarness({
      chromiumOptions: { contextGate, contextCloseFailures: 2 },
      runtimeDeadlinesMs: { ...FAST_RUNTIME_DEADLINES, contextCreate: 25 },
      brokerDeadlinesMs: { ...FAST_BROKER_DEADLINES, operation: 50 },
    })
    const authentication = authenticate(harness).catch(error => error)
    await vi.waitFor(() => expect(harness.chromium.browser.newContextCalls).toHaveLength(1))
    const firstClose = harness.broker.closeAll()
    await expectPending(firstClose)
    contextGate.resolve()

    expect(await authentication).toBeInstanceOf(Error)
    await expect(firstClose).rejects.toBeInstanceOf(Error)
    const [lateContext] = harness.chromium.browser.contexts
    expect(lateContext.closeCalls).toBe(2)
    expect(lateContext.closed).toBe(false)

    await expect(harness.broker.closeAll()).resolves.toEqual({ status: 'passed' })
    expect(lateContext.closeCalls).toBe(3)
    expect(lateContext.closed).toBe(true)
  })

  it('waits for an ignored-abort secret provider before closeAll can pass', async () => {
    const providerGate = deferred()
    let providerSignal
    const harness = createHarness({
      secretProviderOverride: ({ request }) => {
        providerSignal = request.signal
        return providerGate.promise.then(() => validSecretResult())
      },
      runtimeDeadlinesMs: { ...FAST_RUNTIME_DEADLINES, secretProvider: 25 },
      brokerDeadlinesMs: { ...FAST_BROKER_DEADLINES, browserFactory: 50 },
    })
    const authentication = authenticate(harness).catch(error => error)
    await vi.waitFor(() => expect(harness.secretProvider).toHaveBeenCalledTimes(1))
    const close = harness.broker.closeAll()

    await expectPending(close)
    expect(providerSignal.aborted).toBe(true)
    providerGate.resolve()

    expect(await authentication).toBeInstanceOf(Error)
    await expect(close).resolves.toEqual({ status: 'passed' })
    expect(harness.chromium.launchCalls).toHaveLength(0)
  })

  it('waits for an ignored-abort createServerClient before closeAll can pass', async () => {
    const clientGate = deferred()
    const harness = createHarness({
      createServerClientGate: clientGate,
      runtimeDeadlinesMs: { ...FAST_RUNTIME_DEADLINES, authClient: 25 },
      brokerDeadlinesMs: { ...FAST_BROKER_DEADLINES, attestation: 50 },
    })
    const authentication = authenticate(harness).catch(error => error)
    await vi.waitFor(() => expect(harness.createServerClient).toHaveBeenCalledTimes(1))
    const close = harness.broker.closeAll()

    await expectPending(close)
    clientGate.resolve()

    expect(await authentication).toBeInstanceOf(Error)
    await expect(close).resolves.toEqual({ status: 'passed' })
    expect(harness.chromium.browser.contexts[0].closed).toBe(true)
  })

  it('waits for an ignored-abort getUser before closeAll can pass', async () => {
    const getUserGate = deferred()
    const harness = createHarness({
      getUserGate,
      runtimeDeadlinesMs: { ...FAST_RUNTIME_DEADLINES, authGetUser: 25 },
      brokerDeadlinesMs: { ...FAST_BROKER_DEADLINES, attestation: 50 },
    })
    const authentication = authenticate(harness).catch(error => error)
    await vi.waitFor(() => expect(harness.clients[0]?.client.auth.getUser).toHaveBeenCalledTimes(1))
    const close = harness.broker.closeAll()

    await expectPending(close)
    getUserGate.resolve()

    expect(await authentication).toBeInstanceOf(Error)
    await expect(close).resolves.toEqual({ status: 'passed' })
    expect(harness.chromium.browser.contexts[0].closed).toBe(true)
  })

  it.each([
    ['set-cookie attempt', 'set-cookie'],
    ['client origin drift', 'client-drift'],
    ['wrong client target', 'wrong-origin'],
    ['network target drift', 'external-fetch'],
    ['secret-bearing client error', 'throw-secret'],
  ])('quarantines the context on %s and returns only a generic error', async (_label, clientMode) => {
    const harness = createHarness({ clientMode })
    let error
    try {
      await authenticate(harness)
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(Error)
    assertNoSecret(String(error))
    expect(harness.chromium.browser.contexts[0].closed).toBe(true)
  })

  it.each([
    ['extra result field', ({ value }) => ({
      data: { user: verifiedUser(value) },
      error: null,
      token: BYPASS_SECRET,
    })],
    ['missing user', () => ({ data: { user: null }, error: null })],
    ['unverified error', ({ value }) => ({ data: { user: verifiedUser(value) }, error: { message: 'no' } })],
    ['wrong QA namespace', ({ value }) => ({
      data: { user: verifiedUser(value, { qa_namespace: OTHER_NAMESPACE }) },
      error: null,
    })],
    ['unexpected QA metadata', ({ value }) => ({
      data: { user: verifiedUser(value, { qa_unplanned: 'blocked' }) },
      error: null,
    })],
  ])('rejects malformed getUser output: %s', async (_label, clientResultOverride) => {
    const harness = createHarness({ clientResultOverride })

    await expect(authenticate(harness)).rejects.toBeInstanceOf(Error)
    expect(harness.chromium.browser.contexts[0].closed).toBe(true)
  })

  it('aborts a slow getUser attestation and never returns late identity data', async () => {
    const harness = createHarness({
      clientMode: 'delayed',
      runtimeDeadlinesMs: { ...FAST_RUNTIME_DEADLINES, authGetUser: 25 },
    })

    await expect(authenticate(harness)).rejects.toBeInstanceOf(Error)
    expect(harness.chromium.browser.contexts[0].closed).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 90))
    expect(harness.broker).not.toHaveProperty('browser')
  })

  it('blocks environment drift during a secret-provider boundary and closes the launched browser', async () => {
    const harness = createHarness({
      secretProviderOverride: ({ callIndex, state }) => {
        if (callIndex === 2) state.environment = validEnvironment({ VERCEL_ENV: 'production' })
        return validSecretResult()
      },
    })

    await expect(authenticate(harness)).rejects.toBeInstanceOf(Error)
    expect(harness.chromium.browser.closeCalls).toBe(1)
  })

  it('does not leak secrets through provider failures, public results, errors, or capability keys', async () => {
    const providerFailure = createHarness({
      secretProviderOverride: () => {
        throw new Error(`${BYPASS_SECRET}:${ANON_KEY}`)
      },
    })
    let providerError
    try {
      await authenticate(providerFailure)
    } catch (caught) {
      providerError = caught
    }
    assertNoSecret(String(providerError))
    assertNoSecret(providerFailure.broker)

    const successful = createHarness()
    const result = await authenticate(successful)
    const execution = await successful.broker.execute(executeRequest(successful.value))
    assertNoSecret(result)
    assertNoSecret(execution)
    expect(Object.keys(successful.broker)).not.toEqual(expect.arrayContaining([
      'browser',
      'page',
      'cookies',
      'secrets',
      'secretProvider',
      'attestSession',
    ]))
  })
})

function verifiedUser(value, metadataOverrides = {}) {
  return {
    id: value.id,
    email: value.email,
    app_metadata: {
      role: value.role,
      qa_fixture: 'seb-s5',
      qa_namespace: value.namespace,
      qa_role: value.role,
      qa_alias: value.alias,
      qa_schema_version: 1,
      ...metadataOverrides,
    },
  }
}

function fakeRoute(url, headers, { response, fulfillError } = {}) {
  const state = {
    continueWith: null,
    fetchWith: null,
    fulfillWith: null,
    aborted: false,
    response: response ?? Object.freeze({
      kind: 'fake-http-response',
      url,
      dispose: vi.fn(async () => {}),
    }),
  }
  state.route = {
    request() {
      return {
        url: () => url,
        allHeaders: async () => ({ ...headers }),
      }
    },
    async continue(options) {
      state.continueWith = options
    },
    async fetch(options) {
      state.fetchWith = options
      return state.response
    },
    async fulfill(options) {
      state.fulfillWith = options
      if (fulfillError) throw fulfillError
    },
    async abort() {
      state.aborted = true
    },
  }
  return state
}
