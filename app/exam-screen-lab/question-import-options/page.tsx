import { notFound } from 'next/navigation'
import ImportQuestionsPage from '@/app/(app)/questions/import/page'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'

export const dynamic = 'force-dynamic'

/** The real import chooser; opening the page does not select or import a file. */
export default function QuestionImportOptionsLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <main className="p-4"><ImportQuestionsPage /></main>
}
