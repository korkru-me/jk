import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { ExamWaitingLab } from '@/components/exam/exam-waiting-lab'

export const metadata = { title: 'ทดลองหน้ารอสอบ — KorKru' }
export const dynamic = 'force-dynamic'

export default function ExamWaitingLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <main className="min-h-dvh bg-background px-4 py-6 sm:px-6"><ExamWaitingLab /></main>
}
