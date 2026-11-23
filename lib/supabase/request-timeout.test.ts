import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createAuthRateLimitFetch } from '@/lib/auth/rate-limit-fetch'
import { createSupabaseTimeoutFetch } from './request-timeout'

const ORIGIN = 'https://fixture.invalid'

function hangingFetch() {
  return vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
  }))
}

describe('Supabase request timeout', () => {
  it.each([
    ['GET', `${ORIGIN}/rest/v1/users?select=id`],
    ['HEAD', `${ORIGIN}/rest/v1/users?select=id`],
    ['GET', `${ORIGIN}/auth/v1/user`],
  ])('aborts a hung %s %s', async (method, url) => {
    const send = hangingFetch()
    const fetcher = createSupabaseTimeoutFetch(ORIGIN, { fetch: send, readTimeoutMs: 5, authUserTimeoutMs: 5 })
    await expect(fetcher(url, { method })).rejects.toMatchObject({ name: 'AbortError', message: expect.stringContaining('timed out') })
  })

  it.each([
    ['POST', `${ORIGIN}/rest/v1/users`],
    ['PATCH', `${ORIGIN}/rest/v1/users?id=eq.1`],
    ['DELETE', `${ORIGIN}/rest/v1/users?id=eq.1`],
    ['POST', `${ORIGIN}/rest/v1/rpc/commit_submission_grade`],
    ['POST', `${ORIGIN}/auth/v1/token?grant_type=refresh_token`],
    ['GET', `${ORIGIN}/storage/v1/object/bucket/file`],
    ['GET', 'https://other.invalid/rest/v1/users'],
  ])('leaves %s %s on its original transport', async (method, url) => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
    const init = { method }
    await createSupabaseTimeoutFetch(ORIGIN, { fetch: send })(url, init)
    expect(send).toHaveBeenCalledWith(url, init)
  })

  it('keeps the caller abort signal active', async () => {
    const send = hangingFetch()
    const controller = new AbortController()
    const pending = createSupabaseTimeoutFetch(ORIGIN, { fetch: send })(`${ORIGIN}/rest/v1/users`, { signal: controller.signal })
    controller.abort(new DOMException('caller stopped', 'AbortError'))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('bounds each Auth user attempt behind the 429 retry wrapper', async () => {
    const send = hangingFetch()
    const fetcher = createAuthRateLimitFetch(ORIGIN, {
      fetch: createSupabaseTimeoutFetch(ORIGIN, { fetch: send, authUserTimeoutMs: 5 }),
    })
    await expect(fetcher(`${ORIGIN}/auth/v1/user`)).rejects.toMatchObject({ name: 'AbortError' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('surfaces a timed-out read once as a query error instead of an empty success', async () => {
    const send = hangingFetch()
    const client = createClient(ORIGIN, 'synthetic-key', {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: createSupabaseTimeoutFetch(ORIGIN, { fetch: send, readTimeoutMs: 5 }) },
    })
    const { data, error } = await client.from('users').select('id').eq('id', 'fixture').single()
    expect(data).toBeNull()
    expect(error?.code).not.toBe('PGRST116')
    expect(error?.message).toContain('timed out')
    expect(send).toHaveBeenCalledTimes(1)
  })
})
