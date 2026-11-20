import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { TrueFalseAuthoringLab } from './true-false-authoring-lab'

export const dynamic = 'force-dynamic'

export default function Page() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <main className="p-3 sm:p-4"><TrueFalseAuthoringLab /></main>
}
