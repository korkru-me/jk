import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { shouldBypassSessionRefresh } from '@/lib/exam-screen-lab-access'

export async function proxy(request: NextRequest) {
  // Resend authenticates this exact endpoint with its signed raw body.
  // It must not require or refresh a user's Supabase session.
  if (request.nextUrl.pathname === '/api/webhooks/resend') {
    return NextResponse.next({ request })
  }
  if (shouldBypassSessionRefresh(request.nextUrl.pathname, process.env)) {
    return NextResponse.next({ request })
  }
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
