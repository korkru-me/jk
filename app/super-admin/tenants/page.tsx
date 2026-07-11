import { TenantManager } from '@/components/super-admin/tenant-manager'

export default function TenantsPage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Tenant & Franchise Management
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          จัดการสถาบัน แพ็กเกจ สาขา และ Custom Domain
        </p>
      </div>
      <TenantManager />
    </div>
  )
}
