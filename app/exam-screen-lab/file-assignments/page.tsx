import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { FileAssignmentsLab } from './file-assignments-lab'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ตัวอย่างงานส่งไฟล์ — KorKru' }

export default function FileAssignmentsLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <FileAssignmentsLab serverNow={new Date().toISOString()} />
}
