import type { Metadata } from 'next'
import Link from 'next/link'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'
import { Card } from '@/components/ui/card'
import { BrandLogo } from '@/components/brand-logo'

export const metadata: Metadata = { title: 'ลืมรหัสผ่าน — KorKru' }

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-4">
      {/* Logo mark */}
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <BrandLogo subtitle="คลังข้อสอบอัจฉริยะ" />
      </Link>

      <Card padding="2xl" elevation="sm" className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">ลืมรหัสผ่าน?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            กรอกอีเมลของคุณ เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้ทันที
          </p>
        </div>
        <ForgotPasswordForm />
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">
        © 2026 KorKru — ก่อการเรียนรู้ โดยครู
      </p>
    </div>
  )
}
