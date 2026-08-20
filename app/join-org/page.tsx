import { redirect } from 'next/navigation'
import { getInviteInfo } from '@/lib/actions/org-members'
import { JoinOrgClient } from './_client'

interface Props {
  searchParams: Promise<{ token?: string }>
}

export default async function JoinOrgPage({ searchParams }: Props) {
  const { token } = await searchParams

  if (!token) redirect('/dashboard')

  const info = await getInviteInfo(token)

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm bg-card rounded-xl shadow-sm border p-8 space-y-6">
        {info ? (
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
      </div>
    </div>
  )
}
