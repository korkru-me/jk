import 'server-only'

import { getAuthUser } from '@/lib/auth/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { toSafeExamAnswer, type SafeExamAnswer } from '@/lib/exam-safe'
import { canStudentOpenExamReview } from '@/lib/result-visibility'
import { loadStudentSolutionWatermark } from '@/lib/solution-watermark-server'
import type { SolutionWatermarkData } from '@/lib/solution-watermark'
import {
  buildExamReviewFeedback,
  type ExamReviewAnswerRow,
  type ExamReviewFeedback,
  type ExamReviewQuestion,
} from '@/lib/exam-review-feedback'

export interface ExamReviewData {
  submissionId: string
  studentId: string
  assignment: {
    id: string
    title: string
    sections: unknown
    show_sections: boolean | null
    questions_per_page: number
  }
  /** The same answer-key-free shape the exam page was drawn from. */
  answers: SafeExamAnswer[]
  /** Finished panels keyed by submission_answer id — the only place the เฉลย
   *  travels, and only once show_results has released it. */
  feedback: Record<string, ExamReviewFeedback>
  solutionWatermark: SolutionWatermarkData
}

export type ExamReviewResult =
  | { state: 'not_found' }
  /** The student's own, but not (or not yet) reviewable — send them back to
   *  the result page, which says why. */
  | { state: 'closed' }
  | { state: 'watermark_failed' }
  | { state: 'open'; data: ExamReviewData }

type ReviewSubmissionRow = {
  id: string
  student_id: string
  status: string
  assignments: ReviewAssignmentRow | ReviewAssignmentRow[] | null
}
type ReviewAssignmentRow = {
  id: string
  title: string
  type: string
  allow_exam_review: boolean | null
  show_results: string
  end_at: string | null
  sections: unknown
  show_sections: boolean | null
  questions_per_page: number | null
}
type ReviewAnswerRow = ExamReviewAnswerRow & {
  id: string
  question_id: string
  random_values: Record<string, number> | null
  work_images: (string | null)[] | null
}

/**
 * Server-only read boundary for "ดูข้อสอบที่ทำเสร็จแล้ว".
 *
 * Three gates, each enforced here rather than trusted from the page that
 * linked in: the submission is the signed-in student's own and already handed
 * in; the งาน is a ข้อสอบ whose teacher ticked allow_exam_review; and the
 * answers are released. The last is the database's call — submission_answers
 * is read through the student's own RLS (can_current_user_view_submission_answers,
 * the same gate as the result page), so this can never open a เฉลย earlier
 * than show_results allows, even if the check above it drifted.
 */
export async function getExamReviewData(submissionId: string): Promise<ExamReviewResult> {
  const user = await getAuthUser()
  if (!user) return { state: 'not_found' }
  const admin = createAdminClient()

  // Student submission rows are read with the service role because the
  // assignment row carries access_code; the exact owner filter is the gate.
  const { data: submission } = await admin
    .from('submissions')
    .select('id, student_id, status, assignments(id, title, type, allow_exam_review, show_results, end_at, sections, show_sections, questions_per_page)')
    .eq('id', submissionId)
    .eq('student_id', user.id)
    .maybeSingle<ReviewSubmissionRow>()
  if (!submission) return { state: 'not_found' }
  const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments
  if (!assignment) return { state: 'not_found' }
  if (submission.status !== 'submitted' && submission.status !== 'graded') return { state: 'closed' }
  if (!canStudentOpenExamReview(assignment)) return { state: 'closed' }

  const { data: answerRows } = await (await createClient())
    .from('submission_answers')
    .select('id, question_id, random_values, student_answer, work_images, math_input_modes, option_order, correct_answer, is_correct, score, max_score, grading_config')
    .eq('submission_id', submissionId)
    .order('order_index')
    .returns<ReviewAnswerRow[]>()
  if (!answerRows || answerRows.length === 0) return { state: 'closed' }

  // The โจทย์ for exactly the ids RLS just returned. Students may not read
  // `questions` themselves (the row carries the เฉลยวิธีทำ), so only the
  // columns the exam view and its panels need are read, and neither leaves
  // the server unprocessed: toSafeExamAnswer strips the key from what is
  // drawn, and the เฉลย reaches the page only as finished panel rows.
  const questionIds = Array.from(new Set(answerRows.map(row => row.question_id)))
  const { data: questionRows } = await admin
    .from('questions')
    .select('id, title, question_text, question_type, answer_unit, mcq_options, variables, answer_parts, answer_tolerance, extra_data, image_urls')
    .in('id', questionIds)
  const questionById = new Map((questionRows ?? []).map(question => [question.id as string, question]))

  const solutionWatermark = await loadStudentSolutionWatermark(admin, user.id)
  if (!solutionWatermark) return { state: 'watermark_failed' }

  const answers: SafeExamAnswer[] = []
  const feedback: Record<string, ExamReviewFeedback> = {}
  for (const row of answerRows) {
    // Deleting a โจทย์ cascades to its answers, so a missing one is a row
    // about to disappear anyway — the result page skips it the same way.
    const question = questionById.get(row.question_id)
    if (!question) continue
    const safe = toSafeExamAnswer({ ...row, questions: question } as unknown as Parameters<typeof toSafeExamAnswer>[0])
    if (!safe) continue
    answers.push(safe)
    feedback[row.id] = buildExamReviewFeedback(row, question as unknown as ExamReviewQuestion)
  }
  if (answers.length === 0) return { state: 'closed' }

  return {
    state: 'open',
    data: {
      submissionId: submission.id,
      studentId: submission.student_id,
      assignment: {
        id: assignment.id,
        title: assignment.title,
        sections: assignment.sections,
        show_sections: assignment.show_sections,
        questions_per_page: Math.max(1, Number(assignment.questions_per_page ?? 1)),
      },
      answers,
      feedback,
      solutionWatermark,
    },
  }
}
