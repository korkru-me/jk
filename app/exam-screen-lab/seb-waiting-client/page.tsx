import { notFound } from 'next/navigation'
import { SebWaitingClientLab } from '@/components/exam/seb-waiting-client-lab'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'

export const metadata = { title: 'UI QA หน้าสอบ SEB จำลองในเครื่อง — KorKru' }
export const dynamic = 'force-dynamic'

export default function SebWaitingClientLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <SebWaitingClientLab />
}
