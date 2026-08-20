'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Building2,
  Users,
  ShieldCheck,
  BookOpen,
  Megaphone,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Zap,
} from 'lucide-react'

const NAV = [
  {
    href: '/super-admin/dashboard',
    icon: LayoutDashboard,
    label: 'Dashboard',
    sub: 'ภาพรวมธุรกิจ',
  },
  {
    href: '/super-admin/tenants',
    icon: Building2,
    label: 'Tenants',
    sub: 'สถาบัน & สาขา',
  },
  {
    href: '/super-admin/users',
    icon: Users,
    label: 'Users & Support',
    sub: 'ผู้ใช้ & Tickets',
  },
  {
    href: '/super-admin/audit',
    icon: ShieldCheck,
    label: 'Audit Trail',
    sub: 'บันทึกความปลอดภัย',
  },
  {
    href: '/super-admin/content',
    icon: BookOpen,
    label: 'Master Content',
    sub: 'คลังข้อสอบกลาง',
  },
  {
    href: '/super-admin/marketing',
    icon: Megaphone,
    label: 'Marketing',
    sub: 'การตลาด & Growth',
  },
]

export function SuperSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'shrink-0 flex flex-col min-h-screen border-r transition-all duration-300',
        'bg-slate-900 border-slate-700/60',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          'flex items-center gap-3 border-b border-slate-700/60 px-4 py-4 min-h-[64px]',
          collapsed && 'justify-center px-2',
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Zap className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <div>
            <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest">
              Super Admin
            </p>
            <p className="text-sm font-semibold text-white">KorKru HQ</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all',
                active
                  ? 'bg-primary text-white shadow-md shadow-primary/50'
                  : 'text-muted-foreground hover:bg-slate-800 hover:text-slate-100',
                collapsed && 'justify-center px-2',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <div className="min-w-0">
                  <p className="font-medium leading-none">{item.label}</p>
                  <p
                    className={cn(
                      'text-xs mt-0.5 truncate',
                      active ? 'text-indigo-200' : 'text-muted-foreground',
                    )}
                  >
                    {item.sub}
                  </p>
                </div>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700/60 p-2 space-y-1">
        {!collapsed && (
          <Link
            href="/admin/dashboard"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            กลับ Admin Panel
          </Link>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-slate-300 hover:bg-slate-800 transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>ย่อเมนู</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
