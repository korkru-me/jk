import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { ProctorHistoryLab } from './proctor-history-lab'

export const dynamic = 'force-dynamic'
export default async function ProctorHistoryLabPage({ searchParams }: { searchParams: Promise<{ fail?: string }> }) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <ProctorHistoryLab fail={(await searchParams).fail === '1'} />
}
