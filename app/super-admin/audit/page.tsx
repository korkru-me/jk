import { AuditTrail } from '@/components/super-admin/audit-trail'

export default function AuditPage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Master Audit Trail
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          บันทึกความปลอดภัยระดับองค์กร · ตรวจสอบพฤติกรรมในระบบย้อนหลัง
        </p>
      </div>
      <AuditTrail />
    </div>
  )
}
