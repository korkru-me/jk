import { notFound } from 'next/navigation'
import NewQuestionTypePage from '@/app/(app)/questions/new/page'
import { ShellClient } from '@/components/layout/shell-client'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ตัวอย่างหน้าสร้างโจทย์ — KorKru' }

/** Uses the real type picker and its prepared samples without database access. */
export default function QuestionTypesLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return (
    <ShellClient
      user={{ id: 'question-types-lab', email: 'teacher@example.invalid', full_name: 'ครูตัวอย่าง', role: 'teacher' }}
      initialUnreadCount={0}
    >
      <NewQuestionTypePage />
    </ShellClient>
  )
}
