import { afterEach, describe, expect, it, vi } from 'vitest'
import { LabError, probeLab, validateConfig } from './client.mjs'
import { syntheticConfig, syntheticDiscovery, syntheticExam, syntheticToken } from './fixtures.mjs'

const json = (data, options = {}) => new Response(JSON.stringify(data), {
  headers: { 'content-type': 'application/json; charset=utf-8' }, ...options,
})
function responses(...values) {
  const fetch = vi.fn()
  for (const value of values) fetch.mockResolvedValueOnce(value)
  vi.stubGlobal('fetch', fetch)
  return fetch
}
afterEach(() => vi.unstubAllGlobals())

describe('loopback lab boundary', () => {
  it.each([
    'https://www.korkru.com', 'http://localhost:18080', 'http://127.1:18080',
    'http://2130706433:18080', 'http://[::1]:18080', 'http://127.0.0.1:80',
    'http://127.0.0.1:65536', 'http://127.0.0.1:18080/path', 'http://127.0.0.1:18080?x=1',
    'http://127.0.0.1:18080#x', 'http://u:p@127.0.0.1:18080', 'http://127.0.0.1:18080/',
  ])('rejects noncanonical or nonlab URL %s without making requests', async (baseUrl) => {
    const fetch = responses()
    await expect(probeLab({ ...syntheticConfig(), baseUrl })).rejects.toThrow('LOOPBACK_URL_REQUIRED')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('requires explicit lab flag and credentials', () => {
    expect(() => validateConfig({ ...syntheticConfig(), labOnly: false })).toThrow('LAB_CONFIG_REQUIRED')
    expect(() => validateConfig({ ...syntheticConfig(), clientSecret: '' })).toThrow('LAB_CREDENTIALS_REQUIRED')
  })
  it.each([
    { id: '../12', institutionId: 3 }, { id: 12, institutionId: -1 },
    { id: 12, institutionId: 3, startUrl: 'https://www.korkru.com/assignments' },
  ])('rejects ambiguous exam bindings', (exam) => {
    expect(() => validateConfig({ ...syntheticConfig(), exam })).toThrow(LabError)
  })
})

describe('discovery and read-only OAuth contract', () => {
  it('requests only read scope; redacts exam and token data; never issues integrity proof', async () => {
    const fetch = responses(json(syntheticDiscovery()), json(syntheticToken()), json(syntheticExam()))
    const result = await probeLab(syntheticConfig())
    expect(fetch).toHaveBeenCalledTimes(3)
    const [tokenUrl, tokenOptions] = fetch.mock.calls[1]
    expect(tokenUrl).toBe('http://127.0.0.1:18080/oauth/token')
    expect(tokenOptions.method).toBe('POST')
    expect(new URLSearchParams(tokenOptions.body).get('grant_type')).toBe('password')
    expect(new URLSearchParams(tokenOptions.body).get('scope')).toBe('read')
    expect(tokenOptions.headers.Authorization).toBe(`Basic ${Buffer.from('guiClient:SYNTHETIC-CLIENT-SECRET').toString('base64')}`)
    expect(fetch.mock.calls[2][0]).toBe('http://127.0.0.1:18080/admin-api/v1/exam/12')
    expect(fetch.mock.calls[2][1].headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(fetch.mock.calls.every(([, options]) => options.redirect === 'error')).toBe(true)
    expect(result).toEqual({
      labOnly: true, discovery: 'v1', adminReadAuthenticated: true,
      studentIntegrityVerified: false, productionGateChanged: false,
      exam: {
        bindingMatched: true, status: 'RUNNING', active: true, askCheckEnabled: true,
        numericalTrustThreshold: 0, explicitClientGrantVerified: false, policyNeedsReview: true,
      },
    })
    expect(JSON.stringify(result)).not.toContain('SYNTHETIC')
  })
  it('supports discovery/auth probe without querying any exams', async () => {
    const fetch = responses(json(syntheticDiscovery()), json(syntheticToken()))
    const { exam: _exam, ...config } = syntheticConfig()
    expect(await probeLab(config)).not.toHaveProperty('exam')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it.each(['https://www.korkru.com', 'http://127.0.0.1:19999'])('does not send credentials to advertised origin %s', async (origin) => {
    const fetch = responses(json(syntheticDiscovery(origin)))
    await expect(probeLab(syntheticConfig())).rejects.toThrow('DISCOVERY_ORIGIN_MISMATCH')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each(['https://example.invalid/oauth/token', '//example.invalid/oauth/token', '/new-token'])('rejects unrecognized token location %s', async (location) => {
    const discovery = syntheticDiscovery()
    discovery['api-versions'][0].endpoints[0].location = location
    const fetch = responses(json(discovery))
    await expect(probeLab(syntheticConfig())).rejects.toThrow('UNSUPPORTED_DISCOVERY')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('rejects duplicate discovery versions', async () => {
    const discovery = syntheticDiscovery()
    discovery['api-versions'].push(discovery['api-versions'][0])
    responses(json(discovery))
    await expect(probeLab(syntheticConfig())).rejects.toThrow('UNSUPPORTED_DISCOVERY')
  })
  it('rejects incompatible advertised authorization before sending credentials', async () => {
    const discovery = syntheticDiscovery()
    discovery['api-versions'][0].endpoints[0].authorization = 'None'
    const fetch = responses(json(discovery))
    await expect(probeLab(syntheticConfig())).rejects.toThrow('UNSUPPORTED_DISCOVERY')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each([
    { scope: 'read write' }, { scope: undefined }, { access_token: '' },
    { access_token: 'token\r\nInjected: header' }, { token_type: {} }, { expires_in: 0 },
  ])('rejects malformed or overprivileged token %j', async (override) => {
    const fetch = responses(json(syntheticDiscovery()), json({ ...syntheticToken(), ...override }))
    await expect(probeLab(syntheticConfig())).rejects.toThrow('INVALID_TOKEN')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('exact exam read binding', () => {
  it.each([{ id: 13 }, { institutionId: 4 }, { lmsSetupId: 1 }, { lmsSetupId: undefined }, {
    additionalAttributes: { ...syntheticExam().additionalAttributes, quiz_start_url: 'https://example.invalid/lab-b' },
  }])('rejects wrong exam, tenant, LMS or start URL', async (override) => {
    responses(json(syntheticDiscovery()), json(syntheticToken()), json({ ...syntheticExam(), ...override }))
    await expect(probeLab(syntheticConfig())).rejects.toThrow('EXAM_BINDING_MISMATCH')
  })
  it.each([undefined, 'true', 1])('does not treat invalid active state %s as verified', async (active) => {
    responses(json(syntheticDiscovery()), json(syntheticToken()), json({ ...syntheticExam(), active }))
    await expect(probeLab(syntheticConfig())).rejects.toThrow('INVALID_EXAM')
  })
  it('keeps missing ASK policy unknown and never assumes threshold zero disables heuristics', async () => {
    responses(json(syntheticDiscovery()), json(syntheticToken()), json({
      ...syntheticExam(), additionalAttributes: { quiz_start_url: 'https://example.invalid/lab-a' },
    }))
    expect((await probeLab(syntheticConfig())).exam).toMatchObject({
      askCheckEnabled: false, numericalTrustThreshold: null,
      explicitClientGrantVerified: false, policyNeedsReview: true,
    })
  })
})

describe('bounded, sanitized failures', () => {
  it.each([401, 403, 404, 500])('redacts response body on HTTP %s', async (status) => {
    responses(json({ error: 'SYNTHETIC-SECRET' }, { status }))
    const error = await probeLab(syntheticConfig()).catch((e) => e)
    expect(error).toBeInstanceOf(LabError)
    expect(error.message).toBe(status === 401 || status === 403 ? 'ACCESS_DENIED' : 'HTTP_ERROR')
    expect(error.cause).toBeUndefined()
  })
  it('rejects HTML, malformed JSON and JSON arrays', async () => {
    for (const response of [new Response('<html>SYNTHETIC</html>'), json([]), new Response('{broken', { headers: { 'content-type': 'application/json' } })]) {
      responses(response)
      await expect(probeLab(syntheticConfig())).rejects.toThrow(LabError)
    }
  })
  it('limits body size even without Content-Length', async () => {
    responses(json({ padding: 'x'.repeat(128 * 1024) }))
    await expect(probeLab(syntheticConfig())).rejects.toThrow('RESPONSE_TOO_LARGE')
  })
  it('rejects oversized advertised body before reading', async () => {
    responses(json({}, { headers: { 'content-type': 'application/json', 'content-length': '999999' } }))
    await expect(probeLab(syntheticConfig())).rejects.toThrow('RESPONSE_TOO_LARGE')
  })
  it('does not leak underlying connection errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('SYNTHETIC-SECRET')))
    await expect(probeLab(syntheticConfig())).rejects.toThrow('CONNECTION_FAILED')
  })
})
