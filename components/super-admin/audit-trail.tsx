'use client'

import { useState, useMemo } from 'react'
import { Search, ShieldAlert, Info, AlertTriangle, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'

type Severity = 'info' | 'warning' | 'critical'
type ActionCategory = 'auth' | 'content' | 'billing' | 'data' | 'admin'

interface AuditLog {
  id: string
  timestamp: string
  email: string
  tenant: string
  action: string
  resource: string
  category: ActionCategory
  severity: Severity
  ip: string
  result: 'success' | 'failed'
}

const LOGS: AuditLog[] = [
  {
    id: 'L001',
    timestamp: '2026-05-15 14:32:11',
    email: 'admin@pccr.ac.th',
    tenant: 'PCCR',
    action: 'แก้ไขคะแนนสอบ',
    resource: 'submissions/SUB-4421',
    category: 'data',
    severity: 'critical',
    ip: '203.150.44.12',
    result: 'success',
  },
  {
    id: 'L002',
    timestamp: '2026-05-15 13:55:04',
    email: 'piya@mwit.ac.th',
    tenant: 'MWIT',
    action: 'ลบชุดข้อสอบ',
    resource: 'assignments/ASG-2219',
    category: 'content',
    severity: 'warning',
    ip: '58.181.22.90',
    result: 'success',
  },
  {
    id: 'L003',
    timestamp: '2026-05-15 12:10:33',
    email: 'mana@olympicphysics.com',
    tenant: 'OPT',
    action: 'Export ข้อมูลนักเรียนทั้งหมด',
    resource: 'users/export',
    category: 'data',
    severity: 'warning',
    ip: '119.76.33.201',
    result: 'success',
  },
  {
    id: 'L004',
    timestamp: '2026-05-15 11:48:52',
    email: 'somchai@pccr.ac.th',
    tenant: 'PCCR',
    action: 'เปลี่ยนแปลงการตั้งค่าองค์กร',
    resource: 'org/settings',
    category: 'admin',
    severity: 'info',
    ip: '203.150.44.15',
    result: 'success',
  },
  {
    id: 'L005',
    timestamp: '2026-05-15 10:22:18',
    email: 'unknown@attacker.net',
    tenant: '-',
    action: 'พยายาม Login ล้มเหลว 5 ครั้งต่อเนื่อง',
    resource: 'auth/login',
    category: 'auth',
    severity: 'critical',
    ip: '45.142.212.100',
    result: 'failed',
  },
  {
    id: 'L006',
    timestamp: '2026-05-15 09:55:40',
    email: 'vichai@kvis.ac.th',
    tenant: 'KVIS',
    action: 'อัปเกรดแพ็กเกจ Pro',
    resource: 'billing/upgrade',
    category: 'billing',
    severity: 'info',
    ip: '171.96.14.22',
    result: 'success',
  },
  {
    id: 'L007',
    timestamp: '2026-05-15 09:12:07',
    email: 'sa@korkru.app',
    tenant: 'SYSTEM',
    action: 'เข้าสู่ระบบ Super Admin Portal',
    resource: 'super-admin/login',
    category: 'auth',
    severity: 'info',
    ip: '1.10.185.44',
    result: 'success',
  },
  {
    id: 'L008',
    timestamp: '2026-05-14 22:41:09',
    email: 'mana@olympicphysics.com',
    tenant: 'OPT',
    action: 'รีเซ็ตรหัสผ่านนักเรียน',
    resource: 'users/U004',
    category: 'admin',
    severity: 'warning',
    ip: '119.76.33.201',
    result: 'success',
  },
  {
    id: 'L009',
    timestamp: '2026-05-14 20:05:55',
    email: 'piya@mwit.ac.th',
    tenant: 'MWIT',
    action: 'นำเข้าคลังข้อสอบ 500 ข้อ',
    resource: 'questions/import',
    category: 'content',
    severity: 'info',
    ip: '58.181.22.90',
    result: 'success',
  },
  {
    id: 'L010',
    timestamp: '2026-05-14 18:30:22',
    email: 'admin@pccr.ac.th',
    tenant: 'PCCR',
    action: 'ลบฐานข้อมูลนักเรียน (ยกเลิก)',
    resource: 'users/batch-delete',
    category: 'data',
    severity: 'critical',
    ip: '203.150.44.12',
    result: 'failed',
  },
  {
    id: 'L011',
    timestamp: '2026-05-14 15:20:11',
    email: 'sa@korkru.app',
    tenant: 'SYSTEM',
    action: 'แจกจ่ายชุดข้อสอบสู่ Public Bank',
    resource: 'content/master-bank/push',
    category: 'content',
    severity: 'warning',
    ip: '1.10.185.44',
    result: 'success',
  },
  {
    id: 'L012',
    timestamp: '2026-05-14 11:05:44',
    email: 'contact@olympicphysics.com',
    tenant: 'OPT',
    action: 'ชำระเงินค่าแพ็กเกจ Pro รายปี',
    resource: 'billing/payment/PAY-9912',
    category: 'billing',
    severity: 'info',
    ip: '119.76.33.199',
    result: 'success',
  },
  {
    id: 'L013',
    timestamp: '2026-05-13 16:44:02',
    email: 'unknown2@probe.io',
    tenant: '-',
    action: 'สแกน API Endpoint ต้องสงสัย',
    resource: 'api/v1/*',
    category: 'auth',
    severity: 'critical',
    ip: '91.235.128.44',
    result: 'failed',
  },
  {
    id: 'L014',
    timestamp: '2026-05-13 10:00:00',
    email: 'sa@korkru.app',
    tenant: 'SYSTEM',
    action: 'ระงับบัญชีสถาบัน PCM',
    resource: 'tenants/T007',
    category: 'admin',
    severity: 'warning',
    ip: '1.10.185.44',
    result: 'success',
  },
  {
    id: 'L015',
    timestamp: '2026-05-12 09:30:15',
    email: 'somchai@pccr.ac.th',
    tenant: 'PCCR',
    action: 'สร้างชุดข้อสอบใหม่',
    resource: 'assignments/ASG-2280',
    category: 'content',
    severity: 'info',
    ip: '203.150.44.15',
    result: 'success',
  },
]

const SEVERITY_CONFIG: Record<Severity, { cls: string; icon: React.ElementType; label: string }> =
  {
    critical: {
      cls: 'bg-destructive/10 text-destructive',
      icon: ShieldAlert,
      label: 'Critical',
    },
    warning: {
      cls: 'bg-warning/10 text-warning',
      icon: AlertTriangle,
      label: 'Warning',
    },
    info: {
      cls: 'bg-muted text-muted-foreground',
      icon: Info,
      label: 'Info',
    },
  }

const CATEGORY_LABEL: Record<ActionCategory, string> = {
  auth: 'Auth',
  content: 'Content',
  billing: 'Billing',
  data: 'Data',
  admin: 'Admin',
}

export function AuditTrail() {
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<Severity | 'All'>('All')
  const [categoryFilter, setCategoryFilter] = useState<ActionCategory | 'All'>('All')
  const [resultFilter, setResultFilter] = useState<'All' | 'success' | 'failed'>('All')

  const filtered = useMemo(() => {
    return LOGS.filter((log) => {
      const matchSearch =
        log.email.toLowerCase().includes(search.toLowerCase()) ||
        log.action.toLowerCase().includes(search.toLowerCase()) ||
        log.ip.includes(search) ||
        log.resource.toLowerCase().includes(search.toLowerCase()) ||
        log.tenant.toLowerCase().includes(search.toLowerCase())
      const matchSev = severityFilter === 'All' || log.severity === severityFilter
      const matchCat = categoryFilter === 'All' || log.category === categoryFilter
      const matchResult = resultFilter === 'All' || log.result === resultFilter
      return matchSearch && matchSev && matchCat && matchResult
    })
  }, [search, severityFilter, categoryFilter, resultFilter])

  const criticalCount = LOGS.filter((l) => l.severity === 'critical').length

  return (
    <div className="space-y-5">
      {/* Alert Banner */}
      {criticalCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 dark:border-destructive/50">
          <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm font-medium text-destructive">
            พบ {criticalCount} รายการที่มีระดับความรุนแรง Critical ในช่วง 48 ชั่วโมงที่ผ่านมา
            — กรุณาตรวจสอบด่วน
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:max-w-md">
        {[
          { label: 'Critical', count: LOGS.filter((l) => l.severity === 'critical').length, cls: 'text-destructive' },
          { label: 'Warning', count: LOGS.filter((l) => l.severity === 'warning').length, cls: 'text-warning' },
          { label: 'Info', count: LOGS.filter((l) => l.severity === 'info').length, cls: 'text-muted-foreground' },
        ].map((item) => (
          <Card radius="md" padding="sm" key={item.label}>
            <p className={cn('text-2xl font-bold', item.cls)}>{item.count}</p>
            <p className="text-xs text-muted-foreground">{item.label}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา Email, Action, IP, Resource" className="w-full pl-9 pr-4 text-foreground dark:placeholder:text-muted-foreground"
          />
        </div>
        {[
          {
            value: severityFilter,
            onChange: (v: string) => setSeverityFilter(v as Severity | 'All'),
            options: [
              { value: 'All', label: 'ทุก Severity' },
              { value: 'critical', label: 'Critical' },
              { value: 'warning', label: 'Warning' },
              { value: 'info', label: 'Info' },
            ],
          },
          {
            value: categoryFilter,
            onChange: (v: string) => setCategoryFilter(v as ActionCategory | 'All'),
            options: [
              { value: 'All', label: 'ทุก Category' },
              { value: 'auth', label: 'Auth' },
              { value: 'content', label: 'Content' },
              { value: 'billing', label: 'Billing' },
              { value: 'data', label: 'Data' },
              { value: 'admin', label: 'Admin' },
            ],
          },
          {
            value: resultFilter,
            onChange: (v: string) => setResultFilter(v as 'All' | 'success' | 'failed'),
            options: [
              { value: 'All', label: 'ทุก Result' },
              { value: 'success', label: 'Success' },
              { value: 'failed', label: 'Failed' },
            ],
          },
        ].map((sel, i) => (
          <NativeSelect
            key={i}
            value={sel.value}
            onChange={(e) => sel.onChange(e.target.value)} className="text-muted-foreground"
          >
            {sel.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        ))}
        <p className="text-xs text-muted-foreground ml-auto">
          แสดง {filtered.length} / {LOGS.length} รายการ
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full text-sm bg-card">
          <thead>
            <tr className="bg-muted/60">
              {['เวลา', 'Email / Tenant', 'การกระทำ', 'Resource', 'Category', 'Severity', 'IP Address', 'Result'].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map((log) => {
              const sc = SEVERITY_CONFIG[log.severity]
              const SevIcon = sc.icon
              return (
                <tr
                  key={log.id}
                  className={cn(
                    'border-t border-border/60 transition-colors',
                    log.severity === 'critical'
                      ? 'bg-destructive/10'
                      : 'hover:bg-muted',
                  )}
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {log.timestamp}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium text-foreground">
                      {log.email}
                    </p>
                    <p className="text-xs text-muted-foreground">{log.tenant}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground max-w-[220px]">
                    {log.action}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground max-w-[160px] truncate">
                    {log.resource}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {CATEGORY_LABEL[log.category]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                        sc.cls,
                      )}
                    >
                      <SevIcon className="h-3 w-3" />
                      {sc.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {log.ip}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        log.result === 'success'
                          ? 'bg-success/10 text-success'
                          : 'bg-destructive/10 text-destructive',
                      )}
                    >
                      {log.result === 'success' ? 'Success' : 'Failed'}
                    </span>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
