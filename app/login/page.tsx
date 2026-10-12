import type { Metadata } from 'next'
import Link from 'next/link'
import { LoginForm } from '@/components/auth/login-form'
import { Card } from '@/components/ui/card'
import { BrandLogo } from '@/components/brand-logo'

export const metadata: Metadata = { title: 'เข้าสู่ระบบ — KorKru' }

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-4">
      {/* Logo mark */}
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <BrandLogo subtitle="คลังข้อสอบอัจฉริยะ" />
      </Link>

      <Card padding="2xl" elevation="sm" className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">ยินดีต้อนรับกลับมา</h1>
          <p className="mt-1 text-sm text-muted-foreground">เข้าสู่ระบบเพื่อจัดการโจทย์และห้องเรียน</p>
        </div>
        <LoginForm />
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">
        © 2026 KorKru — ก่อการเรียนรู้ โดยครู
      </p>
    </div>
  )
}
