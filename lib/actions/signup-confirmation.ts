'use server'

import { createClient } from '@/lib/supabase/server'
import { emailSchema } from '@/lib/auth/validation'

// This reports only the signed-in user's own verified address. An address from
// the form or signup hint is never enough to look up another account's status.
export async function getSignupConfirmationStatus(expectedEmail: unknown): Promise<{ confirmedEmail: string | null }> {
  const expected = emailSchema.safeParse(expectedEmail)
  if (!expected.success) return { confirmedEmail: null }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    const actual = emailSchema.safeParse(data.user?.email)
    if (error || !data.user?.email_confirmed_at || !actual.success || actual.data !== expected.data) {
      return { confirmedEmail: null }
    }
    return { confirmedEmail: actual.data }
  } catch {
    return { confirmedEmail: null }
  }
}
