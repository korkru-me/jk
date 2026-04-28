'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/types'

interface NavItem {
  href: string
  label: string
  icon: string
}

const teacherNav: NavItem[] = [
  { href: '/dashboard', label: 'หน้าหลัก', icon: '🏠' },
  { href: '/questions', label: 'คลังโจทย์', icon: '📚' },
  { href: '/classrooms', label: 'ห้องเรียน', icon: '🏫' },
  { href: '/assignments', label: 'ชุดข้อสอบ', icon: '📋' },
]

const studentNav: NavItem[] = [
  { href: '/dashboard', label: 'หน้าหลัก', icon: '🏠' },
  { href: '/classrooms', label: 'ห้องเรียนของฉัน', icon: '🏫' },
  { href: '/my-submissions', label: 'การส่งงาน', icon: '📝' },
]

interface SidebarProps {
  role: UserRole
  fullName: string
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ role, fullName, isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const navItems = role === 'teacher' || role === 'admin' ? teacherNav : studentNav

  return (
    <aside className={cn(
      'w-64 flex-shrink-0 border-r bg-white flex flex-col',
      'fixed inset-y-0 left-0 z-30 transition-transform duration-200 ease-in-out',
      'md:static md:translate-x-0',
      isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
    )}>
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b shrink-0">
        <Link href="/dashboard" onClick={onClose}>
          <Image
            src="/logo.png"
            alt="KorKru"
            width={100}
            height={40}
            className="h-9 w-auto object-contain"
          />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              pathname === item.href
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            )}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* User info */}
      <div className="p-4 border-t shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
            {fullName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{fullName}</p>
            <p className="text-xs text-gray-500">
              {role === 'teacher' ? 'ครู' : role === 'student' ? 'นักเรียน' : 'Admin'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
