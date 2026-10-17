import type { ReactNode } from 'react'
import Link from 'next/link'
import { BrandLogo } from '@/components/brand-logo'
import { LegalLinks } from '@/components/legal/legal-links'
import { Card } from '@/components/ui/card'
import { POLICY_UPDATED_LABEL, POLICY_VERSION } from '@/lib/legal'

export interface LegalSection {
  id: string
  title: string
  content: ReactNode
}

interface LegalDocumentProps {
  title: string
  description: string
  sections: LegalSection[]
}

export function LegalDocument({ title, description, sections }: LegalDocumentProps) {
  return (
    <main className="min-h-screen bg-background px-4 py-4 sm:py-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/" aria-label="KorKru หน้าหลัก" className="inline-flex min-h-11 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <BrandLogo compact />
          </Link>
          <Link href="/signup" className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            ไปหน้าสมัครสมาชิก
          </Link>
        </header>
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">ฉบับวันที่ <time dateTime={POLICY_VERSION}>{POLICY_UPDATED_LABEL}</time></p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{description}</p>
        </div>
        <div className="grid items-start gap-3 md:grid-cols-[13rem_minmax(0,1fr)]">
          <Card padding="sm" radius="md" className="md:sticky md:top-4">
            <nav aria-label={`หัวข้อ${title}`}>
              <p className="px-2 pb-1 text-sm font-semibold">หัวข้อในหน้านี้</p>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 md:grid-cols-1">
                {sections.map(({ id, title: sectionTitle }) => (
                  <li key={id}>
                    <a href={`#${id}`} className="flex min-h-11 items-center rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                      {sectionTitle}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </Card>
          <Card padding="md" radius="md" className="min-w-0 sm:px-5">
            <article className="flex flex-col gap-5">
              {sections.map(({ id, title: sectionTitle, content }) => (
                <section key={id} id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-4 flex-col gap-2">
                  <h2 id={`${id}-title`} className="text-base font-semibold">{sectionTitle}</h2>
                  <div className="flex flex-col gap-2 text-sm leading-7 text-muted-foreground [&_a]:break-words [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-offset-2 [&_a]:focus-visible:outline-ring [&_li]:pl-1 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1 [&_ul]:pl-5">
                    {content}
                  </div>
                </section>
              ))}
            </article>
          </Card>
        </div>
        <footer className="flex flex-col gap-1">
          <LegalLinks />
          <p className="text-xs text-muted-foreground">KorKru / ก่อครู — ก่อการเรียนรู้ โดยครู</p>
        </footer>
      </div>
    </main>
  )
}
