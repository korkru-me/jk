import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorizationValid, MIN_CRON_SECRET_LENGTH } from '@/lib/cron-auth'
import { MathWorkCleanupFailure, runMathWorkOrphanCleanup } from '@/lib/math-work-cleanup-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) {
    return json({ error: 'cleanup_not_configured' }, 503)
  }
  if (!isCronAuthorizationValid(request.headers.get('authorization'), secret)) {
    return json({ error: 'unauthorized' }, 401)
  }

  try {
    const dryRun = request.nextUrl.searchParams.get('dryRun') === '1'
    const result = await runMathWorkOrphanCleanup({ dryRun })
    return json({ success: true, ...result })
  } catch (error) {
    const code = error instanceof MathWorkCleanupFailure ? error.code : 'cleanup_failed'
    console.error('[math-work-cleanup] failed', { code })
    return json({ error: code }, 500)
  }
}
