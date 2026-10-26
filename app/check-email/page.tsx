import type { Metadata } from 'next'
import Link from 'next/link'

import { BrandLogo } from '@/components/brand-logo'
import { CheckEmailForm } from '@/components/auth/check-email-form'
import { Card } from '@/components/ui/card'
import { getSignupEmailState } from '@/lib/auth/signup-email.server'
import { getSignupConfirmationStatus } from '@/lib/actions/signup-confirmation'

export const metadata: Metadata = { title: 'ยืนยันอีเมล — KorKru', robots: { index: false, follow: false } }

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const [state, query] = await Promise.all([getSignupEmailState(), searchParams])
  const { confirmedEmail } = await getSignupConfirmationStatus(state.email)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted px-4 py-6">
      <Link href="/" className="flex min-h-11 items-center" aria-label="KorKru กลับหน้าหลัก">
        <BrandLogo subtitle="ก่อการเรียนรู้ โดยครู" />
      </Link>
      <Card padding="md" elevation="sm" className="flex w-full max-w-md flex-col gap-3">
        <CheckEmailForm initialEmail={state.email} initialRetryAfter={state.retryAfterSeconds} initialConfirmedEmail={confirmedEmail} invalidLink={query.error === 'link_invalid'} />
      </Card>
      <Link href="/contact" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline">ติดต่อผู้ดูแล</Link>
    </main>
  )
}
