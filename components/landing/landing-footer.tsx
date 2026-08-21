import Link from 'next/link'

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
                K
              </div>
              <span className="font-bold text-foreground">KorKru</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              แพลตฟอร์มคลังข้อสอบอัจฉริยะ สำหรับครูและสถาบันการศึกษา สร้างโดยครู เพื่อครู
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              ผลิตภัณฑ์
            </h3>
            <ul className="space-y-2">
              {[
                { href: '/pricing', label: 'ราคาและแพ็กเกจ' },
                { href: '/signup', label: 'สมัครใช้งานฟรี' },
                { href: '/login', label: 'เข้าสู่ระบบ' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground dark:hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              บริษัท
            </h3>
            <ul className="space-y-2">
              {[
                { href: '#', label: 'เกี่ยวกับเรา' },
                { href: 'mailto:hello@korkru.app', label: 'ติดต่อเรา' },
                { href: '#', label: 'บล็อก' },
              ].map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground dark:hover:text-white transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              กฎหมาย
            </h3>
            <ul className="space-y-2">
              {[
                { href: '#', label: 'เงื่อนไขการให้บริการ' },
                { href: '#', label: 'นโยบายความเป็นส่วนตัว' },
                { href: '#', label: 'นโยบายคุกกี้' },
                { href: '#', label: 'การคุ้มครองข้อมูล (PDPA)' },
              ].map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground dark:hover:text-white transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © 2026 KorKru — ก่อการเรียนรู้ โดยครู
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>รองรับกรอบ PISA</span>
            <span>•</span>
            <span>ISO 27001 Ready</span>
            <span>•</span>
            <span>PDPA Compliant</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
