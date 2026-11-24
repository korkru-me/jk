// Test-only stand-in for '@/lib/auth/session-user'. Action tests control the
// caller through a mocked `auth.getUser()`; this keeps those fixtures
// authoritative while the real token verification is covered separately in
// session-user.test.ts. Use with:
//   vi.mock('@/lib/auth/session-user', () => import('@/lib/auth/session-user-test-double'))
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionUserResult } from '@/lib/auth/session-user'

export type { SessionUser, SessionUserResult } from '@/lib/auth/session-user'

export async function getSessionUser(supabase: SupabaseClient): Promise<SessionUserResult> {
  return await supabase.auth.getUser() as unknown as SessionUserResult
}
