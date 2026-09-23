import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2, ShieldAlert } from 'lucide-react'
import { Card } from '@/components/ui/card'

export const metadata: Metadata = { title: 'ออกจาก Safe Exam Browser — KorKru' }

export default function SebQuitFallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card padding="2xl" elevation="sm" className="w-full max-w-lg text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 size={28} aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-bold">ส่งข้อสอบเรียบร้อยแล้ว</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Safe Exam Browser ควรปิดหน้าต่างสอบให้อัตโนมัติก่อนเปิดหน้านี้
        </p>

        <div className="mt-5 rounded-xl border border-warning/20 bg-warning/10 p-4 text-left text-sm">
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <ShieldAlert size={17} aria-hidden />
            หากยังเห็นหน้านี้อยู่ใน Safe Exam Browser
          </p>
          <p className="mt-1 text-foreground">
            อย่าพยายามปิดโปรแกรมเอง ให้แจ้งครูผู้คุมสอบเพื่อตรวจไฟล์ตั้งค่าก่อนออกจากห้องสอบ
          </p>
        </div>

        <Link
          href="/assignments"
          className="mt-5 inline-flex min-h-10 items-center justify-center rounded-xl border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
        >
          กลับไปหน้ารายการงาน
        </Link>
      </Card>
    </main>
  )
}
