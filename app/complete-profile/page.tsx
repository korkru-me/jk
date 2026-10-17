import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { CompleteProfileForm } from '@/components/auth/complete-profile-form'
import { BrandLogo } from '@/components/brand-logo'
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted px-4 py-6">
      <Link href="/" className="flex min-h-11 items-center" aria-label="KorKru กลับหน้าหลัก">
        <BrandLogo subtitle="ก่อการเรียนรู้ โดยครู" />
      </Link>

      <Card padding="md" elevation="sm" className="w-full max-w-md">
        <div className="mb-3 text-center">
          <h1 className="text-2xl font-bold text-foreground">ตั้งค่าบัญชีอีกนิดเดียว</h1>
          <p className="text-sm text-muted-foreground">
            ยืนยันชื่อและประเภทบัญชี แล้วเริ่มใช้งานได้ทันที
          </p>
        </div>
        <CompleteProfileForm defaultName={defaultName} defaultRole={defaultRole} />
      </Card>
      <Link href="/contact" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline">ติดต่อผู้ดูแล</Link>
    </main>
  )
}
