'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Moon, Sun, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton } from '@/components/ui/icon-button'

const NAV_LINKS: { href: string; label: string }[] = []

export function LandingNavbar() {
  const { theme, setTheme } = useTheme()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <nav className="sticky top-0 z-50 border-b border-border/80 bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm">
            K
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-foreground">KorKru</span>
            <span className="rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning dark:border-warning/60">
              Demo
            </span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname === link.href
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {link.label}
            </Link>
          ))}

          <div className="mx-2 h-5 w-px bg-muted" />

          {mounted && (
            <IconButton
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              label="สลับธีมสว่าง/มืด"
              size="lg"
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </IconButton>
          )}
          {!mounted && <div className="h-9 w-9" />}

          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            เข้าสู่ระบบ
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            สมัครสมาชิก
          </Link>
        </div>

        {/* Mobile menu button */}
        <div className="flex items-center gap-2 sm:hidden">
          {mounted && (
            <IconButton
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              label="สลับธีมสว่าง/มืด"
              size="lg"
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </IconButton>
          )}
          {!mounted && <div className="h-9 w-9" />}
          <IconButton
            onClick={() => setMobileOpen((v) => !v)}
            label={mobileOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
            size="lg"
            className="[&_svg:not([class*=size-])]:size-5"
          >
            {mobileOpen ? <X /> : <Menu />}
          </IconButton>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border bg-card px-4 pb-4 pt-2 sm:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-2 flex gap-2">
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="flex-1 rounded-lg border border-border py-2.5 text-center text-sm font-medium text-muted-foreground"
            >
              เข้าสู่ระบบ
            </Link>
            <Link
              href="/signup"
              onClick={() => setMobileOpen(false)}
              className="flex-1 rounded-lg bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground"
            >
              สมัครสมาชิก
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
