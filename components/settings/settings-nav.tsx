'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User, Users, Palette, BookOpen, Bell, CreditCard } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  {
    href: '/settings/profile',
    label: 'บัญชีและความปลอดภัย',
    icon: User,
    description: 'โปรไฟล์, รหัสผ่าน, 2FA',
  },
  {
    href: '/settings/organization',
    label: 'พื้นที่ทำงานและทีม',
    icon: Users,
    description: 'สมาชิก, สิทธิ์การใช้งาน',
  },
  {
    href: '/settings/branding',
    label: 'แบรนด์องค์กร',
    icon: Palette,
    description: 'โลโก้, สี, หน้า Login',
  },
  {
    href: '/settings/exam-defaults',
    label: 'ตั้งค่าข้อสอบเริ่มต้น',
    icon: BookOpen,
    description: 'ค่าเริ่มต้นของทุกชุดข้อสอบ',
  },
  {
    href: '/settings/notifications',
    label: 'การแจ้งเตือน',
    icon: Bell,
    description: 'อีเมล, การแจ้งเตือนในระบบ',
  },
  {
    href: '/settings/billing',
    label: 'สมาชิกและการชำระเงิน',
    icon: CreditCard,
    description: 'แพ็กเกจ, ใบเสร็จ',
  },
]

export function SettingsNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(item => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all group',
              isActive
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
              isActive
                ? 'bg-primary/15 text-primary'
                : 'bg-muted/60 text-muted-foreground group-hover:bg-muted group-hover:text-foreground'
            )}>
              <Icon size={15} />
            </div>
            <div className="min-w-0">
              <p className="truncate leading-tight">{item.label}</p>
              <p className={cn(
                'text-[10px] truncate leading-tight mt-0.5',
                isActive ? 'text-primary/60' : 'text-muted-foreground/60'
              )}>
                {item.description}
              </p>
            </div>
          </Link>
        )
      })}
    </nav>
  )
}
