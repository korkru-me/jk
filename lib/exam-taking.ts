import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { toSafeExamAnswer, type SafeExamAnswer } from '@/lib/exam-safe'
import { getExamAccessSession } from '@/lib/exam-access-session'

export interface ExamTakingData {
  submission: {
    id: string
    started_at: string
    assignment_id: string
    student_id: string
  }
  assignment: {
    duration_minutes: number | null
    require_work_image: boolean | null
    sections: unknown
    show_sections: boolean | null
    proctoring_enabled: boolean
    fullscreen_required: boolean
    block_clipboard: boolean
    exam_watermark_enabled: boolean
    secure_browser_mode: 'browser' | 'seb_required'
    android_exam_mode: 'blocked' | 'monitored'
    exam_access_mode: 'browser' | 'seb' | 'android_monitored'
    secure_browser_verified: boolean
    watermark_text: string | null
    questions_per_page: number
    instant_check: boolean
    instant_check_answer_key: boolean
    calculator_enabled: boolean
    scratchpad_enabled: boolean
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
  // The users embed is pinned to the student FK by name. `submissions` gained a
  // second relationship to `users` with Android monitored mode
  // (`android_approved_by`, the approving teacher), and an unqualified
  // `users(...)` is ambiguous from that point on: PostgREST refuses the whole
  // query, which reads here as an attempt that cannot be opened at all.
  const { data: submission } = await admin
    .from('submissions')
    .select('id, started_at, assignment_id, student_id, status, users!submissions_student_id_fkey(full_name), assignments(duration_minutes, require_work_image, sections, show_sections, proctoring_enabled, fullscreen_required, block_clipboard, exam_watermark_enabled, secure_browser_mode, android_exam_mode, questions_per_page, type, mode, instant_check, instant_check_answer_key, calculator_enabled, scratchpad_enabled)')
    .eq('id', submissionId)
    .eq('student_id', user.id)
    .maybeSingle()

  if (!submission || submission.status !== 'in_progress') return null

  const assignment = Array.isArray(submission.assignments)
    ? submission.assignments[0]
    : submission.assignments
  if (!assignment) return null
  const examAccess = assignment.secure_browser_mode === 'seb_required'
    ? await getExamAccessSession(
        user.id,
        submission.assignment_id,
        assignment.android_exam_mode === 'monitored',
      )
    : null
  if (assignment.secure_browser_mode === 'seb_required' && !examAccess) return null

  const { data: answerRows } = await admin
    .from('submission_answers')
    .select(`
      id, question_id, random_values, student_answer, work_images, math_input_modes, option_order,
      questions(
        title, question_text, question_type, answer_unit, mcq_options,
        variables, answer_parts, extra_data, image_urls
      )
    `)
    .eq('submission_id', submissionId)
    // A wrong-only retry copies the questions the student already got right
    // into this attempt so its total still adds up. They are not asked again,
    // so they must not reach the exam view — the student sees only what they
    // came back to fix.
    .eq('carried_over', false)
    .order('order_index')
  const student = Array.isArray(submission.users) ? submission.users[0] : submission.users
  const watermarkText = assignment.exam_watermark_enabled
    ? `${student?.full_name?.trim() || 'ผู้เข้าสอบ'} • ครั้งสอบ ${submission.id.slice(0, 8).toUpperCase()}`
    : null

  const answers = (answerRows ?? [])
    .map(row => toSafeExamAnswer(row as unknown as Parameters<typeof toSafeExamAnswer>[0]))
    .filter((answer): answer is SafeExamAnswer => answer !== null)

  return {
    submission: {
      id: submission.id,
      started_at: submission.started_at,
      assignment_id: submission.assignment_id,
      student_id: submission.student_id,
    },
    assignment: {
      duration_minutes: assignment.duration_minutes,
      require_work_image: assignment.require_work_image,
      sections: assignment.sections,
      show_sections: assignment.show_sections,
      proctoring_enabled: assignment.proctoring_enabled ?? false,
      fullscreen_required: assignment.fullscreen_required ?? false,
      block_clipboard: assignment.block_clipboard ?? false,
      exam_watermark_enabled: assignment.exam_watermark_enabled ?? false,
      secure_browser_mode: assignment.secure_browser_mode === 'seb_required' ? 'seb_required' : 'browser',
      android_exam_mode: assignment.android_exam_mode === 'monitored' ? 'monitored' : 'blocked',
      exam_access_mode: examAccess?.mode ?? 'browser',
      secure_browser_verified: examAccess?.mode === 'seb',
      watermark_text: watermarkText,
      // A row saved before the setting existed reads as the original layout.
      questions_per_page: Math.max(1, Number(assignment.questions_per_page ?? 1)),
      // Re-derived here rather than trusted from the column alone: the ปุ่มตรวจ
      // is a แบบฝึกหัด affordance, so an exam that somehow carries the flag
      // still never shows it. checkAnswer re-checks the same three conditions
      // server-side — this only decides whether the button renders.
      instant_check: assignment.type === 'exercise'
        && assignment.mode === 'online'
        && assignment.instant_check === true,
      instant_check_answer_key: assignment.instant_check_answer_key !== false,
      calculator_enabled: assignment.calculator_enabled === true,
      scratchpad_enabled: assignment.scratchpad_enabled === true,
    },
    answers,
  }
}
