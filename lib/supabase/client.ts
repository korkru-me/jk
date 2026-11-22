import { createBrowserClient } from '@supabase/ssr'
import { createAuthRateLimitFetch } from '@/lib/auth/rate-limit-fetch'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: createAuthRateLimitFetch(process.env.NEXT_PUBLIC_SUPABASE_URL!) } },
  )
}
