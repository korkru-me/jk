'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { isAttemptExpired } from '@/lib/grading'
import { buildAssignmentAttempt, gradeAnswer } from '@/lib/assignment-attempt'
import type { Question } from '@/lib/types'

export async function startSubmission(assignmentId: string, accessCode?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ', unauthenticated: true }
  const admin = createAdminClient()

  // Assignment metadata, classroom links, an individual extension, and the
  // latest attempt are independent after authentication. Fetch them in one
  // stage instead of a four-query waterfall on every exam resume.
  const [assignmentRes, linksRes, extensionRes, existingRes] = await Promise.all([
    admin
      .from('assignments')
      .select('*')
      .eq('id', assignmentId)
      .eq('status', 'published')
      .maybeSingle(),
    admin
      .from('assignment_classrooms')
      .select('classroom_id')
      .eq('assignment_id', assignmentId),
    admin
      .from('assignment_extensions')
      .select('extended_end_at')
      .eq('assignment_id', assignmentId)
      .eq('student_id', user.id)
      .maybeSingle(),
    admin
      .from('submissions')
      .select('id, status, attempt_number, started_at')
      .eq('assignment_id', assignmentId)
      .eq('student_id', user.id)
      .order('attempt_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const assignment = assignmentRes.data

  if (!assignment) return { error: 'ไม่พบชุดข้อสอบ' }

  if (assignment.start_at && new Date(assignment.start_at) > new Date()) {
    return { error: 'ยังไม่ถึงเวลาเปิดสอบ' }
  }

  // Check student is in one of the classrooms this assignment is linked to
  // (not just the legacy single classroom_id column — an assignment may now
  // target multiple classrooms via assignment_classrooms).
  const links = linksRes.data
  const classroomIds = (links ?? []).map((l: any) => l.classroom_id)

  const { data: membership } = classroomIds.length > 0
    ? await admin
        .from('classroom_students')
        .select('id')
        .eq('student_id', user.id)
        .in('classroom_id', classroomIds)
        .maybeSingle()
    : { data: null }

  if (!membership) return { error: 'คุณไม่ได้อยู่ในห้องเรียนนี้' }

  // Check deadline — a per-student extension overrides the assignment's end_at
  const extension = extensionRes.data

  const effectiveEndAt = extension?.extended_end_at ?? assignment.end_at
  if (effectiveEndAt && new Date(effectiveEndAt) < new Date()) {
    return { error: 'หมดเวลาส่งแล้ว' }
  }

  // Return existing in-progress submission, or decide on a retry
  const existing = existingRes.data

  let attemptNumber = 1
  if (existing) {
    if (existing.status === 'in_progress') {
      if (!isAttemptExpired(existing.started_at, assignment.duration_minutes)) {
        return { submissionId: existing.id }
      }
      // Time ran out while this attempt sat abandoned (e.g. the student
      // closed the tab mid-exam and came back much later) — finalize it
      // with whatever was answered instead of resuming into a countdown
      // that's already at zero, then fall through to the normal
      // retry/attempt-limit logic below as if it had just been submitted.
      await gradeAndFinalizeSubmission(admin, existing.id, user.id, { enforceWorkImage: false })
    }
    // submitted / graded: retry up to max_attempts. Exercises are unlimited
    // when not set; exams fall back to single-attempt for legacy rows saved
    // before max_attempts was configurable for exam type.
    const attemptLimit = assignment.max_attempts ?? (assignment.type === 'exercise' ? null : 1)
    if (attemptLimit && existing.attempt_number >= attemptLimit) {
      return { submissionId: existing.id, alreadySubmitted: true }
    }
    attemptNumber = existing.attempt_number + 1
  }

  // Access code is only checked when creating a genuinely new attempt —
  // resuming an in-progress submission (handled above) never re-prompts.
  if (assignment.access_code) {
    if (!accessCode || accessCode.trim().toUpperCase() !== assignment.access_code.trim().toUpperCase()) {
      return {
        error: accessCode ? 'รหัสผ่านไม่ถูกต้อง' : 'กรุณากรอกรหัสผ่านก่อนเริ่มทำ',
        requiresAccessCode: true,
      }
    }
  }

  // Fetch questions
  const { data: questions } = await admin
    .from('questions')
    .select('*')
    .in('id', assignment.question_ids)

  if (!questions || questions.length === 0) return { error: 'ไม่พบโจทย์' }

  const skeletons = buildAssignmentAttempt(assignment, questions as Question[])
  if (assignment.random_question_count && skeletons.length < assignment.random_question_count) {
    return { error: 'ข้อสอบในคลังเหลือไม่ครบตามจำนวนที่ตั้งไว้ กรุณาแจ้งครูผู้สอน' }
  }
  const totalMaxScore = skeletons.reduce((sum, s) => sum + s.max_score, 0)

  // A submission belongs to the same immutable tenant as its assignment.
  // Do not derive this from the student's "primary" organization: students
  // can join a classroom without being organization_members, and even when
  // they have a personal workspace it is not the assignment's tenant.
  const orgId = assignment.org_id

  // Create submission with correct total max_score
  const { data: submission, error: subError } = await admin
    .from('submissions')
    .insert({
      org_id: orgId,
      assignment_id: assignmentId,
      student_id: user.id,
      max_score: totalMaxScore,
      status: 'in_progress',
      attempt_number: attemptNumber,
    })
    .select('id')
    .single()

  if (subError) return { error: subError.message }

  const { error: answersError } = await admin.from('submission_answers').insert(
    skeletons.map(s => ({ ...s, org_id: orgId, submission_id: submission.id }))
  )
  if (answersError) return { error: answersError.message }

  return { submissionId: submission.id }
}

async function getWritableStudentAnswer(
  admin: ReturnType<typeof createAdminClient>,
  submissionAnswerId: string,
  studentId: string,
) {
  const { data: answer } = await admin
    .from('submission_answers')
    .select(`
      id, submission_id, work_images,
      submissions(
        id, student_id, status, started_at, assignment_id,
        assignments(id, duration_minutes, end_at)
      )
    `)
    .eq('id', submissionAnswerId)
    .maybeSingle()

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

  return { answer, submission }
}

export async function saveAnswer(submissionAnswerId: string, studentAnswer: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (studentAnswer.length > 500_000) return { error: 'คำตอบมีขนาดใหญ่เกินไป' }
  const admin = createAdminClient()

  const writable = await getWritableStudentAnswer(admin, submissionAnswerId, user.id)
  if ('error' in writable) return { error: writable.error }

  const { error } = await admin
    .from('submission_answers')
    .update({ student_answer: studentAnswer })
    .eq('id', submissionAnswerId)
    .eq('submission_id', writable.submission.id)

  if (error) return { error: error.message }
  return { success: true }
}

// One image per answer part, keyed by the same positional `partIndex` used
// for student_answer (see handlePartAnswerChange in exam-client.tsx) — not
// by answer_parts[].id.
export async function saveWorkImage(submissionAnswerId: string, partIndex: number, url: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!Number.isInteger(partIndex) || partIndex < 0 || partIndex > 50) return { error: 'ตำแหน่งรูปไม่ถูกต้อง' }
  const admin = createAdminClient()

  const writable = await getWritableStudentAnswer(admin, submissionAnswerId, user.id)
  if ('error' in writable) return { error: writable.error }

  const current: (string | null)[] = Array.isArray(writable.answer.work_images)
    ? [...writable.answer.work_images]
    : []
  while (current.length <= partIndex) current.push(null)
  current[partIndex] = url

  const { error } = await admin
    .from('submission_answers')
    .update({ work_images: current })
    .eq('id', submissionAnswerId)
    .eq('submission_id', writable.submission.id)

  if (error) return { error: error.message }
  return { success: true }
}

// Manual score override for a teacher grading (or re-grading) one student's
// answer to one question — e.g. bumping an auto-graded 0 up to partial/full
// credit, or resolving a pending-manual fill-blank. Bounded to
// [0, max_score] both here (readable error) and in the RLS WITH CHECK
// (submission_answers_org_teacher_update, the real security boundary).
export async function updateSubmissionAnswerScore(submissionAnswerId: string, newScore: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const admin = createAdminClient()

  if (!Number.isFinite(newScore) || newScore < 0) return { error: 'คะแนนไม่ถูกต้อง' }

  const { data: sa } = await admin
    .from('submission_answers')
    .select('id, submission_id, max_score, submissions(id, status, assignment_id, assignments(created_by))')
    .eq('id', submissionAnswerId)
    .maybeSingle()

  if (!sa) return { error: 'ไม่พบคำตอบ' }
  const submission = (sa as any).submissions
  const assignment = submission?.assignments
  if (assignment?.created_by !== user.id) return { error: 'ไม่มีสิทธิ์แก้ไขคะแนนนี้' }
  if (submission?.status === 'in_progress') return { error: 'นักเรียนยังทำไม่เสร็จ แก้คะแนนไม่ได้' }
  if (newScore > sa.max_score) return { error: `คะแนนต้องไม่เกิน ${sa.max_score}` }

  const { error: updateError } = await admin
    .from('submission_answers')
    .update({
      score: newScore,
      is_correct: newScore >= sa.max_score,
      score_edited_by: user.id,
      score_edited_at: new Date().toISOString(),
    })
    .eq('id', submissionAnswerId)

  if (updateError) return { error: updateError.message }

  const { data: allAnswers } = await admin
    .from('submission_answers')
    .select('score')
    .eq('submission_id', sa.submission_id)

  const totalScore = (allAnswers ?? []).reduce((sum: number, a: any) => sum + (a.score ?? 0), 0)

  const { error: subError } = await admin
    .from('submissions')
    .update({ total_score: totalScore, status: 'graded' })
    .eq('id', sa.submission_id)

  if (subError) return { error: subError.message }

  revalidatePath(`/submissions/${sa.submission_id}`)
  revalidatePath(`/assignments/${submission.assignment_id}`)
  revalidatePath(`/assignments/${submission.assignment_id}/results`)

  return { success: true, newTotalScore: totalScore }
}

// Shared by submitSubmission (student-initiated) and startSubmission's
// stale-attempt handling (server-initiated, when a resumed in-progress
// attempt's time limit already elapsed). `enforceWorkImage` is only turned
// on for the student-initiated path — a forced finalize of an abandoned,
// expired attempt shouldn't block on a requirement the student can no
// longer satisfy.
async function gradeAndFinalizeSubmission(
  admin: ReturnType<typeof createAdminClient>,
  submissionId: string,
  studentId: string,
  opts: { enforceWorkImage: boolean }
): Promise<{ error?: string; success?: true; totalScore?: number }> {
  const { data: submission } = await admin
    .from('submissions')
    .select('*, assignments(duration_minutes, end_at, require_work_image)')
    .eq('id', submissionId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (!submission) return { error: 'ไม่พบการสอบ' }
  if (submission.status !== 'in_progress') return { error: 'ส่งงานแล้ว' }

  const { data: answers } = await admin
    .from('submission_answers')
    .select('*, questions(answer_tolerance, answer_parts, question_type, extra_data)')
    .eq('submission_id', submissionId)

  if (!answers) return { error: 'ไม่พบคำตอบ' }

  // Server-side defense-in-depth: the exam UI already blocks submission
  // client-side when a required work-image is missing, but a tampered
  // client could call this action directly. `require_work_image` is the whole
  // decision — one answer for the งาน, given by the teacher when they created
  // it — and it applies to every เติมคำตอบตัวเลข question the งาน contains.
  const workImageEnforced = opts.enforceWorkImage && ((submission as any).assignments?.require_work_image ?? false)
  const missingWorkImage = workImageEnforced && answers.some((a: any) => {
    if (a.questions?.question_type !== 'written') return false
    const parts: unknown[] = a.questions?.answer_parts ?? []
    const requiredCount = parts.length > 0 ? parts.length : 1
    const images: (string | null)[] = Array.isArray(a.work_images) ? a.work_images : []
    for (let i = 0; i < requiredCount; i++) {
      if (!images[i]) return true
    }
    return false
  })
  if (missingWorkImage) return { error: 'กรุณาแนบรูปวิธีทำให้ครบทุกข้อก่อนส่งคำตอบ' }

  // Auto-grade: compare student_answer vs correct_answer with tolerance
  const updates = answers.map((a: any) => gradeAnswer(a))

  // Each answer row is independent. Grade writes can run in small concurrent
  // batches instead of one-by-one, while avoiding a request spike for a long
  // exam on the free Supabase tier.
  const gradeWriteConcurrency = 10
  for (let i = 0; i < updates.length; i += gradeWriteConcurrency) {
    await Promise.all(updates.slice(i, i + gradeWriteConcurrency).map(u =>
      admin
        .from('submission_answers')
        .update({ is_correct: u.is_correct, score: u.score })
        .eq('id', u.id)
    ))
  }

  const totalScore = updates.reduce((sum: number, u: any) => sum + u.score, 0)

  const { error } = await admin
    .from('submissions')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      total_score: totalScore,
    })
    .eq('id', submissionId)

  if (error) return { error: error.message }

  // If this attempt used the live proctor room, stop its presence heartbeat
  // immediately. This is best-effort supporting state; a failure here must
  // never roll back or hide an otherwise successful exam submission.
  const proctorCompletedAt = new Date().toISOString()
  await Promise.all([
    admin
      .from('exam_proctor_connections')
      .update({ closed_at: proctorCompletedAt, last_seen_at: proctorCompletedAt })
      .eq('submission_id', submissionId),
    admin
      .from('exam_proctor_sessions')
      .update({
        is_online: false,
        active_connection_count: 0,
        completed_at: proctorCompletedAt,
        last_seen_at: proctorCompletedAt,
        updated_at: proctorCompletedAt,
      })
      .eq('submission_id', submissionId),
  ])

  revalidatePath(`/submissions/${submissionId}`)
  return { success: true, totalScore }
}

export async function submitSubmission(submissionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const admin = createAdminClient()
  return gradeAndFinalizeSubmission(admin, submissionId, user.id, { enforceWorkImage: true })
}
