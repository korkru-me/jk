import 'server-only'

import { createHmac } from 'node:crypto'
import { headers } from 'next/headers'
import { trustedRequestIp } from '@/lib/auth/email-request-limit.server'

/** Per-account protection against password guessing that lives in our own
 * database, so the hosted Auth per-IP limit (which every student shares when
 * they sign in through our server) can be raised for exam-day bursts.
 *
 * Only failed passwords are counted. The gate FAILS OPEN: if the counter is
 * unavailable, sign-in carries on and the hosted Auth limit still applies.
 * Blocking every student because a counter table is slow or not yet migrated
 * would turn a protection into an outage on exam day.
 */
export type LoginAttemptKeys = { account: string; pair: string | null; ip: string | null }
export type LoginGate =
  | { allowed: true; hasFailures: boolean }
  | { allowed: false; retryAfterSeconds: number }

const RPC_TIMEOUT_MS = 3000
const MAX_WAIT_SECONDS = 86400

export function loginLimitKey(secret: string, kind: 'account' | 'pair' | 'ip', value: string) {
  return createHmac('sha256', secret).update(`auth-login-v1:${kind}:${value}`).digest('hex')
}

export function loginAttemptKeys(secret: string, email: string, ip: string | null): LoginAttemptKeys {
  const account = email.trim().toLowerCase()
  return {
    account: loginLimitKey(secret, 'account', account),
    pair: ip ? loginLimitKey(secret, 'pair', `${account}|${ip}`) : null,
    ip: ip ? loginLimitKey(secret, 'ip', ip) : null,
  }
}

function config() {
  const secret = process.env.AUTH_FLOW_SECRET
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!secret || secret.length < 32 || !serviceKey || !supabaseUrl) return null
  return { secret, serviceKey, supabaseUrl }
}

async function rpc(name: string, body: Record<string, string | null>): Promise<unknown> {
  const c = config()
  if (!c) throw new Error('login limiter not configured')
  const response = await fetch(new URL(`/rest/v1/rpc/${name}`, c.supabaseUrl), {
    method: 'POST',
    headers: {
      apikey: c.serviceKey,
      Authorization: `Bearer ${c.serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`${name} ${response.status}`)
  return response.status === 204 ? null : response.json()
}

function waitSeconds(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_WAIT_SECONDS
    ? value
    : null
}

/** Keys for this request, or null when the limiter is not configured. */
export async function currentLoginKeys(email: string): Promise<LoginAttemptKeys | null> {
  const c = config()
  if (!c) return null
  const ip = trustedRequestIp(await headers(), process.env.VERCEL === '1')
  return loginAttemptKeys(c.secret, email, ip)
}

export async function checkLoginAttempt(keys: LoginAttemptKeys | null): Promise<LoginGate> {
  if (!keys) return { allowed: true, hasFailures: false }
  try {
    const result = await rpc('check_login_attempt', {
      p_account_key: keys.account, p_pair_key: keys.pair, p_ip_key: keys.ip,
    })
    const row = Array.isArray(result) && result.length === 1 ? result[0] as Record<string, unknown> : null
    if (row?.allowed === false) {
      const wait = waitSeconds(row.retry_after_seconds)
      if (wait) return { allowed: false, retryAfterSeconds: wait }
    }
    return { allowed: true, hasFailures: row?.has_failures === true }
  } catch (error) {
    console.error('[login-limit] check unavailable, continuing', error instanceof Error ? error.message : error)
    return { allowed: true, hasFailures: false }
  }
}

/** Returns the wait in seconds when this failure started (or hit) a lockout. */
export async function recordLoginFailure(keys: LoginAttemptKeys | null): Promise<number | null> {
  if (!keys) return null
  try {
    const result = await rpc('record_login_failure', {
      p_account_key: keys.account, p_pair_key: keys.pair, p_ip_key: keys.ip,
    })
    const row = Array.isArray(result) && result.length === 1 ? result[0] as Record<string, unknown> : null
    return row?.locked === true ? waitSeconds(row.retry_after_seconds) : null
  } catch (error) {
    console.error('[login-limit] record unavailable', error instanceof Error ? error.message : error)
    return null
  }
}

export async function clearLoginFailures(keys: LoginAttemptKeys | null): Promise<void> {
  if (!keys) return
  try {
    await rpc('clear_login_failures', { p_account_key: keys.account, p_pair_key: keys.pair })
  } catch (error) {
    console.error('[login-limit] clear unavailable', error instanceof Error ? error.message : error)
  }
}

export function loginLockedMessage(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  return `ใส่รหัสผ่านไม่ถูกต้องหลายครั้ง กรุณารอ ${minutes} นาทีแล้วลองใหม่ หรือกด "ลืมรหัสผ่าน?" เพื่อตั้งรหัสใหม่`
}
