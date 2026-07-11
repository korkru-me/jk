import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/actions/settings'
import { ProfileSettings } from '@/components/settings/profile-settings'

export const metadata = { title: 'บัญชีและความปลอดภัย — KorKru' }

export default async function ProfileSettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <ProfileSettings
      user={{
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        avatar_url: user.avatar_url,
        role: user.role,
        created_at: user.created_at,
      }}
    />
  )
}
