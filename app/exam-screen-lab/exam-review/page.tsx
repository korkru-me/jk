import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { ShellClient } from '@/components/layout/shell-client'
import { ExamClient } from '@/components/exam/exam-client'
import { buildSolutionWatermark } from '@/lib/solution-watermark'
import { gradeAnswer } from '@/lib/assignment-attempt'
import { buildReviewFeedback, type ExamReviewFeedback } from '@/lib/exam-review-feedback'
import type { AnswerPart } from '@/lib/types'
import { buildExamScreenQaFixture, type ExamScreenQaAnswer } from '../_lib/fixture'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ห้องทดลองดูข้อสอบที่ทำแล้ว — KorKru' }

/**
 * A plausible handed-in paper over the device-QA fixture: some ข้อ right, some
 * wrong, one waiting for the teacher, the rest left blank — enough to see
 * every panel state the review draws.
 */
function syntheticAnswer(answer: ExamScreenQaAnswer): string | null {
  const key = answer.correct_answer
  switch (answer.questions.question_type) {
    case 'mcq': {
      const picked = (answer.questions.mcq_options ?? []).find(option => `MCQ:${option.index}` !== key)
      return picked ? `MCQ:${picked.index}` : null
    }
    case 'written':
      return key
    case 'true_false':
      return key.startsWith('TF:') ? JSON.stringify({ answers: JSON.parse(key.slice(3)) }) : key
    case 'ordering':
      return key.startsWith('ORDER:') ? JSON.stringify((JSON.parse(key.slice(6)) as string[]).reverse()) : null
    case 'essay':
      return 'แรงลัพธ์ที่กระทำต่อวัตถุทำให้วัตถุมีความเร่งในทิศเดียวกับแรงนั้น (ข้อมูลจำลอง)'
    default:
      return null
  }
}

/**
 * The student's "ดูข้อสอบที่ทำเสร็จแล้ว" — the real ExamClient in review mode,
 * fed panels from the same builder the protected route uses. Synthetic only:
 * nothing here reads or writes Supabase, and review mode calls no Server Action.
 */
export default async function ExamReviewLab() {
  if (!isExamScreenLabEnabled(process.env)) notFound()

  const fixture = buildExamScreenQaFixture()
  const feedback: Record<string, ExamReviewFeedback> = {}
  const answers = fixture.answers.map(answer => {
    const studentAnswer = syntheticAnswer(answer)
    const question = {
      question_type: answer.questions.question_type,
      answer_unit: answer.questions.answer_unit,
      answer_parts: answer.questions.answer_parts as AnswerPart[] | null,
      answer_tolerance: answer.questions.answer_tolerance,
      extra_data: answer.questions.extra_data,
      mcq_options: answer.questions.mcq_options,
    }
    const graded = gradeAnswer({
      id: answer.id,
      correct_answer: answer.correct_answer,
      student_answer: studentAnswer,
      math_input_modes: {},
      max_score: answer.max_score,
      questions: question,
    })
    feedback[answer.id] = buildReviewFeedback({
      correct_answer: answer.correct_answer,
      student_answer: studentAnswer,
      math_input_modes: {},
      question,
      isCorrect: graded.is_correct,
      score: graded.score,
      maxScore: answer.max_score,
    })
    // What the real route sends: the answer-key-free shape plus the student's
    // own answer, never correct_answer or max_score.
    const { correct_answer: _key, max_score: _max, ...safe } = answer
    return { ...safe, student_answer: studentAnswer }
  })

  const watermark = buildSolutionWatermark(
    { full_name: '', prefix: 'เด็กชาย', first_name: 'ทดสอบ', last_name: 'เรียนรู้ (ข้อมูลจำลอง)' },
    { student_code: '00007', grade_level: 'ม.4', section_number: 1, class_number: 7 },
    new Date().toISOString(),
  )

  return (
    <ShellClient user={{ id: 'qa-student', email: 'preview@example.invalid', full_name: watermark.name, role: 'student' }} initialUnreadCount={0} notificationsEnabled={false}>
      <div className="flex h-full flex-col">
        <ExamClient
          submissionId="qa-exam-review"
          storageOwnerId="qa-synthetic-student"
          answers={answers}
          durationMinutes={null}
          startedAt={new Date().toISOString()}
          config={{
            assignmentType: 'exam',
            proctoringEnabled: false,
            isFullscreenEnforced: false,
            blockClipboard: false,
            watermarkText: null,
            solutionWatermark: watermark,
            isWorkImageEnforced: false,
            calculatorEnabled: false,
            scratchpadEnabled: false,
          }}
          sections={fixture.sections}
          questionsPerPage={1}
          review={{ feedback, returnHref: '/exam-screen-lab/submission-result' }}
        />
      </div>
    </ShellClient>
  )
}
