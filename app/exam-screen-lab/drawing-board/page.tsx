import { notFound } from 'next/navigation'
import { TeachingModeClient, type TeachingQuestionView } from '@/components/assignments/teaching-mode-client'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { buildExamScreenQaQuestions } from '../_lib/fixture'

export const metadata = { title: 'ห้องทดลองกระดานสอน — KorKru' }
export const dynamic = 'force-dynamic'

/**
 * Repeatable local/Staging-only workbench for the real teacher board.
 *
 * It has no authenticated user, Server Action mutation or Supabase fixture;
 * save/image commands remain untouched. Production receives a 404 before the
 * synthetic question is built.
 */
export default function DrawingBoardLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const source = buildExamScreenQaQuestions()[0]
  const question: TeachingQuestionView = {
    ...source,
    randomValues: {},
    correctAnswer: '42',
  }

  return (
    <TeachingModeClient
      assignmentId="11111111-1111-4111-8111-111111111111"
      assignmentTitle="ข้อมูลจำลองสำหรับตรวจเฟส Hardening"
      backHref="/exam-screen-lab"
      currentUserId="22222222-2222-4222-8222-222222222222"
      canManage
      questions={[question]}
      questionsPerPage={1}
      initialBoards={[]}
    />
  )
}
