import { buildAnswerFeedback, type AnswerFeedback, type FeedbackInput, type FeedbackQuestion } from '@/lib/answer-feedback'
import type { GradingConfig } from '@/lib/assignment-attempt'
import { isInstantCheckable } from '@/lib/grading'
import type { MathInputMode } from '@/lib/types'

/**
 * The panel under one ข้อ of a submitted ข้อสอบ reopened from its result page
 * ("ดูข้อสอบที่ทำเสร็จแล้ว"). `voided` marks a ข้อ the teacher cancelled after
 * the fact, which has a note instead of a verdict.
 */
export type ExamReviewFeedback = AnswerFeedback & { voided?: boolean }

/** One graded submission_answers row, as read through the student's RLS. */
export interface ExamReviewAnswerRow {
  correct_answer: string | null
  student_answer: string | null
  math_input_modes?: Record<string, MathInputMode> | null
  option_order: number[] | null
  grading_config?: GradingConfig | null
  is_correct: boolean | null
  score: number | string | null
  max_score: number | string | null
}

/** The live โจทย์ behind that row. Read with the service role and never sent
 *  to the browser — only the panel built from it is. */
export type ExamReviewQuestion = Omit<FeedbackQuestion, 'mcq_options'> & {
  mcq_options: Array<Record<string, unknown>> | null
}

function verdictOf(isCorrect: boolean | null, score: number, maxScore: number): AnswerFeedback['verdict'] {
  if (isCorrect === null) return 'pending'
  if (isCorrect) return 'correct'
  return score > 0 && score < maxScore ? 'partial' : 'wrong'
}

/**
 * One reviewed ข้อ from its banked verdict and score — the row's own
 * (including a teacher's later re-mark), never re-graded here, so the review
 * cannot disagree with the result page beside it. The เฉลย is always shown:
 * a student only reaches this once show_results has released the answers
 * (the RLS read in lib/exam-review.ts), and a teacher's preview always may.
 *
 * `question.mcq_options` must already be in the order the student read them,
 * each ปรนัย option carrying its `index` — see buildExamReviewFeedback.
 */
export function buildReviewFeedback(input: Omit<FeedbackInput, 'revealAnswerKey'>): ExamReviewFeedback {
  const { maxScore, score } = input
  if (!(maxScore > 0)) {
    return {
      verdict: 'pending', score: 0, maxScore: 0, revealed: true, rows: [], voided: true,
      note: 'ข้อนี้เป็นโมฆะ ตัดคะแนนและคะแนนเต็มออกจากผลรวมแล้ว',
    }
  }
  // เขียนตอบ and ส่งไฟล์งาน have no key to compare against — the answer
  // itself is on screen above the panel, and only the teacher's mark is news.
  if (!isInstantCheckable(input.grading_config?.question_type ?? input.question.question_type)) {
    return { verdict: verdictOf(input.isCorrect, score, maxScore), score, maxScore, revealed: true, rows: [] }
  }
  return buildAnswerFeedback({ ...input, revealAnswerKey: true })
}

/**
 * The server side of the review: mirrors what checkAnswer hands a แบบฝึกหัด —
 * the frozen rubric over the live โจทย์, and ปรนัย options put back in the
 * order this student read them.
 */
export function buildExamReviewFeedback(row: ExamReviewAnswerRow, liveQuestion: ExamReviewQuestion): ExamReviewFeedback {
  const question = { ...liveQuestion, ...row.grading_config }
  const rawOptions = question.mcq_options ?? []
  const optionOrder = row.option_order ?? rawOptions.map((_, i) => i)
  const displayOptions = question.question_type === 'mcq'
    ? optionOrder
        .filter(i => rawOptions[i])
        .map(i => ({
          text: String(rawOptions[i].text ?? ''),
          ...(typeof rawOptions[i].image_url === 'string' ? { image_url: rawOptions[i].image_url as string } : {}),
          index: i,
        }))
    : rawOptions.map(option => ({
        left_text: typeof option.left_text === 'string' ? option.left_text : undefined,
      }))

  return buildReviewFeedback({
    correct_answer: row.correct_answer ?? '',
    student_answer: row.student_answer,
    math_input_modes: row.math_input_modes,
    question: { ...question, mcq_options: displayOptions },
    grading_config: row.grading_config,
    isCorrect: row.is_correct,
    score: Number(row.score ?? 0),
    maxScore: Number(row.max_score ?? 0),
  })
}
