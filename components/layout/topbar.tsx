'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { logout } from '@/lib/actions/auth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NotificationsBell } from '@/components/layout/notifications-bell'
import type { ShellUser } from './shell-client'

interface TopbarProps {
  user: ShellUser
  initialUnreadCount: number
  onMenuToggle?: () => void
  sidebarCollapsed?: boolean
  onSidebarCollapseToggle?: () => void
}

export function Topbar({ user, initialUnreadCount, onMenuToggle, sidebarCollapsed = false, onSidebarCollapseToggle }: TopbarProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-4 sm:px-6 shrink-0">
      <button
        className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
        onClick={onMenuToggle}
        aria-label="เปิดเมนู"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <button
        className="hidden md:flex p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
        onClick={onSidebarCollapseToggle}
        aria-label={sidebarCollapsed ? 'แสดงแถบด้านข้าง' : 'ซ่อนแถบด้านข้าง'}
        title={sidebarCollapsed ? 'แสดงแถบด้านข้าง' : 'ซ่อนแถบด้านข้าง'}
      >
        {sidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
      </button>

      <div className="flex items-center gap-3">
        {/* Notifications */}
        <NotificationsBell initialUnreadCount={initialUnreadCount} />

        {/* Dark / Light toggle switch */}
        <div className="flex items-center gap-1.5">
          <Sun size={13} className={isDark ? 'text-muted-foreground' : 'text-warning'} />
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label="สลับโหมดสี"
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 ${
              isDark ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`pointer-events-none inline-flex h-5 w-5 items-center justify-center rounded-full bg-card shadow-md ring-0 transition-transform duration-200 ${
                isDark ? 'translate-x-5' : 'translate-x-0'
              }`}
            >
              {isDark
                ? <Moon size={10} className="text-primary" />
                : <Sun size={10} className="text-warning" />}
            </span>
          </button>
          <Moon size={13} className={isDark ? 'text-primary' : 'text-muted-foreground'} />
        </div>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted transition-colors outline-none">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold">
              {user.full_name.charAt(0)}
            </div>
            <span className="text-sm hidden sm:block">{user.full_name}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled>
              <span className="text-xs text-muted-foreground">{user.email}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <form action={logout} className="w-full">
                <button type="submit" className="w-full text-left text-destructive text-sm">
                  ออกจากระบบ
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
