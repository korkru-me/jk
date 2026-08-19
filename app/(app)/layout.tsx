import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ShellClient, type ShellUser } from '@/components/layout/shell-client'
import { getAuthUser } from '@/lib/auth/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const authUser = await getAuthUser()

  if (!authUser) redirect('/login')

  const admin = createAdminClient()
  // The profile and unread count are independent after authentication. Feed
  // the count into the persistent app shell so the client does not need a
  // second server-action request immediately after every full page load.
  const [profileRes, unreadRes] = await Promise.all([
    admin
      .from('users')
      .select('id, email, full_name, role')
      .eq('id', authUser.id)
      .single(),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', authUser.id)
      .eq('is_read', false),
  ])
  const profile = profileRes.data
  const initialUnreadCount = unreadRes.count ?? 0

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
      .select('id, email, full_name, role')
      .eq('id', authUser.id)
      .single()
    if (!newProfile) redirect('/login')
    return <ShellClient user={newProfile as ShellUser} initialUnreadCount={initialUnreadCount}>{children}</ShellClient>
  }

  return <ShellClient user={profile as ShellUser} initialUnreadCount={initialUnreadCount}>{children}</ShellClient>
}
