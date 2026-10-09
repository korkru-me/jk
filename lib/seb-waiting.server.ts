import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { studentHasAssignment } from '@/lib/auth/assignment-access'
import { readCurrentAssignmentSebRelease } from '@/lib/seb-assignment-release.server'
import { readWaitingSebProfile, waitingSebFeatureEnabled } from '@/lib/seb-waiting-release-policy'
import { readSebExamContext, createSebExamStartIntent, getSebExamCsrfToken } from '@/lib/seb-exam-context.server'
import { createSebChallenge, getSebSession } from '@/lib/seb-session'
import { completionAttemptLimit, findPassingCompletion } from '@/lib/assignment-completion'
import { projectSebWaitingRoom } from '@/lib/seb-waiting-room'
import type { SebExamContextClaims } from '@/lib/seb-exam-context-core'
import { inspectWaitingSebAssignmentPolicy } from '@/lib/seb-waiting-assignment-policy'

export interface SebWaitingRouteParams { assignmentId: string; revision: string }

/** Authentication + exact release + roster. A routing cookie is not SEB authority. */
export async function authorizeWaitingExam(params: SebWaitingRouteParams) {
  if (!waitingSebFeatureEnabled(process.env)) return { ok: false as const, reason: 'release' as const }
  const state = await readSebExamContext({ assignmentId: params.assignmentId, revision: Number(params.revision) })
  if (state.status !== 'valid') return { ok: false as const, reason: 'context' as const }
  const context = state.claims
  const release = await readCurrentAssignmentSebRelease(context.assignmentId)
  const profile = release ? readWaitingSebProfile(release) : null
  if (!release || !profile || release.releaseId !== context.releaseId || release.revision !== context.revision) {
    return { ok: false as const, reason: 'release' as const }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, reason: 'login' as const, context }
  if (context.userId !== user.id) return { ok: false as const, reason: 'account' as const }
  const admin = createAdminClient()
  const [{ data: account, error: accountError }, roster] = await Promise.all([
    admin.from('users').select('id, role, status, survey_role, full_name').eq('id', user.id).maybeSingle(),
    studentHasAssignment(admin, context.assignmentId, user.id),
  ])
  if (accountError || !account || account.role !== 'student' || account.status !== 'active' || !roster) {
    return { ok: false as const, reason: 'roster' as const }
  }
  const [assignment, passwordless] = await Promise.all([
    admin.from('assignments').select('type, mode, secure_browser_mode, completion_rule').eq('id', context.assignmentId).maybeSingle(),
    admin.from('assignments').select('id').eq('id', context.assignmentId).is('access_code', null).maybeSingle(),
  ])
  if (assignment.error || passwordless.error) return { ok: false as const, reason: 'release' as const }
  const policy = inspectWaitingSebAssignmentPolicy({ profileId: profile.profileId, assignment: assignment.data, passwordless: !!passwordless.data })
  if (!policy.applies || !policy.supported) {
    return { ok: false as const, reason: 'unsupported' as const,
      message: policy.applies ? policy.message : 'ข้อสอบนี้ยังไม่รองรับห้องสอบ SEB รุ่นทดลอง' }
  }
  return { ok: true as const, context, profile, release, user, account, admin }
}

export async function readWaitingExamData(params: SebWaitingRouteParams) {
  const access = await authorizeWaitingExam(params)
  if (!access.ok) return access
  if (!access.account.survey_role) return { ok: false as const, reason: 'profile' as const, context: access.context }
  const { context, admin, user, release } = access
  const [assignmentResult, extensionResult, attemptsResult, verified, passwordlessResult] = await Promise.all([
    // Intentionally no question_ids, access_code, answers, keys or teacher password.
    admin.from('assignments').select('id, title, status, type, mode, secure_browser_mode, duration_minutes, start_at, end_at, max_attempts, completion_rule, passing_type, passing_value, display_max_score')
      .eq('id', context.assignmentId).maybeSingle(),
    admin.from('assignment_extensions').select('extended_end_at').eq('assignment_id', context.assignmentId).eq('student_id', user.id).maybeSingle(),
    admin.from('submissions').select('id, status, started_at, attempt_number, total_score, max_score, streak_reached, exam_access_mode, seb_config_revision')
      .eq('assignment_id', context.assignmentId).eq('student_id', user.id).order('attempt_number', { ascending: false }),
    getSebSession(user.id, context.assignmentId, release.releaseId, context.revision),
    // Read only a Boolean-shaped eligibility row, never the legacy code value.
    admin.from('assignments').select('id').eq('id', context.assignmentId).is('access_code', null).maybeSingle(),
  ])
  const assignment = assignmentResult.data
  if (!assignment || assignmentResult.error || extensionResult.error || attemptsResult.error || passwordlessResult.error
    || assignment.type !== 'exam' || assignment.mode !== 'online' || assignment.secure_browser_mode !== 'seb_required') {
    return { ok: false as const, reason: 'release' as const }
  }
  const attempts = attemptsResult.data ?? []
  const latest = attempts[0] ?? null
  if (latest?.status === 'in_progress' && (latest.exam_access_mode !== 'seb' || latest.seb_config_revision !== context.revision)) {
    return { ok: false as const, reason: 'release' as const }
  }
  const limit = completionAttemptLimit(assignment)
  const quota = (limit === null || (latest?.attempt_number ?? 0) < limit) && !findPassingCompletion(assignment, attempts)
  const view = projectSebWaitingRoom({
    title: assignment.title, durationMinutes: assignment.duration_minutes,
    published: assignment.status === 'published', authorized: true, releaseReady: true,
    verified: !!verified, opensAt: assignment.start_at,
    closesAt: extensionResult.data?.extended_end_at ?? assignment.end_at,
    attempt: latest ? { id: latest.id, status: latest.status, startedAt: latest.started_at } : null,
    canCreateAttempt: quota && !!passwordlessResult.data,
    receiptAvailable: !!latest && latest.exam_access_mode === 'seb' && latest.seb_config_revision === context.revision,
  })
  if (!latest && !passwordlessResult.data) view.message = 'ข้อสอบนี้ยังมีรหัสเข้าแบบเดิม กรุณาให้ครูนำรหัสเข้าออกก่อนใช้ห้องสอบ SEB'
  // The intent is retained client-side on a lost-response retry. Refreshing the
  // page reconciles the server receipt instead of guessing that a new start failed.
  const startIntent = !latest || latest.status !== 'in_progress'
    ? createSebExamStartIntent(context, { submissionId: latest?.id ?? null, attemptNumber: latest?.attempt_number ?? 0 })
    : null
  return {
    ok: true as const, view, context, csrf: getSebExamCsrfToken(context), startIntent,
    challenge: createSebChallenge(user.id, context.assignmentId, context.releaseId, context.revision, 'system_check'),
  }
}

/** Resolve an operation's object through its exact owner/assignment, never its id alone. */
export async function authorizeWaitingObject(context: SebExamContextClaims, kind: 'submission' | 'answer' | 'artifact', id: string, options: { allowExpired?: boolean } = {}) {
  const access = await authorizeWaitingExam({ assignmentId: context.assignmentId, revision: String(context.revision) })
  if (!access.ok || !access.account.survey_role || access.context.contextId !== context.contextId) return null
  const { admin, user, release } = access
  const session = await getSebSession(user.id, context.assignmentId, release.releaseId, context.revision)
  if (!session) return null
  let submissionId = id
  let answerId = kind === 'answer' ? id : null
  if (kind === 'artifact') {
    const { data } = await admin.from('student_work_artifacts').select('submission_answer_id').eq('id', id).maybeSingle()
    if (!data) return null
    answerId = data.submission_answer_id
  }
  if (answerId) {
    const { data } = await admin.from('submission_answers').select('submission_id, carried_over').eq('id', answerId).maybeSingle()
    if (!data || data.carried_over) return null
    submissionId = data.submission_id
  }
  const { data: submission } = await admin.from('submissions').select('id, status, started_at, exam_access_mode, seb_config_revision, assignments(duration_minutes, end_at)')
    .eq('id', submissionId).eq('student_id', user.id).eq('assignment_id', context.assignmentId).maybeSingle()
  if (!submission || submission.status !== 'in_progress' || submission.exam_access_mode !== 'seb' || submission.seb_config_revision !== context.revision) return null
  const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments
  const { data: extension, error: extensionError } = await admin.from('assignment_extensions').select('extended_end_at')
    .eq('assignment_id', context.assignmentId).eq('student_id', user.id).maybeSingle()
  if (!assignment || extensionError || !Number.isFinite(Date.parse(submission.started_at))) return null
  if (assignment.duration_minutes !== null && (!Number.isFinite(assignment.duration_minutes) || assignment.duration_minutes <= 0)) return null
  const deadline = extension?.extended_end_at ?? assignment.end_at
  if (deadline && !Number.isFinite(Date.parse(deadline))) return null
  if (!options.allowExpired && ((assignment.duration_minutes !== null
    && Date.parse(submission.started_at) + assignment.duration_minutes * 60_000 <= Date.now())
    || (deadline && Date.parse(deadline) <= Date.now()))) return null
  return { ...access, submissionId, answerId }
}
