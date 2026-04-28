'use client'

import { logout } from '@/lib/actions/auth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { User } from '@/lib/types'

interface TopbarProps {
  user: User
  onMenuToggle?: () => void
}

export function Topbar({ user, onMenuToggle }: TopbarProps) {
  return (
    <header className="h-16 border-b bg-white flex items-center justify-between px-4 sm:px-6 shrink-0">
      <button
        className="md:hidden p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
        onClick={onMenuToggle}
        aria-label="เปิดเมนู"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <div className="hidden md:block" />
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted transition-colors outline-none">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
            {user.full_name.charAt(0)}
          </div>
          <span className="text-sm hidden sm:block">{user.full_name}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled>
            <span className="text-xs text-gray-500">{user.email}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <form action={logout} className="w-full">
              <button type="submit" className="w-full text-left text-red-600 text-sm">
                ออกจากระบบ
              </button>
            </form>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
