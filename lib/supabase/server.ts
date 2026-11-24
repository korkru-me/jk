import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAuthRateLimitFetch } from '@/lib/auth/rate-limit-fetch'
import { createSupabaseTimeoutFetch } from '@/lib/supabase/request-timeout'

export async function createClient() {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

  return createServerClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: createAuthRateLimitFetch(supabaseUrl, { fetch: createSupabaseTimeoutFetch(supabaseUrl) }) },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
