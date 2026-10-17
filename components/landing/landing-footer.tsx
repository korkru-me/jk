import Link from 'next/link'
import { BrandLogo } from '@/components/brand-logo'
import { LegalLinks } from '@/components/legal/legal-links'
import { Separator } from '@/components/ui/separator'
import { LEGAL_LINKS } from '@/lib/legal'

export function LandingFooter() {
  return (
    <footer className="bg-card">
      <Separator />
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="flex max-w-md flex-col gap-2">
            <Link href="/" aria-label="KorKru หน้าหลัก" className="inline-flex min-h-11 w-fit items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <BrandLogo compact />
            </Link>
            <p className="text-sm leading-6 text-muted-foreground">
              พื้นที่สร้างโจทย์ จัดห้องเรียน และติดตามงานสำหรับครูและนักเรียน
            </p>
          </div>
          <nav aria-label="บัญชีและความช่วยเหลือ" className="flex flex-wrap gap-x-4 gap-y-1">
            {[
              { href: '/signup', label: 'สมัครสมาชิก' },
              { href: '/login', label: 'เข้าสู่ระบบ' },
              { href: LEGAL_LINKS.contact, label: 'ติดต่อผู้ดูแล' },
            ].map(({ href, label }) => (
              <Link key={href} href={href} className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <Separator />
        <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">© 2026 KorKru — ก่อการเรียนรู้ โดยครู</p>
          <LegalLinks />
        </div>
      </div>
    </footer>
  )
}
