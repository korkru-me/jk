import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { BellLab } from './bell-lab'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'ทดลองกระดิ่งแจ้งเตือน — KorKru' }
export default async function BellLabPage({ searchParams }: { searchParams: Promise<{ fail?: string }> }) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <BellLab fail={(await searchParams).fail === '1'} />
}
