import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { FileAssignmentsLab } from './file-assignments-lab'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ตัวอย่างงานส่งไฟล์ — KorKru' }

export default async function FileAssignmentsLabPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const { mode } = await searchParams
  return <FileAssignmentsLab serverNow={new Date().toISOString()} mode={mode === 'global' || mode === 'locked' ? mode : 'context'} />
}
