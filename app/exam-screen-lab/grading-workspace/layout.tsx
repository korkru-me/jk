import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { GradingWorkspaceLabShell } from './grading-workspace-lab'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ทดลองหน้าตรวจให้คะแนน — KorKru', robots: { index: false, follow: false } }

export default function GradingWorkspaceLabLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production' || !isExamScreenLabEnabled(process.env)) notFound()
  return <GradingWorkspaceLabShell>{children}</GradingWorkspaceLabShell>
}
