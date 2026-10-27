import type { Metadata } from 'next'
import Link from 'next/link'

import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { RecoveryLinkNotice } from '@/components/auth/recovery-link-notice'
import { Card } from '@/components/ui/card'
import { BrandLogo } from '@/components/brand-logo'
import { createClient } from '@/lib/supabase/server'
import { hasRecoveryGrant } from '@/lib/auth/recovery-grant.server'
import { recoveryFailure } from '@/lib/auth/recovery-feedback'

export const metadata: Metadata = { title: 'ตั้งรหัสผ่านใหม่ — KorKru' }

export default async function ResetPasswordPage({ searchParams }: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()
  const canReset = Boolean(user && session && await hasRecoveryGrant(user.id, session.access_token))

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-4">
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <BrandLogo subtitle="คลังข้อสอบอัจฉริยะ" />
      </Link>

      <Card padding="2xl" elevation="sm" className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">ตั้งรหัสผ่านใหม่</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            เลือกรหัสผ่านที่จำได้และไม่ใช้ร่วมกับบริการอื่น
          </p>
        </div>

        {canReset ? (
          <ResetPasswordForm />
        ) : (
          <RecoveryLinkNotice reason={recoveryFailure(error)} />
        )}
      </Card>
    </div>
  )
}
