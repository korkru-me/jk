import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { AssignmentPresetsLab } from './_components/assignment-presets-lab'

export const dynamic = 'force-dynamic'
export default function AssignmentPresetsLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <AssignmentPresetsLab />
}
