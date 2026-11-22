import { describe, expect, it, vi } from 'vitest'
import { createAuthRateLimitFetch } from './rate-limit-fetch'

describe('Auth burst retry', () => {
  it('replays only an explicitly rejected Auth request with the same body and credentials', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('{}'))
    const sleep = vi.fn(async (_ms: number) => {})
    const fetcher = createAuthRateLimitFetch('https://fixture.invalid', { fetch: send, sleep, random: () => 0 })
    await fetcher('https://fixture.invalid/auth/v1/signup', { method: 'POST', headers: { apikey: 'synthetic' }, body: '{"email":"fixture@example.test"}' })
    expect(send).toHaveBeenCalledTimes(2)
    expect(await (send.mock.calls[0][0] as Request).text()).toBe(await (send.mock.calls[1][0] as Request).text())
    expect((send.mock.calls[1][0] as Request).headers.get('apikey')).toBe('synthetic')
    expect(sleep).toHaveBeenCalledWith(500)
  })
  it.each([400, 401, 403, 500, 503])('does not retry HTTP %s', async status => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status }))
    await createAuthRateLimitFetch('https://fixture.invalid', { fetch: send })('https://fixture.invalid/auth/v1/signup', { method: 'POST' })
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('does not replay an ambiguous network failure', async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValue(new Error('network'))
    await expect(createAuthRateLimitFetch('https://fixture.invalid', { fetch: send })('https://fixture.invalid/auth/v1/signup')).rejects.toThrow('network')
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('does not retry an exhausted email quota', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"code":"over_email_send_rate_limit"}', { status: 429 }))
    await createAuthRateLimitFetch('https://fixture.invalid', { fetch: send })('https://fixture.invalid/auth/v1/signup', { method: 'POST' })
    expect(send).toHaveBeenCalledTimes(1)
  })
  it.each(['https://other.invalid/auth/v1/token', 'https://fixture.invalid/rest/v1/submissions', 'https://fixture.invalid/auth/v1/logout'])('does not retry %s', async url => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429 }))
    await createAuthRateLimitFetch('https://fixture.invalid', { fetch: send })(url)
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('honors Retry-After and returns a rejection beyond its bounded budget', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '60' } }))
    const sleep = vi.fn(async (_ms: number) => {})
    expect((await createAuthRateLimitFetch('https://fixture.invalid', { fetch: send, sleep })('https://fixture.invalid/auth/v1/token')).status).toBe(429)
    expect(send).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })
  it('bounds persistent throttling and preserves the final response', async () => {
    const send = vi.fn<typeof fetch>().mockImplementation(async () => new Response('', { status: 429 }))
    const sleep = vi.fn(async (_ms: number) => {})
    const result = await createAuthRateLimitFetch('https://fixture.invalid', { fetch: send, sleep, random: () => 0 })('https://fixture.invalid/auth/v1/user')
    expect(result.status).toBe(429)
    expect(send.mock.calls.length).toBeLessThanOrEqual(9)
    expect(sleep.mock.calls.reduce((sum, call) => sum + Number(call[0]), 0)).toBeLessThanOrEqual(40_000)
  })
})
