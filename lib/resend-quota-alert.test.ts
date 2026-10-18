import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Webhook } from 'svix'

vi.mock('server-only', () => ({}))
import { handleResendQuotaWebhook } from './resend-quota-alert.server'
import type { QuotaAlertStore, QuotaClaim } from './resend-quota-store.server'

const now = new Date('2026-10-17T06:00:00.000Z')
const secret = `whsec_${Buffer.alloc(32, 7).toString('base64')}`
const environment = {
  NODE_ENV: 'test', RESEND_QUOTA_ALERTS_ENABLED: 'true',
  RESEND_QUOTA_API_KEY: 're_test_key_not_real', RESEND_QUOTA_WEBHOOK_SECRET: secret,
  RESEND_QUOTA_ALERT_FROM: 'alerts@mail.example.test', RESEND_QUOTA_ALERT_TO: 'owner@example.test',
  KORKRU_DEPLOYMENT_ENV: 'staging',
} satisfies NodeJS.ProcessEnv

function request(overrides: Record<string, unknown> = {}, timestamp = new Date()) {
  return signedRequest(JSON.stringify({
    type: 'email.sent', created_at: new Date().toISOString(),
    data: { email_id: 'synthetic-id', to: ['student@example.test'], subject: 'Private reset link' },
    ...overrides,
  }), timestamp)
}
function signedRequest(payload: string, timestamp = new Date()) {
  return new Request('https://staging.example.test/api/webhooks/resend', {
    method: 'POST', body: payload, headers: {
      'svix-id': 'msg_synthetic', 'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'svix-signature': new Webhook(secret).sign('msg_synthetic', timestamp, payload),
    },
  })
}
function usage(dailyUsed = 80, monthlyUsed = 800, daily: Record<string, unknown> = {}, monthly: Record<string, unknown> = {}) {
  return { emails: {
    daily: { used: dailyUsed, limit: 100, resets_at: new Date(Date.now() + 18 * 3600000).toISOString(), ...daily },
    monthly: { used: monthlyUsed, limit: 3000, resets_at: '2026-11-01T00:00:00.000Z', ...monthly },
  } }
}
function provider(dailyUsed = 80, monthlyUsed = 800) {
  return vi.fn<typeof fetch>(async url => String(url).endsWith('/usage')
    ? Response.json(usage(dailyUsed, monthlyUsed)) : Response.json({ id: 'synthetic-alert' }))
}
type Fetcher = ReturnType<typeof provider>
type ClaimResult = Awaited<ReturnType<QuotaAlertStore['claim']>>
interface Receipt extends QuotaClaim { deliveryKey: string; createdAt: number; sent: boolean }

/** Durable test boundary; no test uses the default Supabase-backed store. */
function memoryStore() {
  const receipts: Receipt[] = []
  const claim = vi.fn<QuotaAlertStore['claim']>(async input => {
    const window = receipts.filter(item => item.scope === input.scope && item.period === input.period && item.windowKey === input.windowKey)
    const existing = window.find(item => item.level === input.level)
    const result = (status: ClaimResult['status'], deliveryKey: string | null = null): ClaimResult => ({ status, deliveryKey })
    if (existing?.sent || window.some(item => item.level > input.level && item.sent)) return result('already_sent')
    if (existing && existing.payloadHash !== input.payloadHash) return result('payload_mismatch')
    if (window.some(item => item.level > input.level)) return result('ignored_higher')
    if (existing) return Date.now() - existing.createdAt >= 23 * 3600000
      ? result('delivery_uncertain') : result('ready', existing.deliveryKey)
    const receipt: Receipt = {
      ...input, createdAt: Date.now(), sent: false,
      deliveryKey: `00000000-0000-4000-8000-${String(receipts.length + 1).padStart(12, '0')}`,
    }
    receipts.push(receipt)
    return result('ready', receipt.deliveryKey)
  })
  const complete = vi.fn<QuotaAlertStore['complete']>(async key => {
    const receipt = receipts.find(item => item.deliveryKey === key)
    if (!receipt) throw new Error('unknown synthetic receipt')
    receipt.sent = true
  })
  return { claim, complete, receipts } satisfies QuotaAlertStore & { receipts: Receipt[] }
}
interface AlertBody { from: string; to: string[]; subject: string; text: string; tags: { name: string; value: string }[] }
function sends(fetcher: Fetcher) {
  return fetcher.mock.calls.filter(([url]) => String(url).endsWith('/emails')).map(([, options]) => ({
    options: options!, body: JSON.parse(options!.body as string) as AlertBody,
    key: new Headers(options!.headers).get('Idempotency-Key'),
  }))
}
const tags = (body: AlertBody) => Object.fromEntries(body.tags.map(tag => [tag.name, tag.value]))

describe('Resend quota alert webhook', () => {
  let store: ReturnType<typeof memoryStore>
  const handle = (fetcher: Fetcher, incoming = request(), env: NodeJS.ProcessEnv = environment) =>
    handleResendQuotaWebhook(incoming, env, fetcher, store)
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); store = memoryStore() })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('uses fresh account usage and the configured recipient without forwarding private metadata', async () => {
    const fetcher = provider()
    const response = await handle(fetcher)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'alert_accepted' })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0][0]).toBe('https://api.resend.com/usage')
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: 'no-store', redirect: 'error' })
    expect(fetcher.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
    const sent = sends(fetcher)[0]
    expect(sent.body.to).toEqual(['owner@example.test'])
    expect(sent.body.from).toBe('KorKru <alerts@mail.example.test>')
    expect(sent.body.subject).toContain('รายวัน')
    expect(sent.body.subject).toContain('80%')
    expect(tags(sent.body)).toEqual({ kind: 'korkru_quota_alert', quota_period: 'daily', quota_level: '80', quota_scope: 'staging', delivery_key: store.receipts[0].deliveryKey })
    expect(sent.key).toBe(`korkru-quota-v3/${store.receipts[0].deliveryKey}`)
    for (const privateValue of ['student@example.test', 'Private reset link', 'synthetic-id']) expect(sent.options.body).not.toContain(privateValue)
    expect(sent.options.redirect).toBe('error')
    expect(sent.options.signal).toBeInstanceOf(AbortSignal)
    expect(new Headers(sent.options.headers).get('Authorization')).toBe(`Bearer ${environment.RESEND_QUOTA_API_KEY}`)
    expect(store.claim).toHaveBeenCalledWith({ scope: 'staging', period: 'daily', windowKey: '2026-10-17', level: 80, payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/) })
    expect(JSON.stringify(store.claim.mock.calls)).not.toContain('owner@example.test')
    expect(JSON.stringify(store.claim.mock.calls)).not.toContain(environment.RESEND_QUOTA_API_KEY)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it.each([[79, null], [80, 80], [89, 80], [90, 90], [94, 90], [95, 95], [99, 95]])(
    'selects the highest daily threshold at %i emails (%s)', async (used, level) => {
      const fetcher = provider(used!)
      const response = await handle(fetcher)
      expect(response.status).toBe(200)
      if (level === null) {
        expect(await response.json()).toEqual({ status: 'below_threshold' })
        expect(sends(fetcher)).toHaveLength(0)
        expect(store.claim).not.toHaveBeenCalled()
      } else {
        expect(await response.json()).toEqual({ status: 'alert_accepted' })
        expect(sends(fetcher)).toHaveLength(1)
        expect(tags(sends(fetcher)[0].body)).toMatchObject({ quota_period: 'daily', quota_level: String(level) })
      }
    },
  )
  it.each([[2399, null], [2400, 80], [2699, 80], [2700, 90], [2849, 90], [2850, 95]])(
    'selects the highest monthly threshold at %i of 3000 emails (%s)', async (used, level) => {
      const fetcher = provider(1, used!)
      const response = await handle(fetcher)
      expect(response.status).toBe(200)
      if (level === null) {
        expect(await response.json()).toEqual({ status: 'below_threshold' })
        expect(sends(fetcher)).toHaveLength(0)
      } else {
        expect(await response.json()).toEqual({ status: 'alert_accepted' })
        expect(sends(fetcher)).toHaveLength(1)
        expect(sends(fetcher)[0].body.subject).toContain('รายเดือน')
        expect(tags(sends(fetcher)[0].body)).toMatchObject({ quota_period: 'monthly', quota_level: String(level) })
      }
    },
  )
  it('sends one independent highest alert for each period when both are reached', async () => {
    const fetcher = provider(90, 2850)
    expect(await (await handle(fetcher)).json()).toEqual({ status: 'alert_accepted' })
    expect(sends(fetcher).map(sent => tags(sent.body))).toEqual([
      expect.objectContaining({ quota_period: 'daily', quota_level: '90' }),
      expect.objectContaining({ quota_period: 'monthly', quota_level: '95' }),
    ])
    expect(store.receipts.every(item => item.sent)).toBe(true)
    expect(new Set(sends(fetcher).map(sent => sent.key)).size).toBe(2)
  })
  it('keeps monthly alerts active when a paid plan removes the daily cap', async () => {
    const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/usage') ? Response.json(usage(1000, 2400, { limit: null })) : Response.json({ id: 'monthly-alert' }))
    expect(await (await handle(fetcher)).json()).toEqual({ status: 'alert_accepted' })
    expect(sends(fetcher)).toHaveLength(1)
    expect(tags(sends(fetcher)[0].body).quota_period).toBe('monthly')
    expect(store.claim.mock.calls[0][0].period).toBe('monthly')
  })
  it('returns below threshold for an unlimited daily quota and a low monthly counter', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(usage(1000, 2399, { limit: null })))
    expect(await (await handle(fetcher)).json()).toEqual({ status: 'below_threshold' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(store.claim).not.toHaveBeenCalled()
  })
  it('uses percentages of both reported caps rather than hardcoded Free counts', async () => {
    const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/usage') ? Response.json(usage(180, 4000, { limit: 200 }, { limit: 5000 })) : Response.json({ id: 'custom-cap-alert' }))
    expect((await handle(fetcher)).status).toBe(200)
    expect(sends(fetcher).map(sent => tags(sent.body))).toEqual([
      expect.objectContaining({ quota_period: 'daily', quota_level: '90' }),
      expect.objectContaining({ quota_period: 'monthly', quota_level: '80' }),
    ])
  })
  it('does not resend completed daily or monthly alerts on another ordinary event', async () => {
    const fetcher = provider(80, 2400)
    expect(await (await handle(fetcher)).json()).toEqual({ status: 'alert_accepted' })
    expect(await (await handle(fetcher)).json()).toEqual({ status: 'already_alerted' })
    expect(sends(fetcher)).toHaveLength(2)
  })
  it('keeps the same payload and UUID key across concurrent events as usage rises', async () => {
    let used = 80
    const accepted = new Map<string, string>()
    const fetcher = vi.fn<typeof fetch>(async (url, options) => {
      if (String(url).endsWith('/usage')) return Response.json(usage(used++, 2400 + used))
      const key = new Headers(options!.headers).get('Idempotency-Key')!
      const body = options!.body as string
      if (accepted.has(key)) expect(accepted.get(key)).toBe(body)
      accepted.set(key, body)
      return Response.json({ id: 'same-provider-id' })
    })
    const responses = await Promise.all([0, 1, 2].map(() => handle(fetcher)))
    expect(responses.map(response => response.status)).toEqual([200, 200, 200])
    expect(accepted.size).toBe(2)
    expect([...accepted.keys()].every(key => /^korkru-quota-v3\/[a-f0-9-]{36}$/.test(key))).toBe(true)
    for (const period of ['daily', 'monthly']) {
      const hashes = store.claim.mock.calls.filter(([input]) => input.period === period).map(([input]) => input.payloadHash)
      expect(new Set(hashes).size).toBe(1)
    }
  })
  it.each(['daily', 'monthly'] as const)('keeps a pending %s payload stable as both counters and the daily reset move', async period => {
    let attempt = 0
    const fetcher = vi.fn<typeof fetch>(async url => {
      if (String(url).endsWith('/usage')) return Response.json(period === 'daily'
        ? usage(80 + attempt, 800 + attempt * 100, { resets_at: attempt === 0 ? '2026-10-18T00:00:00.000Z' : '2026-10-18T05:00:00.000Z' })
        : usage(1 + attempt * 30, 2400 + attempt))
      if (++attempt === 1) throw new Error('timeout after provider accepted a private payload')
      return Response.json({ id: 'same-provider-id' })
    })
    expect(await (await handle(fetcher)).json()).toEqual({ error: 'alert_unavailable' })
    expect(await (await handle(fetcher)).json()).toEqual({ status: 'alert_accepted' })
    expect(sends(fetcher)).toHaveLength(2)
    expect(new Set(sends(fetcher).map(sent => sent.key)).size).toBe(1)
    expect(new Set(sends(fetcher).map(sent => sent.options.body)).size).toBe(1)
    expect(tags(sends(fetcher)[0].body).quota_period).toBe(period)
  })
  it('deduplicates 80, 90 and 95 independently for both periods across concurrent events', async () => {
    let daily = 80
    let monthly = 2400
    const accepted = new Set<string>()
    const fetcher = vi.fn<typeof fetch>(async (url, options) => {
      if (String(url).endsWith('/usage')) return Response.json(usage(daily, monthly))
      accepted.add(new Headers(options!.headers).get('Idempotency-Key')!)
      return Response.json({ id: 'deduped-provider-id' })
    })
    for (const [d, m] of [[80, 2400], [81, 2401], [90, 2700], [91, 2701], [95, 2850], [96, 2851]]) {
      daily = d; monthly = m
      await Promise.all([handle(fetcher), handle(fetcher)])
    }
    expect(accepted.size).toBe(6)
    for (const period of ['daily', 'monthly']) expect(store.receipts.filter(item => item.period === period).map(item => item.level)).toEqual([80, 90, 95])
  })
  it('does not send lower-level alerts when either counter later decreases', async () => {
    let daily = 95
    let monthly = 2850
    const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/usage') ? Response.json(usage(daily, monthly)) : Response.json({ id: 'high-water-alert' }))
    await handle(fetcher)
    daily = 80; monthly = 2400
    expect(await (await handle(fetcher)).json()).toEqual({ status: 'already_alerted' })
    expect(sends(fetcher)).toHaveLength(2)
  })
  it('retains a completed monthly receipt after the provider idempotency key expires', async () => {
    const fetcher = provider(1, 2400)
    await handle(fetcher)
    vi.setSystemTime(new Date('2026-10-18T07:00:00.000Z'))
    expect(await (await handle(fetcher)).json()).toEqual({ status: 'already_alerted' })
    expect(sends(fetcher)).toHaveLength(1)
    expect(store.receipts[0].windowKey).toBe('2026-11-01T00:00:00.000Z')
  })
  it('opens a new daily notification day without resending the monthly alert', async () => {
    const fetcher = provider(80, 2400)
    await handle(fetcher)
    vi.setSystemTime(new Date('2026-10-18T00:00:01.000Z'))
    expect(await (await handle(fetcher)).json()).toEqual({ status: 'alert_accepted' })
    expect(sends(fetcher).map(sent => tags(sent.body).quota_period)).toEqual(['daily', 'monthly', 'daily'])
    expect(store.receipts.filter(item => item.period === 'daily').map(item => item.windowKey)).toEqual(['2026-10-17', '2026-10-18'])
    expect(new Set(sends(fetcher).map(sent => sent.key)).size).toBe(3)
  })
  it('opens a new monthly window from the provider reset instant', async () => {
    let reset = '2026-11-01T00:00:00.000Z'
    const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/usage') ? Response.json(usage(1, 2850, {}, { resets_at: reset })) : Response.json({ id: 'new-month-alert' }))
    await handle(fetcher)
    vi.setSystemTime(new Date('2026-11-01T06:00:00.000Z'))
    reset = '2026-12-01T00:00:00.000Z'
    expect(await (await handle(fetcher)).json()).toEqual({ status: 'alert_accepted' })
    expect(store.receipts.map(item => item.windowKey)).toEqual(['2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z'])
    expect(new Set(sends(fetcher).map(sent => sent.key)).size).toBe(2)
  })
  it('canonicalizes a non-calendar monthly reset without assuming the first of a month', async () => {
    const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/usage') ? Response.json(usage(1, 2400, {}, { resets_at: '2026-11-02T13:45:00Z' })) : Response.json({ id: 'provider-month-window' }))
    expect((await handle(fetcher)).status).toBe(200)
    expect(store.claim.mock.calls[0][0].windowKey).toBe('2026-11-02T13:45:00.000Z')
  })
  it('uses the UTC notification day when the daily reset is a moving future instant', async () => {
    const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/usage') ? Response.json(usage(80, 800, { resets_at: '2026-10-18T05:00:00.000Z' })) : Response.json({ id: 'moving-daily-window' }))
    expect((await handle(fetcher)).status).toBe(200)
    expect(store.claim.mock.calls[0][0].windowKey).toBe('2026-10-17')
    expect(sends(fetcher)[0].body.text).toContain('2026-10-17 UTC')
    expect(sends(fetcher)[0].body.text).not.toContain('2026-10-18T05:00:00')
  })
  it('keeps receipts separate across deployment scopes', async () => {
    const fetcher = provider()
    await handle(fetcher)
    await handle(fetcher, request(), { ...environment, KORKRU_DEPLOYMENT_ENV: 'production' })
    expect(store.receipts.map(item => item.scope)).toEqual(['staging', 'production'])
    expect(new Set(sends(fetcher).map(sent => sent.key)).size).toBe(2)
  })
  it('checks inbound events because received emails consume both quotas', async () => {
    const fetcher = provider(80, 2400)
    expect((await handle(fetcher, request({ type: 'email.received' }))).status).toBe(200)
    expect(sends(fetcher)).toHaveLength(2)
  })
  it('ignores irrelevant signed events before reading usage or the ledger', async () => {
    const fetcher = provider()
    expect(await (await handle(fetcher, request({ type: 'email.delivered' }))).json()).toEqual({ status: 'ignored' })
    expect(fetcher).not.toHaveBeenCalled()
    expect(store.claim).not.toHaveBeenCalled()
    expect(store.complete).not.toHaveBeenCalled()
  })
  it.each(['2026-10-16T23:59:59.000Z', '2026-10-18T00:00:00.000Z'])('reads current usage regardless of a valid signed event created_at (%s)', async createdAt => {
    const fetcher = provider(1, 2400)
    expect(await (await handle(fetcher, request({ created_at: createdAt }))).json()).toEqual({ status: 'alert_accepted' })
    expect(sends(fetcher)).toHaveLength(1)
    expect(store.claim.mock.calls[0][0].windowKey).toBe('2026-11-01T00:00:00.000Z')
  })
  it.each([
    { firstDaily: 95, firstMonthly: 2399, nextDaily: 96, nextMonthly: 2400, firstPeriod: 'daily', nextPeriod: 'monthly' },
    { firstDaily: 79, firstMonthly: 2850, nextDaily: 80, nextMonthly: 2851, firstPeriod: 'monthly', nextPeriod: 'daily' },
  ])('reevaluates the other period after its own $firstPeriod 95% alert', async scenario => {
    let daily = scenario.firstDaily
    let monthly = scenario.firstMonthly
    const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/usage') ? Response.json(usage(daily, monthly)) : Response.json({ id: 'cross-period-alert' }))
    await handle(fetcher)
    const ownTags = tags(sends(fetcher)[0].body)
    expect(ownTags.quota_period).toBe(scenario.firstPeriod)
    daily = scenario.nextDaily; monthly = scenario.nextMonthly
    expect(await (await handle(fetcher, request({ data: { tags: ownTags } }))).json()).toEqual({ status: 'alert_accepted' })
    expect(sends(fetcher).map(sent => tags(sent.body).quota_period)).toEqual([scenario.firstPeriod, scenario.nextPeriod])
    expect(store.complete).toHaveBeenCalledWith(ownTags.delivery_key)
  })
  it('does not loop when both 95% alerts produce their own events', async () => {
    const fetcher = provider(100, 3000)
    await handle(fetcher)
    for (const ownTags of sends(fetcher).map(sent => tags(sent.body))) expect(await (await handle(fetcher, request({ data: { tags: ownTags } }))).json()).toEqual({ status: 'already_alerted' })
    expect(sends(fetcher)).toHaveLength(2)
  })
  it('settles a pending send from its signed self-event before reevaluating both quotas', async () => {
    let monthly = 2399
    const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/usage') ? Response.json(usage(95, monthly)) : Response.json({ id: 'accepted-before-ledger-failure' }))
    store.complete.mockRejectedValueOnce(new Error('private ledger failure'))
    expect(await (await handle(fetcher)).json()).toEqual({ error: 'ledger_unavailable' })
    expect(store.receipts[0].sent).toBe(false)
    const ownTags = tags(sends(fetcher)[0].body)
    monthly = 2400
    expect(await (await handle(fetcher, request({ data: { tags: ownTags } }))).json()).toEqual({ status: 'alert_accepted' })
    expect(store.receipts.every(item => item.sent)).toBe(true)
    expect(sends(fetcher).map(sent => tags(sent.body).quota_period)).toEqual(['daily', 'monthly'])
    expect(store.complete.mock.invocationCallOrder[1]).toBeLessThan(fetcher.mock.invocationCallOrder[2])
  })
  it.each([
    { kind: 'korkru_quota_alert' },
    { kind: 'korkru_quota_alert', quota_scope: 'production', delivery_key: '00000000-0000-4000-8000-000000000001' },
    { kind: 'korkru_quota_alert', quota_scope: 'staging', delivery_key: 'not-a-uuid' },
  ])('does not treat incomplete or other-scope self tags as delivery proof: %j', async eventTags => {
    const fetcher = provider(79, 2399)
    expect(await (await handle(fetcher, request({ data: { tags: eventTags } }))).json()).toEqual({ status: 'below_threshold' })
    expect(store.complete).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('does not finalize delivery from an inbound event carrying copied self tags', async () => {
    const fetcher = provider(79, 2399)
    const response = await handle(fetcher, request({ type: 'email.received', data: { tags: { kind: 'korkru_quota_alert', quota_scope: 'staging', delivery_key: '00000000-0000-4000-8000-000000000001' } } }))
    expect(await response.json()).toEqual({ status: 'below_threshold' })
    expect(store.complete).not.toHaveBeenCalled()
  })
  it('does not acknowledge a self-event when its ledger completion fails', async () => {
    const fetcher = provider()
    store.complete.mockRejectedValueOnce(new Error('private ledger failure'))
    const response = await handle(fetcher, request({ data: { tags: { kind: 'korkru_quota_alert', quota_scope: 'staging', delivery_key: '00000000-0000-4000-8000-000000000001' } } }))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'ledger_unavailable' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects missing signatures and tampering before provider or ledger calls', async () => {
    const fetcher = provider()
    expect((await handle(fetcher, new Request('https://example.test', { method: 'POST', body: '{}' }))).status).toBe(400)
    const signed = request()
    const tampered = new Request(signed.url, { method: 'POST', headers: signed.headers, body: (await signed.text()).replace('email.sent', 'email.received') })
    expect((await handle(fetcher, tampered)).status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
    expect(store.claim).not.toHaveBeenCalled()
    expect(store.complete).not.toHaveBeenCalled()
  })
  it.each([-301, 301])('rejects signatures outside the timestamp tolerance (%i seconds)', async seconds => {
    const fetcher = provider()
    expect((await handle(fetcher, request({}, new Date(now.getTime() + seconds * 1000)))).status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
    expect(store.claim).not.toHaveBeenCalled()
  })
  it('rejects a signature made with the other environment secret', async () => {
    const fetcher = provider()
    expect((await handle(fetcher, request(), { ...environment, RESEND_QUOTA_WEBHOOK_SECRET: `whsec_${Buffer.alloc(32, 8).toString('base64')}` })).status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([
    { RESEND_QUOTA_ALERTS_ENABLED: 'false' }, { RESEND_QUOTA_API_KEY: '' }, { RESEND_QUOTA_WEBHOOK_SECRET: '' },
    { RESEND_QUOTA_ALERT_TO: '' }, { RESEND_QUOTA_ALERT_FROM: 'bad\r\nBcc: somebody@example.test' }, { KORKRU_DEPLOYMENT_ENV: 'preview' },
  ])('fails closed for disabled, missing or invalid configuration: %j', async overrides => {
    const fetcher = provider()
    const response = await handle(fetcher, request(), { ...environment, ...overrides })
    expect(response.status).toBe(503)
    expect(fetcher).not.toHaveBeenCalled()
    expect(store.claim).not.toHaveBeenCalled()
    expect(store.complete).not.toHaveBeenCalled()
    expect(await response.text()).not.toContain(environment.RESEND_QUOTA_API_KEY)
  })
  it('bounds a chunked request body without trusting Content-Length', async () => {
    const fetcher = provider()
    expect((await handle(fetcher, signedRequest('x'.repeat(32769)))).status).toBe(413)
    expect(fetcher).not.toHaveBeenCalled()
    expect(store.claim).not.toHaveBeenCalled()
  })
  it.each(['{', '{}', '{"type":"email.sent","created_at":"invalid","data":{}}'])('rejects malformed signed event data: %s', async payload => {
    const fetcher = provider()
    expect((await handle(fetcher, signedRequest(payload))).status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
    expect(store.claim).not.toHaveBeenCalled()
  })
  it.each([
    { period: 'daily', overrides: { used: -1 } }, { period: 'daily', overrides: { used: '80' } },
    { period: 'daily', overrides: { limit: 0 } }, { period: 'daily', overrides: { resets_at: 'invalid' } },
    { period: 'monthly', overrides: { used: -1 } }, { period: 'monthly', overrides: { used: 2400.5 } },
    { period: 'monthly', overrides: { limit: '3000' } }, { period: 'monthly', overrides: { resets_at: 'invalid' } },
  ])('does not send when $period usage is malformed ($overrides)', async ({ period, overrides }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(usage(80, 2400, period === 'daily' ? overrides : {}, period === 'monthly' ? overrides : {})))
    expect((await handle(fetcher)).status).toBe(503)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(store.claim).not.toHaveBeenCalled()
  })
  it.each([
    { period: 'daily', reset: '2026-10-17T00:00:00.000Z' }, { period: 'daily', reset: now.toISOString() },
    { period: 'daily', reset: new Date(now.getTime() + 25 * 3600000 + 1).toISOString() },
    { period: 'monthly', reset: '2026-10-16T00:00:00.000Z' }, { period: 'monthly', reset: now.toISOString() },
    { period: 'monthly', reset: new Date(now.getTime() + 35 * 86400000 + 1).toISOString() },
  ])('rejects a stale or excessive $period window before sending either alert: $reset', async ({ period, reset }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(usage(80, 2400, period === 'daily' ? { resets_at: reset } : {}, period === 'monthly' ? { resets_at: reset } : {})))
    const response = await handle(fetcher)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'usage_window_mismatch' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(store.claim).not.toHaveBeenCalled()
  })
  it.each([401, 429, 500])('returns a retryable error on Usage API failure (%i) without sending', async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('sensitive upstream error', { status }))
    const response = await handle(fetcher)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('sensitive')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(store.claim).not.toHaveBeenCalled()
  })
  it('does not expose a Usage timeout or claim a ledger receipt after it fails', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(`timeout ${environment.RESEND_QUOTA_API_KEY}`))
    const response = await handle(fetcher)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain(environment.RESEND_QUOTA_API_KEY)
    expect(store.claim).not.toHaveBeenCalled()
  })
  it.each([409, 429, 500])('does not acknowledge a provider-rejected alert (%i)', async status => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/usage') ? Response.json(usage()) : new Response('secret provider detail', { status }))
    const response = await handle(fetcher)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'alert_unavailable' })
    expect(console.error).toHaveBeenCalledWith('[resend-quota] Alert not accepted', { period: 'daily', status })
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret provider detail')
    expect(store.complete).not.toHaveBeenCalled()
  })
  it.each([{ unexpected: 'private provider detail' }, { id: '' }])('does not complete a receipt for an invalid provider acknowledgement: %j', async acknowledgement => {
    const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/usage') ? Response.json(usage()) : Response.json(acknowledgement))
    const response = await handle(fetcher)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'alert_unavailable' })
    expect(store.complete).not.toHaveBeenCalled()
  })
  it('returns a ledger error without sending when a claim fails', async () => {
    const fetcher = provider()
    store.claim.mockRejectedValueOnce(new Error('private database connection string'))
    const response = await handle(fetcher)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'ledger_unavailable' })
    expect(sends(fetcher)).toHaveLength(0)
    expect(store.complete).not.toHaveBeenCalled()
  })
  it.each(['delivery_uncertain', 'payload_mismatch'] as const)('does not send or acknowledge a %s ledger claim', async status => {
    const fetcher = provider()
    store.claim.mockResolvedValueOnce({ status, deliveryKey: null })
    const response = await handle(fetcher)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: status })
    expect(sends(fetcher)).toHaveLength(0)
    expect(store.complete).not.toHaveBeenCalled()
  })
  it('quarantines an unresolved monthly send before the provider can forget its idempotency key', async () => {
    const fetcher = vi.fn<typeof fetch>(async url => {
      if (String(url).endsWith('/usage')) return Response.json(usage(1, 2400))
      throw new Error('timeout after provider accepted')
    })
    expect(await (await handle(fetcher)).json()).toEqual({ error: 'alert_unavailable' })
    vi.setSystemTime(new Date(now.getTime() + 24 * 3600000))
    const response = await handle(fetcher)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'delivery_uncertain' })
    expect(sends(fetcher)).toHaveLength(1)
    expect(store.receipts).toHaveLength(1)
    expect(store.receipts[0].sent).toBe(false)
  })
  it('does not reuse a receipt with a changed recipient and payload', async () => {
    const fetcher = provider()
    store.complete.mockRejectedValueOnce(new Error('private ledger failure after acceptance'))
    expect(await (await handle(fetcher)).json()).toEqual({ error: 'ledger_unavailable' })
    const response = await handle(fetcher, request(), { ...environment, RESEND_QUOTA_ALERT_TO: 'different-owner@example.test' })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'payload_mismatch' })
    expect(sends(fetcher)).toHaveLength(1)
    expect(store.receipts).toHaveLength(1)
  })
  it('preserves a successful period when the other send fails and retries only the unfinished period', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let rejectDaily = true
    const fetcher = vi.fn<typeof fetch>(async (url, options) => {
      if (String(url).endsWith('/usage')) return Response.json(usage(80, 2400))
      const period = tags(JSON.parse(options!.body as string) as AlertBody).quota_period
      if (period === 'daily' && rejectDaily) return new Response('private rejection', { status: 500 })
      return Response.json({ id: `${period}-accepted` })
    })
    const first = await handle(fetcher)
    expect(first.status).toBe(503)
    expect(await first.json()).toEqual({ error: 'alert_unavailable' })
    expect(store.receipts.find(item => item.period === 'monthly')?.sent).toBe(true)
    expect(store.receipts.find(item => item.period === 'daily')?.sent).toBe(false)
    rejectDaily = false
    expect(await (await handle(fetcher)).json()).toEqual({ status: 'alert_accepted' })
    expect(sends(fetcher).map(sent => tags(sent.body).quota_period)).toEqual(['daily', 'monthly', 'daily'])
    const daily = sends(fetcher).filter(sent => tags(sent.body).quota_period === 'daily')
    expect(daily[1].key).toBe(daily[0].key)
    expect(daily[1].options.body).toBe(daily[0].options.body)
    expect(store.receipts.every(item => item.sent)).toBe(true)
    expect(await (await handle(fetcher)).json()).toEqual({ status: 'already_alerted' })
    expect(sends(fetcher)).toHaveLength(3)
  })
  it('still sends the other period when one period cannot claim its ledger receipt', async () => {
    const fetcher = provider(80, 2400)
    store.claim.mockRejectedValueOnce(new Error('private ledger failure'))
    const response = await handle(fetcher)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'ledger_unavailable' })
    expect(sends(fetcher)).toHaveLength(1)
    expect(tags(sends(fetcher)[0].body).quota_period).toBe('monthly')
    expect(store.receipts[0].sent).toBe(true)
    expect(await (await handle(fetcher)).json()).toEqual({ status: 'alert_accepted' })
    expect(sends(fetcher).map(sent => tags(sent.body).quota_period)).toEqual(['monthly', 'daily'])
  })
  it('reuses the original key if ledger finalization fails after provider acceptance', async () => {
    const fetcher = provider()
    store.complete.mockRejectedValueOnce(new Error('private database failure'))
    const response = await handle(fetcher)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'ledger_unavailable' })
    expect(await (await handle(fetcher)).json()).toEqual({ status: 'alert_accepted' })
    expect(sends(fetcher)).toHaveLength(2)
    expect(sends(fetcher)[1].key).toBe(sends(fetcher)[0].key)
    expect(sends(fetcher)[1].options.body).toBe(sends(fetcher)[0].options.body)
    expect(store.receipts).toHaveLength(1)
    expect(store.receipts[0].sent).toBe(true)
  })
  it.each(['daily', 'monthly'] as const)('does not send if its %s window expires while claiming the receipt', async period => {
    const fetcher = provider(period === 'daily' ? 80 : 1, period === 'monthly' ? 2400 : 800)
    const claim = store.claim.getMockImplementation()!
    store.claim.mockImplementationOnce(async input => {
      const result = await claim(input)
      vi.setSystemTime(new Date(period === 'daily' ? '2026-10-18T00:00:00.000Z' : '2026-11-01T00:00:00.000Z'))
      return result
    })
    const response = await handle(fetcher)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'usage_window_mismatch' })
    expect(sends(fetcher)).toHaveLength(0)
    expect(store.complete).not.toHaveBeenCalled()
  })
})
