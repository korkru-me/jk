import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { ClassroomThemesLab } from './classroom-themes-lab'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ธีมสีภายในห้องเรียน · ตัวอย่าง — KorKru' }

export default function ClassroomThemesLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <ClassroomThemesLab />
}
