import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { GradingCorrectionsLab } from './grading-corrections-lab'

export const metadata = { title: 'ทดลองแก้เฉลยและทำข้อเป็นโมฆะ — KorKru', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function GradingCorrectionsLabPage({
  searchParams,
}: {
  searchParams: Promise<{ active?: string; type?: string }>
}) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const params = await searchParams
  const type = params.type === 'written' ? 'written' : 'mcq'
  const active = params.active === '1'
  return <GradingCorrectionsLab key={`${type}-${active}`} active={active} questionType={type} />
}
