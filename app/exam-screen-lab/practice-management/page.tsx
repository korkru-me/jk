import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { PracticeManagementLab } from './practice-management-lab'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'จัดการคลังฝึก · ตัวอย่าง — KorKru' }

export default function PracticeManagementLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <PracticeManagementLab />
}
