import type { Metadata } from 'next'
import { LandingNavbar } from '@/components/landing/landing-navbar'
import { HeroSection } from '@/components/landing/hero-section'

export const metadata: Metadata = {
  title: 'KorKru — ก่อการเรียนรู้ โดยครู (Demo)',
  description: 'เวอร์ชัน Demo สำหรับทดลองใช้งาน',
}

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-white dark:bg-slate-950">
      <LandingNavbar />

      <HeroSection />
    </main>
  )
}
