'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useTheme } from 'next-themes'
import { Menu, Moon, Sun } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'
import { cn } from '@/lib/utils'
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
  sidebarOpen?: boolean
  notificationsEnabled?: boolean
  onSidebarCollapseToggle?: () => void
  onLogoNavigate?: () => void
}

export function Topbar({ user, initialUnreadCount, onMenuToggle, sidebarCollapsed = false, sidebarOpen = false, notificationsEnabled = true, onSidebarCollapseToggle, onLogoNavigate }: TopbarProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const [themeMounted, setThemeMounted] = useState(false)
  const isDark = resolvedTheme === 'dark'

  useEffect(() => setThemeMounted(true), [])

  return (
    <header className="h-16 border-b bg-card flex items-center justify-between gap-2 px-2 sm:px-6 shrink-0">
      <div className="flex shrink-0 items-center gap-2">
        <IconButton
          className="size-11 md:hidden"
          onClick={onMenuToggle}
          label={sidebarOpen ? 'ปิดเมนูด้านข้าง' : 'เปิดเมนูด้านข้าง'}
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
        >
          <Menu />
        </IconButton>
        <IconButton
          className="hidden size-11 md:inline-flex"
          onClick={onSidebarCollapseToggle}
          label={sidebarCollapsed ? 'ขยายเมนูด้านข้าง' : 'ย่อเมนูด้านข้าง'}
          aria-expanded={!sidebarCollapsed}
          aria-controls="app-sidebar"
        >
          <Menu />
        </IconButton>

        <Link href="/dashboard" onClick={onLogoNavigate} title="KorKru · หน้าหลัก" className="shrink-0">
          <Image
            src="/logo.png"
            alt="KorKru"
            width={423}
            height={576}
            className="h-11 w-auto object-contain dark:brightness-0 dark:invert"
          />
        </Link>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* Notifications */}
        {notificationsEnabled
          ? <NotificationsBell initialUnreadCount={initialUnreadCount} />
          // Keep the real bell's footprint in local fixtures without polling.
          : <span aria-hidden="true" className="size-9 shrink-0" />}

        {/* Dark / Light toggle switch */}
        {themeMounted ? (
          <div className="flex items-center gap-1.5">
            <Sun size={13} className={cn('hidden sm:block', isDark ? 'text-muted-foreground' : 'text-warning')} />
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
            <Moon size={13} className={cn('hidden sm:block', isDark ? 'text-primary' : 'text-muted-foreground')} />
          </div>
        ) : <div className="h-6 w-[81px]" aria-hidden="true" />}

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted transition-colors outline-none">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
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
