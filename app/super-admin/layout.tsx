import { redirect } from 'next/navigation'
import { getVerifiedAuthUser as getAuthUser } from '@/lib/auth/server'
import { isProfileRowMissing, PROFILE_READ_FAILED_MESSAGE } from '@/lib/auth/profile-read'
import { createAdminClient } from '@/lib/supabase/admin'
import { SuperSidebar } from '@/components/super-admin/super-sidebar'
import { SuperTopbar } from '@/components/super-admin/topbar'
import { Toaster } from '@/components/ui/sonner'

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
    <div className="flex min-h-screen bg-muted">
      <SuperSidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <SuperTopbar />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
      <Toaster />
    </div>
  )
}
