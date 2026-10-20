import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { AssignmentReminderLab } from './reminder-lab'

export const metadata = { title: 'ห้องทดลองแจ้งเตือนงาน — KorKru' }
export const dynamic = 'force-dynamic'

export default function AssignmentReminderLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <AssignmentReminderLab />
}
