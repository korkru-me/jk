import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ShellClient } from '@/components/layout/shell-client'
import type { User } from '@/lib/types'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!authUser) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  if (!profile) redirect('/login')

  const user = profile as User

  return <ShellClient user={user}>{children}</ShellClient>
}
