import { notFound } from 'next/navigation'
import { CheckEmailForm } from '@/components/auth/check-email-form'
import { Card } from '@/components/ui/card'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ยืนยันอีเมลจำลอง — KorKru', robots: { index: false, follow: false } }

export default function SignupFeedbackLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const email = 'teacher@example.invalid'
  return <main className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
    <p className="text-sm text-muted-foreground">ข้อมูลสมมติสำหรับตรวจผลยืนยันอีเมล ไม่อ่านบัญชีหรือส่งอีเมล</p>
    <Card padding="md">
      <CheckEmailForm initialEmail={email} initialConfirmedEmail={email} />
    </Card>
  </main>
}
