'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  ChevronDown,
  ChevronLeft,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  FileUp,
  FlaskConical,
  FolderKanban,
  House,
  LayoutGrid,
  LibraryBig,
  NotebookPen,
  Plus,
  School,
  Settings,
  ShieldCheck,
  Trash2,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { isClassroomSectionPath } from '@/lib/classroom-navigation'
import { Separator } from '@/components/ui/separator'
import { sidebarSearchKey, useSidebarContext } from './sidebar-context'
import { SidebarDisplayProvider, SidebarLabel, useSidebarCompact } from './sidebar-display'
import type { UserRole } from '@/lib/types'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

/** A heading that opens to reveal its pages instead of navigating anywhere. */
interface NavGroup {
  label: string
  icon: LucideIcon
  children: NavItem[]
}

type NavEntry = NavItem | NavGroup

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry
}

const teacherNav: NavEntry[] = [
  { href: '/dashboard', label: 'หน้าหลัก', icon: House },
  {
    label: 'จัดการโจทย์',
    icon: NotebookPen,
    children: [
      { href: '/questions/new', label: 'สร้างโจทย์', icon: FilePlus2 },
      { href: '/questions/import', label: 'นำเข้าโจทย์', icon: FileUp },
      { href: '/questions/sets', label: 'คลังโจทย์', icon: LibraryBig },
    ],
  },
  { href: '/classrooms', label: 'ห้องเรียน', icon: School },
  {
    label: 'วิจัยการศึกษา',
    icon: FlaskConical,
    children: [
      { href: '/research', label: 'โครงการวิจัย', icon: FolderKanban },
      { href: '/research/ioc', label: 'ฟอร์ม IOC', icon: ClipboardCheck },
    ],
  },
  { href: '/settings/profile', label: 'ตั้งค่า', icon: Settings },
]

const studentNav: NavEntry[] = [
  { href: '/dashboard', label: 'หน้าหลัก', icon: House },
  { href: '/classrooms', label: 'ห้องเรียนของฉัน', icon: School },
  { href: '/my-submissions', label: 'สรุปงานของฉัน', icon: ClipboardList },
  { href: '/settings/profile', label: 'ข้อมูลส่วนตัว', icon: UserRound },
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

function NavItemIcon({ icon: Icon }: Pick<NavItem, 'icon'>) {
  return <Icon className="size-4 shrink-0" aria-hidden="true" />
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
function NavGroupItem({ group, pathname, onNavigate, compactOnDesktop = false }: {
  group: NavGroup
  pathname: string
  onNavigate?: () => void
  compactOnDesktop?: boolean
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
        title={compactOnDesktop ? group.label : undefined}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          hasActiveChild
            ? 'bg-primary/10 text-primary'
            : 'text-foreground/70 hover:bg-muted hover:text-foreground',
          compactOnDesktop && 'md:min-h-11 md:justify-center md:px-2'
        )}
      >
        <NavItemIcon icon={group.icon} />
        <span className={cn(compactOnDesktop && 'md:sr-only')}>{group.label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'ml-auto size-4 transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180',
            compactOnDesktop && 'md:hidden'
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
          <div className={cn(
            'ml-6 mt-1 space-y-1 border-l pl-2',
            compactOnDesktop && 'md:ml-0 md:border-l-0 md:pl-0'
          )}>
            {group.children.map(child => (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                title={compactOnDesktop ? child.label : undefined}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isNavActive(pathname, child.href)
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground/70 hover:bg-muted hover:text-foreground',
                  compactOnDesktop && 'md:min-h-11 md:justify-center md:px-2'
                )}
              >
                <NavItemIcon icon={child.icon} />
                <span className={cn(compactOnDesktop && 'md:sr-only')}>{child.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ClassroomSectionNavigation({ pathname, onNavigate }: {
  pathname: string
  onNavigate?: () => void
}) {
  const compact = useSidebarCompact()
  const items = [
    { href: '/classrooms', label: 'ห้องเรียนทั้งหมด', Icon: LayoutGrid },
    { href: '/classrooms/new', label: 'สร้างห้องเรียน', Icon: Plus },
    { href: '/classrooms/trash', label: 'ถังขยะ', Icon: Trash2 },
  ]

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        title={compact ? 'เมนูหลัก' : undefined}
        className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', compact && 'md:justify-center md:px-0 md:h-11')}
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        <SidebarLabel>เมนูหลัก</SidebarLabel>
      </Link>

      <div className={cn('flex items-start gap-3 px-2 py-1', compact && 'md:justify-center md:px-0')} title="ห้องเรียน">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <School aria-hidden="true" className="size-5" />
        </div>
        <div className={cn('min-w-0 flex-1', compact && 'md:hidden')}>
          <p className="font-semibold text-foreground">ห้องเรียน</p>
          <p className="text-xs text-muted-foreground">จัดการพื้นที่การเรียนรู้</p>
        </div>
      </div>

      <Separator />

      <div className={cn('px-2 text-xs font-medium text-muted-foreground', compact && 'md:sr-only')}>เมนูห้องเรียน</div>
      <nav aria-label="เมนูจัดการห้องเรียน" className="flex flex-col gap-1">
        {items.map(({ href, label, Icon }) => {
          const selected = pathname === href
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={selected ? 'page' : undefined}
              title={compact ? label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                selected
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground/70 hover:bg-muted hover:text-foreground',
                compact && 'md:h-11 md:justify-center md:px-0',
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              <SidebarLabel>{label}</SidebarLabel>
            </Link>
          )
        })}
      </nav>
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
  const [desktop, setDesktop] = useState(false)
  const [desktopPreviewOpen, setDesktopPreviewOpen] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = sidebarSearchKey(searchParams.toString())
  const navItems = role === 'teacher' || role === 'admin' ? teacherNav : studentNav
  const { contextualSidebar, pendingSidebar, clearPendingSidebar } = useSidebarContext()
  const usesTeacherNavigation = role === 'teacher' || role === 'admin'
  const usesClassroomSidebar = usesTeacherNavigation && isClassroomSectionPath(pathname)
  const pendingMatches = pendingSidebar?.pathname === pathname && pendingSidebar.search === search
  const sidebarEntry = pendingMatches ? pendingSidebar.entry : contextualSidebar
  const contextualMatches = sidebarEntry?.pathname === pathname
    && (pathname !== '/assignments/new' || sidebarEntry.classroomId === searchParams.get('classroom'))
  const contextualContent = usesTeacherNavigation
    && (pendingMatches || contextualMatches)
    ? sidebarEntry?.render(onClose)
    : null

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const update = () => setDesktop(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!desktop || !collapsed) setDesktopPreviewOpen(false)
  }, [collapsed, desktop])

  useEffect(() => {
    if (pendingSidebar && pathname !== pendingSidebar.sourcePathname && !pendingMatches) {
      clearPendingSidebar()
    }
  }, [clearPendingSidebar, pathname, pendingMatches, pendingSidebar])

  const compactOnDesktop = collapsed && !desktopPreviewOpen

  return (
    <SidebarDisplayProvider compactOnDesktop={compactOnDesktop}>
    <aside
      id="app-sidebar"
      aria-label="เมนูด้านข้าง"
      inert={!desktop && !isOpen}
      data-collapsed={collapsed ? 'true' : 'false'}
      data-preview-open={desktopPreviewOpen ? 'true' : 'false'}
      onMouseEnter={() => {
        if (desktop && collapsed) setDesktopPreviewOpen(true)
      }}
      onMouseLeave={() => setDesktopPreviewOpen(false)}
      className={cn(
        'fixed bottom-0 left-0 top-16 z-30 w-64 flex-shrink-0 transition-none',
        'md:static md:overflow-visible',
        isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        collapsed ? 'md:w-20' : 'md:w-64',
      )}
    >
      <div
        data-sidebar-panel
        className={cn(
          'flex h-full w-64 flex-col overflow-hidden border-r bg-card transition-none',
          collapsed && 'md:absolute md:inset-y-0 md:left-0',
          compactOnDesktop ? 'md:w-20' : 'md:w-64',
          desktopPreviewOpen && 'md:shadow-lg',
        )}
      >
        {/* Nav */}
        {contextualContent || usesClassroomSidebar ? (
          <div className={cn('flex-1 overflow-y-auto overflow-x-hidden p-3', compactOnDesktop && 'md:p-2')}>
            {contextualContent ?? <ClassroomSectionNavigation pathname={pathname} onNavigate={onClose} />}
          </div>
        ) : (
          <nav aria-label="เมนูหลัก" className={cn('flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-3', compactOnDesktop && 'md:p-2')}>
            {navItems.map((entry) => (
              isGroup(entry)
                ? (
                  <NavGroupItem
                    key={entry.label}
                    group={entry}
                    pathname={pathname}
                    onNavigate={onClose}
                    compactOnDesktop={compactOnDesktop}
                  />
                )
                : (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    onClick={onClose}
                    title={compactOnDesktop ? entry.label : undefined}
                    aria-current={isNavActive(pathname, entry.href) ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      isNavActive(pathname, entry.href)
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground/70 hover:bg-muted hover:text-foreground',
                      compactOnDesktop && 'md:justify-center md:px-2 md:min-h-11',
                    )}
                  >
                    <NavItemIcon icon={entry.icon} />
                    <SidebarLabel>{entry.label}</SidebarLabel>
                  </Link>
                )
            ))}
          </nav>
        )}

        {/* Admin link */}
        {role === 'admin' && !usesClassroomSidebar && !contextualContent && (
          <div className={cn('px-3 pb-2', compactOnDesktop && 'md:px-2')}>
            <Link
              href="/admin"
              onClick={onClose}
              title={compactOnDesktop ? 'Admin Panel' : undefined}
              className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors bg-warning/10 text-warning hover:bg-warning/20 border border-warning/20', compactOnDesktop && 'md:justify-center md:px-2')}
            >
              <NavItemIcon icon={ShieldCheck} />
              <SidebarLabel>Admin Panel</SidebarLabel>
            </Link>
          </div>
        )}

        {/* User info */}
        <div className={cn('shrink-0 border-t p-4', compactOnDesktop && 'md:px-2')} title={fullName}>
          <div className={cn('flex items-center gap-3', compactOnDesktop && 'md:justify-center')}>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {fullName.charAt(0)}
            </div>
            <div className={cn('min-w-0 flex-1', compactOnDesktop && 'md:sr-only')}>
              <p className="text-sm font-medium truncate">{fullName}</p>
              <p className="text-xs text-muted-foreground">
                {role === 'teacher' ? 'ครู' : role === 'student' ? 'นักเรียน' : 'Admin'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
    </SidebarDisplayProvider>
  )
}
