'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User, Users, School, Palette, BookOpen, Bell, CreditCard, HardDrive } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/types'

const STUDENT_NAV_ITEMS = [
  {
    href: '/settings/profile',
    label: 'ข้อมูลส่วนตัว',
    icon: User,
    description: 'โปรไฟล์, ข้อมูลนักเรียน, รหัสผ่าน',
  },
]

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
    href: '/settings/team',
    label: 'ทีมของฉัน',
    icon: School,
    description: 'สร้าง/เข้าร่วมทีม, แชร์โจทย์',
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
    description: 'ค่าเริ่มต้นและความพร้อม SEB',
  },
  {
    href: '/settings/notifications',
    label: 'การแจ้งเตือน',
    icon: Bell,
    description: 'อีเมล, การแจ้งเตือนในระบบ',
  },
  {
    href: '/settings/storage',
    label: 'พื้นที่จัดเก็บไฟล์',
    icon: HardDrive,
    description: 'เก็บกวาดรูปที่ไม่ได้ใช้แล้ว',
  },
  {
    href: '/settings/billing',
    label: 'สมาชิกและการชำระเงิน',
    icon: CreditCard,
    description: 'แพ็กเกจ, ใบเสร็จ',
  },
]

export function SettingsNav({ role }: { role?: UserRole }) {
  const pathname = usePathname()
  const items = role === 'student' ? STUDENT_NAV_ITEMS : NAV_ITEMS

  return (
    <nav className="flex flex-col gap-1">
      {items.map(item => {
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
