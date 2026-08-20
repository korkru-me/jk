import { TenantManager } from '@/components/super-admin/tenant-manager'

export default function TenantsPage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Tenant & Franchise Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          จัดการสถาบัน แพ็กเกจ สาขา และ Custom Domain
        </p>
      </div>
      <TenantManager />
    </div>
  )
}
