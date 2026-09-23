import { describe, expect, it, vi } from 'vitest'

import {
  SebStagingBrowserSessionBlockedError,
  createSebStagingBrowserSessionBroker,
} from './seb-staging-browser-session.mjs'

const SITE_ORIGIN = 'https://staging.korkru.com'
const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const NAMESPACE = 'qa:seb-s5-browser-1'
const OTHER_NAMESPACE = 'qa:seb-s5-browser-2'
const FAST_DEADLINES = Object.freeze({
  browserFactory: 50,
  attestation: 50,
  operation: 50,
  probe: 50,
  close: 50,
  action: 50,
  navigation: 50,
})

const ACCOUNT_SPECS = Object.freeze([
  Object.freeze({ alias: 'teacher-primary', role: 'teacher', token: 'tp', index: 1 }),
  Object.freeze({ alias: 'teacher-unrelated', role: 'teacher', token: 'tu', index: 2 }),
  Object.freeze({ alias: 'student-primary', role: 'student', token: 'sp', index: 3 }),
  Object.freeze({ alias: 'student-secondary', role: 'student', token: 'ss', index: 4 }),
])
const OPERATION_BY_ALIAS = Object.freeze({
  'teacher-primary': 'create-subject-classroom',
  'teacher-unrelated': 'unrelated-teacher-denied-assignment-result',
  'student-primary': 'resume-same-attempt',
  'student-secondary': 'secondary-student-denied-primary-attempt',
})

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

function uuid(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

function account(spec, namespace = NAMESPACE) {
  return Object.freeze({
    alias: spec.alias,
    role: spec.role,
    id: uuid(spec.index),
    email: `seb-s5-${spec.token}-${String(spec.index).repeat(20)}@qa.staging.korkru.com`,
    password: `Aa1!${String(spec.index).repeat(64)}`,
    namespace,
  })
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

function accessRequest(value, overrides = {}) {
  return {
    targetOrigin: SITE_ORIGIN,
    namespace: value.namespace,
    alias: value.alias,
    role: value.role,
    expectedUserId: value.id,
    ...overrides,
  }
}

function executeRequest(value, overrides = {}) {
  return {
    ...accessRequest(value),
    operationId: OPERATION_BY_ALIAS[value.alias],
    payload: {},
    ...overrides,
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

class FakeResponse {
  constructor(url, ok = true) {
    this.responseUrl = url
    this.responseOk = ok
  }

  ok() {
    return this.responseOk
  }

  url() {
    return this.responseUrl
  }
}

class FakeLocator {
  constructor(page, kind) {
    this.page = page
    this.kind = kind
  }

  async count() {
    if (this.kind === 'marker') return this.page.options.markerVisible ? 1 : 0
    if (this.kind === 'root') return this.page.options.rootVisible ? 1 : 0
    if (this.page.options.missingSelector === this.kind) return 0
    return 1
  }

  async isVisible() {
    return await this.count() === 1
  }

  async getAttribute(name) {
    if (this.kind === 'root' && name === 'data-deployment-environment') {
      return this.page.options.rootEnvironment
    }
    if (name !== 'type') return null
    if (this.kind === '#email') return 'email'
    if (this.kind === '#password') return 'password'
    if (this.kind === 'button[type="submit"]') return 'submit'
    return null
  }

  async textContent() {
    return this.kind === 'marker' ? this.page.options.markerText : ''
  }

  async fill(value) {
    this.page.fields.set(this.kind, value)
  }

  async click() {
    if (this.kind !== 'button[type="submit"]') throw new Error('not a button')
    this.page.context.login(
      this.page.fields.get('#email'),
      this.page.fields.get('#password'),
    )
    this.page.currentUrl = this.page.options.submitUrl
  }
}

class FakePage {
  constructor(context, options) {
    this.context = context
    this.options = options
    this.currentUrl = 'about:blank'
    this.fields = new Map()
    this.closed = false
    this.gotoCalls = []
    this.actionTimeout = null
    this.navigationTimeout = null
  }

  isClosed() {
    return this.closed
  }

  setDefaultTimeout(value) {
    this.actionTimeout = value
  }

  setDefaultNavigationTimeout(value) {
    this.navigationTimeout = value
  }

  async goto(url) {
    this.gotoCalls.push(url)
    if (this.options.gotoGate) await this.options.gotoGate.promise
    this.currentUrl = this.options.gotoUrl ?? url
    return new FakeResponse(this.currentUrl, this.options.responseOk)
  }

  async reload() {
    this.context.refreshAuthenticatedAccount()
    this.currentUrl = this.context.currentAccount
      ? `${SITE_ORIGIN}/dashboard`
      : `${SITE_ORIGIN}/login`
    return new FakeResponse(this.currentUrl, this.options.responseOk)
  }

  url() {
    return this.currentUrl
  }

  locator(selector) {
    return new FakeLocator(
      this,
      selector === 'html[data-deployment-environment="staging"]' ? 'root' : selector,
    )
  }

  getByRole(role, config) {
    return role === 'status'
      && config?.name === 'ระบบทดสอบ Staging'
      && config?.exact === true
      ? new FakeLocator(this, 'marker')
      : new FakeLocator(this, 'missing')
  }

  async waitForURL(expected) {
    if (typeof expected !== 'string' || this.currentUrl !== expected) {
      throw new Error('unexpected navigation')
    }
  }

  async evaluate(callback) {
    expect(callback).toBeTypeOf('function')
  }
}

class FakeContext {
  constructor(accountsByEmail, accountsByAlias, options) {
    this.accountsByEmail = accountsByEmail
    this.accountsByAlias = accountsByAlias
    this.options = options
    this.pageList = []
    this.cookieJar = []
    this.currentAccount = null
    this.closeCalls = 0
    this.closed = false
    this.closeMode = options.closeMode ?? 'normal'
    this.pendingClose = null
    this.clearCookiesGate = options.clearCookiesGate ?? null
    this.addCookieCalls = []
    this.clearCookieCalls = 0
  }

  async newPage() {
    const page = new FakePage(this, this.options)
    this.pageList.push(page)
    return page
  }

  pages() {
    return [...this.pageList]
  }

  login(email, password) {
    const value = this.accountsByEmail.get(email)
    if (!value || value.password !== password) throw new Error('bad credentials')
    this.currentAccount = value
    this.cookieJar = [this.cookieFor(value)]
  }

  cookieFor(value) {
    return {
      name: 'sb-dyuxkrzeveknqgtuzpbh-auth-token',
      value: `session:${value.alias}`,
      domain: 'staging.korkru.com',
      path: '/',
      expires: 2_000_000_000,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    }
  }

  refreshAuthenticatedAccount() {
    const authCookie = this.cookieJar.find(cookie => cookie.name.includes('auth-token'))
    const alias = authCookie?.value.startsWith('session:')
      ? authCookie.value.slice('session:'.length)
      : null
    this.currentAccount = alias ? this.accountsByAlias.get(alias) ?? null : null
  }

  async cookies() {
    return structuredClone(this.options.cookieOverride ?? this.cookieJar)
  }

  async clearCookies() {
    this.clearCookieCalls += 1
    const gate = this.clearCookiesGate
    this.clearCookiesGate = null
    if (gate) await gate.promise
    this.cookieJar = []
    this.currentAccount = null
  }

  async addCookies(cookies) {
    this.addCookieCalls.push(structuredClone(cookies))
    this.cookieJar = structuredClone(cookies)
    this.refreshAuthenticatedAccount()
  }

  async close() {
    this.closeCalls += 1
    if (this.closeMode === 'never') {
      this.pendingClose ??= deferred()
      await this.pendingClose.promise
      this.pendingClose = null
    }
    if (this.closeMode === 'fail-once') {
      this.closeMode = 'normal'
      throw new Error('context close failed')
    }
    this.closed = true
    for (const page of this.pageList) page.closed = true
  }

  releasePendingClose() {
    this.closeMode = 'normal'
    this.pendingClose?.resolve()
  }
}

class FakeBrowser {
  constructor(accountsByEmail, accountsByAlias, options) {
    this.accountsByEmail = accountsByEmail
    this.accountsByAlias = accountsByAlias
    this.options = options
    this.contexts = []
    this.newContextCalls = []
    this.closeCalls = 0
    this.closeMode = options.browserCloseMode ?? 'normal'
    this.pendingClose = null
    this.connected = true
  }

  isConnected() {
    return this.connected
  }

  async newContext(options) {
    this.newContextCalls.push(options)
    const index = this.contexts.length
    const context = new FakeContext(this.accountsByEmail, this.accountsByAlias, {
      markerVisible: this.options.markerVisible ?? true,
      markerText: this.options.markerText ?? 'STAGING · ระบบทดสอบ',
      rootVisible: this.options.rootVisible ?? true,
      rootEnvironment: this.options.rootEnvironment ?? 'staging',
      missingSelector: this.options.missingSelector,
      gotoUrl: this.options.gotoUrl,
      submitUrl: this.options.submitUrl ?? `${SITE_ORIGIN}/dashboard`,
      responseOk: this.options.responseOk ?? true,
      cookieOverride: this.options.cookieOverride,
      closeMode: this.options.contextCloseModes?.[index] ?? 'normal',
      clearCookiesGate: this.options.clearCookiesGates?.[index],
      gotoGate: this.options.gotoGates?.[index],
    })
    this.contexts.push(context)
    return context
  }

  async close() {
    this.closeCalls += 1
    if (this.closeMode === 'never') {
      this.pendingClose ??= deferred()
      await this.pendingClose.promise
      this.pendingClose = null
    }
    if (this.closeMode === 'fail-once') {
      this.closeMode = 'normal'
      throw new Error('browser close failed')
    }
    this.connected = false
  }

  releasePendingClose() {
    this.closeMode = 'normal'
    this.pendingClose?.resolve()
  }
}

function createHarness({
  namespace = NAMESPACE,
  environment,
  browserOptions = {},
  factoryOrigin = SITE_ORIGIN,
  factoryNamespace = namespace,
  factoryOverride,
  mutateAttestation,
  attestOverride,
  runnerOverride,
  includeProbe = false,
  probeOverride,
  deadlinesMs,
} = {}) {
  const accounts = ACCOUNT_SPECS.map(spec => account(spec, namespace))
  const accountsByEmail = new Map(accounts.map(value => [value.email, value]))
  const accountsByAlias = new Map(accounts.map(value => [value.alias, value]))
  const state = { current: environment ?? validEnvironment() }
  const browser = new FakeBrowser(accountsByEmail, accountsByAlias, browserOptions)
  const readEnvironment = vi.fn(() => state.current)
  const browserFactory = vi.fn(async request => {
    if (factoryOverride) return factoryOverride({ request, browser })
    return { targetOrigin: factoryOrigin, namespace: factoryNamespace, browser }
  })
  let attestCall = 0
  const attestSession = vi.fn(async input => {
    attestCall += 1
    if (attestOverride) {
      return attestOverride({
        ...input,
        accountsByAlias,
        callIndex: attestCall,
      })
    }
    const authCookie = input.cookies.find(cookie => cookie.name.includes('auth-token'))
    const alias = authCookie?.value.startsWith('session:')
      ? authCookie.value.slice('session:'.length)
      : null
    const value = alias ? accountsByAlias.get(alias) : null
    if (!value) throw new Error('missing session')
    const attestation = {
      targetOrigin: SITE_ORIGIN,
      authenticatedUserId: value.id,
      authenticatedEmail: value.email,
      appMetadata: {
        role: value.role,
        qa_fixture: 'seb-s5',
        qa_namespace: value.namespace,
        qa_role: value.role,
        qa_alias: value.alias,
        qa_schema_version: 1,
        provider: 'email',
        providers: ['email'],
      },
    }
    return mutateAttestation
      ? mutateAttestation(structuredClone(attestation), value, attestCall)
      : attestation
  })
  const sessionOperationRunner = vi.fn(async input => (
    runnerOverride ? runnerOverride(input) : { status: 'passed' }
  ))
  const userScopedReadProbe = includeProbe
    ? vi.fn(async input => (probeOverride ? probeOverride(input) : { status: 'passed' }))
    : undefined
  const broker = createSebStagingBrowserSessionBroker({
    namespace,
    readEnvironment,
    browserFactory,
    attestSession,
    sessionOperationRunner,
    userScopedReadProbe,
    deadlinesMs,
  })
  return {
    namespace,
    accounts,
    accountsByAlias,
    state,
    browser,
    readEnvironment,
    browserFactory,
    attestSession,
    sessionOperationRunner,
    userScopedReadProbe,
    broker,
  }
}

async function authenticate(broker, value) {
  return broker.authenticate(authenticationRequest(value))
}

function defaultAttestationFromCookies({ cookies, accountsByAlias }) {
  const alias = cookies[0].value.slice('session:'.length)
  const value = accountsByAlias.get(alias)
  return {
    targetOrigin: SITE_ORIGIN,
    authenticatedUserId: value.id,
    authenticatedEmail: value.email,
    appMetadata: {
      role: value.role,
      qa_fixture: 'seb-s5',
      qa_namespace: value.namespace,
      qa_role: value.role,
      qa_alias: value.alias,
      qa_schema_version: 1,
    },
  }
}

describe('SEB Staging browser session broker', () => {
  it('binds one namespace, creates one isolated context per alias, and re-attests reuse', async () => {
    const harness = createHarness({ deadlinesMs: FAST_DEADLINES })

    for (const value of harness.accounts) {
      const result = await authenticate(harness.broker, value)
      expect(result).toEqual({
        targetOrigin: SITE_ORIGIN,
        authenticatedUserId: value.id,
        appMetadata: {
          role: value.role,
          qa_fixture: 'seb-s5',
          qa_namespace: NAMESPACE,
          qa_role: value.role,
          qa_alias: value.alias,
          qa_schema_version: 1,
        },
      })
      expect(JSON.stringify(result)).not.toContain(value.password)
      expect(JSON.stringify(result)).not.toContain('session:')
    }

    expect(harness.browserFactory).toHaveBeenCalledTimes(1)
    const factoryInput = harness.browserFactory.mock.calls[0][0]
    expect(factoryInput).toMatchObject({
      targetOrigin: SITE_ORIGIN,
      namespace: NAMESPACE,
      isolatedContexts: true,
    })
    expect(factoryInput.signal).toBeInstanceOf(AbortSignal)
    expect(Object.isFrozen(factoryInput)).toBe(true)
    expect(harness.browser.contexts).toHaveLength(4)
    expect(new Set(harness.browser.contexts).size).toBe(4)
    for (const context of harness.browser.contexts) {
      expect(context.pageList[0].actionTimeout).toBe(FAST_DEADLINES.action)
      expect(context.pageList[0].navigationTimeout).toBe(FAST_DEADLINES.navigation)
    }

    const primary = harness.accountsByAlias.get('teacher-primary')
    const originalContext = harness.browser.contexts[0]
    await authenticate(harness.broker, primary)
    expect(harness.browser.contexts).toHaveLength(4)
    expect(harness.browser.contexts[0]).toBe(originalContext)
    expect(harness.attestSession).toHaveBeenCalledTimes(5)
  })

  it.each([
    ['wrong site origin', request => ({ ...request, targetOrigin: 'https://www.korkru.com' })],
    ['cross-run namespace', request => ({ ...request, namespace: OTHER_NAMESPACE })],
    ['unknown alias', request => ({ ...request, alias: 'teacher-production' })],
    ['wrong alias role', request => ({ ...request, role: 'admin' })],
    ['wrong user id shape', request => ({ ...request, expectedUserId: 'not-a-uuid' })],
    ['non-synthetic email', request => ({
      ...request,
      credentials: { ...request.credentials, email: 'teacher@example.com' },
    })],
    ['short password', request => ({
      ...request,
      credentials: { ...request.credentials, password: 'short' },
    })],
    ['extra request field', request => ({ ...request, secret: 'unexpected' })],
  ])('blocks %s before creating a browser', async (_label, mutate) => {
    const harness = createHarness()
    const request = mutate(authenticationRequest(harness.accounts[0]))

    await expect(harness.broker.authenticate(request))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(harness.browserFactory).not.toHaveBeenCalled()
  })

  it.each([
    ['wrong authenticated id', attestation => ({ ...attestation, authenticatedUserId: uuid(99) })],
    ['wrong authenticated email', attestation => ({ ...attestation, authenticatedEmail: 'wrong@qa.staging.korkru.com' })],
    ['missing authorization role', attestation => {
      delete attestation.appMetadata.role
      return attestation
    }],
    ['elevated authorization role', attestation => {
      attestation.appMetadata.role = 'admin'
      return attestation
    }],
    ['wrong QA alias', attestation => {
      attestation.appMetadata.qa_alias = 'teacher-unrelated'
      return attestation
    }],
    ['unexpected QA metadata', attestation => {
      attestation.appMetadata.qa_unplanned = 'value'
      return attestation
    }],
    ['extra attestation field', attestation => ({ ...attestation, accessToken: 'secret' })],
  ])('fails closed on %s and quarantines the context', async (_label, mutateAttestation) => {
    const harness = createHarness({ mutateAttestation })

    await expect(authenticate(harness.broker, harness.accounts[0]))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(harness.browser.contexts[0].closed).toBe(true)
  })

  it.each([
    ['missing email control', { missingSelector: '#email' }],
    ['missing password control', { missingSelector: '#password' }],
    ['missing submit control', { missingSelector: 'button[type="submit"]' }],
    ['missing staging marker', { markerVisible: false }],
    ['wrong staging marker text', { markerText: 'PRODUCTION' }],
    ['wrong root environment', { rootEnvironment: 'production' }],
    ['failed login response', { responseOk: false }],
    ['navigation outside Staging', { submitUrl: 'https://www.korkru.com/dashboard' }],
  ])('fails closed for %s', async (_label, browserOptions) => {
    const harness = createHarness({ browserOptions })

    await expect(authenticate(harness.broker, harness.accounts[0]))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(harness.browser.contexts[0].closed).toBe(true)
  })

  it('requires the browser factory to attest the same origin and namespace', async () => {
    const wrongOrigin = createHarness({ factoryOrigin: 'https://www.korkru.com' })
    await expect(authenticate(wrongOrigin.broker, wrongOrigin.accounts[0]))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(wrongOrigin.browser.closeCalls).toBe(1)

    const wrongNamespace = createHarness({ factoryNamespace: OTHER_NAMESPACE })
    await expect(authenticate(wrongNamespace.broker, wrongNamespace.accounts[0]))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(wrongNamespace.browser.closeCalls).toBe(1)
  })

  it('serializes operations and rejects a concurrent duplicate', async () => {
    let releaseAttestation
    const gate = new Promise(resolve => {
      releaseAttestation = resolve
    })
    const harness = createHarness({
      attestOverride: async input => {
        await gate
        return defaultAttestationFromCookies(input)
      },
    })
    const first = authenticate(harness.broker, harness.accounts[0])
    await vi.waitFor(() => expect(harness.attestSession).toHaveBeenCalledTimes(1))

    await expect(authenticate(harness.broker, harness.accounts[0]))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    releaseAttestation()
    await expect(first).resolves.toMatchObject({ authenticatedUserId: harness.accounts[0].id })
  })

  it('executes only a fixed allowlisted operation without exposing Page to the caller', async () => {
    const harness = createHarness({ deadlinesMs: FAST_DEADLINES })
    const value = harness.accountsByAlias.get('teacher-primary')
    await authenticate(harness.broker, value)

    const result = await harness.broker.execute(executeRequest(value))
    expect(result).toEqual({ status: 'passed' })
    expect(Object.keys(result)).toEqual(['status'])
    expect(Object.keys(harness.broker)).not.toContain('withPage')
    expect(harness.sessionOperationRunner).toHaveBeenCalledTimes(1)
    const runnerInput = harness.sessionOperationRunner.mock.calls[0][0]
    expect(runnerInput).toMatchObject({
      targetOrigin: SITE_ORIGIN,
      namespace: NAMESPACE,
      alias: value.alias,
      expectedUserId: value.id,
      operationId: 'create-subject-classroom',
      payload: {},
    })
    expect(runnerInput.page).toBe(harness.browser.contexts[0].pageList[0])
    expect(runnerInput.signal).toBeInstanceOf(AbortSignal)
    expect(Object.isFrozen(runnerInput)).toBe(true)
    expect(Object.isFrozen(runnerInput.payload)).toBe(true)
  })

  it.each([
    ['unknown operation', request => ({ ...request, operationId: 'read-production' })],
    ['operation for another alias', request => ({ ...request, operationId: 'resume-same-attempt' })],
    ['non-empty payload', request => ({ ...request, payload: { id: 'caller-controlled' } })],
    ['cross-run namespace', request => ({ ...request, namespace: OTHER_NAMESPACE })],
    ['extra field', request => ({ ...request, callback: 'not-allowed' })],
  ])('rejects %s before invoking the trusted runner', async (_label, mutate) => {
    const harness = createHarness()
    const value = harness.accountsByAlias.get('teacher-primary')
    await authenticate(harness.broker, value)
    const clearCalls = harness.browser.contexts[0].clearCookieCalls

    await expect(harness.broker.execute(mutate(executeRequest(value))))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(harness.sessionOperationRunner).not.toHaveBeenCalled()
    expect(harness.browser.contexts[0].clearCookieCalls).toBe(clearCalls)
  })

  it('quarantines the session after runner navigation or an expanded runner result', async () => {
    const navigated = createHarness({
      runnerOverride: async input => {
        input.page.currentUrl = 'https://www.korkru.com/dashboard'
        return { status: 'passed' }
      },
    })
    await authenticate(navigated.broker, navigated.accounts[0])
    await expect(navigated.broker.execute(executeRequest(navigated.accounts[0])))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(navigated.browser.contexts[0].closed).toBe(true)

    const expanded = createHarness({
      runnerOverride: async () => ({ status: 'passed', token: 'secret' }),
    })
    await authenticate(expanded.broker, expanded.accounts[0])
    await expect(expanded.broker.execute(executeRequest(expanded.accounts[0])))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(expanded.browser.contexts[0].closed).toBe(true)
  })

  it('keeps cookie snapshots private while supporting replace, fixed probe, and restore', async () => {
    const harness = createHarness({ includeProbe: true, deadlinesMs: FAST_DEADLINES })
    const primary = harness.accountsByAlias.get('teacher-primary')
    const unrelated = harness.accountsByAlias.get('teacher-unrelated')
    await authenticate(harness.broker, primary)
    await authenticate(harness.broker, unrelated)
    const primarySnapshot = await harness.broker.snapshotCookies(accessRequest(primary))
    const unrelatedSnapshot = await harness.broker.snapshotCookies(accessRequest(unrelated))
    expect(JSON.stringify([primarySnapshot, unrelatedSnapshot])).not.toContain('session:')

    await expect(harness.broker.replaceCookies({
      targetOrigin: SITE_ORIGIN,
      namespace: NAMESPACE,
      alias: primary.alias,
      sourceAlias: unrelated.alias,
    })).resolves.toEqual({ status: 'passed' })
    const replacedTarget = harness.browser.contexts[0]
    const addCallsAfterReplace = replacedTarget.addCookieCalls.length
    await expect(harness.broker.restoreCookies(accessRequest(primary, {
      namespace: OTHER_NAMESPACE,
    }))).rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(replacedTarget.addCookieCalls).toHaveLength(addCallsAfterReplace)
    await expect(harness.broker.probeUserScopedRead({
      targetOrigin: SITE_ORIGIN,
      namespace: NAMESPACE,
      contextAlias: primary.alias,
      authenticatedAsAlias: unrelated.alias,
    })).resolves.toEqual({ status: 'passed' })
    const probeInput = harness.userScopedReadProbe.mock.calls[0][0]
    expect(probeInput).toMatchObject({
      namespace: NAMESPACE,
      contextAlias: primary.alias,
      authenticatedAsAlias: unrelated.alias,
      authenticatedUserId: unrelated.id,
    })
    expect(probeInput).not.toHaveProperty('cookies')
    expect(probeInput.signal).toBeInstanceOf(AbortSignal)
    expect(Object.isFrozen(probeInput)).toBe(true)

    await expect(harness.broker.restoreCookies(accessRequest(primary)))
      .resolves.toEqual({ status: 'passed' })
    await expect(harness.broker.execute(executeRequest(primary)))
      .resolves.toEqual({ status: 'passed' })
  })

  it('rejects cross-namespace swap and probe before any browser mutation', async () => {
    const harness = createHarness({ includeProbe: true })
    const primary = harness.accountsByAlias.get('teacher-primary')
    const unrelated = harness.accountsByAlias.get('teacher-unrelated')
    await authenticate(harness.broker, primary)
    await authenticate(harness.broker, unrelated)
    await harness.broker.snapshotCookies(accessRequest(primary))
    await harness.broker.snapshotCookies(accessRequest(unrelated))
    const target = harness.browser.contexts[0]
    const clearCalls = target.clearCookieCalls

    await expect(harness.broker.snapshotCookies(accessRequest(primary, {
      namespace: OTHER_NAMESPACE,
    }))).rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    await expect(harness.broker.replaceCookies({
      targetOrigin: SITE_ORIGIN,
      namespace: OTHER_NAMESPACE,
      alias: primary.alias,
      sourceAlias: unrelated.alias,
    })).rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    await expect(harness.broker.probeUserScopedRead({
      targetOrigin: SITE_ORIGIN,
      namespace: OTHER_NAMESPACE,
      contextAlias: primary.alias,
      authenticatedAsAlias: primary.alias,
    })).rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(target.clearCookieCalls).toBe(clearCalls)
    expect(target.addCookieCalls).toHaveLength(0)
    expect(harness.userScopedReadProbe).not.toHaveBeenCalled()
  })

  it('omits the fixed read probe when none is injected', () => {
    const harness = createHarness()
    expect(Object.keys(harness.broker).sort()).toEqual([
      'authenticate',
      'closeAll',
      'execute',
      'replaceCookies',
      'restoreCookies',
      'snapshotCookies',
    ])
  })

  it('rejects cookies that could escape the exact Staging host', async () => {
    const harness = createHarness({
      browserOptions: {
        cookieOverride: [{
          name: 'unsafe',
          value: 'secret-cookie-value',
          domain: '.korkru.com',
          path: '/',
          secure: true,
        }],
      },
    })
    await expect(authenticate(harness.broker, harness.accounts[0]))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(harness.browser.contexts[0].closed).toBe(true)
  })

  it('fails active operations after environment drift but still closes when writes are disabled', async () => {
    const harness = createHarness()
    const value = harness.accounts[0]
    await authenticate(harness.broker, value)
    harness.state.current = validEnvironment({ EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'false' })

    await expect(harness.broker.execute(executeRequest(value)))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    await expect(harness.broker.closeAll()).resolves.toEqual({ status: 'passed' })
  })

  it('closes every context and browser once and remains idempotent', async () => {
    const harness = createHarness()
    await authenticate(harness.broker, harness.accounts[0])
    await authenticate(harness.broker, harness.accounts[1])

    await expect(harness.broker.closeAll()).resolves.toEqual({ status: 'passed' })
    await expect(harness.broker.closeAll()).resolves.toEqual({ status: 'passed' })
    expect(harness.browser.contexts.map(context => context.closeCalls)).toEqual([1, 1])
    expect(harness.browser.closeCalls).toBe(1)
  })

  it('retains a context after its first close failure and retries it in closeAll', async () => {
    const harness = createHarness({
      browserOptions: { contextCloseModes: ['fail-once'] },
      runnerOverride: async () => ({ status: 'failed' }),
      deadlinesMs: FAST_DEADLINES,
    })
    const value = harness.accounts[0]
    await authenticate(harness.broker, value)

    await expect(harness.broker.execute(executeRequest(value)))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(harness.browser.contexts[0].closeCalls).toBe(1)
    expect(harness.browser.contexts[0].closed).toBe(false)
    await expect(harness.broker.closeAll()).resolves.toEqual({ status: 'passed' })
    expect(harness.browser.contexts[0].closeCalls).toBe(2)
  })

  it('retains a session when post-operation attestation fails and first close fails', async () => {
    const harness = createHarness({
      browserOptions: { contextCloseModes: ['fail-once'] },
      mutateAttestation: (attestation, _account, callIndex) => {
        if (callIndex === 3) attestation.appMetadata.role = 'admin'
        return attestation
      },
      deadlinesMs: FAST_DEADLINES,
    })
    const value = harness.accounts[0]
    await authenticate(harness.broker, value)

    await expect(harness.broker.execute(executeRequest(value)))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(harness.browser.contexts[0].closeCalls).toBe(1)
    expect(harness.browser.contexts[0].closed).toBe(false)
    await expect(harness.broker.closeAll()).resolves.toEqual({ status: 'passed' })
    expect(harness.browser.contexts[0].closeCalls).toBe(2)
  })

  it('tracks a late browser factory from invocation and closes its browser before cleanup passes', async () => {
    let factorySignal
    const factoryGate = deferred()
    const harness = createHarness({
      deadlinesMs: FAST_DEADLINES,
      factoryOverride: ({ request }) => {
        factorySignal = request.signal
        return factoryGate.promise
      },
    })

    await expect(authenticate(harness.broker, harness.accounts[0]))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(factorySignal.aborted).toBe(true)
    await expect(harness.broker.closeAll())
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(harness.browser.closeCalls).toBe(0)

    factoryGate.resolve({
      targetOrigin: SITE_ORIGIN,
      namespace: NAMESPACE,
      browser: harness.browser,
    })
    await vi.waitFor(() => expect(harness.browser.closeCalls).toBe(1))
    await expect(harness.broker.closeAll()).resolves.toEqual({ status: 'passed' })
  })

  it('keeps cleanup failed until an abort-ignoring attestor settles', async () => {
    let attestorSignal
    const attestorGate = deferred()
    const harness = createHarness({
      deadlinesMs: FAST_DEADLINES,
      attestOverride: input => {
        attestorSignal = input.signal
        return attestorGate.promise.then(() => defaultAttestationFromCookies(input))
      },
    })

    await expect(authenticate(harness.broker, harness.accounts[0]))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(attestorSignal.aborted).toBe(true)
    expect(harness.browser.contexts[0].closed).toBe(true)
    await expect(harness.broker.closeAll())
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)

    attestorGate.resolve()
    await vi.waitFor(() => expect(attestorSignal.aborted).toBe(true))
    await expect(harness.broker.closeAll()).resolves.toEqual({ status: 'passed' })
  })

  it('does not claim cleanup while an abort-ignoring mutation runner is unsettled', async () => {
    let runnerSignal
    const runnerGate = deferred()
    const harness = createHarness({
      deadlinesMs: FAST_DEADLINES,
      runnerOverride: input => {
        runnerSignal = input.signal
        return runnerGate.promise.then(() => ({ status: 'passed' }))
      },
    })
    const value = harness.accounts[0]
    await authenticate(harness.broker, value)

    await expect(harness.broker.execute(executeRequest(value)))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(runnerSignal.aborted).toBe(true)
    expect(harness.browser.contexts[0].closed).toBe(true)
    await expect(harness.broker.closeAll())
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)

    runnerGate.resolve()
    await vi.waitFor(() => expect(runnerSignal.aborted).toBe(true))
    await expect(harness.broker.closeAll()).resolves.toEqual({ status: 'passed' })
  })

  it('keeps cleanup failed until an abort-ignoring fixed read probe settles', async () => {
    let probeSignal
    const probeGate = deferred()
    const harness = createHarness({
      includeProbe: true,
      deadlinesMs: FAST_DEADLINES,
      probeOverride: input => {
        probeSignal = input.signal
        return probeGate.promise.then(() => ({ status: 'passed' }))
      },
    })
    const value = harness.accounts[0]
    await authenticate(harness.broker, value)

    await expect(harness.broker.probeUserScopedRead({
      targetOrigin: SITE_ORIGIN,
      namespace: NAMESPACE,
      contextAlias: value.alias,
      authenticatedAsAlias: value.alias,
    })).rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(probeSignal.aborted).toBe(true)
    expect(harness.browser.contexts[0].closed).toBe(true)
    await expect(harness.broker.closeAll())
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)

    probeGate.resolve()
    await vi.waitFor(() => expect(probeSignal.aborted).toBe(true))
    await expect(harness.broker.closeAll()).resolves.toEqual({ status: 'passed' })
  })

  it('tracks a timed-out authentication action until its late work settles', async () => {
    const clearCookiesGate = deferred()
    const harness = createHarness({
      browserOptions: { clearCookiesGates: [clearCookiesGate] },
      deadlinesMs: FAST_DEADLINES,
    })

    await expect(authenticate(harness.broker, harness.accounts[0]))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(harness.browser.contexts[0].closed).toBe(true)
    await expect(harness.broker.closeAll())
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)

    clearCookiesGate.resolve()
    await vi.waitFor(() => expect(harness.browser.contexts[0].clearCookieCalls).toBe(1))
    await expect(harness.broker.closeAll()).resolves.toEqual({ status: 'passed' })
  })

  it('bounds a never-resolving context close and retries it later', async () => {
    const harness = createHarness({
      browserOptions: { contextCloseModes: ['never'] },
      runnerOverride: async () => ({ status: 'failed' }),
      deadlinesMs: FAST_DEADLINES,
    })
    const value = harness.accounts[0]
    await authenticate(harness.broker, value)

    await expect(harness.broker.execute(executeRequest(value)))
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(harness.browser.contexts[0].closeCalls).toBe(1)
    await expect(harness.broker.closeAll())
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)

    harness.browser.contexts[0].releasePendingClose()
    await vi.waitFor(() => expect(harness.browser.contexts[0].closed).toBe(true))
    await expect(harness.broker.closeAll()).resolves.toEqual({ status: 'passed' })
    expect(harness.browser.contexts[0].closeCalls).toBe(2)
  })

  it('bounds a never-resolving browser close and retries it later', async () => {
    const harness = createHarness({
      browserOptions: { browserCloseMode: 'never' },
      deadlinesMs: FAST_DEADLINES,
    })
    await authenticate(harness.broker, harness.accounts[0])

    await expect(harness.broker.closeAll())
      .rejects.toBeInstanceOf(SebStagingBrowserSessionBlockedError)
    expect(harness.browser.closeCalls).toBe(1)
    harness.browser.releasePendingClose()
    await vi.waitFor(() => expect(harness.browser.connected).toBe(false))
    await expect(harness.broker.closeAll()).resolves.toEqual({ status: 'passed' })
    expect(harness.browser.closeCalls).toBe(2)
  })

  it('rejects unsafe deadline bounds and missing construction boundaries', () => {
    const base = {
      namespace: NAMESPACE,
      readEnvironment: () => validEnvironment(),
      browserFactory: async () => null,
      attestSession: async () => null,
      sessionOperationRunner: async () => ({ status: 'passed' }),
    }
    expect(() => createSebStagingBrowserSessionBroker({
      ...base,
      deadlinesMs: { close: 49 },
    })).toThrow(SebStagingBrowserSessionBlockedError)
    expect(() => createSebStagingBrowserSessionBroker({
      ...base,
      deadlinesMs: { close: 120_001 },
    })).toThrow(SebStagingBrowserSessionBlockedError)
    expect(() => createSebStagingBrowserSessionBroker({
      ...base,
      deadlinesMs: { unknown: 100 },
    })).toThrow(SebStagingBrowserSessionBlockedError)
    expect(() => createSebStagingBrowserSessionBroker({
      ...base,
      namespace: 'qa:seb-s5-production-1',
    })).toThrow(SebStagingBrowserSessionBlockedError)
    expect(() => createSebStagingBrowserSessionBroker({
      namespace: NAMESPACE,
      readEnvironment: () => validEnvironment(),
      browserFactory: async () => null,
      attestSession: async () => null,
    })).toThrow(SebStagingBrowserSessionBlockedError)
  })
})
