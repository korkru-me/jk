import { Settings } from 'lucide-react'
import { SettingsNav } from '@/components/settings/settings-nav'
import { Card } from '@/components/ui/card'
import type { UserRole } from '@/lib/types'

export function SettingsShell({ role, children }: { role?: UserRole; children: React.ReactNode }) {
  const isStudent = role === 'student'
  return (
    <div className={isStudent ? 'student-profile-stage w-full min-w-0' : 'mx-auto max-w-6xl'}>
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Settings size={18} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">การตั้งค่า</h1>
          <p className="text-xs text-muted-foreground">{isStudent ? 'จัดการข้อมูลส่วนตัวของคุณ' : 'จัดการบัญชี, ทีม, และการตั้งค่าระบบ'}</p>
        </div>
      </div>
      <div className="flex items-start gap-6">
        {!isStudent && (
          <aside className="sticky top-0 w-60 shrink-0">
            <Card className="p-2"><SettingsNav role={role} /></Card>
          </aside>
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
