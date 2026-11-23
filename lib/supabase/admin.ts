import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { createSupabaseTimeoutFetch } from '@/lib/supabase/request-timeout'

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  return createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: createSupabaseTimeoutFetch(supabaseUrl) },
    }
  )
}
