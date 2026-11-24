import { redirect } from 'next/navigation'
import { getVerifiedAuthUser as getAuthUser } from '@/lib/auth/server'
import { isProfileRowMissing, PROFILE_READ_FAILED_MESSAGE } from '@/lib/auth/profile-read'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { Toaster } from '@/components/ui/sonner'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()

  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile && !isProfileRowMissing(profileError)) throw new Error(PROFILE_READ_FAILED_MESSAGE)
  if (profile?.role !== 'admin') redirect('/')

  return (
    <div className="flex min-h-screen bg-card">
      <AdminSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl">{children}</div>
      </main>
      <Toaster />
    </div>
  )
}
