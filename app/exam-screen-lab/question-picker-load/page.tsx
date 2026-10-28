import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { QuestionPickerLoadLabClient } from './_components/question-picker-load-lab-client'

export const metadata = { title: 'ห้องทดลองความเร็วหน้าต่างเลือกโจทย์ — KorKru' }
export const dynamic = 'force-dynamic'

/**
 * Local/Staging-only load fixture for the เพิ่มหรือเอาโจทย์ออก picker: a
 * synthetic คลัง the size of a real teacher's, with badges served by a
 * synthetic loader. Nothing here reads or writes Supabase.
 */
export default function QuestionPickerLoadLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <QuestionPickerLoadLabClient />
}
