'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/types'

interface NavItem {
  href: string
  label: string
  icon: string
}

/** A heading that opens to reveal its pages instead of navigating anywhere. */
interface NavGroup {
  label: string
  icon: string
  children: NavItem[]
}

type NavEntry = NavItem | NavGroup

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry
}

const teacherNav: NavEntry[] = [
  { href: '/dashboard', label: 'หน้าหลัก', icon: '🏠' },
  { href: '/questions/new', label: 'สร้างโจทย์', icon: '➕' },
  { href: '/questions/import', label: 'นำเข้าโจทย์', icon: '📥' },
  { href: '/questions/sets', label: 'คลังโจทย์', icon: '📚' },
  { href: '/classrooms', label: 'ห้องเรียน', icon: '🏫' },
  {
    label: 'วิจัยการศึกษา',
    icon: '🧪',
    children: [
      { href: '/research', label: 'โครงการวิจัย', icon: '📊' },
      { href: '/research/ioc', label: 'ฟอร์ม IOC', icon: '📋' },
    ],
  },
  { href: '/settings/profile', label: 'ตั้งค่า', icon: '⚙️' },
]

const studentNav: NavEntry[] = [
  { href: '/dashboard', label: 'หน้าหลัก', icon: '🏠' },
  { href: '/classrooms', label: 'ห้องเรียนของฉัน', icon: '🏫' },
  { href: '/my-submissions', label: 'สรุปงานของฉัน', icon: '📋' },
  { href: '/settings/profile', label: 'ข้อมูลส่วนตัว', icon: '⚙️' },
]

function isNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  if (href === '/settings/profile') return pathname.startsWith('/settings')
  // /research/ioc is its own menu entry, so the research item must not claim
  // it as a child the way the default prefix rule would.
  if (href === '/research') return pathname === '/research' || pathname.startsWith('/research/') && !pathname.startsWith('/research/ioc')
  if (href === '/questions/sets') {
    return pathname === '/questions' || (
      pathname.startsWith('/questions/')
      && !pathname.startsWith('/questions/new')
      && !pathname.startsWith('/questions/import')
    )
  }
  return pathname === href || pathname.startsWith(href + '/')
}

/**
 * A nav heading whose pages slide down underneath it.
 *
 * Opens itself whenever the current page is one of its own, so arriving from a
 * link or a reload never leaves the menu looking like the page is not in it.
 * An explicit click overrides that for as long as the sidebar stays mounted —
 * a teacher who closes the group keeps it closed while moving around inside it.
 *
 * The slide is a 0fr→1fr grid row rather than a max-height guess: it animates
 * to whatever the links actually measure, with no magic number to outgrow when
 * a page is added. (The newer interpolate-size/calc-size route does the same
 * job but is Chrome/Edge only — on Safari and Firefox it would snap open.)
 */
function NavGroupItem({ group, pathname, onNavigate }: {
  group: NavGroup
  pathname: string
  onNavigate?: () => void
}) {
  const hasActiveChild = group.children.some(child => isNavActive(pathname, child.href))
  const [override, setOverride] = useState<boolean | null>(null)
  const open = override ?? hasActiveChild
  const panelId = `nav-group-${group.label}`

  return (
    <div>
      <button
        type="button"
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          hasActiveChild
            ? 'text-primary'
            : 'text-foreground/70 hover:bg-muted hover:text-foreground'
        )}
      >
        <span className="text-base">{group.icon}</span>
        {group.label}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'ml-auto size-4 transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180'
          )}
        />
      </button>

      <div
        id={panelId}
        // `inert` keeps the collapsed links out of the tab order and the
        // screen-reader tree — overflow-hidden alone only hides them visually.
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          {/* Indented under the heading, with a rail so the nesting reads at a
              glance rather than only from the padding. */}
          <div className="ml-6 mt-1 space-y-1 border-l pl-2">
            {group.children.map(child => (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isNavActive(pathname, child.href)
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                )}
              >
                <span className="text-sm">{child.icon}</span>
                {child.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
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
              width={423}
              height={576}
              className="h-11 w-auto object-contain dark:brightness-0 dark:invert"
            />
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((entry) => (
            isGroup(entry)
              ? <NavGroupItem key={entry.label} group={entry} pathname={pathname} onNavigate={onClose} />
              : (
                <Link
                  key={entry.href}
                  href={entry.href}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isNavActive(pathname, entry.href)
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                  )}
                >
                  <span className="text-base">{entry.icon}</span>
                  {entry.label}
                </Link>
              )
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
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
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
