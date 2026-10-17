import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))
import { headers } from 'next/headers'
import { emailLimitKey, reserveAuthEmail, trustedRequestIp } from './email-request-limit.server'

const fetchMock = vi.fn()
beforeEach(() => {
  vi.stubEnv('AUTH_FLOW_SECRET', 'synthetic-secret-not-for-production-1234')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-key')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.invalid')
  vi.stubEnv('VERCEL', '')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue(new Response(JSON.stringify([{ allowed: true, retry_after_seconds: 0 }])))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks() })

describe('server auth email guard', () => {
  it('fails closed before network when its secret is missing', async () => {
    vi.stubEnv('AUTH_FLOW_SECRET', '')
    expect((await reserveAuthEmail('student@example.com')).allowed).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('sends only scoped HMAC keys to a fixed RPC', async () => {
    expect((await reserveAuthEmail('Student@Example.COM')).allowed).toBe(true)
    const [url, request] = fetchMock.mock.calls[0]
    expect(url.toString()).toBe('https://fixture.invalid/rest/v1/rpc/reserve_auth_email_request')
    expect(request.body).not.toContain('Student')
    expect(JSON.parse(request.body)).toEqual({
      p_email_key: emailLimitKey('synthetic-secret-not-for-production-1234', 'email', 'student@example.com'),
      p_ip_key: null,
    })
    expect(request.cache).toBe('no-store')
  })
  it('does not trust a caller-selected forwarding header', () => {
    expect(trustedRequestIp(new Headers({ 'x-forwarded-for': '192.0.2.1' }), true)).toBeNull()
    expect(trustedRequestIp(new Headers({ 'x-vercel-forwarded-for': 'garbage' }), true)).toBeNull()
    expect(trustedRequestIp(new Headers({ 'x-vercel-forwarded-for': '192.0.2.1' }), false)).toBeNull()
    expect(trustedRequestIp(new Headers({ 'x-vercel-forwarded-for': '2001:db8::1' }), true)).toBe('2001:db8::1')
  })
  it('requires a trusted IP on Vercel', async () => {
    vi.stubEnv('VERCEL', '1')
    expect((await reserveAuthEmail('student@example.com')).allowed).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('fails closed on an unsupported hosted proxy instead of skipping the network cap', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('KORKRU_DEPLOYMENT_ENV', 'production')
    expect((await reserveAuthEmail('student@example.com')).allowed).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('adds a separate network key when its trusted header is present', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.mocked(headers).mockResolvedValueOnce(new Headers({ 'x-vercel-forwarded-for': '192.0.2.1' }) as Awaited<ReturnType<typeof headers>>)
    await reserveAuthEmail('student@example.com')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).p_ip_key).toMatch(/^[a-f0-9]{64}$/)
  })
  it('propagates a bounded server cooldown', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{ allowed: false, retry_after_seconds: 60 }])))
    expect(await reserveAuthEmail('student@example.com')).toMatchObject({ allowed: false, retryAfterSeconds: 60 })
  })
  it('does not send when the counter service fails or gives malformed data', async () => {
    for (const response of [new Response('', { status: 503 }), new Response('[]'), new Response('[{"allowed":false,"retry_after_seconds":-1}]')]) {
      fetchMock.mockResolvedValueOnce(response)
      expect((await reserveAuthEmail('student@example.com')).allowed).toBe(false)
    }
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    expect((await reserveAuthEmail('student@example.com')).allowed).toBe(false)
  })
})
