import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { shouldBypassSessionRefresh } from '@/lib/exam-screen-lab-access'

export async function proxy(request: NextRequest) {
  if (shouldBypassSessionRefresh(request.nextUrl.pathname, process.env.NODE_ENV)) {
    return NextResponse.next({ request })
  }
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
