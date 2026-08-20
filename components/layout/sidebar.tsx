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
  { href: '/questions/new', label: 'สร้างโจทย์', icon: '➕' },
  { href: '/questions', label: 'คลังโจทย์', icon: '📚' },
  { href: '/classrooms', label: 'ห้องเรียน', icon: '🏫' },
  { href: '/settings/profile', label: 'ตั้งค่า', icon: '⚙️' },
]

const studentNav: NavItem[] = [
  { href: '/dashboard', label: 'หน้าหลัก', icon: '🏠' },
  { href: '/classrooms', label: 'ห้องเรียนของฉัน', icon: '🏫' },
  { href: '/my-submissions', label: 'สรุปงานของฉัน', icon: '📋' },
  { href: '/settings/profile', label: 'ข้อมูลส่วนตัว', icon: '⚙️' },
]

function isNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  if (href === '/settings/profile') return pathname.startsWith('/settings')
  if (href === '/questions') return pathname === '/questions' || (pathname.startsWith('/questions/') && !pathname.startsWith('/questions/new'))
  return pathname === href || pathname.startsWith(href + '/')
}

interface SidebarProps {
  role: UserRole
  fullName: string
  isOpen?: boolean
  onClose?: () => void
  collapsed?: boolean
}

export function Sidebar({ role, fullName, isOpen = false, onClose, collapsed = false }: SidebarProps) {
  const pathname = usePathname()
  const navItems = role === 'teacher' || role === 'admin' ? teacherNav : studentNav

  return (
    <aside className={cn(
      'flex-shrink-0 border-r bg-card overflow-hidden',
      'fixed inset-y-0 left-0 z-30 transition-[width,transform] duration-200 ease-in-out',
      'md:static',
      isOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0',
      collapsed ? 'md:w-0 md:border-r-0' : 'md:w-64',
    )}>
      <div className="w-64 h-full flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b shrink-0">
          <Link href="/dashboard" onClick={onClose}>
            <Image
              src="/logo.png"
              alt="KorKru"
              width={100}
              height={40}
              className="h-9 w-auto object-contain dark:brightness-0 dark:invert"
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
                isNavActive(pathname, item.href)
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground/70 hover:bg-muted hover:text-foreground'
              )}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Admin link */}
        {role === 'admin' && (
          <div className="px-3 pb-2">
            <Link
              href="/admin"
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors bg-warning/10 text-warning hover:bg-warning/20 border border-warning/20"
            >
              <span className="text-base">⚙️</span>
              Admin Panel
            </Link>
          </div>
        )}

        {/* User info */}
        <div className="p-4 border-t shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold shrink-0">
              {fullName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{fullName}</p>
              <p className="text-xs text-muted-foreground">
                {role === 'teacher' ? 'ครู' : role === 'student' ? 'นักเรียน' : 'Admin'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
