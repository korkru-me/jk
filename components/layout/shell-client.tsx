'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { useAppViewport } from '@/hooks/use-app-viewport'
import { isAssignmentTakingPath } from '@/lib/app-shell-mode'
import type { User } from '@/lib/types'

const SIDEBAR_COLLAPSE_KEY = 'korkru:sidebar-collapsed'

export type ShellUser = Pick<User, 'id' | 'email' | 'full_name' | 'role'>

export function ShellClient({
  user,
  initialUnreadCount,
  children,
}: {
  user: ShellUser
  initialUnreadCount: number
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const pathname = usePathname()
  const isTakingAssignment = isAssignmentTakingPath(pathname)

  // Nothing inside the shell scrolls the page itself, so its height has to
  // track the visible area rather than 100vh — see the hook for why iOS turns
  // the difference into a white half-screen.
  useAppViewport()

  useEffect(() => {
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1')
  }, [])

  function toggleSidebarCollapsed() {
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? '1' : '0')
      return next
    })
  }

  // The exam already carries its own status, navigation and submit controls.
  // Removing the ordinary app chrome here prevents a landscape phone from
  // crossing the `md` breakpoint and losing most of its question width to two
  // sidebars. Authentication and the route's server checks still run in the
  // parent layout; this changes presentation only.
  if (isTakingAssignment) {
    return (
      <div className="h-[var(--app-height,100dvh)] overflow-hidden bg-muted/30">
        <main className="h-full overflow-y-auto overscroll-contain p-2 sm:p-3 md:p-4">
          {children}
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-[var(--app-height,100dvh)] overflow-hidden bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-overlay md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar
        role={user.role}
        fullName={user.full_name}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar
          user={user}
          initialUnreadCount={initialUnreadCount}
          onMenuToggle={() => setSidebarOpen(o => !o)}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarCollapseToggle={toggleSidebarCollapsed}
        />
        <main className="flex-1 overflow-y-auto overscroll-contain bg-muted/30 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
