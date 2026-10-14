'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Sidebar } from './sidebar'
import { SidebarContextProvider } from './sidebar-context'
import { AppFeatureFlagsProvider } from './app-feature-flags'
import { Topbar } from './topbar'
import { useAppViewport } from '@/hooks/use-app-viewport'
import type { User } from '@/lib/types'

const SIDEBAR_COLLAPSE_KEY = 'korkru:sidebar-collapsed'

export type ShellUser = Pick<User, 'id' | 'email' | 'full_name' | 'role'>

export function ShellClient({
  user,
  initialUnreadCount,
  children,
  notificationsEnabled = true,
  previewNavigationOnly,
  practiceLibraryEnabled = false,
}: {
  user: ShellUser
  initialUnreadCount: number
  children: React.ReactNode
  /** Local shell fixtures disable polling; authenticated app shells keep it. */
  notificationsEnabled?: boolean
  /** Local shell fixtures can exercise the assignment-preview navigation. */
  previewNavigationOnly?: boolean
  /** Server-derived presentation gate; route authorization remains independent. */
  practiceLibraryEnabled?: boolean
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)

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

  useLayoutEffect(() => {
    const shell = shellRef.current
    const notificationAnchor = shell?.querySelector<HTMLElement>('[data-notification-anchor]')
    if (!shell || !notificationAnchor) return

    const alignAssignmentStage = () => {
      const shellRect = shell.getBoundingClientRect()
      const anchorRect = notificationAnchor.getBoundingClientRect()
      const rightInset = Math.max(0, shellRect.right - (anchorRect.left + anchorRect.width / 2))
      shell.style.setProperty('--notification-anchor-right-inset', `${rightInset}px`)
    }

    alignAssignmentStage()
    const observer = new ResizeObserver(alignAssignmentStage)
    observer.observe(shell)
    if (notificationAnchor.parentElement) observer.observe(notificationAnchor.parentElement)
    window.addEventListener('resize', alignAssignmentStage)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', alignAssignmentStage)
    }
  }, [])

  function toggleSidebarCollapsed() {
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <AppFeatureFlagsProvider practiceLibrary={practiceLibraryEnabled}>
      <SidebarContextProvider>
        <div
          ref={shellRef}
          className="flex h-[var(--app-height,100dvh)] flex-col overflow-hidden bg-background [--notification-anchor-right-inset:calc(var(--spacing)*30)]"
        >
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
                className="fixed inset-0 top-12 z-20 bg-overlay md:hidden"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <Sidebar
              role={user.role}
              fullName={user.full_name}
              isOpen={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
              collapsed={sidebarCollapsed}
              previewNavigationOnly={previewNavigationOnly}
            />
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <main className="flex-1 overflow-y-auto overscroll-contain bg-muted/30 p-6 md:[&>.assignment-create-stage]:max-w-[calc(100%+(var(--spacing)*6)-var(--notification-anchor-right-inset))] md:[&>.assignment-edit-stage]:max-w-[calc(100%+(var(--spacing)*6)-var(--notification-anchor-right-inset))] md:[&>.assignment-waiting-stage]:max-w-[calc(100%+(var(--spacing)*6)-var(--notification-anchor-right-inset))] md:[&>.classroom-create-stage]:max-w-[calc(100%+(var(--spacing)*6)-var(--notification-anchor-right-inset))] lg:[&>.student-profile-stage]:max-w-[calc(100%+(var(--spacing)*6)-var(--notification-anchor-right-inset))] lg:[&>.student-learning-stage]:[--student-content-width:min(calc(100%+(var(--spacing)*6)-var(--notification-anchor-right-inset)),calc(100%-15rem))]">
                {children}
              </main>
            </div>
          </div>
        </div>
      </SidebarContextProvider>
    </AppFeatureFlagsProvider>
  )
}
