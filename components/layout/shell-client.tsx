'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import type { User } from '@/lib/types'

const SIDEBAR_COLLAPSE_KEY = 'korkru:sidebar-collapsed'

export function ShellClient({ user, children }: { user: User; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

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

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
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
          onMenuToggle={() => setSidebarOpen(o => !o)}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarCollapseToggle={toggleSidebarCollapsed}
        />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
