import type { Metadata } from 'next'
import Link from 'next/link'
import { SignupForm } from '@/components/auth/signup-form'
import { Card } from '@/components/ui/card'
import { BrandLogo } from '@/components/brand-logo'

export const metadata: Metadata = { title: 'สมัครสมาชิก — KorKru' }

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-4">
      {/* Logo mark */}
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <BrandLogo subtitle="คลังข้อสอบอัจฉริยะ" />
      </Link>

      <Card padding="2xl" elevation="sm" className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">สมัครสมาชิก</h1>
        </div>
        <SignupForm />
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">
        © 2026 KorKru — ก่อการเรียนรู้ โดยครู
      </p>
    </div>
  )
}
