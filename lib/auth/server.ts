import 'server-only'

import { cache } from 'react'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { AUTH_UNAVAILABLE_MESSAGE } from '@/lib/auth/profile-read'
import { getSessionUser } from '@/lib/auth/session-user'

export { getSessionUser, type SessionUser } from '@/lib/auth/session-user'

// Layouts and pages render in the same request but previously each called
// Supabase Auth independently. React cache shares the verified result for
// that render pass only; it never persists a session across requests/users.
//
// The identity comes from the locally verified access token (see
// getSessionUser), not from a round trip to the Auth server.
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user }, error } = await getSessionUser(supabase)
  // An unavailable Auth service proves nothing about the session. Fail closed
  // through the error boundary instead of redirecting a signed-in user to login.
  if (isAuthRetryableFetchError(error)) throw new Error(AUTH_UNAVAILABLE_MESSAGE)
  return user
})

// Admin areas and account-security pages also ask the Auth database, so a
// session revoked by sign-out or a deleted account is refused immediately.
export const getVerifiedAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (isAuthRetryableFetchError(error)) throw new Error(AUTH_UNAVAILABLE_MESSAGE)
  return user
})
