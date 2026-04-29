import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ShellClient } from '@/components/layout/shell-client'
import type { User } from '@/lib/types'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!authUser) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  if (!profile) {
    // Auto-create profile if missing (orphaned auth user)
    const meta = authUser.user_metadata
    await admin.from('users').insert({
      id: authUser.id,
      email: authUser.email!,
      full_name: meta?.full_name ?? authUser.email!.split('@')[0],
      role: (meta?.role as 'teacher' | 'student') ?? 'student',
    })
    const { data: newProfile } = await admin
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single()
    if (!newProfile) redirect('/login')
    return <ShellClient user={newProfile as User}>{children}</ShellClient>
  }

  return <ShellClient user={profile as User}>{children}</ShellClient>
}
