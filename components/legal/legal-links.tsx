import Link from 'next/link'
import { LEGAL_LINKS } from '@/lib/legal'
import { cn } from '@/lib/utils'

interface LegalLinksProps {
  className?: string
}

export function LegalLinks({ className }: LegalLinksProps) {
  return (
    <nav aria-label="ข้อมูลการใช้บริการ" className={cn('flex flex-wrap gap-x-4 gap-y-1', className)}>
      {[
        { href: LEGAL_LINKS.terms, label: 'เงื่อนไขการให้บริการ' },
        { href: LEGAL_LINKS.privacy, label: 'ความเป็นส่วนตัว' },
        { href: LEGAL_LINKS.contact, label: 'ติดต่อผู้ดูแล' },
      ].map(({ href, label }) => (
        <Link key={href} href={href} className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {label}
        </Link>
      ))}
    </nav>
  )
}
