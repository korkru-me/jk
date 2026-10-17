import 'server-only'

import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { headers } from 'next/headers'

export type EmailLimitResult =
  | { allowed: true }
  | { allowed: false; error: string; retryAfterSeconds?: number }

export function emailLimitKey(secret: string, kind: 'email' | 'ip', value: string) {
  return createHmac('sha256', secret).update(`auth-email-v1:${kind}:${value}`).digest('hex')
}

// Only Vercel's overwritten header is trusted. Never accept a caller-supplied
// x-forwarded-for as an authority to reset the network bucket.
export function trustedRequestIp(requestHeaders: Headers, onVercel: boolean) {
  if (!onVercel) return null
  const value = requestHeaders.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
  return value && isIP(value) ? value : null
}

/** Authorizes only a bounded, anonymous email-send reservation. This dedicated
 * server-to-server RPC cannot read users or accept client-selected DB operations.
 * Provider limits/CAPTCHA must ALSO be configured: direct Supabase Auth requests
 * do not pass through a Next.js action.
 */
export async function reserveAuthEmail(email: string): Promise<EmailLimitResult> {
  const secret = process.env.AUTH_FLOW_SECRET
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const unavailable: EmailLimitResult = {
    allowed: false,
    error: 'ระบบส่งอีเมลยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลังหรือติดต่อผู้ดูแล KorKru',
  }
  if (!secret || secret.length < 32 || !serviceKey || !supabaseUrl) return unavailable
  if (process.env.NODE_ENV === 'production' && process.env.KORKRU_DEPLOYMENT_ENV !== 'local'
    && process.env.VERCEL !== '1') return unavailable

  const requestHeaders = await headers()
  const ip = trustedRequestIp(requestHeaders, process.env.VERCEL === '1')
  // On hosted deployments an absent trusted IP is a configuration error, not a
  // reason to silently skip network protection. Local unit/runtime fixtures do
  // not claim network-level coverage.
  if (process.env.VERCEL === '1' && !ip) return unavailable

  try {
    const response = await fetch(new URL('/rest/v1/rpc/reserve_auth_email_request', supabaseUrl), {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_email_key: emailLimitKey(secret, 'email', email.trim().toLowerCase()),
        p_ip_key: ip ? emailLimitKey(secret, 'ip', ip) : null,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return unavailable
    const result: unknown = await response.json()
    if (!Array.isArray(result) || result.length !== 1) return unavailable
    const row = result[0] as Record<string, unknown>
    if (row.allowed === true) return { allowed: true }
    if (row.allowed !== false || typeof row.retry_after_seconds !== 'number'
      || !Number.isInteger(row.retry_after_seconds) || row.retry_after_seconds < 1
      || row.retry_after_seconds > 86400) return unavailable
    return {
      allowed: false,
      error: 'มีคำขอส่งอีเมลถี่เกินไป กรุณารอแล้วลองใหม่',
      retryAfterSeconds: row.retry_after_seconds,
    }
  } catch {
    return unavailable
  }
}
