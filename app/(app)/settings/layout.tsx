import { SettingsShell } from '@/components/settings/settings-shell'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const authUser = await getAuthUser()
  const { data: profile } = authUser
    ? await supabase.from('users').select('role').eq('id', authUser.id).maybeSingle()
    : { data: null }

  return <SettingsShell role={profile?.role}>{children}</SettingsShell>
}
