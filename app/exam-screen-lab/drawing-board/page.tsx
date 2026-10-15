import { notFound } from 'next/navigation'
import { TeachingModeClient, type TeachingQuestionView } from '@/components/assignments/teaching-mode-client'
import { ShellClient } from '@/components/layout/shell-client'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { buildExamScreenQaQuestions } from '../_lib/fixture'
import { buildAttemptQuestion } from '@/lib/assignment-attempt'

export const metadata = { title: 'ห้องทดลองกระดานสอน — KorKru' }
export const dynamic = 'force-dynamic'

/**
 * Repeatable local/Staging-only workbench for the real teacher board.
 *
 * It has no authenticated user, Server Action mutation or Supabase fixture;
 * save/image commands remain untouched. Production receives a 404 before the
 * synthetic question is built.
 */
export default async function DrawingBoardLabPage({ searchParams }: { searchParams: Promise<{ random?: string }> }) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const random = (await searchParams).random === '1'
  const source = buildExamScreenQaQuestions(random)[0]
  const attempt = random ? buildAttemptQuestion(source, { orderIndex: 0, shuffleOptions: false }) : null
  const question: TeachingQuestionView = {
    ...source,
    randomValues: attempt?.random_values ?? {},
    correctAnswer: attempt?.correct_answer ?? '42',
  }

  return (
    <ShellClient
      user={{
        id: '22222222-2222-4222-8222-222222222222',
        email: 'teacher-qa@korkru.local',
        full_name: 'ครูทดสอบ',
        role: 'teacher',
      }}
      initialUnreadCount={0}
    >
      <TeachingModeClient
        assignmentId="11111111-1111-4111-8111-111111111111"
        assignmentTitle="ข้อมูลจำลองสำหรับตรวจเฟส Hardening"
        backHref="/exam-screen-lab"
        currentUserId="22222222-2222-4222-8222-222222222222"
        canManage
        questions={[question]}
        questionsPerPage={1}
        initialBoards={[]}
        contextualSidebarPath="/exam-screen-lab/drawing-board"
      />
    </ShellClient>
  )
}
