import 'server-only'

import { cache } from 'react'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { AUTH_UNAVAILABLE_MESSAGE } from '@/lib/auth/profile-read'

// Layouts and pages render in the same request but previously each called
// Supabase Auth independently. React cache shares the verified result for
// that render pass only; it never persists a session across requests/users.
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  // An unavailable Auth service proves nothing about the session. Fail closed
  // through the error boundary instead of redirecting a signed-in user to login.
  if (isAuthRetryableFetchError(error)) throw new Error(AUTH_UNAVAILABLE_MESSAGE)
  return user
})
