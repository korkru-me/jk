import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SEB_EXAM_TRUSTED_PATHNAME_HEADER } from '@/lib/seb-exam-transport-policy'

export async function updateSession(request: NextRequest, requestHeaders?: Headers) {
  const forwardedHeaders = requestHeaders ? new Headers(requestHeaders) : new Headers(request.headers)
  if (!requestHeaders) forwardedHeaders.delete(SEB_EXAM_TRUSTED_PATHNAME_HEADER)
  let supabaseResponse = NextResponse.next({ request: { headers: forwardedHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Preserve Proxy's sanitized/canonical headers and the refreshed request cookies together.
          const cookieHeader = request.headers.get('cookie')
          if (cookieHeader === null) forwardedHeaders.delete('cookie')
          else forwardedHeaders.set('cookie', cookieHeader)
          supabaseResponse = NextResponse.next({ request: { headers: forwardedHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session cookies only — redirect logic is handled by layouts
  await supabase.auth.getSession()

  return supabaseResponse
}
