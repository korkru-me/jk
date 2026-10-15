import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { ReuseWorkLab } from './reuse-work-lab'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ตัวอย่างนำงานมาใช้ซ้ำ — KorKru' }

export default async function ReuseWorkLabPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <ReuseWorkLab view={(await searchParams).view} />
}
