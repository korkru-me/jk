import type { Metadata } from 'next'
import { LandingNavbar } from '@/components/landing/landing-navbar'
import { HeroSection } from '@/components/landing/hero-section'
import { LegalLinks } from '@/components/legal/legal-links'

export const metadata: Metadata = {
  title: 'KorKru — ก่อการเรียนรู้ โดยครู (Demo)',
  description: 'เวอร์ชัน Demo สำหรับทดลองใช้งาน',
}

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-card">
      <LandingNavbar />

      <HeroSection />
      <footer className="px-4 py-3"><LegalLinks /></footer>
    </main>
  )
}
