import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { toSafeExamAnswer, type SafeExamAnswer } from '@/lib/exam-safe'

export interface ExamTakingData {
  submission: {
    id: string
    started_at: string
    assignment_id: string
  }
  assignment: {
    duration_minutes: number | null
    require_work_image: boolean | null
    sections: unknown
    show_sections: boolean | null
  }
  answers: SafeExamAnswer[]
}

/**
 * Server-only read boundary for an active student attempt. The service-role
 * query is intentionally made only after authentication, then constrained by
 * both the exact submission id and the authenticated owner id.
 */
export async function getExamTakingData(submissionId: string): Promise<ExamTakingData | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: submission } = await admin
    .from('submissions')
    .select('id, started_at, assignment_id, student_id, status, assignments(duration_minutes, require_work_image, sections, show_sections)')
    .eq('id', submissionId)
    .eq('student_id', user.id)
    .maybeSingle()

  if (!submission || submission.status !== 'in_progress') return null

  const { data: answerRows } = await admin
    .from('submission_answers')
    .select(`
      id, question_id, random_values, student_answer, work_images, option_order,
      questions(
        title, question_text, question_type, answer_unit, mcq_options,
        variables, answer_parts, extra_data, image_urls, requires_work_image
      )
    `)
    .eq('submission_id', submissionId)
    .order('order_index')

  const assignment = Array.isArray(submission.assignments)
    ? submission.assignments[0]
    : submission.assignments
  if (!assignment) return null

  const answers = (answerRows ?? [])
    .map(row => toSafeExamAnswer(row as unknown as Parameters<typeof toSafeExamAnswer>[0]))
    .filter((answer): answer is SafeExamAnswer => answer !== null)

  return {
    submission: {
      id: submission.id,
      started_at: submission.started_at,
      assignment_id: submission.assignment_id,
    },
    assignment: {
      duration_minutes: assignment.duration_minutes,
      require_work_image: assignment.require_work_image,
      sections: assignment.sections,
      show_sections: assignment.show_sections,
    },
    answers,
  }
}
