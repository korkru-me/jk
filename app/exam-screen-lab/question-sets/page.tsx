import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { QuestionSetsLabClient } from './_components/question-sets-lab-client'

export const metadata = { title: 'ห้องทดลองแฟ้มโจทย์ — KorKru' }
export const dynamic = 'force-dynamic'

/** Local/Staging-only visual fixture. Its initial render uses synthetic sets and never reads Supabase. */
export default function QuestionSetsLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <QuestionSetsLabClient />
}
