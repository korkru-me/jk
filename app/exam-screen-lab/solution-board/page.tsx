import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { SolutionLabClient } from './_components/solution-lab-client'

export const metadata = { title: 'ห้องทดลองเฉลย — KorKru' }
export const dynamic = 'force-dynamic'

/**
 * Local/Staging-only workbench for the เฉลย section every question form
 * shares: attaching pictures and PDFs, and the กระดานเขียนเฉลย. Files stay in
 * the tab's memory — nothing is uploaded, and nobody has to sign in.
 * Production receives a 404.
 */
export default function SolutionBoardLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <SolutionLabClient />
}
