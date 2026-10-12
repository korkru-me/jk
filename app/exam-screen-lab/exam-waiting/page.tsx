import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { ExamWaitingLab } from '@/components/exam/exam-waiting-lab'
import { ShellClient } from '@/components/layout/shell-client'

export const metadata = { title: 'ทดลองหน้ารอสอบ — KorKru' }
export const dynamic = 'force-dynamic'

export default function ExamWaitingLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return (
    <ShellClient
      user={{ id: '80000000-0000-4000-8000-000000000001', email: 'waiting@example.invalid', full_name: 'ครูจำลอง', role: 'teacher' }}
      initialUnreadCount={0}
      notificationsEnabled={false}
    >
      <ExamWaitingLab />
    </ShellClient>
  )
}
