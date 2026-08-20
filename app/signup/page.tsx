import type { Metadata } from 'next'
import Link from 'next/link'
import { SignupForm } from '@/components/auth/signup-form'
import { Card } from '@/components/ui/card'

export const metadata: Metadata = { title: 'สมัครสมาชิก — KorKru' }

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-4 dark:bg-slate-950">
      {/* Logo mark */}
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-base font-bold text-white shadow-md">
          K
        </div>
        <div>
          <p className="text-lg font-bold text-foreground leading-none">KorKru</p>
          <p className="text-xs text-muted-foreground">คลังข้อสอบอัจฉริยะ</p>
        </div>
      </Link>

      <Card padding="2xl" elevation="sm" className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">สมัครสมาชิก</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            เริ่มสร้างโจทย์ฟิสิกส์ได้เลย ฟรีทันที ไม่ต้องใช้บัตรเครดิต
          </p>
        </div>
        <SignupForm />
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">
        © 2026 KorKru — ก่อการเรียนรู้ โดยครู
      </p>
    </div>
  )
}
