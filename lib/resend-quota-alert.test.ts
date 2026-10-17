import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Webhook } from 'svix'

vi.mock('server-only', () => ({}))
import { handleResendQuotaWebhook } from './resend-quota-alert.server'

const now = new Date('2026-10-17T06:00:00.000Z')
const secret = `whsec_${Buffer.alloc(32, 7).toString('base64')}`
const environment = {
  NODE_ENV: 'test',
  RESEND_QUOTA_ALERTS_ENABLED: 'true',
  RESEND_QUOTA_API_KEY: 're_test_key_not_real',
  RESEND_QUOTA_WEBHOOK_SECRET: secret,
  RESEND_QUOTA_ALERT_FROM: 'alerts@mail.example.test',
  RESEND_QUOTA_ALERT_TO: 'owner@example.test',
  KORKRU_DEPLOYMENT_ENV: 'staging',
} satisfies NodeJS.ProcessEnv

function request(overrides: Record<string, unknown> = {}, timestamp = now) {
  const payload = JSON.stringify({
    type: 'email.sent', created_at: now.toISOString(),
    data: { email_id: 'synthetic-id', to: ['student@example.test'], subject: 'Private reset link' },
    ...overrides,
  })
  return signedRequest(payload, timestamp)
}

function signedRequest(payload: string, timestamp = now) {
  return new Request('https://staging.example.test/api/webhooks/resend', {
    method: 'POST', body: payload, headers: {
      'svix-id': 'msg_synthetic',
      'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'svix-signature': new Webhook(secret).sign('msg_synthetic', timestamp, payload),
    },
  })
}

function usage(used: number, overrides: Record<string, unknown> = {}) {
  return { emails: {
    daily: { used, limit: 100, resets_at: '2026-10-18T00:00:00.000Z', ...overrides },
    monthly: { used: 800, limit: 3000, resets_at: '2026-11-01T00:00:00.000Z' },
  } }
}

function provider(used = 80) {
  return vi.fn<typeof fetch>()
    .mockImplementation(async url => String(url).endsWith('/usage')
      ? Response.json(usage(used)) : Response.json({ id: 'synthetic-alert' }))
}

describe('Resend quota alert webhook', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('alerts at 80 using the account usage API and configured owner, without forwarding private metadata', async () => {
    const fetcher = provider()
    const response = await handleResendQuotaWebhook(request(), environment, fetcher)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'alert_accepted' })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0][0]).toBe('https://api.resend.com/usage')
    expect(fetcher.mock.calls[0][1]?.cache).toBe('no-store')
    const [url, options] = fetcher.mock.calls[1]
    expect(url).toBe('https://api.resend.com/emails')
    const body = JSON.parse(options!.body as string)
    expect(body.to).toEqual(['owner@example.test'])
    expect(body.from).toBe('KorKru <alerts@mail.example.test>')
    expect(body.text).toContain('80')
    expect(body.tags).toEqual([
      { name: 'kind', value: 'korkru_quota_alert' }, { name: 'quota_level', value: '80' },
    ])
    expect(options!.body).not.toContain('student@example.test')
    expect(options!.body).not.toContain('Private reset link')
    expect(options!.redirect).toBe('error')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('does not send an alert at 79', async () => {
    const fetcher = provider(79)
    const response = await handleResendQuotaWebhook(request(), environment, fetcher)
    expect(await response.json()).toEqual({ status: 'below_threshold' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('uses identical body and idempotency key across duplicate/concurrent events as usage rises', async () => {
    const sent: RequestInit[] = []
    let used = 80
    const accepted = new Map<string, string>()
    const fetcher = vi.fn<typeof fetch>(async (url, options) => {
      if (String(url).endsWith('/usage')) return Response.json(usage(used++))
      sent.push(options!)
      const key = new Headers(options!.headers).get('Idempotency-Key')!
      const body = options!.body as string
      if (accepted.has(key)) expect(accepted.get(key)).toBe(body)
      accepted.set(key, body)
      return Response.json({ id: 'same-provider-id' })
    })
    const responses = await Promise.all([
      handleResendQuotaWebhook(request(), environment, fetcher),
      handleResendQuotaWebhook(request(), environment, fetcher),
      handleResendQuotaWebhook(request(), environment, fetcher),
    ])
    expect(responses.map(response => response.status)).toEqual([200, 200, 200])
    expect(sent).toHaveLength(3)
    expect(accepted.size).toBe(1)
    expect([...accepted.keys()]).toEqual(['korkru-quota-v2/staging/2026-10-17/80'])
  })

  it('checks inbound events because received emails also consume quota', async () => {
    const fetcher = provider()
    const response = await handleResendQuotaWebhook(request({ type: 'email.received' }), environment, fetcher)
    expect(response.status).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it.each([
    { type: 'email.delivered' },
    { data: { tags: { kind: 'korkru_quota_alert' } } },
    { created_at: '2026-10-16T23:59:59.000Z' },
    { created_at: '2026-10-18T00:00:00.000Z' },
  ])('ignores other events, its own alert and old/new quota-day replays: %j', async overrides => {
    const fetcher = provider()
    const response = await handleResendQuotaWebhook(request(overrides), environment, fetcher)
    expect(await response.json()).toEqual({ status: 'ignored' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects missing signatures and tampering before any provider call', async () => {
    const fetcher = provider()
    const unsigned = new Request('https://example.test', { method: 'POST', body: '{}' })
    expect((await handleResendQuotaWebhook(unsigned, environment, fetcher)).status).toBe(400)
    const signed = request()
    const tampered = new Request(signed.url, {
      method: 'POST', headers: signed.headers, body: (await signed.text()).replace('email.sent', 'email.received'),
    })
    expect((await handleResendQuotaWebhook(tampered, environment, fetcher)).status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([-301, 301])('rejects signed requests outside the timestamp tolerance (%i seconds)', async seconds => {
    const fetcher = provider()
    const response = await handleResendQuotaWebhook(
      request({}, new Date(now.getTime() + seconds * 1000)), environment, fetcher,
    )
    expect(response.status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects a signature made with the other environment secret', async () => {
    const fetcher = provider()
    const response = await handleResendQuotaWebhook(request(), {
      ...environment, RESEND_QUOTA_WEBHOOK_SECRET: `whsec_${Buffer.alloc(32, 8).toString('base64')}`,
    }, fetcher)
    expect(response.status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    { RESEND_QUOTA_ALERTS_ENABLED: 'false' },
    { RESEND_QUOTA_API_KEY: '' },
    { RESEND_QUOTA_WEBHOOK_SECRET: '' },
    { RESEND_QUOTA_ALERT_TO: '' },
    { RESEND_QUOTA_ALERT_FROM: 'bad\r\nBcc: somebody@example.test' },
    { KORKRU_DEPLOYMENT_ENV: 'preview' },
  ])('fails closed for disabled/missing/invalid configuration: %j', async overrides => {
    const fetcher = provider()
    const response = await handleResendQuotaWebhook(request(), { ...environment, ...overrides }, fetcher)
    expect(response.status).toBe(503)
    expect(fetcher).not.toHaveBeenCalled()
    expect(await response.text()).not.toContain(environment.RESEND_QUOTA_API_KEY)
  })

  it('bounds a chunked request body without trusting Content-Length', async () => {
    const fetcher = provider()
    const response = await handleResendQuotaWebhook(signedRequest('x'.repeat(32769)), environment, fetcher)
    expect(response.status).toBe(413)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    { used: -1 }, { used: '80' }, { limit: 0 }, { resets_at: 'invalid' },
    { resets_at: '2026-10-17T00:00:00.000Z' },
  ])('does not send on malformed or stale usage: %j', async overrides => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(usage(80, overrides)))
    const response = await handleResendQuotaWebhook(request(), environment, fetcher)
    expect(response.status).toBe(503)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('skips alerts after an upgrade removes the daily limit', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(usage(1000, { limit: null })))
    const response = await handleResendQuotaWebhook(request(), environment, fetcher)
    expect(await response.json()).toEqual({ status: 'below_threshold' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each([401, 429, 500])('returns retryable status on usage API failure (%i), without sending', async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('sensitive upstream error', { status }))
    const response = await handleResendQuotaWebhook(request(), environment, fetcher)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('sensitive')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each([409, 429, 500])('does not ACK an alert rejected by the provider (%i)', async status => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(usage(80)))
      .mockResolvedValueOnce(new Response('secret provider detail', { status }))
    const response = await handleResendQuotaWebhook(request(), environment, fetcher)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('secret')
    expect(console.error).toHaveBeenCalledWith('[resend-quota] Alert not accepted', { status, exhausted: false })
  })

  it('keeps the same key/body when an accepted send times out and Resend retries the webhook', async () => {
    const bodies: string[] = []
    const keys: string[] = []
    let sends = 0
    const fetcher = vi.fn<typeof fetch>(async (url, options) => {
      if (String(url).endsWith('/usage')) return Response.json(usage(80 + sends))
      bodies.push(options!.body as string)
      keys.push(new Headers(options!.headers).get('Idempotency-Key')!)
      if (++sends === 1) throw new Error('timeout after provider accepted')
      return Response.json({ id: 'same-provider-id' })
    })
    expect((await handleResendQuotaWebhook(request(), environment, fetcher)).status).toBe(503)
    expect((await handleResendQuotaWebhook(request(), environment, fetcher)).status).toBe(200)
    expect(new Set(keys).size).toBe(1)
    expect(new Set(bodies).size).toBe(1)
  })

  it('opens a new alert window at midnight UTC (07:00 Bangkok)', async () => {
    vi.setSystemTime(new Date('2026-10-18T00:00:01.000Z'))
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(usage(80, { resets_at: '2026-10-19T00:00:00.000Z' })))
      .mockResolvedValueOnce(Response.json({ id: 'new-day-alert' }))
    const response = await handleResendQuotaWebhook(request({
      created_at: '2026-10-18T00:00:00.000Z',
    }, new Date()), environment, fetcher)
    expect(response.status).toBe(200)
    expect(new Headers(fetcher.mock.calls[1][1]!.headers).get('Idempotency-Key'))
      .toBe('korkru-quota-v2/staging/2026-10-18/80')
    expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string).text).toContain('07:00')
  })

  it.each([[80, 80], [89, 80], [90, 90], [96, 90], [97, 97], [99, 97]])(
    'selects only the highest reached level at %i emails (%i%%)', async (used, level) => {
      const fetcher = provider(used)
      expect((await handleResendQuotaWebhook(request(), environment, fetcher)).status).toBe(200)
      const body = JSON.parse(fetcher.mock.calls[1][1]!.body as string)
      expect(body.subject).toContain(`${level}%`)
      expect(body.tags).toContainEqual({ name: 'quota_level', value: String(level) })
      expect(fetcher).toHaveBeenCalledTimes(2)
    },
  )

  it('deduplicates independently at 80, 90 and 97 across retries and concurrent events', async () => {
    const accepted = new Map<string, string>()
    let used = 80
    const fetcher = vi.fn<typeof fetch>(async (url, options) => {
      if (String(url).endsWith('/usage')) return Response.json(usage(used))
      const key = new Headers(options!.headers).get('Idempotency-Key')!
      const body = options!.body as string
      if (accepted.has(key)) expect(accepted.get(key)).toBe(body)
      accepted.set(key, body)
      return Response.json({ id: 'deduped-provider-id' })
    })
    for (const count of [80, 81, 90, 91, 97, 98]) {
      used = count
      await Promise.all([0, 1].map(() => handleResendQuotaWebhook(request(), environment, fetcher)))
    }
    expect([...accepted.keys()]).toEqual([80, 90, 97].map(level => `korkru-quota-v2/staging/2026-10-17/${level}`))
  })

  it.each([[80, 90], [90, 97]])(
    'allows a %i%% alert consuming quota to trigger the next reached level %i%%', async (previous, current) => {
      const fetcher = provider(current)
      const response = await handleResendQuotaWebhook(request({ data: { tags: {
        kind: 'korkru_quota_alert', quota_level: String(previous),
      } } }), environment, fetcher)
      expect(response.status).toBe(200)
      expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string).subject).toContain(`${current}%`)
    },
  )

  it.each([[80, 81], [90, 91], [97, 98], [97, 100]])(
    'never loops when the %i%% alert is received at usage %i', async (previous, used) => {
      const fetcher = provider(used)
      const response = await handleResendQuotaWebhook(request({ data: { tags: {
        kind: 'korkru_quota_alert', quota_level: String(previous),
      } } }), environment, fetcher)
      expect(await response.json()).toEqual({ status: 'ignored' })
      expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/emails'))).toHaveLength(0)
    },
  )

  it('uses percentages of the reported cap rather than hardcoded email counts', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(usage(180, { limit: 200 })))
      .mockResolvedValueOnce(Response.json({ id: 'synthetic-alert' }))
    expect((await handleResendQuotaWebhook(request(), environment, fetcher)).status).toBe(200)
    expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string).subject).toContain('90%')
  })
})
