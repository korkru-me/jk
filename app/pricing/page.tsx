import type { Metadata } from 'next'
import Link from 'next/link'
import { LandingNavbar } from '@/components/landing/landing-navbar'
import { LandingFooter } from '@/components/landing/landing-footer'
import { PricingTable } from '@/components/landing/pricing-table'
import { Card } from '@/components/ui/card'
import { MessageCircle } from 'lucide-react'

export const metadata: Metadata = {
  title: 'ราคาและแพ็กเกจ — KorKru',
  description: 'เลือกแพ็กเกจที่เหมาะกับคุณ เริ่มต้นฟรี ไม่ต้องใช้บัตรเครดิต',
}

const FAQS = [
  {
    q: 'ทดลองใช้ฟรี 14 วันต้องใช้บัตรเครดิตไหม?',
    a: 'ไม่จำเป็นครับ คุณสามารถเริ่มทดลองใช้ Pro Plan ได้ทันทีโดยไม่ต้องผูกบัตรเครดิต หลังครบ 14 วันระบบจะย้ายกลับไป Free Plan อัตโนมัติ',
  },
  {
    q: 'ถ้าต้องการยกเลิกแพ็กเกจต้องทำอย่างไร?',
    a: 'คุณสามารถยกเลิกได้ตลอดเวลาจากหน้า Settings > Billing โดยไม่มีค่าปรับ ข้อมูลของคุณจะยังคงอยู่จนหมดรอบบิลปัจจุบัน',
  },
  {
    q: 'Enterprise Plan รองรับนักเรียนได้กี่คน?',
    a: 'Enterprise Plan ไม่จำกัดจำนวนนักเรียน สามารถรองรับได้ตั้งแต่หลักร้อยถึงหลักพันคนต่อองค์กร รองรับ Custom Domain และ SSO',
  },
  {
    q: 'ข้อมูลของนักเรียนปลอดภัยไหม?',
    a: 'ระบบปฏิบัติตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) ข้อมูลถูกเข้ารหัสทั้ง In-transit และ At-rest จัดเก็บบน Supabase Cloud ที่มี ISO 27001',
  },
]

export default function PricingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-card">
      <LandingNavbar />

      {/* Header */}
      <section className="bg-gradient-to-b from-indigo-50/60 to-white py-16 text-center dark:from-indigo-950/30 dark:to-slate-950">
        <div className="mx-auto max-w-3xl px-4">
          <h1 className="text-4xl font-extrabold text-foreground sm:text-5xl">
            ราคาที่ยุติธรรม เพื่อครูทุกคน
          </h1>
          <p className="mt-4 text-xl text-muted-foreground">
            เริ่มต้นฟรี อัปเกรดเมื่อพร้อม ไม่มีค่าใช้จ่ายซ่อนเร้น
          </p>
        </div>
      </section>

      {/* Pricing Table */}
      <section className="mx-auto w-full max-w-6xl px-4 py-12">
        <PricingTable />
      </section>

      {/* FAQ */}
      <section className="bg-muted py-16 dark:bg-slate-900/40">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-2xl font-bold text-foreground mb-8">
            คำถามที่พบบ่อย
          </h2>
          <div className="space-y-4">
            {FAQS.map((faq) => (
              <Card key={faq.q} radius="md" padding="lg">
                <p className="font-semibold text-foreground mb-1.5">{faq.q}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="bg-card py-12 text-center dark:bg-slate-950">
        <div className="mx-auto max-w-xl px-4">
          <div className="flex justify-center mb-4">
            <MessageCircle className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">
            ยังมีคำถามอีกไหม?
          </h2>
          <p className="mt-2 text-muted-foreground">
            ทีมงานของเรายินดีให้คำปรึกษาและเสนอราคาสำหรับโรงเรียนและองค์กร
          </p>
          <a
            href="mailto:hello@korkru.app"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            ติดต่อเรา
          </a>
        </div>
      </section>

      <LandingFooter />
    </main>
  )
}
