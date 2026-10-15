import { NextResponse } from 'next/server'
import { isCronAuthorizationValid, MIN_CRON_SECRET_LENGTH } from '@/lib/cron-auth'
import { runAttemptFinalizer } from '@/lib/attempt-finalizer.server'

export const runtime = 'nodejs'
export const maxDuration = 60

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: {
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  } })
}

export async function POST(request: Request) {
  const secret = process.env.ATTEMPT_FINALIZER_SECRET
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) return json({ error: 'not_configured' }, 503)
  if (!isCronAuthorizationValid(request.headers.get('authorization'), secret)) return json({ error: 'unauthorized' }, 401)
  try {
    const result = await runAttemptFinalizer()
    return json({ success: result.failed === 0, ...result }, result.failed ? 503 : 200)
  } catch {
    return json({ error: 'finalization_failed' }, 503)
  }
}
