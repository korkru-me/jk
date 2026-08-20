'use client'

import { useState } from 'react'
import {
  Search,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Globe,
  Building2,
  Users,
  CalendarClock,
  BadgeCheck,
  AlertCircle,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

type Plan = 'Enterprise' | 'Pro' | 'Basic'
type TenantStatus = 'active' | 'suspended' | 'trial'

interface Branch {
  id: string
  name: string
  city: string
  users: number
  status: TenantStatus
}

interface Tenant {
  id: string
  name: string
  shortName: string
  plan: Plan
  status: TenantStatus
  branches: Branch[]
  totalUsers: number
  domain: string
  sslVerified: boolean
  mrr: number
  joinedAt: string
  expiresAt: string
  contactEmail: string
}

const TENANTS: Tenant[] = [
  {
    id: 'T001',
    name: 'โรงเรียนวิทยาศาสตร์จุฬาภรณราชวิทยาลัย เชียงราย',
    shortName: 'PCCR',
    plan: 'Enterprise',
    status: 'active',
    totalUsers: 847,
    domain: 'exam.pccr.ac.th',
    sslVerified: true,
    mrr: 12000,
    joinedAt: '2024-06-01',
    expiresAt: '2026-05-31',
    contactEmail: 'admin@pccr.ac.th',
    branches: [
      { id: 'B001', name: 'สำนักงานใหญ่ เชียงราย', city: 'เชียงราย', users: 412, status: 'active' },
      { id: 'B002', name: 'สาขาพะเยา', city: 'พะเยา', users: 228, status: 'active' },
      { id: 'B003', name: 'สาขาแม่ฮ่องสอน', city: 'แม่ฮ่องสอน', users: 207, status: 'active' },
    ],
  },
  {
    id: 'T002',
    name: 'สถาบันกวดวิชาฟิสิกส์โอลิมปิก',
    shortName: 'OPT',
    plan: 'Pro',
    status: 'active',
    totalUsers: 1240,
    domain: 'test.olympicphysics.com',
    sslVerified: true,
    mrr: 8500,
    joinedAt: '2024-09-15',
    expiresAt: '2025-09-14',
    contactEmail: 'contact@olympicphysics.com',
    branches: [
      { id: 'B004', name: 'สาขาสยาม กรุงเทพ', city: 'กรุงเทพ', users: 780, status: 'active' },
      { id: 'B005', name: 'สาขาเชียงใหม่', city: 'เชียงใหม่', users: 460, status: 'active' },
    ],
  },
  {
    id: 'T003',
    name: 'โรงเรียนมหิดลวิทยานุสรณ์',
    shortName: 'MWIT',
    plan: 'Enterprise',
    status: 'active',
    totalUsers: 2134,
    domain: 'exam.mwit.ac.th',
    sslVerified: true,
    mrr: 18000,
    joinedAt: '2024-03-01',
    expiresAt: '2027-02-28',
    contactEmail: 'ict@mwit.ac.th',
    branches: [
      { id: 'B006', name: 'สำนักงานใหญ่ นครปฐม', city: 'นครปฐม', users: 2134, status: 'active' },
    ],
  },
  {
    id: 'T004',
    name: 'โรงเรียนกำเนิดวิทย์',
    shortName: 'KVIS',
    plan: 'Pro',
    status: 'active',
    totalUsers: 692,
    domain: 'quiz.kvis.ac.th',
    sslVerified: true,
    mrr: 8500,
    joinedAt: '2024-11-20',
    expiresAt: '2025-11-19',
    contactEmail: 'admin@kvis.ac.th',
    branches: [
      { id: 'B007', name: 'สำนักงานใหญ่ ระยอง', city: 'ระยอง', users: 692, status: 'active' },
    ],
  },
  {
    id: 'T005',
    name: 'ติวเตอร์พลัส ฟิสิกส์',
    shortName: 'TPP',
    plan: 'Basic',
    status: 'active',
    totalUsers: 318,
    domain: 'exam.tutorplusphysics.com',
    sslVerified: false,
    mrr: 2900,
    joinedAt: '2025-01-10',
    expiresAt: '2026-01-09',
    contactEmail: 'owner@tutorplusphysics.com',
    branches: [],
  },
  {
    id: 'T006',
    name: 'โรงเรียนสามเสนวิทยาลัย',
    shortName: 'SSW',
    plan: 'Basic',
    status: 'trial',
    totalUsers: 56,
    domain: 'ssw.korkru.app',
    sslVerified: true,
    mrr: 0,
    joinedAt: '2026-05-01',
    expiresAt: '2026-05-31',
    contactEmail: 'teacher@samsenwit.ac.th',
    branches: [],
  },
  {
    id: 'T007',
    name: 'ศูนย์เตรียมสอบฟิสิกส์ เชียงใหม่',
    shortName: 'PCM',
    plan: 'Pro',
    status: 'suspended',
    totalUsers: 203,
    domain: 'exam.physicschiangmai.com',
    sslVerified: false,
    mrr: 0,
    joinedAt: '2024-07-22',
    expiresAt: '2025-07-21',
    contactEmail: 'info@physicschiangmai.com',
    branches: [
      { id: 'B008', name: 'สาขาเชียงใหม่ 1', city: 'เชียงใหม่', users: 124, status: 'suspended' },
      { id: 'B009', name: 'สาขาลำปาง', city: 'ลำปาง', users: 79, status: 'suspended' },
    ],
  },
]

const PLAN_BADGE: Record<Plan, string> = {
  Enterprise:
    'bg-violet-100 text-violet-700 ring-1 ring-violet-300 dark:bg-violet-950/60 dark:text-violet-300 dark:ring-violet-700',
  Pro: 'bg-primary/10 text-primary ring-1 ring-indigo-300 dark:bg-indigo-950/60 dark:ring-indigo-700',
  Basic:
    'bg-muted text-muted-foreground ring-1 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600',
}

const STATUS_BADGE: Record<TenantStatus, string> = {
  active:
    'bg-success/10 text-success dark:bg-emerald-950/60',
  suspended: 'bg-destructive/10 text-destructive dark:bg-red-950/60',
  trial:
    'bg-warning/10 text-warning dark:bg-amber-950/60',
}

const STATUS_LABEL: Record<TenantStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  trial: 'Trial',
}

function BranchRow({ branch }: { branch: Branch }) {
  return (
    <tr className="border-t border-border/40 bg-muted/60 dark:bg-slate-900/40">
      <td className="pl-12 pr-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          {branch.name}
          <span className="text-muted-foreground">— {branch.city}</span>
        </div>
      </td>
      <td />
      <td className="px-4 py-2.5 text-xs text-muted-foreground">
        {branch.users.toLocaleString()} users
      </td>
      <td className="px-4 py-2.5">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            STATUS_BADGE[branch.status],
          )}
        >
          {STATUS_LABEL[branch.status]}
        </span>
      </td>
      <td />
      <td />
      <td />
    </tr>
  )
}

function TenantRow({ tenant }: { tenant: Tenant }) {
  const [expanded, setExpanded] = useState(false)
  const hasBranches = tenant.branches.length > 0

  return (
    <>
      <tr className="border-t border-border/60 hover:bg-muted dark:hover:bg-slate-800/40 transition-colors">
        <td className="px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            {hasBranches ? (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-muted-foreground dark:hover:text-slate-200"
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="w-5" />
            )}
            <div>
              <p className="text-sm font-semibold text-foreground leading-none">
                {tenant.name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tenant.shortName} · {tenant.contactEmail}
              </p>
            </div>
          </div>
        </td>

        <td className="px-4 py-3.5">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
              PLAN_BADGE[tenant.plan],
            )}
          >
            {tenant.plan}
          </span>
        </td>

        <td className="px-4 py-3.5">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            {tenant.totalUsers.toLocaleString()}
          </div>
        </td>

        <td className="px-4 py-3.5">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              STATUS_BADGE[tenant.status],
            )}
          >
            {STATUS_LABEL[tenant.status]}
          </span>
        </td>

        <td className="px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono text-xs">{tenant.domain}</span>
            {tenant.sslVerified ? (
              <span title="SSL Verified">
                <BadgeCheck className="h-3.5 w-3.5 text-success" />
              </span>
            ) : (
              <span title="SSL ไม่ผ่าน">
                <AlertCircle className="h-3.5 w-3.5 text-warning" />
              </span>
            )}
          </div>
        </td>

        <td className="px-4 py-3.5 text-sm font-semibold text-foreground">
          {tenant.mrr > 0 ? `฿${tenant.mrr.toLocaleString()}` : '—'}
        </td>

        <td className="px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            {tenant.expiresAt}
          </div>
        </td>

        <td className="px-4 py-3.5">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/20 hover:bg-primary/10 hover:text-primary transition-colors dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-primary dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300">
            <Settings className="h-3 w-3" />
            Manage
          </button>
        </td>
      </tr>

      {expanded &&
        tenant.branches.map((branch) => (
          <BranchRow key={branch.id} branch={branch} />
        ))}
    </>
  )
}

export function TenantManager() {
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState<Plan | 'All'>('All')
  const [statusFilter, setStatusFilter] = useState<TenantStatus | 'All'>('All')
  const [sortKey, setSortKey] = useState<'name' | 'mrr' | 'totalUsers' | 'expiresAt'>('mrr')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const filtered = TENANTS.filter((t) => {
    const matchSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.domain.toLowerCase().includes(search.toLowerCase()) ||
      t.shortName.toLowerCase().includes(search.toLowerCase())
    const matchPlan = planFilter === 'All' || t.plan === planFilter
    const matchStatus = statusFilter === 'All' || t.status === statusFilter
    return matchSearch && matchPlan && matchStatus
  }).sort((a, b) => {
    let cmp = 0
    if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
    else if (sortKey === 'mrr') cmp = a.mrr - b.mrr
    else if (sortKey === 'totalUsers') cmp = a.totalUsers - b.totalUsers
    else if (sortKey === 'expiresAt')
      cmp = new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
    return sortDir === 'asc' ? cmp : -cmp
  })

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  function SortIndicator({ k }: { k: typeof sortKey }) {
    if (sortKey !== k) return <span className="opacity-20">↕</span>
    return <span>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const totalMRR = filtered.reduce((s, t) => s + t.mrr, 0)
  const activeCount = filtered.filter((t) => t.status === 'active').length

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'สถาบันทั้งหมด', value: TENANTS.length.toString(), icon: Building2 },
          { label: 'กำลังใช้งาน', value: TENANTS.filter((t) => t.status === 'active').length.toString(), icon: BadgeCheck },
          { label: 'MRR รวม', value: `฿${TENANTS.reduce((s, t) => s + t.mrr, 0).toLocaleString()}`, icon: Globe },
          { label: 'Users รวม', value: TENANTS.reduce((s, t) => s + t.totalUsers, 0).toLocaleString(), icon: Users },
        ].map((item) => {
          const Icon = item.icon
          return (
            <Card radius="md" padding="md" key={item.label}>
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
              <p className="mt-1.5 text-2xl font-bold text-foreground">
                {item.value}
              </p>
            </Card>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อสถาบัน หรือ Domain"
            className="w-full rounded-lg border border-border bg-card pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-muted-foreground dark:focus:border-primary dark:focus:ring-indigo-900/30"
          />
        </div>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as Plan | 'All')}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground focus:border-primary focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="All">ทุก Plan</option>
          <option value="Enterprise">Enterprise</option>
          <option value="Pro">Pro</option>
          <option value="Basic">Basic</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TenantStatus | 'All')}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground focus:border-primary focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="All">ทุก Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="trial">Trial</option>
        </select>
        <p className="text-xs text-muted-foreground ml-auto">
          แสดง {filtered.length} / {TENANTS.length} สถาบัน · MRR รวม ฿{totalMRR.toLocaleString()} · Active {activeCount}
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full text-sm bg-card">
          <thead>
            <tr className="bg-muted/60">
              {[
                { label: 'สถาบัน', key: 'name' as const },
                { label: 'Plan', key: null },
                { label: 'Users', key: 'totalUsers' as const },
                { label: 'Status', key: null },
                { label: 'Domain', key: null },
                { label: 'MRR', key: 'mrr' as const },
                { label: 'หมดอายุ', key: 'expiresAt' as const },
                { label: '', key: null },
              ].map((col) => (
                <th
                  key={col.label}
                  onClick={col.key ? () => toggleSort(col.key!) : undefined}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider',
                    col.key && 'cursor-pointer select-none hover:text-muted-foreground dark:hover:text-slate-200',
                  )}
                >
                  {col.label}
                  {col.key && (
                    <span className="ml-1 text-[10px]">
                      <SortIndicator k={col.key} />
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((tenant) => (
              <TenantRow key={tenant.id} tenant={tenant} />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  ไม่พบสถาบันที่ตรงกับเงื่อนไขการค้นหา
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
