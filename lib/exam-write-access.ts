import 'server-only'

import { getExamAccessSession } from '@/lib/exam-access-session'
import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>
type Relation<T> = T | T[] | null

export interface WritableExamQuestion {
  question_type: string
  answer_parts: unknown[] | null
}

export interface WritableExamAssignment {
  id: string
  duration_minutes: number | null
  end_at: string | null
  secure_browser_mode: string | null
  android_exam_mode: string | null
  type: string | null
  mode: string | null
  instant_check: boolean | null
  instant_check_answer_key: boolean | null
  completion_rule: string | null
  streak_target: number | null
  streak_question_cap: number | null
  streak_recycle_pool: boolean | null
  require_work_image: boolean | null
  scratchpad_enabled: boolean | null
}

export interface WritableExamSubmission {
  id: string
  student_id: string
  status: string
  started_at: string
  assignment_id: string
  seb_config_revision: number | null
  exam_access_mode: string
  current_streak: number | null
  best_streak: number | null
  streak_reached: boolean | null
  assignments: Relation<WritableExamAssignment>
}

export interface WritableExamAnswer {
  id: string
  submission_id: string
  student_answer: string | null
  work_images: unknown
  carried_over: boolean | null
  check_count: number | null
  questions: Relation<WritableExamQuestion>
  submissions: Relation<WritableExamSubmission>
}

export type WritableStudentAnswerResult =
  | { error: string }
  | {
      answer: WritableExamAnswer
      submission: WritableExamSubmission
      assignment: WritableExamAssignment | null
      question: WritableExamQuestion | null
    }

/**
 * Loads one answer only after re-checking every condition that permits a
 * student-side mutation. Keep uploads on this boundary too: a signed Storage
 * target must never outlive ownership, the attempt timer, the assignment
 * deadline, or an SEB/Android exam-access session.
 */
export async function getWritableStudentAnswer(
  admin: AdminClient,
  submissionAnswerId: string,
  studentId: string,
): Promise<WritableStudentAnswerResult> {
  const { data } = await admin
    .from('submission_answers')
    .select(`
      id, submission_id, student_answer, work_images, carried_over, check_count,
      questions(question_type, answer_parts),
      submissions(
        id, student_id, status, started_at, assignment_id, seb_config_revision, exam_access_mode,
        current_streak, best_streak, streak_reached,
        assignments(
          id, duration_minutes, end_at, secure_browser_mode, android_exam_mode, type, mode,
          instant_check, instant_check_answer_key, completion_rule, streak_target,
          streak_question_cap, streak_recycle_pool, require_work_image, scratchpad_enabled
        )
      )
    `)
    .eq('id', submissionAnswerId)
    .maybeSingle()
  const answer = data as unknown as WritableExamAnswer | null

  if (!answer) return { error: 'ไม่พบคำตอบ' as const }
  const submission = Array.isArray(answer.submissions) ? answer.submissions[0] : answer.submissions
  if (!submission || submission.student_id !== studentId) return { error: 'ไม่มีสิทธิ์' as const }
  if (submission.status !== 'in_progress') return { error: 'ส่งงานแล้ว' as const }

  const assignment = Array.isArray(submission.assignments)
    ? submission.assignments[0]
    : submission.assignments
  const durationMinutes = assignment?.duration_minutes
  if (durationMinutes) {
    const deadline = new Date(submission.started_at).getTime() + durationMinutes * 60_000
    if (Date.now() > deadline) return { error: 'หมดเวลาทำข้อสอบแล้ว' as const }
  }

  if (assignment?.end_at && new Date(assignment.end_at).getTime() < Date.now()) {
    const { data: extension } = await admin
      .from('assignment_extensions')
      .select('extended_end_at')
      .eq('assignment_id', submission.assignment_id)
      .eq('student_id', studentId)
      .maybeSingle()
    if (!extension?.extended_end_at || new Date(extension.extended_end_at).getTime() < Date.now()) {
      return { error: 'หมดเวลาส่งแล้ว' as const }
    }
  }

  if (
    assignment?.secure_browser_mode === 'seb_required'
    && !await getExamAccessSession(
      studentId,
      submission.assignment_id,
      assignment.android_exam_mode === 'monitored',
      submission.seb_config_revision,
      submission.exam_access_mode === 'seb' || submission.exam_access_mode === 'android_monitored'
        ? submission.exam_access_mode
        : null,
    )
  ) {
    return { error: 'เซสชันเข้าสอบหมดอายุ กรุณากลับไปเปิดข้อสอบใหม่' as const }
  }

  const question = Array.isArray(answer.questions) ? answer.questions[0] : answer.questions
  return { answer, submission, assignment, question }
}
