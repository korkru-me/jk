'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Returns the primary org_id for the currently logged-in user.
 * "Primary" = earliest org they joined (personal workspace created at signup).
 */
export async function getMyOrgId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return data?.org_id ?? null
}
