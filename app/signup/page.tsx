import type { Metadata } from 'next'
import Link from 'next/link'
import { SignupForm } from '@/components/auth/signup-form'
import { Card } from '@/components/ui/card'
import { BrandLogo } from '@/components/brand-logo'

export const metadata: Metadata = { title: 'สมัครสมาชิก — KorKru' }

export default function SignupPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted px-4 py-6">
      <Link href="/" className="flex min-h-11 items-center" aria-label="KorKru กลับหน้าหลัก">
        <BrandLogo size="large" subtitle="ก่อการเรียนรู้ โดยครู" />
      </Link>

      <Card padding="md" elevation="sm" className="w-full max-w-md">
        <div className="mb-3 text-center">
          <h1 className="text-2xl font-bold text-foreground">สมัครสมาชิก</h1>
          <p className="text-sm text-muted-foreground">เลือกบทบาท แล้วเลือกวิธีสร้างบัญชี</p>
        </div>
        <SignupForm />
      </Card>

      <p className="text-xs text-muted-foreground">
        © 2026 KorKru · <Link href="/contact" className="inline-flex min-h-11 items-center hover:underline">ติดต่อผู้ดูแล</Link>
      </p>
    </main>
  )
}
