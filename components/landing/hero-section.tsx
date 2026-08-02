import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white dark:bg-slate-950">
      {/* Background gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(99,102,241,0.12),transparent)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(99,102,241,0.18),transparent)]"
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-20 text-center sm:pt-32">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/60 dark:text-amber-300">
          <Sparkles className="h-3.5 w-3.5" />
          เวอร์ชัน Demo
        </div>

        {/* Headline */}
        <h1 className="mx-auto max-w-4xl text-5xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-6xl lg:text-7xl">
          ก่อการเรียนรู้{' '}
          <span className="relative">
            <span className="relative z-10 bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              โดยครู
            </span>
          </span>
        </h1>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-700 transition-all hover:shadow-indigo-500/40 hover:-translate-y-0.5"
          >
            เริ่มต้นทดสอบการใช้งาน
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
