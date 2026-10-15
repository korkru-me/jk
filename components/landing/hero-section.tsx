import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'

import { BRAND_MARK_ASPECT_RATIO, BRAND_MARK_URL } from '@/components/brand-mark-data'
import { HeroHeadline } from '@/components/landing/hero-headline'

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-card">
      {/* Background gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(99,102,241,0.12),transparent)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(99,102,241,0.18),transparent)]"
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 text-center sm:pb-20 sm:pt-20">
        <div className="relative mx-auto mb-8 w-fit">
          {/* Approved deer mark, shared with the navigation logo. */}
          <span
            aria-hidden="true"
            className="block h-28 bg-brand-accent sm:h-36 lg:h-40"
            style={{
              WebkitMask: `url('${BRAND_MARK_URL}') center / contain no-repeat`,
              mask: `url('${BRAND_MARK_URL}') center / contain no-repeat`,
              aspectRatio: BRAND_MARK_ASPECT_RATIO,
            }}
          />

          <div className="absolute -bottom-2 left-[calc(100%-1rem)] inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-warning/20 bg-warning/10 px-2 py-1.5 text-xs font-medium text-warning min-[360px]:gap-1.5 min-[360px]:px-3 sm:bottom-3 sm:left-full sm:ml-6 sm:gap-2 sm:px-4 sm:text-sm">
            <Sparkles className="size-3 sm:size-3.5" />
            เวอร์ชัน Demo
          </div>
        </div>

        {/* Headline */}
        <HeroHeadline />

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all hover:shadow-primary/40 hover:-translate-y-0.5"
          >
            เริ่มต้นทดสอบการใช้งาน
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
