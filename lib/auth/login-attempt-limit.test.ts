import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))
import { headers } from 'next/headers'
import {
  checkLoginAttempt, clearLoginFailures, currentLoginKeys, loginAttemptKeys, loginLimitKey,
  loginLockedMessage, recordLoginFailure,
} from './login-attempt-limit.server'

const SECRET = 'synthetic-secret-not-for-production-1234'
const fetchMock = vi.fn()
const ok = (body: unknown) => new Response(JSON.stringify(body))

beforeEach(() => {
  vi.stubEnv('AUTH_FLOW_SECRET', SECRET)
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-key')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.invalid')
  vi.stubEnv('VERCEL', '')
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); fetchMock.mockReset() })

describe('per-account login limiter', () => {
  it('keys accounts case-insensitively and never sends the email or IP itself', () => {
    const keys = loginAttemptKeys(SECRET, ' Student@Example.COM ', '192.0.2.1')
    expect(keys.account).toBe(loginLimitKey(SECRET, 'account', 'student@example.com'))
    expect(keys.pair).toBe(loginLimitKey(SECRET, 'pair', 'student@example.com|192.0.2.1'))
    expect(keys.ip).toBe(loginLimitKey(SECRET, 'ip', '192.0.2.1'))
    expect(Object.values(keys).every(k => /^[a-f0-9]{64}$/.test(k!))).toBe(true)
    expect(loginAttemptKeys(SECRET, 'student@example.com', null)).toMatchObject({ pair: null, ip: null })
  })
  it('uses only the Vercel-overwritten client IP header', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.mocked(headers).mockResolvedValueOnce(new Headers({
      'x-vercel-forwarded-for': '192.0.2.1', 'x-forwarded-for': '198.51.100.9',
    }) as Awaited<ReturnType<typeof headers>>)
    const keys = await currentLoginKeys('student@example.com')
    expect(keys?.ip).toBe(loginLimitKey(SECRET, 'ip', '192.0.2.1'))
  })
  it('is switched off rather than half-configured without a strong secret', async () => {
    vi.stubEnv('AUTH_FLOW_SECRET', 'short')
    expect(await currentLoginKeys('student@example.com')).toBeNull()
    expect(await checkLoginAttempt(null)).toEqual({ allowed: true, hasFailures: false })
    expect(await recordLoginFailure(null)).toBeNull()
    await clearLoginFailures(null)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('asks a fixed RPC with the three keys and passes a lockout through', async () => {
    const keys = loginAttemptKeys(SECRET, 'student@example.com', '192.0.2.1')
    fetchMock.mockResolvedValueOnce(ok([{ allowed: false, retry_after_seconds: 299, has_failures: true }]))
    expect(await checkLoginAttempt(keys)).toEqual({ allowed: false, retryAfterSeconds: 299 })
    const [url, request] = fetchMock.mock.calls[0]
    expect(url.toString()).toBe('https://fixture.invalid/rest/v1/rpc/check_login_attempt')
    expect(JSON.parse(request.body)).toEqual({ p_account_key: keys.account, p_pair_key: keys.pair, p_ip_key: keys.ip })
    expect(request.cache).toBe('no-store')
  })
  it('reports earlier typos so a correct password can clear them', async () => {
    const keys = loginAttemptKeys(SECRET, 'student@example.com', null)
    fetchMock.mockResolvedValueOnce(ok([{ allowed: true, retry_after_seconds: 0, has_failures: true }]))
    expect(await checkLoginAttempt(keys)).toEqual({ allowed: true, hasFailures: true })
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await clearLoginFailures(keys)
    expect(fetchMock.mock.calls[1][0].toString()).toBe('https://fixture.invalid/rest/v1/rpc/clear_login_failures')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ p_account_key: keys.account, p_pair_key: null })
  })
  it('fails open when the counter is down, slow or malformed', async () => {
    const keys = loginAttemptKeys(SECRET, 'student@example.com', null)
    for (const response of [new Response('', { status: 503 }), ok([]), ok([{ allowed: false, retry_after_seconds: -1 }])]) {
      fetchMock.mockResolvedValueOnce(response)
      expect((await checkLoginAttempt(keys)).allowed).toBe(true)
    }
    fetchMock.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'))
    expect((await checkLoginAttempt(keys)).allowed).toBe(true)
  })
  it('returns the wait only when a failure locked the account', async () => {
    const keys = loginAttemptKeys(SECRET, 'student@example.com', null)
    fetchMock.mockResolvedValueOnce(ok([{ locked: false, retry_after_seconds: 0 }]))
    expect(await recordLoginFailure(keys)).toBeNull()
    fetchMock.mockResolvedValueOnce(ok([{ locked: true, retry_after_seconds: 300 }]))
    expect(await recordLoginFailure(keys)).toBe(300)
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    expect(await recordLoginFailure(keys)).toBeNull()
  })
  it('tells the student how many minutes to wait and where to reset', () => {
    expect(loginLockedMessage(299)).toContain('5 นาที')
    expect(loginLockedMessage(1)).toContain('1 นาที')
    expect(loginLockedMessage(900)).toContain('ลืมรหัสผ่าน')
  })
})
