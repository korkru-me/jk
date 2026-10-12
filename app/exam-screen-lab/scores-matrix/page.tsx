import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { ScoresMatrixLabClient } from './_components/scores-matrix-lab-client'

export const metadata = { title: 'ห้องทดลองตารางคะแนน — KorKru' }
export const dynamic = 'force-dynamic'

export default function ScoresMatrixLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <ScoresMatrixLabClient />
}
