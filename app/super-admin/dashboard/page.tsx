import { AdminDashboard } from '@/components/super-admin/admin-dashboard'
import { SystemHealth } from '@/components/super-admin/system-health'

export default function SuperAdminDashboardPage() {
  return (
    <div className="space-y-8 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Super Admin Dashboard
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          ศูนย์บัญชาการ KorKru SaaS Platform
        </p>
      </div>
      <AdminDashboard />
      <SystemHealth />
    </div>
  )
}
