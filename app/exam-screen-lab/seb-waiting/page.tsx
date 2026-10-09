import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { SebWaitingLab } from '@/components/exam/seb-waiting-lab'

export const metadata = { title: 'ทดลองห้องรอสอบ SEB — KorKru' }
export const dynamic = 'force-dynamic'

export default function SebWaitingLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <main className="min-h-dvh bg-background px-4 py-6 sm:px-6"><SebWaitingLab /></main>
}
