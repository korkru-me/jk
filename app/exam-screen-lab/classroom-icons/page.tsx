import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { randomClassroomCoverPatternKey } from '@/lib/classroom-cover-patterns'
import { ClassroomIconsLab } from './_components/classroom-icons-lab'

export const dynamic = 'force-dynamic'
export default function ClassroomIconsLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <ClassroomIconsLab initialCoverPattern={randomClassroomCoverPatternKey()} />
}
