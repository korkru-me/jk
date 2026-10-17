import { notFound } from 'next/navigation'
import NewQuestionTypePage from '@/app/(app)/questions/new/page'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'

export const dynamic = 'force-dynamic'

/** The real chooser with written examples only; no Auth, database or uploads. */
export default function QuestionSamplesLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <main className="p-4"><NewQuestionTypePage /></main>
}
