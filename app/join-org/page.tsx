import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getInviteInfo } from '@/lib/actions/org-members'
import { JoinOrgClient } from './_client'
import { Card } from '@/components/ui/card'

interface Props {
  searchParams: Promise<{ token?: string }>
}

export default async function JoinOrgPage({ searchParams }: Props) {
  const { token } = await searchParams

  if (!token) redirect('/dashboard')

  // The invite can only be looked up by a signed-in user, so a visitor who
  // is not signed in yet is told that instead of "invalid link".
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const info = user ? await getInviteInfo(token) : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted px-4">
      <Card radius="md" elevation="sm" padding="2xl" className="w-full max-w-sm space-y-6">
        {!user ? (
          <div className="text-center space-y-3">
            <div className="text-4xl">🔑</div>
            <h1 className="text-lg font-semibold text-foreground">กรุณาเข้าสู่ระบบก่อน</h1>
            <p className="text-sm text-muted-foreground">เข้าสู่ระบบด้วยบัญชีที่จะรับคำเชิญ แล้วเปิดลิงก์นี้อีกครั้ง</p>
            <a href="/login" className="inline-block text-sm text-primary hover:underline mt-2">
              ไปหน้าเข้าสู่ระบบ
            </a>
          </div>
        ) : info ? (
          <JoinOrgClient token={token} orgName={info.orgName} role={info.role} />
        ) : (
          <div className="text-center space-y-3">
            <div className="text-4xl">🔗</div>
            <h1 className="text-lg font-semibold text-foreground">ลิงก์ไม่ถูกต้องหรือหมดอายุ</h1>
            <p className="text-sm text-muted-foreground">ขอลิงก์ใหม่จากผู้เชิญ</p>
            <a href="/dashboard" className="inline-block text-sm text-primary hover:underline mt-2">
              กลับหน้าหลัก
            </a>
          </div>
        )}
      </Card>
    </div>
  )
}
