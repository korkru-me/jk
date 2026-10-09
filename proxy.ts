import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { shouldBypassSessionRefresh } from '@/lib/exam-screen-lab-access'
import { readSebSessionSecret } from '@/lib/seb'
import {
  SEB_EXAM_CONTEXT_COOKIE_NAME,
  verifySebExamContextClaims,
} from '@/lib/seb-exam-context-core'
import {
  SEB_EXAM_TRUSTED_PATHNAME_HEADER,
  evaluateSebExamRequestPolicy,
  type SebExamRequestContext,
} from '@/lib/seb-exam-transport-policy'

function readRequestExamContext(request: NextRequest): SebExamRequestContext {
  // RequestCookies normalizes into a Map: inspect the raw header to reject duplicate markers.
  const markers = (request.headers.get('cookie') ?? '').split(';').map(part => part.trim())
    .filter(part => part.split('=', 1)[0].trim() === SEB_EXAM_CONTEXT_COOKIE_NAME)
  if (markers.length === 0) return 'absent'
  if (markers.length !== 1) return 'invalid'
  const separator = markers[0].indexOf('=')
  if (separator < 0) return 'invalid'
  const secret = readSebSessionSecret()
  if (!secret) return 'invalid'
  const claims = verifySebExamContextClaims(markers[0].slice(separator + 1), secret)
  return claims ?? 'invalid'
}

function wasOrdinaryAssetExcluded(pathname: string) {
  // Preserve the old matcher's refresh behavior only when no exam marker is present.
  return pathname.startsWith('/_next/static') || pathname.startsWith('/_next/image')
    || pathname.startsWith('/favicon.ico') || /\.(?:svg|png|jpg|jpeg|gif|webp)$/.test(pathname)
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const requestHeaders = new Headers(request.headers)
  // Never let a browser tell an app layout which page was authenticated by Proxy.
  requestHeaders.delete(SEB_EXAM_TRUSTED_PATHNAME_HEADER)
  const context = readRequestExamContext(request)
  // Retain the existing harmless Quit/lab fallback only outside restricted mode.
  if (context === 'absent' && shouldBypassSessionRefresh(pathname, process.env)) {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }
  const decision = evaluateSebExamRequestPolicy({
    pathname,
    search: request.nextUrl.search,
    method: request.method,
    hasNextAction: request.headers.has('next-action'),
    contentType: request.headers.get('content-type'),
    context,
  })
  if (!decision.allowed) {
    return NextResponse.json({ error: 'ไม่อนุญาตคำขอนี้ในโหมดข้อสอบ' }, {
      status: decision.status,
      headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    })
  }
  if (decision.route) requestHeaders.set(SEB_EXAM_TRUSTED_PATHNAME_HEADER, pathname)
  if (decision.kind === 'static'
    || (context === 'absent' && wasOrdinaryAssetExcluded(pathname))) {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }
  return await updateSession(request, requestHeaders)
}

export const config = {
  matcher: [
    // Marker-bearing requests must be gated even for image extensions and Next transports.
    '/:path*',
  ],
}
