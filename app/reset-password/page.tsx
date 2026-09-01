import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'ตั้งรหัสผ่านใหม่ — KorKru' }

export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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
          <h1 className="text-2xl font-bold text-foreground">ตั้งรหัสผ่านใหม่</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            เลือกรหัสผ่านที่จำได้และไม่ใช้ร่วมกับบริการอื่น
          </p>
        </div>

        {user ? (
          <ResetPasswordForm />
        ) : (
          <div className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/10">
                <AlertCircle className="h-7 w-7 text-warning" />
              </div>
            </div>
            <div>
              <p className="font-semibold text-foreground">ลิงก์นี้หมดอายุหรือถูกใช้แล้ว</p>
              <p className="mt-1 text-sm text-muted-foreground">ขอลิงก์ใหม่เพื่อดำเนินการต่อ</p>
            </div>
            <Button className="w-full" render={<Link href="/forgot-password" />}>
              ขอลิงก์ตั้งรหัสผ่านใหม่
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
