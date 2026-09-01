import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { CompleteProfileForm } from '@/components/auth/complete-profile-form'
import { Card } from '@/components/ui/card'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { AccountRole } from '@/lib/auth/validation'

export const metadata: Metadata = { title: 'ตั้งค่าบัญชี — KorKru' }

type Props = {
  searchParams: Promise<{ role?: string }>
}

export default async function CompleteProfilePage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('full_name, role, survey_role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) redirect('/login')
  if (profile.role === 'admin' || profile.survey_role) redirect('/dashboard')

  const params = await searchParams
  const defaultRole: AccountRole | undefined =
    params.role === 'teacher' || params.role === 'student' ? params.role : undefined
  const defaultName =
    user.user_metadata?.full_name
    ?? user.user_metadata?.name
    ?? profile.full_name
    ?? user.email?.split('@')[0]
    ?? ''

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-4">
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-md">
          K
        </div>
        <div>
          <p className="text-lg font-bold leading-none text-foreground">KorKru</p>
          <p className="text-xs text-muted-foreground">คลังข้อสอบอัจฉริยะ</p>
        </div>
      </Link>

      <Card padding="2xl" elevation="sm" className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">ตั้งค่าบัญชีอีกนิดเดียว</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ยืนยันชื่อและประเภทบัญชี แล้วเริ่มใช้งานได้ทันที
          </p>
        </div>
        <CompleteProfileForm defaultName={defaultName} defaultRole={defaultRole} />
      </Card>
    </div>
  )
}
