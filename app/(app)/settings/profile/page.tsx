import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/actions/settings'
import { getMyStudentProfile } from '@/lib/actions/student-profile'
import { ProfileSettings } from '@/components/settings/profile-settings'
import { StudentProfileSettings } from '@/components/settings/student-profile-settings'

export const metadata = { title: 'ข้อมูลส่วนตัว — KorKru' }

export default async function ProfileSettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  if (user.role === 'student') {
    const profile = await getMyStudentProfile()
    return (
      <StudentProfileSettings
        user={{
          id: user.id,
          full_name: user.full_name,
          prefix: user.prefix,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          avatar_url: user.avatar_url,
          created_at: user.created_at,
        }}
        profile={profile}
      />
    )
  }

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
