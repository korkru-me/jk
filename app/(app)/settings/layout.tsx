import { SettingsNav } from '@/components/settings/settings-nav'
import { Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const authUser = await getAuthUser()
  const { data: profile } = authUser
    ? await supabase.from('users').select('role').eq('id', authUser.id).maybeSingle()
    : { data: null }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Settings size={18} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">การตั้งค่า</h1>
          <p className="text-xs text-muted-foreground">จัดการบัญชี, ทีม, และการตั้งค่าระบบ</p>
        </div>
      </div>

      <div className="flex gap-6 items-start">
        {/* Left: Settings sidebar nav */}
        <aside className="w-60 shrink-0 sticky top-0">
          <div className="bg-card border rounded-2xl p-2">
            <SettingsNav role={profile?.role} />
          </div>
        </aside>

        {/* Right: Content */}
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  )
}
