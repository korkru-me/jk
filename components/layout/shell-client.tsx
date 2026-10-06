'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './sidebar'
import { SidebarContextProvider } from './sidebar-context'
import { Topbar } from './topbar'
import { useAppViewport } from '@/hooks/use-app-viewport'
import type { User } from '@/lib/types'
import { cn } from '@/lib/utils'

const SIDEBAR_COLLAPSE_KEY = 'korkru:sidebar-collapsed'

export type ShellUser = Pick<User, 'id' | 'email' | 'full_name' | 'role'>

export function ShellClient({
  user,
  initialUnreadCount,
  children,
  notificationsEnabled = true,
}: {
  user: ShellUser
  initialUnreadCount: number
  children: React.ReactNode
  /** Local shell fixtures disable polling; authenticated app shells keep it. */
  notificationsEnabled?: boolean
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Nothing inside the shell scrolls the page itself, so its height has to
  // track the visible area rather than 100vh — see the hook for why iOS turns
  // the difference into a white half-screen.
  useAppViewport()

  useEffect(() => {
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1')
  }, [])

  useEffect(() => {
    if (!sidebarOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setSidebarOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [sidebarOpen])

  function toggleSidebarCollapsed() {
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <SidebarContextProvider>
      <div className="flex h-[var(--app-height,100dvh)] flex-col overflow-hidden bg-background">
        <Topbar
          user={user}
          initialUnreadCount={initialUnreadCount}
          onMenuToggle={() => setSidebarOpen(o => !o)}
          sidebarCollapsed={sidebarCollapsed}
          sidebarOpen={sidebarOpen}
          notificationsEnabled={notificationsEnabled}
          onSidebarCollapseToggle={toggleSidebarCollapsed}
          onLogoNavigate={() => setSidebarOpen(false)}
        />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {sidebarOpen && (
            <div
              className="fixed inset-0 top-16 z-20 bg-overlay md:hidden"
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
            <main
              className={cn(
                'flex-1 overflow-y-auto overscroll-contain bg-muted/30 p-6',
                sidebarCollapsed &&
                  'md:[&>.assignment-create-stage]:max-w-[calc(42rem+(var(--spacing)*44))]',
              )}
            >
              {children}
            </main>
          </div>
        </div>
      </div>
    </SidebarContextProvider>
  )
}
