import 'server-only'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// Layouts and pages render in the same request but previously each called
// Supabase Auth independently. React cache shares the verified result for
// that render pass only; it never persists a session across requests/users.
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})
