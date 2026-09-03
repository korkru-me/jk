'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { isAttemptExpired, isInstantCheckable } from '@/lib/grading'
import {
  buildAssignmentAttempt,
  buildRetryAttempt,
  gradeAnswer,
  type AssignmentAttemptSkeleton,
  type CarriedAttemptAnswer,
  type PreviousAttemptAnswer,
} from '@/lib/assignment-attempt'
import { buildAnswerFeedback, type FeedbackQuestion } from '@/lib/answer-feedback'
import type { Question } from '@/lib/types'
import { createSebChallenge, validateSebChallenge } from '@/lib/seb-session'
import { getExamAccessSession } from '@/lib/exam-access-session'
import { parseMathInputModes } from '@/lib/math/input-mode'
import { hasCompleteWorkEvidence } from '@/lib/math-work'

export async function startSubmission(
  assignmentId: string,
  accessCode?: string,
  sebChallenge?: string,
) {
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

  // A normal browser must never receive, create, or resume an attempt for a
  // SEB-required exam. Android monitored mode is a deliberately lower-assurance
  // path: it still requires a short-lived signed session issued only after a
  // teacher approves that exact student and assignment in the proctor room.
  const secureBrowserRequired = assignment.secure_browser_mode === 'seb_required'
  const androidMonitoredAllowed = assignment.android_exam_mode === 'monitored'
  const examAccess = secureBrowserRequired
    ? await getExamAccessSession(user.id, assignmentId, androidMonitoredAllowed)
    : null
  if (secureBrowserRequired && !examAccess) {
    const reusableChallenge = validateSebChallenge(sebChallenge, user.id, assignmentId, 'take')
    const challenge = reusableChallenge
      ? sebChallenge!
      : createSebChallenge(user.id, assignmentId, 'take')
    return {
      requiresSecureBrowser: true as const,
      sebConfigured: challenge !== null,
      androidMonitoredAllowed,
      challenge,
    }
  }

  // Return existing in-progress submission, or decide on a retry
  const existing = existingRes.data

  let attemptNumber = 1
  // Set to the attempt a wrong-only retry rebuilds from. Null on a first
  // attempt and whenever the งาน re-asks everything, which is the default.
  let retryFromSubmissionId: string | null = null
  if (existing) {
    if (existing.status === 'in_progress') {
      if (!isAttemptExpired(existing.started_at, assignment.duration_minutes)) {
        if (examAccess) {
          await admin.from('submissions').update(examAccess.mode === 'seb'
            ? {
                exam_access_mode: 'seb',
                secure_browser_verified_at: new Date(examAccess.issuedAt).toISOString(),
                secure_browser_platform: examAccess.platform,
                secure_browser_version: examAccess.version,
              }
            : {
                exam_access_mode: 'android_monitored',
                android_approved_at: new Date(examAccess.approvedAt).toISOString(),
                android_approved_by: examAccess.approvedBy,
              })
            .eq('id', existing.id)
            .eq('student_id', user.id)
        }
        return { submissionId: existing.id }
      }
      // Time ran out while this attempt sat abandoned (e.g. the student
      // closed the tab mid-exam and came back much later) — finalize it
      // with whatever was answered instead of resuming into a countdown
      // that's already at zero, then fall through to the normal
      // retry/attempt-limit logic below as if it had just been submitted.
      await gradeAndFinalizeSubmission(admin, existing.id, user.id, {
        enforceWorkImage: false,
        enforceSecureBrowser: false,
      })
    }
    // submitted / graded: retry up to max_attempts. Exercises are unlimited
    // when not set; exams fall back to single-attempt for legacy rows saved
    // before max_attempts was configurable for exam type.
    const attemptLimit = assignment.max_attempts ?? (assignment.type === 'exercise' ? null : 1)
    if (attemptLimit && existing.attempt_number >= attemptLimit) {
      return { submissionId: existing.id, alreadySubmitted: true }
    }
    attemptNumber = existing.attempt_number + 1
    if (assignment.retry_scope === 'wrong_only') retryFromSubmissionId = existing.id
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

  let skeletons: AssignmentAttemptSkeleton[]
  // Rows copied from the previous attempt, kept out of this attempt's exam
  // view and out of auto-grading, but counted in its totals.
  let carried: CarriedAttemptAnswer[] = []

  if (retryFromSubmissionId) {
    const { data: previous } = await admin
      .from('submission_answers')
      .select(`
        question_id, random_values, correct_answer, student_answer, is_correct,
        score, max_score, teacher_feedback, order_index, option_order,
        work_images, math_input_modes, score_edited_by, score_edited_at
      `)
      .eq('submission_id', retryFromSubmissionId)
      .order('order_index')

    if (!previous || previous.length === 0) return { error: 'ไม่พบคำตอบของครั้งก่อน' }

    const split = buildRetryAttempt(
      assignment,
      questions as Question[],
      previous as unknown as PreviousAttemptAnswer[],
    )
    // Nothing to come back for: either every question already earned full
    // marks, or the only shortfalls are still waiting on the teacher. Send the
    // student to their results instead of opening an attempt with no questions.
    if (split.retried.length === 0) {
      return { submissionId: retryFromSubmissionId, alreadySubmitted: true }
    }
    skeletons = split.retried
    carried = split.carried
  } else {
    skeletons = buildAssignmentAttempt(assignment, questions as Question[])
    if (assignment.random_question_count && skeletons.length < assignment.random_question_count) {
      return { error: 'ข้อสอบในคลังเหลือไม่ครบตามจำนวนที่ตั้งไว้ กรุณาแจ้งครูผู้สอน' }
    }
  }

  // Carried rows are part of the total on purpose — that is what makes a
  // wrong-only retry add up to the same max_score as a full attempt.
  const totalMaxScore = [...skeletons, ...carried]
    .reduce((sum, s) => sum + Number(s.max_score), 0)

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
      exam_access_mode: examAccess?.mode ?? 'browser',
      secure_browser_verified_at: examAccess?.mode === 'seb'
        ? new Date(examAccess.issuedAt).toISOString()
        : null,
      secure_browser_platform: examAccess?.mode === 'seb' ? examAccess.platform : null,
      secure_browser_version: examAccess?.mode === 'seb' ? examAccess.version : null,
      android_approved_at: examAccess?.mode === 'android_monitored'
        ? new Date(examAccess.approvedAt).toISOString()
        : null,
      android_approved_by: examAccess?.mode === 'android_monitored'
        ? examAccess.approvedBy
        : null,
    })
    .select('id')
    .single()

  if (subError) return { error: subError.message }

  const { error: answersError } = await admin.from('submission_answers').insert([
    ...skeletons.map(s => ({ ...s, org_id: orgId, submission_id: submission.id, carried_over: false })),
    ...carried.map(c => ({ ...c, org_id: orgId, submission_id: submission.id })),
  ])
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
      id, submission_id, work_images, carried_over, check_count,
      submissions(
        id, student_id, status, started_at, assignment_id,
        assignments(id, duration_minutes, end_at, secure_browser_mode, android_exam_mode, type, mode, instant_check, instant_check_answer_key)
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

  if (
    assignment?.secure_browser_mode === 'seb_required'
    && !await getExamAccessSession(
      studentId,
      submission.assignment_id,
      assignment.android_exam_mode === 'monitored',
    )
  ) {
    return { error: 'เซสชันเข้าสอบหมดอายุ กรุณากลับไปเปิดข้อสอบใหม่' as const }
  }

  return { answer, submission, assignment }
}

export async function saveAnswer(
  submissionAnswerId: string,
  studentAnswer: string,
  mathInputModes?: unknown,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (typeof studentAnswer !== 'string') return { error: 'รูปแบบคำตอบไม่ถูกต้อง' }
  if (studentAnswer.length > 500_000) return { error: 'คำตอบมีขนาดใหญ่เกินไป' }
  const parsedModes = mathInputModes === undefined ? undefined : parseMathInputModes(mathInputModes)
  if (mathInputModes !== undefined && !parsedModes) return { error: 'โหมดมุมไม่ถูกต้อง' }
  const admin = createAdminClient()

  const writable = await getWritableStudentAnswer(admin, submissionAnswerId, user.id)
  if ('error' in writable) return { error: writable.error }

  const { error } = await admin
    .from('submission_answers')
    .update({
      student_answer: studentAnswer,
      ...(parsedModes ? { math_input_modes: parsedModes } : {}),
    })
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

/**
 * แบบฝึกหัด only: grade one ข้อ on the spot, without ending the attempt.
 *
 * This is the difference between a ข้อสอบ and a แบบฝึกหัด. An exam is graded
 * once, when the student presses ส่งคำตอบ at the end. An exercise lets them
 * finish one ข้อ, see whether it is right, read the เฉลย, and fix it there and
 * then — so the answer key has to cross the wire mid-attempt, which nothing
 * else in the exam path is allowed to do.
 *
 * Every guard that protects that key is therefore re-checked here, server-side,
 * rather than assumed from the fact that the button rendered:
 *
 *  - owner, still `in_progress`, within the timer and the deadline, and holding
 *    a live SEB/Android session where one is required (getWritableStudentAnswer)
 *  - the งาน is actually an online แบบฝึกหัด with `instant_check` on
 *  - `instant_check_answer_key` decides whether the เฉลย is in the response at
 *    all — a withheld one is never serialized, not merely hidden client-side
 *  - a row carried over from a previous attempt is not being asked again, so
 *    there is nothing to check and its earlier score must not be re-shown
 *
 * Nothing here writes a score. The final ส่งคำตอบ re-grades every non-carried
 * row from `student_answer`, so an exercise always scores the answer the
 * student left behind — checking a ข้อ ten times and fixing it changes what is
 * banked exactly as much as quietly editing it would. `check_count` records how
 * many times they looked, which is the only thing that distinguishes "ถูกตั้งแต่
 * แรก" from "แก้จนถูก" once the scores are equal.
 */
export async function checkAnswer(submissionAnswerId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const admin = createAdminClient()

  const writable = await getWritableStudentAnswer(admin, submissionAnswerId, user.id)
  if ('error' in writable) return { error: writable.error }

  const assignment = writable.assignment as {
    type?: string
    mode?: string
    instant_check?: boolean
    instant_check_answer_key?: boolean
  } | null

  if (
    assignment?.type !== 'exercise'
    || assignment?.mode !== 'online'
    || assignment?.instant_check !== true
  ) {
    return { error: 'งานนี้ไม่ได้เปิดให้ตรวจทีละข้อ' }
  }
  if ((writable.answer as { carried_over?: boolean }).carried_over) {
    return { error: 'ข้อนี้ยกคะแนนมาจากครั้งก่อน ไม่ต้องทำใหม่' }
  }

  const { data: row } = await admin
    .from('submission_answers')
    .select(`
      id, correct_answer, student_answer, math_input_modes, max_score, option_order,
      questions(
        question_type, answer_unit, answer_parts, answer_tolerance, extra_data,
        mcq_options, solution_text, solution_image_urls
      )
    `)
    .eq('id', submissionAnswerId)
    .eq('submission_id', writable.submission.id)
    .maybeSingle()

  if (!row) return { error: 'ไม่พบคำตอบ' }
  const question = (Array.isArray(row.questions) ? row.questions[0] : row.questions) as
    (Omit<FeedbackQuestion, 'mcq_options'> & { mcq_options: any[] | null }) | null
  if (!question) return { error: 'ไม่พบโจทย์' }
  if (!isInstantCheckable(question.question_type)) {
    return { error: 'ข้อเขียนต้องให้ครูตรวจ จึงยังตรวจเองตอนนี้ไม่ได้' }
  }

  // The same function the real grading path runs, on the same frozen row —
  // so a ข้อ that reads ถูก here cannot come out ผิด at ส่งคำตอบ. Built
  // explicitly rather than passed through, because the embed is typed as a
  // possible array and gradeAnswer reads `questions.question_type` directly:
  // an array there would silently miss every type-keyed branch it has.
  const maxScore = Number(row.max_score ?? 0)
  const graded = gradeAnswer({
    id: row.id,
    correct_answer: row.correct_answer ?? '',
    student_answer: row.student_answer,
    math_input_modes: row.math_input_modes,
    max_score: maxScore,
    questions: {
      question_type: question.question_type,
      answer_tolerance: question.answer_tolerance ?? 0.1,
      answer_parts: question.answer_parts,
      extra_data: question.extra_data,
    },
  })

  // Put the ปรนัย options back in the order this student read them, tagging
  // each with its position in the question's own list — the same reorder
  // toSafeExamAnswer does for the exam view, so ก/ข/ค/ง in the panel are the
  // letters that were on screen. จับคู่ shuffles only its right-hand column,
  // so its pairs stay in authored order.
  const rawOptions = (question.mcq_options ?? []) as Array<Record<string, unknown>>
  const optionOrder = (row.option_order as number[] | null) ?? rawOptions.map((_, i) => i)
  const displayOptions = question.question_type === 'mcq'
    ? optionOrder
        .filter(i => rawOptions[i])
        .map(i => ({
          text: String(rawOptions[i].text ?? ''),
          ...(typeof rawOptions[i].image_url === 'string'
            ? { image_url: rawOptions[i].image_url as string }
            : {}),
          index: i,
        }))
    : rawOptions.map(option => ({
        left_text: typeof option.left_text === 'string' ? option.left_text : undefined,
      }))

  const checkCount = Number((writable.answer as { check_count?: number }).check_count ?? 0) + 1
  await admin
    .from('submission_answers')
    .update({ check_count: checkCount })
    .eq('id', submissionAnswerId)
    .eq('submission_id', writable.submission.id)

  return {
    success: true as const,
    checkCount,
    feedback: buildAnswerFeedback({
      correct_answer: row.correct_answer ?? '',
      student_answer: row.student_answer,
      math_input_modes: row.math_input_modes,
      question: { ...question, mcq_options: displayOptions },
      isCorrect: graded.is_correct,
      score: graded.score,
      maxScore,
      revealAnswerKey: assignment.instant_check_answer_key !== false,
    }),
  }
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
// attempt's time limit already elapsed). Student-initiated calls enforce both
// work-image and SEB rules; a forced finalize of an abandoned expired attempt
// bypasses both because the student can no longer satisfy either requirement.
async function gradeAndFinalizeSubmission(
  admin: ReturnType<typeof createAdminClient>,
  submissionId: string,
  studentId: string,
  opts: { enforceWorkImage: boolean; enforceSecureBrowser: boolean }
): Promise<{ error?: string; success?: true; totalScore?: number }> {
  const { data: submission } = await admin
    .from('submissions')
    .select('*, assignments(duration_minutes, end_at, require_work_image, secure_browser_mode, android_exam_mode)')
    .eq('id', submissionId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (!submission) return { error: 'ไม่พบการสอบ' }
  if (submission.status !== 'in_progress') return { error: 'ส่งงานแล้ว' }

  const assignment = Array.isArray((submission as any).assignments)
    ? (submission as any).assignments[0]
    : (submission as any).assignments
  if (
    opts.enforceSecureBrowser
    && assignment?.secure_browser_mode === 'seb_required'
    && !await getExamAccessSession(
      studentId,
      submission.assignment_id,
      assignment.android_exam_mode === 'monitored',
    )
  ) {
    return { error: 'เซสชันเข้าสอบหมดอายุ กรุณากลับไปเปิดข้อสอบใหม่' }
  }

  const { data: answers } = await admin
    .from('submission_answers')
    .select('*, questions(answer_tolerance, answer_parts, question_type, extra_data)')
    .eq('submission_id', submissionId)

  if (!answers) return { error: 'ไม่พบคำตอบ' }

  // Rows carried over from an earlier attempt keep that attempt's answer and
  // score. Re-grading them would be wrong twice over: the student never saw
  // them this time, and any score a teacher gave or adjusted by hand would be
  // recomputed — an essay would drop back to pending and score 0.
  const gradable = answers.filter((a: any) => !a.carried_over)
  const carriedScore = answers
    .filter((a: any) => a.carried_over)
    .reduce((sum: number, a: any) => sum + Number(a.score ?? 0), 0)

  // Server-side defense-in-depth: the exam UI already blocks submission
  // client-side when required working is missing, but a tampered
  // client could call this action directly. `require_work_image` is the whole
  // decision — one answer for the งาน, given by the teacher when they created
  // it — and it applies to every เติมคำตอบตัวเลข question the งาน contains.
  const workImageEnforced = opts.enforceWorkImage && (assignment?.require_work_image ?? false)
  const { data: workArtifactRows, error: workArtifactError } = workImageEnforced && gradable.length > 0
    ? await admin
        .from('student_work_artifacts')
        .select('submission_answer_id, part_key')
        .in('submission_answer_id', gradable.map((answer: any) => answer.id))
    : { data: [], error: null }
  if (workArtifactError) return { error: 'ตรวจสอบวิธีทำที่แนบไม่สำเร็จ กรุณาลองใหม่' }
  const attachedArtifactSlots = new Set((workArtifactRows ?? []).map(row => (
    `${row.submission_answer_id}:${row.part_key}`
  )))
  const missingWorkImage = workImageEnforced && gradable.some((a: any) => {
    if (a.questions?.question_type !== 'written') return false
    const parts: unknown[] = a.questions?.answer_parts ?? []
    const requiredCount = parts.length > 0 ? parts.length : 1
    const images: (string | null)[] = Array.isArray(a.work_images) ? a.work_images : []
    return !hasCompleteWorkEvidence({
      submissionAnswerId: a.id,
      partCount: requiredCount,
      workImages: images,
      artifactSlots: attachedArtifactSlots,
    })
  })
  if (missingWorkImage) return { error: 'กรุณาแนบวิธีทำให้ครบทุกข้อก่อนส่งคำตอบ' }

  // Auto-grade: compare student_answer vs correct_answer with tolerance
  const updates = gradable.map((a: any) => gradeAnswer(a))

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

  const totalScore = updates.reduce((sum: number, u: any) => sum + u.score, 0) + carriedScore

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
  return gradeAndFinalizeSubmission(admin, submissionId, user.id, {
    enforceWorkImage: true,
    enforceSecureBrowser: true,
  })
}
