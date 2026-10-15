import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { QuestionSetThemesLab } from './question-set-themes-lab'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ธีมสีแฟ้มโจทย์ · ตัวอย่าง — KorKru' }

export default function QuestionSetThemesLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <QuestionSetThemesLab />
}
