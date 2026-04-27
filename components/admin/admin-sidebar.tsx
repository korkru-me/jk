'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/admin/dashboard', icon: '📊', label: 'Dashboard' },
  { href: '/admin/questions', icon: '📝', label: 'โจทย์ทั้งหมด' },
  { href: '/admin/pending',   icon: '⏳', label: 'รออนุมัติ' },
  { href: '/admin/users',     icon: '👥', label: 'ผู้ใช้' },
  { href: '/admin/presets',   icon: '📐', label: 'สูตรสำเร็จ' },
  { href: '/admin/categories',icon: '🗂️',  label: 'หมวดหมู่' },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 shrink-0 border-r bg-gray-50 min-h-screen flex flex-col">
      <div className="px-4 py-4 border-b">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Admin Panel</p>
        <p className="text-sm font-semibold text-gray-800 mt-0.5">KorKru</p>
      </div>
      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname.startsWith(item.href)
                ? 'bg-blue-600 text-white font-medium'
                : 'text-gray-700 hover:bg-gray-200'
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
        >
          ← กลับแอปหลัก
        </Link>
      </div>
    </aside>
  )
}
