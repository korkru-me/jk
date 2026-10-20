import type { Metadata } from 'next'
import Link from 'next/link'
import { CircleCheck, TriangleAlert } from 'lucide-react'
import { LoginForm } from '@/components/auth/login-form'
import { Card } from '@/components/ui/card'
import { BrandLogo } from '@/components/brand-logo'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export const metadata: Metadata = { title: 'เข้าสู่ระบบ — KorKru' }

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ password_changed?: string; sessions_revoked?: string; error?: string }>
}) {
  const params = await searchParams
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted px-4 py-6">
      <Link href="/" className="flex min-h-[44px] items-center" aria-label="KorKru กลับหน้าหลัก">
        <BrandLogo size="large" subtitle="ก่อการเรียนรู้ โดยครู" />
      </Link>

      <Card padding="md" elevation="sm" className="flex w-full max-w-md flex-col gap-3">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">ยินดีต้อนรับกลับมา</h1>
          <p className="mt-1 text-sm text-muted-foreground">เลือกวิธีเข้าสู่บัญชี KorKru ของคุณ</p>
        </div>
        {params.password_changed === '1' && (
          <Alert role="status" variant={params.sessions_revoked === '0' ? 'warning' : 'success'}>
            {params.sessions_revoked === '0' ? <TriangleAlert aria-hidden /> : <CircleCheck aria-hidden />}
            <AlertTitle>เปลี่ยนรหัสผ่านแล้ว</AlertTitle>
            <AlertDescription>
              {params.sessions_revoked === '0'
                ? 'รหัสผ่านใหม่ใช้ได้แล้ว แต่ระบบยังยืนยันการออกจากระบบทุกอุปกรณ์ไม่ได้ กรุณาเข้าสู่ระบบด้วยรหัสใหม่ หากสงสัยว่าบัญชีถูกเข้าถึง ให้ติดต่อผู้ดูแล KorKru'
                : 'กรุณาเข้าสู่ระบบอีกครั้งด้วยรหัสผ่านใหม่'}
            </AlertDescription>
          </Alert>
        )}
        {params.error === 'auth_failed' && (
          <Alert variant="destructive">
            <AlertTitle>เข้าสู่ระบบไม่สำเร็จ</AlertTitle>
            <AlertDescription>กรุณาลองอีกครั้งด้วยอีเมลและรหัสผ่าน หรือ Google หากจำรหัสผ่านไม่ได้ ให้เลือก “ลืมรหัสผ่าน”</AlertDescription>
          </Alert>
        )}
        <LoginForm />
      </Card>

      <p className="text-xs text-muted-foreground">
        © 2026 KorKru · <Link href="/contact" className="inline-flex min-h-[44px] items-center underline-offset-4 hover:underline">ติดต่อผู้ดูแล</Link>
      </p>
    </main>
  )
}
