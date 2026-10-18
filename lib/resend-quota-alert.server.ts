import 'server-only'
import { createHash } from 'node:crypto'
import { Webhook } from 'svix'
import { z } from 'zod'
import { resendQuotaStore, type QuotaAlertStore, type QuotaLevel, type QuotaPeriod } from './resend-quota-store.server'

export const RESEND_QUOTA_LEVELS = [80, 90, 95] as const
const ALERT_KIND = 'korkru_quota_alert'
const API_ORIGIN = 'https://api.resend.com'
const MAX_BODY_BYTES = 32 * 1024

const configSchema = z.object({
  apiKey: z.string().regex(/^re_\S+$/),
  webhookSecret: z.string().regex(/^whsec_\S+$/),
  from: z.email(),
  to: z.email(),
  scope: z.enum(['local', 'staging', 'production']),
})

const eventSchema = z.object({
  type: z.string(),
  created_at: z.iso.datetime(),
  // Discard recipient addresses, subjects, IDs and other webhook metadata.
  data: z.object({ tags: z.record(z.string(), z.string()).optional() }),
})

const quotaSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().positive().nullable(),
  resets_at: z.iso.datetime(),
})
const usageSchema = z.object({ emails: z.object({ daily: quotaSchema, monthly: quotaSchema }) })

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } })
}

async function readBoundedBody(request: Request): Promise<string> {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > MAX_BODY_BYTES) {
        await reader.cancel()
        throw new Error('payload_too_large')
      }
      chunks.push(chunk.value)
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally {
    reader.releaseLock()
  }
}

/** No secrets, user email content, or provider error bodies are returned/logged.
 * Fetch is injectable so all verification can run without contacting Resend. */
export async function handleResendQuotaWebhook(
  request: Request,
  environment: NodeJS.ProcessEnv,
  fetcher: typeof fetch = fetch,
  store: QuotaAlertStore = resendQuotaStore,
) {
  if (environment.RESEND_QUOTA_ALERTS_ENABLED !== 'true') {
    return json({ error: 'not_configured' }, 503)
  }
  const configured = configSchema.safeParse({
    apiKey: environment.RESEND_QUOTA_API_KEY,
    webhookSecret: environment.RESEND_QUOTA_WEBHOOK_SECRET,
    from: environment.RESEND_QUOTA_ALERT_FROM,
    to: environment.RESEND_QUOTA_ALERT_TO,
    scope: environment.KORKRU_DEPLOYMENT_ENV
      ?? (environment.VERCEL_ENV === 'production' ? 'production' : 'local'),
  })
  if (!configured.success) return json({ error: 'not_configured' }, 503)
  const config = configured.data

  const headers = {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  }
  if (Object.values(headers).some(value => !value)) return json({ error: 'invalid_webhook' }, 400)

  let payload: string
  try {
    payload = await readBoundedBody(request)
  } catch {
    return json({ error: 'invalid_payload' }, 413)
  }
  let event: z.infer<typeof eventSchema>
  try {
    // Svix verifies the raw body, constant-time signature and timestamp tolerance.
    new Webhook(config.webhookSecret).verify(payload, headers)
    event = eventSchema.parse(JSON.parse(payload))
  } catch {
    return json({ error: 'invalid_webhook' }, 400)
  }

  if (!['email.sent', 'email.received'].includes(event.type)) return json({ status: 'ignored' })

  const authorization = `Bearer ${config.apiKey}`
  // A signed delivery event can settle a timeout/failed finalization without
  // resending. Even a 95% self-event must check the OTHER period afterwards.
  const tags = event.data.tags
  if (event.type === 'email.sent' && tags?.kind === ALERT_KIND
    && tags.quota_scope === config.scope && z.uuid().safeParse(tags.delivery_key).success) {
    try { await store.complete(tags.delivery_key) } catch {
      return json({ error: 'ledger_unavailable' }, 503)
    }
  }

  try {
    const usageResponse = await fetcher(`${API_ORIGIN}/usage`, {
      headers: { Authorization: authorization },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    })
    if (!usageResponse.ok) return json({ error: 'usage_unavailable' }, 503)
    const usage = usageSchema.safeParse(await usageResponse.json())
    if (!usage.success) return json({ error: 'usage_unavailable' }, 503)
    const now = new Date()
    const quotaDay = now.toISOString().slice(0, 10)
    const candidates: { period: QuotaPeriod; windowKey: string; level: QuotaLevel; limit: number }[] = []
    for (const period of ['daily', 'monthly'] as const) {
      const quota = usage.data.emails[period]
      // Upgrading removes only the daily cap; monthly monitoring remains active.
      if (quota.limit === null) continue
      const reset = Date.parse(quota.resets_at)
      const maximumWindow = period === 'daily' ? 25 * 3600000 : 35 * 86400000
      if (reset <= now.getTime() || reset > now.getTime() + maximumWindow) {
        return json({ error: 'usage_window_mismatch' }, 503)
      }
      const level = [...RESEND_QUOTA_LEVELS].reverse()
        .find(percent => quota.used >= Math.ceil(quota.limit! * percent / 100))
      if (level !== undefined) candidates.push({
        period, level, limit: quota.limit,
        // Daily is our notification cadence, not a claim that Resend's usage
        // counter resets at midnight. Monthly uses the provider's actual window.
        windowKey: period === 'daily' ? quotaDay : new Date(reset).toISOString(),
      })
    }
    if (!candidates.length) return json({ status: 'below_threshold' })

    const results = await Promise.allSettled(candidates.map(async candidate => {
      const { period, level, windowKey, limit } = candidate
      const label = period === 'daily' ? 'รายวัน' : 'รายเดือน'
      const windowLabel = period === 'daily' ? `${windowKey} UTC`
        : `รอบสิ้นสุด ${new Date(windowKey).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} (เวลาไทย)`
      // Immutable per-period payload: actual used count/other-period values
      // must never change the body of an existing provider idempotency key.
      const alert = {
        from: `KorKru <${config.from}>`, to: [config.to],
        subject: `[KorKru ${config.scope}] Resend โควตา${label}ถึง ${level}% แล้ว · ${windowLabel}`,
        text: [
          `Resend ของ KorKru (${config.scope}) ใช้โควตา${label}ถึงอย่างน้อย ${level}% (${Math.ceil(limit * level / 100)} จาก ${limit} ฉบับ) แล้ว`,
          `รอบแจ้งเตือน: ${windowLabel}`,
          'ยอดรวมอีเมลส่งและรับทั้ง Resend team อีเมลเตือนนี้นับใช้โควตาอีก 1 ฉบับด้วย',
          period === 'daily'
            ? 'ตรวจยอดรายวันล่าสุดจาก Resend แจ้งระดับละครั้งต่อวัน UTC (07:00–07:00 น. เวลาไทย) เวลานี้เป็นรอบแจ้งเตือน ไม่ใช่การรับรองเวลาคืนโควตาของ Resend'
            : 'แจ้งระดับละครั้งต่อรอบรายเดือนที่ Resend รายงาน แยกจากการเตือนรายวัน',
          'ตรวจยอดและเวลาคืนโควตาล่าสุด: https://resend.com/settings/usage',
          'หากต้องการเพิ่มโควตา ตรวจแพ็กเกจและอัปเกรดด้วยตนเอง: https://resend.com/settings/billing',
          'ระบบนี้ไม่อัปเกรดแพ็กเกจอัตโนมัติ เตือนที่ 80%, 90%, 95% ถ้ายอดข้ามหลายระดับจะเตือนระดับสูงสุดที่ตรวจพบ',
        ].join('\n\n'),
        tags: [
          { name: 'kind', value: ALERT_KIND }, { name: 'quota_period', value: period },
          { name: 'quota_level', value: String(level) }, { name: 'quota_scope', value: config.scope },
        ],
      }
      let claimed
      try {
        claimed = await store.claim({
          scope: config.scope, period, windowKey, level,
          payloadHash: createHash('sha256').update(JSON.stringify(alert)).digest('hex'),
        })
      } catch { throw new Error('ledger_unavailable') }
      if (claimed.status === 'already_sent' || claimed.status === 'ignored_higher') return false
      if (claimed.status !== 'ready') throw new Error(claimed.status)
      if (!claimed.deliveryKey) throw new Error('ledger_unavailable')

      // Prevent using an old notification key after the UTC date/provider
      // window expires during a slow request.
      if ((period === 'daily' && new Date().toISOString().slice(0, 10) !== windowKey)
        || (period === 'monthly' && Date.now() >= Date.parse(windowKey))) {
        throw new Error('usage_window_mismatch')
      }
      const sent = await fetcher(`${API_ORIGIN}/emails`, {
        method: 'POST', headers: {
          Authorization: authorization, 'Content-Type': 'application/json',
          'Idempotency-Key': `korkru-quota-v3/${claimed.deliveryKey}`,
        },
        body: JSON.stringify({ ...alert, tags: [...alert.tags, { name: 'delivery_key', value: claimed.deliveryKey }] }),
        signal: AbortSignal.timeout(8000), redirect: 'error',
      })
      if (!sent.ok) {
        console.error('[resend-quota] Alert not accepted', { period, status: sent.status })
        throw new Error('alert_unavailable')
      }
      if (!z.object({ id: z.string().min(1) }).safeParse(await sent.json()).success) {
        throw new Error('alert_unavailable')
      }
      try { await store.complete(claimed.deliveryKey) } catch { throw new Error('ledger_unavailable') }
      return true
    }))
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') {
      const safeErrors = ['ledger_unavailable', 'delivery_uncertain', 'payload_mismatch', 'usage_window_mismatch']
      const message = failure.reason instanceof Error ? failure.reason.message : ''
      return json({ error: safeErrors.includes(message) ? message : 'alert_unavailable' }, 503)
    }
    return json({ status: results.some(result => result.status === 'fulfilled' && result.value)
      ? 'alert_accepted' : 'already_alerted' })
  } catch {
    // A non-2xx response asks Resend to retry delivery. Do not ACK failed work.
    return json({ error: 'provider_unavailable' }, 503)
  }
}
