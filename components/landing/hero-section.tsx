import Link from 'next/link'
import { ArrowRight, Sparkles, ShieldCheck } from 'lucide-react'

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
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-950/60 dark:text-indigo-300">
          <Sparkles className="h-3.5 w-3.5" />
          รองรับโครงสร้างข้อสอบตามกรอบ PISA และ ONET
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

        {/* Subtitle */}
        <p className="mx-auto mt-6 max-w-2xl text-xl text-slate-600 dark:text-slate-400 leading-relaxed">
          สร้างโจทย์ฟิสิกส์ที่{' '}
          <strong className="text-slate-900 dark:text-white">
            สุ่มตัวเลขต่างกันทุกคน
          </strong>{' '}
          วิเคราะห์ผู้เรียน ประหยัดเวลาครู
          พิมพ์ใบงาน A4 ได้ทันที
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-700 transition-all hover:shadow-indigo-500/40 hover:-translate-y-0.5"
          >
            เริ่มต้นใช้งานฟรี
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-8 py-4 text-base font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
          >
            ดูราคาแพ็กเกจ
          </Link>
        </div>

        {/* Social proof line */}
        <p className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-400 dark:text-slate-500">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          ใช้งานฟรี · ไม่ต้องใช้บัตรเครดิต · ยกเลิกได้ตลอดเวลา
        </p>

        {/* Hero Visual */}
        <div className="relative mx-auto mt-16 max-w-4xl">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900 dark:shadow-slate-900/80">
            {/* Fake browser chrome */}
            <div className="flex h-10 items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 dark:border-slate-800 dark:bg-slate-800/60">
              <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <div className="mx-auto flex h-5 w-64 items-center justify-center rounded-md bg-slate-200/70 dark:bg-slate-700">
                <span className="text-xs text-slate-400 dark:text-slate-500">korkru.app/dashboard</span>
              </div>
            </div>

            {/* Dashboard mockup */}
            <div className="grid grid-cols-3 gap-3 p-5 sm:grid-cols-5">
              {[
                { label: 'โจทย์ทั้งหมด', val: '284', color: 'indigo' },
                { label: 'ห้องเรียน', val: '6', color: 'violet' },
                { label: 'นักเรียน', val: '142', color: 'emerald' },
                { label: 'ส่งงานวันนี้', val: '38', color: 'amber' },
                { label: 'คะแนนเฉลี่ย', val: '78%', color: 'cyan' },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700/50 dark:bg-slate-800/60"
                >
                  <p className="text-xs text-slate-500 dark:text-slate-400">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                    {card.val}
                  </p>
                </div>
              ))}
              <div className="col-span-3 sm:col-span-5 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700/50 dark:bg-slate-800/60">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">ตัวอย่างโจทย์สุ่มตัวเลข</p>
                <div className="rounded-lg bg-white p-3 text-sm text-slate-700 font-mono leading-relaxed dark:bg-slate-900 dark:text-slate-200 border border-slate-100 dark:border-slate-700">
                  <span className="text-indigo-600 dark:text-indigo-400">วัตถุมวล</span>{' '}
                  <strong className="text-emerald-600 dark:text-emerald-400">4.2 kg</strong>{' '}
                  <span className="text-indigo-600 dark:text-indigo-400">เคลื่อนที่ด้วยความเร่ง</span>{' '}
                  <strong className="text-emerald-600 dark:text-emerald-400">3.8 m/s²</strong>{' '}
                  <span className="text-indigo-600 dark:text-indigo-400">แรงสุทธิที่กระทำคือ</span>{' '}
                  <strong className="text-amber-600 dark:text-amber-400">? N</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Floating badges */}
          <div className="absolute -left-4 top-24 hidden rounded-xl border border-emerald-200 bg-white p-3 shadow-lg dark:border-emerald-800/60 dark:bg-slate-900 sm:block">
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">ตรวจอัตโนมัติ</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">15.96 N</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">คำตอบถูกต้อง</p>
          </div>
          <div className="absolute -right-4 bottom-16 hidden rounded-xl border border-indigo-200 bg-white p-3 shadow-lg dark:border-indigo-800/60 dark:bg-slate-900 sm:block">
            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">นักเรียนแต่ละคน</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">ได้ตัวเลขต่างกัน</p>
          </div>
        </div>
      </div>
    </section>
  )
}
