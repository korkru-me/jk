import type { Metadata } from 'next'
import Link from 'next/link'
import { LandingNavbar } from '@/components/landing/landing-navbar'
import { LandingFooter } from '@/components/landing/landing-footer'
import { HeroSection } from '@/components/landing/hero-section'
import { TrustBadges } from '@/components/landing/trust-badges'
import { InteractiveDemo } from '@/components/landing/interactive-demo'
import { CookieConsent } from '@/components/landing/cookie-consent'
import { ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'KorKru — คลังข้อสอบอัจฉริยะ สร้างโดยครู เพื่อครู',
  description:
    'สร้างโจทย์ฟิสิกส์ที่สุ่มตัวเลขต่างกันทุกคน วิเคราะห์ผู้เรียน พิมพ์ใบงาน A4 ได้ทันที รองรับกรอบ PISA',
}

const FEATURES = [
  {
    icon: '🔢',
    title: 'โจทย์สุ่มตัวเลข',
    desc: 'ระบบสุ่มค่าตัวแปรอัตโนมัติ นักเรียนแต่ละคนได้โจทย์ตัวเลขไม่เหมือนกัน ลดการลอกคำตอบ ตรวจอัตโนมัติด้วยสูตร',
  },
  {
    icon: '📝',
    title: 'Editor ง่าย ไม่ต้องเขียน LaTeX',
    desc: '4 วิธีสร้างสูตรคำตอบ พิมพ์เอง คลังสูตร ปุ่มกด และลอกจากโจทย์เดิม รองรับตัวเลขลงตัว',
  },
  {
    icon: '🏫',
    title: 'ระบบห้องเรียนสมบูรณ์',
    desc: 'สร้างห้องเรียน แชร์ Class Code ให้นักเรียนเข้าร่วม มอบหมายชุดข้อสอบ ติดตามความก้าวหน้ารายคน',
  },
  {
    icon: '🖨️',
    title: 'พิมพ์ใบงาน A4 ทันที',
    desc: 'สร้างใบงาน Print-Ready พร้อม QR Code ประจำตัว นักเรียนสแกนส่งงานออนไลน์ได้',
  },
  {
    icon: '📊',
    title: 'Dashboard วิเคราะห์ผู้เรียน',
    desc: 'ดูคะแนนรายคน วิเคราะห์ตัวลวง ระบุจุดอ่อนของห้องเรียน Export Excel ได้ทันที',
  },
  {
    icon: '🔗',
    title: 'โจทย์ต่อเนื่อง Multi-step',
    desc: 'สร้างโจทย์หลายข้อที่ใช้สถานการณ์เดียวกัน ผลลัพธ์ข้อก่อนนำมาคำนวณข้อต่อไป',
  },
]

const HOW_IT_WORKS = [
  {
    step: 1,
    icon: '🖊️',
    title: 'สร้างโจทย์',
    desc: 'ครูสร้างโจทย์ฟิสิกส์พร้อมสูตรคำตอบ กำหนดตัวแปรที่ต้องการสุ่ม และขอบเขตค่าที่ยอมรับ',
  },
  {
    step: 2,
    icon: '📤',
    title: 'มอบหมาย',
    desc: 'เพิ่มโจทย์เป็นชุดข้อสอบ มอบหมายให้ห้องเรียน หรือพิมพ์ใบงานแจกได้ทันที',
  },
  {
    step: 3,
    icon: '📈',
    title: 'ดูผลและวิเคราะห์',
    desc: 'ระบบตรวจคะแนนอัตโนมัติ ครูเห็นผลแบบ Real-time และวิเคราะห์ผู้เรียนได้ลึกซึ้ง',
  },
]

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-white dark:bg-slate-950">
      <LandingNavbar />

      <HeroSection />

      <TrustBadges />

      <InteractiveDemo />

      {/* Features */}
      <section className="bg-slate-50 py-20 dark:bg-slate-900/40">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">
              ฟีเจอร์ที่ครูต้องการ
            </h2>
            <p className="mt-3 text-slate-500 dark:text-slate-400">
              ทุกสิ่งที่คุณต้องการสำหรับการสอนฟิสิกส์ยุคใหม่
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 hover:shadow-md transition-shadow dark:border-slate-700/60 dark:bg-slate-900"
              >
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white py-20 dark:bg-slate-950">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl mb-12">
            เริ่มต้นได้ใน 3 ขั้นตอน
          </h2>
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
            {HOW_IT_WORKS.map((s, i) => (
              <div key={s.step} className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-500/30">
                    <span className="text-2xl">{s.icon}</span>
                  </div>
                  <span className="absolute -bottom-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-xs font-bold text-white dark:border-slate-950">
                    {s.step}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-white text-lg">
                  {s.title}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">{s.desc}</p>
                {i < HOW_IT_WORKS.length - 1 && (
                  <ArrowRight className="hidden sm:block absolute translate-x-32 text-slate-200 dark:text-slate-700 h-6 w-6" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-indigo-600 py-20">
        <div className="mx-auto max-w-2xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            พร้อมเริ่มสอนแบบใหม่แล้วหรือยัง?
          </h2>
          <p className="mt-4 text-indigo-200">
            สมัครฟรี ใช้งานได้ทันที ไม่ต้องใช้บัตรเครดิต
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors shadow-lg"
            >
              สมัครใช้งานฟรี
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-400 px-8 py-4 text-base font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              ดูราคาแพ็กเกจ
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
      <CookieConsent />
    </main>
  )
}
