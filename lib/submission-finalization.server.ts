import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getExamAccessSession } from '@/lib/exam-access-session'
import { gradeAnswer } from '@/lib/assignment-attempt'
import { hasCompleteWorkEvidence } from '@/lib/math-work'
import { parseSubmittedFiles } from '@/lib/exam-attachment'
import { validateStoredExamAttachmentUrl } from '@/lib/exam-attachment-access.server'
import { revalidatePath } from 'next/cache'

// Shared by submitSubmission (student-initiated) and startSubmission's
// stale-attempt handling (server-initiated, when a resumed in-progress
// attempt's time limit already elapsed). Student-initiated calls enforce both
// work-image and SEB rules; a forced finalize of an abandoned expired attempt
// bypasses both because the student can no longer satisfy either requirement.
export async function gradeAndFinalizeSubmission(
  admin: ReturnType<typeof createAdminClient>,
  submissionId: string,
  studentId: string,
  opts: { enforceWorkImage: boolean; enforceSecureBrowser: boolean; expiredOnly?: boolean }
): Promise<{ error?: string; success?: true; totalScore?: number; notExpired?: true }> {
  const { data: submission } = await admin
    .from('submissions')
    .select('*, assignments(duration_minutes, end_at, require_work_image, secure_browser_mode, android_exam_mode)')
    .eq('id', submissionId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (!submission) return { error: 'ไม่พบการสอบ' }
  if (submission.status !== 'in_progress') return { success: true, totalScore: submission.total_score ?? 0 }

  // A cron-closed attempt must never wait for missing working or a native
  // session which the student can no longer renew. SQL rechecks the cutoff.
  const automatic = opts.expiredOnly === true || submission.closed_at != null

  const assignment = Array.isArray((submission as any).assignments)
    ? (submission as any).assignments[0]
    : (submission as any).assignments
  if (
    !automatic && opts.enforceSecureBrowser
    && assignment?.secure_browser_mode === 'seb_required'
    && !await getExamAccessSession(
      studentId,
      submission.assignment_id,
      assignment.android_exam_mode === 'monitored',
      typeof submission.seb_config_revision === 'number' ? submission.seb_config_revision : null,
      submission.exam_access_mode === 'seb' || submission.exam_access_mode === 'android_monitored'
        ? submission.exam_access_mode
        : null,
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

  // A URL-shaped string is not evidence of an uploaded answer. Re-inspect
  // every legacy photo/file before the final grade so a tampered client cannot
  // gain credit by calling saveAnswer/saveWorkImage with external or missing
  // objects. New paths are bound to this exact student + attempt + answer;
  // two-segment paths are accepted only for attempts opened before S1 shipped.
  const attachmentChecks: Array<() => ReturnType<typeof validateStoredExamAttachmentUrl>> = []
  for (const answer of (!automatic && opts.enforceSecureBrowser ? gradable : []) as any[]) {
    if (answer.questions?.question_type === 'file_upload') {
      const files = parseSubmittedFiles(answer.student_answer)
      if (!files) return { error: 'รายการไฟล์คำตอบไม่ถูกต้อง กรุณาแนบใหม่' }
      for (const file of files) {
        attachmentChecks.push(() => validateStoredExamAttachmentUrl(admin, {
          kind: 'submission_file',
          url: file.url,
          studentId,
          submissionId,
          submissionAnswerId: answer.id,
          expectedMimeType: file.type,
          allowLegacy: true,
        }))
      }
    }
    const workImages: unknown[] = Array.isArray(answer.work_images) ? answer.work_images : []
    for (const url of workImages) {
      if (typeof url !== 'string' || !url) continue
      attachmentChecks.push(() => validateStoredExamAttachmentUrl(admin, {
        kind: 'work_image',
        url,
        studentId,
        submissionId,
        submissionAnswerId: answer.id,
        allowLegacy: true,
      }))
    }
  }
  const attachmentCheckConcurrency = 4
  for (let index = 0; index < attachmentChecks.length; index += attachmentCheckConcurrency) {
    const results = await Promise.all(
      attachmentChecks.slice(index, index + attachmentCheckConcurrency).map(check => check()),
    )
    const failed = results.find(result => 'error' in result)
    if (failed?.error) return { error: failed.error }
  }

  // Server-side defense-in-depth: the exam UI already blocks submission
  // client-side when required working is missing, but a tampered
  // client could call this action directly. `require_work_image` is the whole
  // decision — one answer for the งาน, given by the teacher when they created
  // it — and it applies to every เติมคำตอบตัวเลข question the งาน contains.
  const workImageRequired = assignment?.require_work_image ?? false
  const workImageEnforced = !automatic && opts.enforceWorkImage && workImageRequired
  const { data: workArtifactRows, error: workArtifactError } = !automatic && workImageRequired && gradable.length > 0
    ? await admin
        .from('student_work_artifacts')
        .select('submission_answer_id, part_key')
        .in('submission_answer_id', gradable.map((answer: any) => answer.id))
    : { data: [], error: null }
  if (workArtifactError) return { error: 'ตรวจสอบวิธีทำที่แนบไม่สำเร็จ กรุณาลองใหม่' }
  const attachedArtifactSlots = new Set((workArtifactRows ?? []).map(row => (
    `${row.submission_answer_id}:${row.part_key}`
  )))
  const missingWorking = (rows: typeof gradable, slots: Set<string>) => workImageRequired && rows.some((a: any) => {
    if (a.questions?.question_type !== 'written') return false
    const parts: unknown[] = a.questions?.answer_parts ?? []
    const requiredCount = parts.length > 0 ? parts.length : 1
    const images: (string | null)[] = Array.isArray(a.work_images) ? a.work_images : []
    return !hasCompleteWorkEvidence({
      submissionAnswerId: a.id,
      partCount: requiredCount,
      workImages: images,
      artifactSlots: slots,
    })
  })
  let missingWorkImage = missingWorking(gradable, attachedArtifactSlots)
  if (workImageEnforced && missingWorkImage) return { error: 'กรุณาแนบวิธีทำให้ครบทุกข้อก่อนส่งคำตอบ' }

  // Freeze first. Manual submissions compare the answer revision that was
  // validated above; automatic closure always reads the frozen DB copy.
  const { data: closure, error: closeError } = await admin.rpc('claim_submission_close', {
    p_submission_id: submissionId, p_student_id: studentId,
    p_expired_only: automatic,
    p_expected_revision: automatic ? null : submission.answer_revision,
  })
  if (closeError?.code === 'PT425') return { error: 'เวลาของรอบนี้เปลี่ยนแล้ว กำลังตรวจสอบเวลาใหม่', notExpired: true }
  if (closeError) return { error: closeError.code === 'PT409'
    ? 'คำตอบกำลังเปลี่ยนแปลง กรุณาลองส่งอีกครั้ง'
    : closeError.code === 'PT425' ? 'รอบนี้ยังไม่หมดเวลา' : 'ยืนยันการปิดรอบไม่สำเร็จ กรุณาลองใหม่' }
  if (closure?.completed) return { success: true, totalScore: closure.total_score ?? 0 }

  const { data: frozenAnswers, error: frozenError } = await admin.from('submission_answers')
    .select('*, questions(answer_tolerance, answer_parts, question_type, extra_data)')
    .eq('submission_id', submissionId)
  if (frozenError || !frozenAnswers) return { error: 'รอบปิดแล้ว แต่ยังตรวจคะแนนไม่สำเร็จ ระบบจะลองใหม่' }
  if (automatic && workImageRequired) {
    const { data: artifacts, error } = await admin.from('student_work_artifacts')
      .select('submission_answer_id, part_key').in('submission_answer_id', frozenAnswers.map((a: any) => a.id))
    if (error) return { error: 'รอบปิดแล้ว แต่ยังตรวจวิธีทำไม่สำเร็จ ระบบจะลองใหม่' }
    missingWorkImage = missingWorking(frozenAnswers.filter((a: any) => !a.carried_over),
      new Set((artifacts ?? []).map(a => `${a.submission_answer_id}:${a.part_key}`)))
  }
  const updates = frozenAnswers.filter((a: any) => !a.carried_over).map((a: any) => gradeAnswer(a))
  // One transaction writes all verdicts and the header; overlapping cron,
  // reconnect and manual calls cannot overwrite a completed/teacher grade.
  const { data: receipt, error: gradeError } = await admin.rpc('commit_submission_grade', {
    p_submission_id: submissionId, p_student_id: studentId, p_updates: updates,
    p_missing_work_evidence: missingWorkImage,
  })
  if (gradeError) return { error: 'รอบปิดแล้ว แต่ยังตรวจคะแนนไม่สำเร็จ ระบบจะลองใหม่' }
  const totalScore = receipt?.total_score ?? 0

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
