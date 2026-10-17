import 'server-only'
import { Webhook } from 'svix'
import { z } from 'zod'

export const RESEND_QUOTA_LEVELS = [80, 90, 97] as const
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

  const now = new Date()
  // UTC is intentional: Resend's quota day resets at 00:00 UTC (07:00 Bangkok).
  const quotaDay = now.toISOString().slice(0, 10)
  const isOwnAlert = event.data.tags?.kind === ALERT_KIND
  const ownLevel = Number(event.data.tags?.quota_level)
  if (!['email.sent', 'email.received'].includes(event.type)
    // Legacy unlevelled alerts and the final level cannot advance another
    // threshold. Lower-level alerts may themselves consume the next threshold.
    || (isOwnAlert && (!RESEND_QUOTA_LEVELS.some(level => level === ownLevel) || ownLevel === 97))
    || event.created_at.slice(0, 10) !== quotaDay) {
    return json({ status: 'ignored' })
  }

  const authorization = `Bearer ${config.apiKey}`
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
    const { daily, monthly } = usage.data.emails
    const dailyLimit = daily.limit
    const level = dailyLimit === null ? undefined : [...RESEND_QUOTA_LEVELS].reverse()
      .find(percent => daily.used >= Math.ceil(dailyLimit * percent / 100))
    if (level === undefined || daily.limit === null) {
      return json({ status: 'below_threshold' })
    }
    // A self-event can advance to a higher level, never repeat its own or a
    // lower level. This handles an alert at 89 consuming the 90th email.
    if (isOwnAlert && level <= ownLevel) return json({ status: 'ignored' })
    const nextReset = new Date(`${quotaDay}T00:00:00.000Z`).getTime() + 86400000
    // Never alert using a stale counter from the previous quota window.
    if (Date.parse(daily.resets_at) !== nextReset || new Date().toISOString().slice(0, 10) !== quotaDay) {
      return json({ error: 'usage_window_mismatch' }, 503)
    }

    // Keep each level's entire payload stable as usage changes within its band.
    // Resend rejects retries with a reused idempotency key and different body.
    const resetThai = new Date(nextReset).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
    const alert = {
      from: `KorKru <${config.from}>`,
      to: [config.to],
      subject: `[KorKru ${config.scope}] Resend ใช้โควตาถึง ${level}% แล้ว · ${quotaDay} UTC`,
      text: [
        `Resend ของ KorKru (${config.scope}) ใช้โควตารายวันถึงอย่างน้อย ${level}% (${Math.ceil(daily.limit * level / 100)} จาก ${daily.limit} ฉบับ) แล้ว`,
        'ยอดรวมทั้งอีเมลส่งและรับของ Resend team ไม่ได้จำกัดเฉพาะอีเมลรีเซ็ตรหัสผ่าน',
        `โควตาปัจจุบัน ${daily.limit} ฉบับ/วัน และ ${monthly.limit ?? 'ไม่จำกัด'} ฉบับ/เดือน อีเมลเตือนนี้นับอีก 1 ฉบับด้วย`,
        `รอบโควตาถัดไปเริ่ม ${resetThai} (เวลาไทย) หากโควตารายเดือนยังเหลือ`,
        'ตรวจยอดล่าสุด: https://resend.com/settings/usage',
        'หากต้องการเพิ่มโควตา ให้ตรวจแพ็กเกจและอัปเกรดด้วยตนเอง: https://resend.com/settings/billing',
        'ระบบนี้ไม่อัปเกรดแพ็กเกจอัตโนมัติ และเตือนที่ 80%, 90%, 97% ระดับละครั้งต่อวัน UTC ถ้ายอดข้ามหลายระดับจะเตือนระดับสูงสุดที่ตรวจพบ',
      ].join('\n\n'),
      tags: [{ name: 'kind', value: ALERT_KIND }, { name: 'quota_level', value: String(level) }],
    }
    const sent = await fetcher(`${API_ORIGIN}/emails`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        'Idempotency-Key': `korkru-quota-v2/${config.scope}/${quotaDay}/${level}`,
      },
      body: JSON.stringify(alert),
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    })
    if (!sent.ok) {
      // A retry after quota exhaustion may still succeed via the same
      // idempotency key if Resend already accepted the alert before a timeout.
      const exhausted = daily.used >= daily.limit
        || (monthly.limit !== null && monthly.used >= monthly.limit)
      console.error('[resend-quota] Alert not accepted', { status: sent.status, exhausted })
      return json({ error: exhausted ? 'quota_exhausted' : 'alert_unavailable' }, 503)
    }
    const result = z.object({ id: z.string().min(1) }).safeParse(await sent.json())
    if (!result.success) return json({ error: 'alert_unavailable' }, 503)
    return json({ status: 'alert_accepted' })
  } catch {
    // A non-2xx response asks Resend to retry delivery. Do not ACK failed work.
    return json({ error: 'provider_unavailable' }, 503)
  }
}
