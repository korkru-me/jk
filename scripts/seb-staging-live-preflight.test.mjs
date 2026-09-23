import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  SebStagingLivePreflightBlockedError,
  createSebStagingLivePreflight,
} from './seb-staging-live-preflight.mjs'

const SITE_ORIGIN = 'https://staging.korkru.com'
const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const PROJECT_REF = 'dyuxkrzeveknqgtuzpbh'
const SOURCE_REVISION = 'b'.repeat(40)
const DEPLOYMENT_ID = `dpl_${'C'.repeat(24)}`
const DEPLOYMENT_URL = 'jk-staging-safe-korkru-mes-projects.vercel.app'
const PROJECT_ID = `prj_${'P'.repeat(24)}`
const TOKEN = `vcp_${'t'.repeat(36)}`
const PROTECTION_BYPASS = `bypass_${'s'.repeat(36)}`
const REQUEST_TIMEOUT_FOR_TESTS = 5_001
const STAGING_PREFLIGHT_URL = `${SITE_ORIGIN}/exam-screen-lab/seb?view=launch&configured=0`
const BLOCKED = /SEB Staging live preflight blocked/
const PROBE_COLUMNS = Object.freeze({
  assignment_seb_config_revisions: 'assignment_id,revision,org_id,owner_id,hashed_quit_password,created_at',
  assignment_seb_config_releases: 'assignment_id,revision,org_id,owner_id,release_id,artifact_storage_path,artifact_sha256,artifact_size_bytes,config_key,browser_exam_keys,security_mode,created_at',
  submissions: 'id,assignment_id,student_id,status,exam_access_mode,seb_config_revision',
  exam_proctor_sessions: 'submission_id,exam_access_mode,seb_config_revision',
  seb_staging_qa_run_reservations: 'run_id,qa_namespace,source_sha,deployment_id,reservation_proof_sha256,state,reserved_at,cleaned_at',
})

const STAGING_HTML = `<!doctype html>
<html lang="th" data-style="playful" data-deployment-environment="staging" data-source-revision="${SOURCE_REVISION}">
  <head><meta name="robots" content="noindex, nofollow, nocache"></head>
  <body>
    <div aria-label="ระบบทดสอบ Staging" role="status">
      <span>STAGING &middot; ระบบทดสอบ</span>
    </div>
  </body>
</html>`

function runIdentity(overrides = {}) {
  return {
    runId: 'seb-s5-preflight-20260923',
    sourceRevision: SOURCE_REVISION,
    deploymentId: DEPLOYMENT_ID,
    ...overrides,
  }
}

function fullIdentity(overrides = {}) {
  const artifactSha256 = 'a'.repeat(64)
  return {
    ...runIdentity(),
    releaseId: `asr-${'1'.repeat(32)}-r3-${artifactSha256.slice(0, 16)}`,
    releaseRevision: 3,
    artifactSha256,
    ...overrides,
  }
}

function preflightRequest(identity = runIdentity(), overrides = {}) {
  return {
    schemaVersion: 1,
    stepId: 'verify-staging-isolation',
    phase: 'preflight',
    actor: 'harness',
    mutates: false,
    identity,
    ...overrides,
  }
}

function deployment(overrides = {}) {
  return {
    id: DEPLOYMENT_ID,
    name: 'jk',
    projectId: PROJECT_ID,
    readyState: 'READY',
    target: null,
    aliasAssigned: true,
    alias: ['staging.korkru.com'],
    url: DEPLOYMENT_URL,
    meta: {
      githubCommitOrg: 'korkru-me',
      githubCommitRepo: 'jk',
      githubCommitRef: 'staging',
      githubCommitSha: SOURCE_REVISION,
    },
    gitSource: {
      type: 'github',
      ref: 'staging',
      sha: SOURCE_REVISION,
    },
    ...overrides,
  }
}

function alias(overrides = {}) {
  return {
    alias: 'staging.korkru.com',
    deploymentId: DEPLOYMENT_ID,
    projectId: PROJECT_ID,
    deployment: {
      id: DEPLOYMENT_ID,
      url: DEPLOYMENT_URL,
    },
    ...overrides,
  }
}

function response(url, body, contentType, { status = 200, headers = {} } = {}) {
  const output = new Response(body, {
    status,
    headers: { 'content-type': contentType, ...headers },
  })
  Object.defineProperty(output, 'url', { configurable: true, value: url })
  return output
}

function jsonResponse(url, value, options) {
  return response(url, JSON.stringify(value), 'application/json; charset=utf-8', options)
}

function htmlResponse(url, html = STAGING_HTML, options) {
  return response(url, html, 'text/html; charset=utf-8', options)
}

function adminHarness({
  targetOrigin = SUPABASE_ORIGIN,
  projectRef = PROJECT_REF,
  supabaseUrl = targetOrigin,
  probeErrorTable = null,
} = {}) {
  const probes = []
  const publicSchema = {
    from: vi.fn(table => ({
      select: vi.fn((columns, options) => {
        const probe = { table, columns, options, limit: null, signal: null }
        const limitedQuery = {
          abortSignal: vi.fn(async signal => {
            probe.signal = signal
            probes.push(probe)
            return {
              data: null,
              error: table === probeErrorTable
                ? { code: 'SCHEMA_MISMATCH_SENTINEL' }
                : null,
            }
          }),
        }
        return {
          limit: vi.fn(limit => {
            probe.limit = limit
            return limitedQuery
          }),
        }
      }),
    })),
  }
  const client = {
    supabaseUrl,
    schema: vi.fn(name => (name === 'public' ? publicSchema : null)),
  }
  const attestation = { targetOrigin, projectRef, client }
  return { attestation, client, probes, publicSchema }
}

function createHarness({
  deploymentValue = deployment(),
  aliasValue = alias(),
  html = STAGING_HTML,
  fetchOverride,
  admin = adminHarness(),
  factoryOverride,
  tokenReader,
  protectionBypassReader,
} = {}) {
  const requests = []
  const fetchImpl = vi.fn(async (url, options) => {
    requests.push({ url, options })
    if (fetchOverride) {
      const overridden = await fetchOverride({ url, options, requests })
      if (overridden !== undefined) return overridden
    }
    const parsed = new URL(url)
    if (parsed.pathname === `/v13/deployments/${DEPLOYMENT_ID}`) {
      return jsonResponse(url, deploymentValue)
    }
    if (parsed.pathname === '/v4/aliases/staging.korkru.com') {
      return jsonResponse(url, aliasValue)
    }
    if (url === STAGING_PREFLIGHT_URL) return htmlResponse(url, html)
    throw new Error('UNEXPECTED_NETWORK_TARGET_SENTINEL')
  })
  const readVercelToken = vi.fn(tokenReader ?? (() => TOKEN))
  const readProtectionBypass = vi.fn(protectionBypassReader ?? (() => PROTECTION_BYPASS))
  const adminClientFactory = vi.fn(async (request, signal) => (
    factoryOverride ? factoryOverride({ request, signal, admin }) : admin.attestation
  ))
  const capability = createSebStagingLivePreflight({
    readVercelToken,
    readProtectionBypass,
    fetchImpl,
    adminClientFactory,
  })
  return {
    capability,
    readVercelToken,
    readProtectionBypass,
    fetchImpl,
    adminClientFactory,
    requests,
    admin,
  }
}

async function captureRejection(promise) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('EXPECTED_REJECTION_SENTINEL')
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

async function expectPending(promise) {
  let settled = false
  promise.then(
    () => { settled = true },
    () => { settled = true },
  )
  await Promise.resolve()
  expect(settled).toBe(false)
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('SEB Staging live preflight', () => {
  it('attests the exact READY staging source, canonical DOM, and Supabase schema', async () => {
    const harness = createHarness()
    const output = await harness.capability.attest(preflightRequest())

    expect(output).toEqual({
      siteOrigin: SITE_ORIGIN,
      supabaseOrigin: SUPABASE_ORIGIN,
      sourceRevision: SOURCE_REVISION,
      deploymentId: DEPLOYMENT_ID,
      branchRef: 'staging',
      readyState: 'READY',
    })
    expect(Object.keys(output)).toEqual([
      'siteOrigin',
      'supabaseOrigin',
      'sourceRevision',
      'deploymentId',
      'branchRef',
      'readyState',
    ])
    expect(Object.isFrozen(output)).toBe(true)
    expect(Object.isFrozen(harness.capability)).toBe(true)

    expect(harness.requests).toHaveLength(4)
    const deploymentRequest = new URL(harness.requests[0].url)
    expect(deploymentRequest.origin).toBe('https://api.vercel.com')
    expect(deploymentRequest.pathname).toBe(`/v13/deployments/${DEPLOYMENT_ID}`)
    expect(Object.fromEntries(deploymentRequest.searchParams)).toEqual({
      withGitRepoInfo: 'true',
      slug: 'korkru-mes-projects',
    })
    const aliasRequest = new URL(harness.requests[1].url)
    expect(aliasRequest.pathname).toBe('/v4/aliases/staging.korkru.com')
    expect(Object.fromEntries(aliasRequest.searchParams)).toEqual({
      slug: 'korkru-mes-projects',
    })
    expect(harness.requests[2].url).toBe(STAGING_PREFLIGHT_URL)
    const aliasAfterHtmlRequest = new URL(harness.requests[3].url)
    expect(aliasAfterHtmlRequest.href).toBe(aliasRequest.href)
    expect(harness.requests[0].options.headers.authorization).toBe(`Bearer ${TOKEN}`)
    expect(harness.requests[1].options.headers.authorization).toBe(`Bearer ${TOKEN}`)
    expect(harness.requests[3].options.headers.authorization).toBe(`Bearer ${TOKEN}`)
    expect(harness.requests[2].options.headers).toEqual({
      accept: 'text/html',
      'x-vercel-protection-bypass': PROTECTION_BYPASS,
    })
    expect(JSON.stringify(harness.requests[2].options.headers)).not.toContain(TOKEN)
    expect(harness.requests[0].options.headers).not.toHaveProperty('x-vercel-protection-bypass')
    expect(harness.requests[1].options.headers).not.toHaveProperty('x-vercel-protection-bypass')
    expect(harness.requests[3].options.headers).not.toHaveProperty('x-vercel-protection-bypass')
    for (const request of harness.requests) {
      expect(request.url).not.toContain(PROTECTION_BYPASS)
    }

    expect(harness.adminClientFactory).toHaveBeenCalledWith(Object.freeze({
      schemaVersion: 1,
      targetOrigin: SUPABASE_ORIGIN,
      projectRef: PROJECT_REF,
      access: 'read-only-schema-probe',
    }), expect.any(AbortSignal))
    expect(harness.adminClientFactory.mock.calls[0][1].aborted).toBe(false)
    expect(harness.admin.client.schema).toHaveBeenCalledWith('public')
    expect(harness.admin.probes).toEqual(Object.entries(PROBE_COLUMNS).map(([table, columns]) => ({
      table,
      columns,
      options: { head: true },
      limit: 1,
      signal: expect.any(AbortSignal),
    })))
    expect(harness.admin.probes.every(probe => probe.signal.aborted === false)).toBe(true)
  })

  it('accepts the full six-field runner identity without exposing release material', async () => {
    const harness = createHarness()
    const identity = fullIdentity()
    const output = await harness.capability.attest(preflightRequest(identity))

    expect(output.sourceRevision).toBe(identity.sourceRevision)
    expect(output.deploymentId).toBe(identity.deploymentId)
    expect(JSON.stringify(output)).not.toContain(identity.releaseId)
    expect(JSON.stringify(output)).not.toContain(identity.artifactSha256)
  })

  it('rejects any non-exact composite request before reading credentials or using network', async () => {
    const cases = [
      preflightRequest(runIdentity({ sourceRevision: SOURCE_REVISION.toUpperCase() })),
      preflightRequest(runIdentity({ deploymentId: 'https://staging.korkru.com' })),
      preflightRequest(runIdentity({ runId: 'seb-s5-production-data' })),
      preflightRequest({ ...runIdentity(), unexpected: 'SECRET_SENTINEL' }),
      preflightRequest(fullIdentity({ releaseRevision: 4 })),
      preflightRequest(runIdentity(), { mutates: true }),
      preflightRequest(runIdentity(), { actor: 'fixture-admin' }),
      { ...preflightRequest(), unexpected: 'SECRET_SENTINEL' },
    ]

    for (const request of cases) {
      const harness = createHarness()
      await expect(harness.capability.attest(request)).rejects.toThrow(BLOCKED)
      expect(harness.readVercelToken).not.toHaveBeenCalled()
      expect(harness.readProtectionBypass).not.toHaveBeenCalled()
      expect(harness.fetchImpl).not.toHaveBeenCalled()
      expect(harness.adminClientFactory).not.toHaveBeenCalled()
    }
  })

  it.each([
    ['not ready', { readyState: 'ERROR' }],
    ['production target', { target: 'production' }],
    ['wrong project', { name: 'lookalike' }],
    ['wrong alias', { alias: ['lookalike.korkru.com'] }],
    ['wrong repository owner', { meta: { ...deployment().meta, githubCommitOrg: 'attacker' } }],
    ['wrong repository', { meta: { ...deployment().meta, githubCommitRepo: 'lookalike' } }],
    ['wrong branch', { meta: { ...deployment().meta, githubCommitRef: 'codex/seb-completion' } }],
    ['wrong source revision', { meta: { ...deployment().meta, githubCommitSha: 'c'.repeat(40) } }],
    ['wrong git source', { gitSource: { type: 'github', ref: 'staging', sha: 'c'.repeat(40) } }],
  ])('fails closed when the Vercel deployment has %s', async (_label, override) => {
    const harness = createHarness({ deploymentValue: deployment(override) })
    await expect(harness.capability.attest(preflightRequest())).rejects.toThrow(BLOCKED)
    expect(harness.adminClientFactory).not.toHaveBeenCalled()
  })

  it.each([
    ['another deployment', alias({ deploymentId: `dpl_${'D'.repeat(24)}` })],
    ['another project', alias({ projectId: `prj_${'Q'.repeat(24)}` })],
    ['another domain', alias({ alias: 'lookalike.korkru.com' })],
    ['another deployment URL', alias({ deployment: { id: DEPLOYMENT_ID, url: 'lookalike.vercel.app' } })],
  ])('fails closed when canonical alias resolves to %s', async (_label, aliasValue) => {
    const harness = createHarness({ aliasValue })
    await expect(harness.capability.attest(preflightRequest())).rejects.toThrow(BLOCKED)
    expect(harness.adminClientFactory).not.toHaveBeenCalled()
  })

  it('fails closed when the canonical alias changes while the HTML is being attested', async () => {
    let aliasReads = 0
    const harness = createHarness({
      fetchOverride: ({ url }) => {
        if (new URL(url).pathname === '/v4/aliases/staging.korkru.com') {
          aliasReads += 1
          return jsonResponse(url, aliasReads === 1
            ? alias()
            : alias({ deploymentId: `dpl_${'R'.repeat(24)}` }))
        }
      },
    })

    await expect(harness.capability.attest(preflightRequest())).rejects.toThrow(BLOCKED)
    expect(aliasReads).toBe(2)
    expect(harness.adminClientFactory).not.toHaveBeenCalled()
  })

  it.each([
    ['missing staging marker', STAGING_HTML.replace('data-deployment-environment="staging"', '')],
    ['missing source revision marker', STAGING_HTML.replace(` data-source-revision="${SOURCE_REVISION}"`, '')],
    ['wrong source revision marker', STAGING_HTML.replace(SOURCE_REVISION, 'c'.repeat(40))],
    ['missing noindex', STAGING_HTML.replace('noindex, nofollow, nocache', 'index, follow')],
    ['missing visible badge', STAGING_HTML.replace('STAGING &middot; ระบบทดสอบ', 'ระบบทั่วไป')],
    ['badge only in script', STAGING_HTML
      .replace('<div aria-label="ระบบทดสอบ Staging" role="status">\n      <span>STAGING &middot; ระบบทดสอบ</span>\n    </div>', '')
      .replace('</body>', '<script>"STAGING · ระบบทดสอบ"</script></body>')],
  ])('fails closed for canonical DOM with %s', async (_label, html) => {
    const harness = createHarness({ html })
    await expect(harness.capability.attest(preflightRequest())).rejects.toThrow(BLOCKED)
    expect(harness.adminClientFactory).not.toHaveBeenCalled()
  })

  it('rejects a protected-page redirect instead of accepting a Vercel challenge', async () => {
    const harness = createHarness({
      fetchOverride: ({ url }) => {
        if (url === STAGING_PREFLIGHT_URL) {
          return response(url, 'PROTECTION_CHALLENGE_SECRET_SENTINEL', 'text/html', {
            status: 302,
            headers: { location: 'https://vercel.com/sso' },
          })
        }
      },
    })

    await expect(harness.capability.attest(preflightRequest())).rejects.toThrow(BLOCKED)
    const htmlRequest = harness.requests.find(request => request.url === STAGING_PREFLIGHT_URL)
    expect(htmlRequest?.options.redirect).toBe('error')
    expect(htmlRequest?.options.headers['x-vercel-protection-bypass']).toBe(PROTECTION_BYPASS)
    expect(harness.adminClientFactory).not.toHaveBeenCalled()
  })

  it('requires the canonical final URL, status, content type, and bounded response body', async () => {
    const wrongFinalUrl = createHarness({
      fetchOverride: ({ url }) => {
        if (new URL(url).pathname.startsWith('/v13/deployments/')) {
          return jsonResponse('https://lookalike.example/deployment', deployment())
        }
      },
    })
    await expect(wrongFinalUrl.capability.attest(preflightRequest())).rejects.toThrow(BLOCKED)

    const oversized = createHarness({
      fetchOverride: ({ url }) => {
        if (new URL(url).pathname.startsWith('/v13/deployments/')) {
          return jsonResponse(url, deployment(), {
            headers: { 'content-length': String(256 * 1024 + 1) },
          })
        }
      },
    })
    await expect(oversized.capability.attest(preflightRequest())).rejects.toThrow(BLOCKED)

    const wrongType = createHarness({
      fetchOverride: ({ url }) => {
        if (url === STAGING_PREFLIGHT_URL) {
          return response(url, STAGING_HTML, 'application/json')
        }
      },
    })
    await expect(wrongType.capability.attest(preflightRequest())).rejects.toThrow(BLOCKED)
  })

  it('retains and cancels an invalid response body before closeAll can report quiescence', async () => {
    const cancel = vi.fn(async () => undefined)
    const reader = {
      read: vi.fn(async () => new Promise(() => {})),
      cancel,
    }
    const harness = createHarness({
      fetchOverride: ({ url }) => {
        if (new URL(url).pathname.startsWith('/v13/deployments/')) {
          return {
            status: 403,
            ok: false,
            url,
            headers: { get: vi.fn(() => 'application/json') },
            body: { getReader: vi.fn(() => reader) },
          }
        }
      },
    })

    await expect(harness.capability.attest(preflightRequest())).rejects.toThrow(BLOCKED)
    expect(cancel).not.toHaveBeenCalled()
    await expect(harness.capability.closeAll()).resolves.toEqual({ status: 'passed' })
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('never reports closed for a malformed factory result without a close capability', async () => {
    const harness = createHarness({
      factoryOverride: () => ({
        targetOrigin: SUPABASE_ORIGIN,
        projectRef: PROJECT_REF,
        client: { supabaseUrl: SUPABASE_ORIGIN },
      }),
    })

    await expect(harness.capability.attest(preflightRequest())).rejects.toThrow(BLOCKED)
    await expect(harness.capability.closeAll()).resolves.toEqual({ status: 'failed' })
    await expect(harness.capability.closeAll()).resolves.toEqual({ status: 'failed' })
  })

  it('never reports closed when malformed factory validation itself throws', async () => {
    const malformed = new Proxy({}, {
      getPrototypeOf() {
        throw new Error('MALFORMED_FACTORY_PROXY_SENTINEL')
      },
    })
    const harness = createHarness({ factoryOverride: () => malformed })

    await expect(harness.capability.attest(preflightRequest())).rejects.toThrow(BLOCKED)
    await expect(harness.capability.closeAll()).resolves.toEqual({ status: 'failed' })
    await expect(harness.capability.closeAll()).resolves.toEqual({ status: 'failed' })
  })

  it('never reports closed after acquiring a response reader without a cancel capability', async () => {
    const malformedReader = {}
    Object.defineProperty(malformedReader, 'read', {
      get() {
        throw new Error('MALFORMED_READER_SENTINEL')
      },
    })
    const harness = createHarness({
      fetchOverride: ({ url }) => {
        if (new URL(url).pathname.startsWith('/v13/deployments/')) {
          return {
            status: 200,
            ok: true,
            url,
            headers: { get: vi.fn(() => 'application/json') },
            body: { getReader: vi.fn(() => malformedReader) },
          }
        }
      },
    })

    await expect(harness.capability.attest(preflightRequest())).rejects.toThrow(BLOCKED)
    await expect(harness.capability.closeAll()).resolves.toEqual({ status: 'failed' })
    await expect(harness.capability.closeAll()).resolves.toEqual({ status: 'failed' })
  })

  it.each([
    ['wrong origin', adminHarness({ targetOrigin: 'https://production-project.supabase.co' })],
    ['wrong project ref', adminHarness({ projectRef: 'production-project' })],
    ['wrong client target', adminHarness({ supabaseUrl: 'https://production-project.supabase.co' })],
    ['schema mismatch', adminHarness({ probeErrorTable: 'assignment_seb_config_releases' })],
  ])('fails closed for a Supabase admin capability with %s', async (_label, admin) => {
    const harness = createHarness({ admin })
    await expect(harness.capability.attest(preflightRequest())).rejects.toThrow(BLOCKED)
  })

  it('times out a stalled body stream and aborts the exact request', async () => {
    vi.useFakeTimers()
    let observedSignal = null
    const stalledBody = new ReadableStream({
      pull() {
        return new Promise(() => {})
      },
    })
    const harness = createHarness({
      fetchOverride: ({ url, options }) => {
        if (new URL(url).pathname.startsWith('/v13/deployments/')) {
          observedSignal = options.signal
          const output = new Response(stalledBody, {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
          Object.defineProperty(output, 'url', { configurable: true, value: url })
          return output
        }
      },
    })

    const pending = harness.capability.attest(preflightRequest())
    const blockedExpectation = expect(pending).rejects.toThrow(BLOCKED)
    await vi.advanceTimersByTimeAsync(5_001)
    await blockedExpectation
    expect(observedSignal?.aborted).toBe(true)
    expect(harness.adminClientFactory).not.toHaveBeenCalled()
  })

  it('redacts tokens, bypass secrets, service errors, response payloads, and logs', async () => {
    const sentinels = [
      'VERCEL_TOKEN_SECRET_SENTINEL',
      'VERCEL_BYPASS_SECRET_SENTINEL',
      'VERCEL_RESPONSE_SECRET_SENTINEL',
      'SUPABASE_SERVICE_ROLE_SECRET_SENTINEL',
    ]
    const consoleSpies = [
      vi.spyOn(console, 'debug').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
    ]
    const tokenFailure = createHarness({
      tokenReader: () => {
        throw new Error(sentinels[0])
      },
    })
    const bypassFailure = createHarness({
      protectionBypassReader: () => {
        throw new Error(sentinels[1])
      },
    })
    const responseFailure = createHarness({
      fetchOverride: ({ url }) => {
        if (new URL(url).pathname.startsWith('/v13/deployments/')) {
          return jsonResponse(url, { error: sentinels[2] }, { status: 403 })
        }
      },
    })
    const adminFailure = createHarness({
      factoryOverride: () => {
        throw new Error(sentinels[3])
      },
    })

    const failures = [tokenFailure, bypassFailure, responseFailure, adminFailure]
    const errors = []
    for (const harness of failures) {
      const error = await captureRejection(harness.capability.attest(preflightRequest()))
      errors.push(error)
      expect(error).toMatchObject({
        name: 'SebStagingLivePreflightBlockedError',
        message: 'SEB Staging live preflight blocked',
      })
      expect(Object.keys(error)).toEqual(['name'])
      expect(error).not.toHaveProperty('cause')
    }

    for (const sentinel of sentinels) {
      expect(JSON.stringify(errors)).not.toContain(sentinel)
      expect(errors.map(error => String(error)).join('\n')).not.toContain(sentinel)
      expect(consoleSpies.flatMap(spy => spy.mock.calls).flat().join('\n')).not.toContain(sentinel)
    }
    for (const harness of failures) {
      for (const request of harness.requests) {
        expect(request.url).not.toContain(PROTECTION_BYPASS)
        for (const sentinel of sentinels) expect(request.url).not.toContain(sentinel)
      }
    }
    expect(consoleSpies.every(spy => spy.mock.calls.length === 0)).toBe(true)
    expect(Object.keys(tokenFailure.capability)).toEqual(['attest', 'closeAll'])
    expect(JSON.stringify(tokenFailure.capability)).not.toContain(TOKEN)
    expect(JSON.stringify(tokenFailure.capability)).not.toContain(PROTECTION_BYPASS)
  })

  it('rejects missing constructor capabilities with one generic error', () => {
    expect(() => createSebStagingLivePreflight()).toThrow(SebStagingLivePreflightBlockedError)
    expect(() => createSebStagingLivePreflight({
      readVercelToken: () => TOKEN,
      readProtectionBypass: () => PROTECTION_BYPASS,
      fetchImpl: vi.fn(),
    })).toThrow(BLOCKED)
    expect(() => createSebStagingLivePreflight({
      readVercelToken: () => TOKEN,
      fetchImpl: vi.fn(),
      adminClientFactory: vi.fn(),
    })).toThrow(BLOCKED)
  })

  it('keeps a timed-out secret provider tracked until its ignored-abort late resolve settles', async () => {
    vi.useFakeTimers()
    const gate = deferred()
    const entered = deferred()
    let providerSignal = null
    const harness = createHarness({
      tokenReader: signal => {
        providerSignal = signal
        entered.resolve()
        return gate.promise
      },
    })
    const attestation = harness.capability.attest(preflightRequest())
    const blockedAttestation = expect(attestation).rejects.toThrow(BLOCKED)
    await entered.promise
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_FOR_TESTS)
    await blockedAttestation
    expect(providerSignal).toBeInstanceOf(AbortSignal)
    expect(providerSignal.aborted).toBe(true)

    const close = harness.capability.closeAll()
    await expectPending(close)
    gate.resolve(TOKEN)
    await expect(close).resolves.toEqual({ status: 'passed' })
    await expect(harness.capability.closeAll()).resolves.toEqual({ status: 'passed' })
    await expect(harness.capability.attest(preflightRequest())).rejects.toThrow(BLOCKED)
  })

  it('keeps a timed-out provider tracked through a late rejection without leaking it', async () => {
    vi.useFakeTimers()
    const sentinel = 'LATE_PROVIDER_SECRET_SENTINEL'
    const gate = deferred()
    const entered = deferred()
    const harness = createHarness({
      protectionBypassReader: signal => {
        entered.resolve(signal)
        return gate.promise
      },
    })
    const attestation = harness.capability.attest(preflightRequest())
    const errorPromise = captureRejection(attestation)
    const providerSignal = await entered.promise
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_FOR_TESTS)
    const error = await errorPromise
    expect(error).toBeInstanceOf(SebStagingLivePreflightBlockedError)
    expect(String(error)).not.toContain(sentinel)
    expect(providerSignal.aborted).toBe(true)

    const close = harness.capability.closeAll()
    await expectPending(close)
    gate.reject(new Error(sentinel))
    await expect(close).resolves.toEqual({ status: 'passed' })
  })

  it('fails close while an abort-ignoring fetch is unsettled, then succeeds after late settlement', async () => {
    vi.useFakeTimers()
    const gate = deferred()
    const entered = deferred()
    let fetchSignal = null
    const harness = createHarness({
      fetchOverride: ({ url, options }) => {
        if (new URL(url).pathname.startsWith('/v13/deployments/')) {
          fetchSignal = options.signal
          entered.resolve()
          return gate.promise
        }
      },
    })
    const attestation = harness.capability.attest(preflightRequest())
    const blockedAttestation = expect(attestation).rejects.toThrow(BLOCKED)
    await entered.promise
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_FOR_TESTS)
    await blockedAttestation
    expect(fetchSignal.aborted).toBe(true)

    const firstClose = harness.capability.closeAll()
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_FOR_TESTS)
    await expect(firstClose).resolves.toEqual({ status: 'failed' })
    gate.resolve(jsonResponse(
      `https://api.vercel.com/v13/deployments/${DEPLOYMENT_ID}?withGitRepoInfo=true&slug=korkru-mes-projects`,
      deployment(),
    ))
    await Promise.resolve()
    await expect(harness.capability.closeAll()).resolves.toEqual({ status: 'passed' })
  })

  it('retains a malformed late factory resource and retries its exact close obligation', async () => {
    vi.useFakeTimers()
    const gate = deferred()
    const entered = deferred()
    const closeResource = vi.fn()
      .mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValueOnce({ status: 'passed' })
    const malformedClient = {
      supabaseUrl: 'https://production-project.supabase.co',
      schema: vi.fn(),
      close: closeResource,
    }
    const harness = createHarness({
      factoryOverride: ({ signal }) => {
        entered.resolve(signal)
        return gate.promise
      },
    })
    const attestation = harness.capability.attest(preflightRequest())
    const blockedAttestation = expect(attestation).rejects.toThrow(BLOCKED)
    const factorySignal = await entered.promise
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_FOR_TESTS)
    await blockedAttestation
    expect(factorySignal.aborted).toBe(true)

    const firstClose = harness.capability.closeAll()
    await expectPending(firstClose)
    gate.resolve({
      targetOrigin: 'https://production-project.supabase.co',
      projectRef: 'production-project',
      client: malformedClient,
    })
    await expect(firstClose).resolves.toEqual({ status: 'failed' })
    expect(closeResource).toHaveBeenCalledTimes(1)
    expect(closeResource.mock.contexts[0]).toBe(malformedClient)
    expect(closeResource.mock.calls[0]).toEqual([{ signal: expect.any(AbortSignal) }])

    await expect(harness.capability.closeAll()).resolves.toEqual({ status: 'passed' })
    expect(closeResource).toHaveBeenCalledTimes(2)
  })
})
