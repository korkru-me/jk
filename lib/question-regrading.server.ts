import 'server-only'

import { createHash } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageAssignment } from '@/lib/auth/assignment-access'
import { isGradingDefinitionChanged, assertCompatibleGradingChange, regradeAnswer, voidAnswer } from '@/lib/assignment-regrading'
import { createRegradingConfirmation, verifyRegradingConfirmation } from '@/lib/question-regrading-confirmation'
import type { RegradingConfirmation } from '@/lib/question-regrading-confirmation'
import type { QuestionFormData } from '@/lib/actions/questions'
import type { Question } from '@/lib/types'

export interface RegradingImpact {
  assignmentCount: number
  submissionCount: number
  manualCount: number
  activeCount: number
}

interface SubmissionSnapshot {
  id: string
  assignment_id: string
  answer_revision: number
  status: string
  total_score: number | null
  max_score: number
}

interface RegradingAnswer {
  id: string
  submission_id: string
  question_id: string
  student_answer: string | null
  correct_answer: string
  random_values: Record<string, number>
  option_order: number[] | null
  math_input_modes: Record<string, import('@/lib/types').MathInputMode> | null
  score: number
  max_score: number
  is_correct: boolean | null
  score_edited_by: string | null
  score_edited_at: string | null
  grading_config?: import('@/lib/assignment-attempt').GradingConfig | null
  is_void?: boolean
}

interface Target {
  assignment_id: string
  submissions: SubmissionSnapshot[]
  answers: Array<ReturnType<typeof regradeAnswer> & { submission_id: string }>
}

interface Plan {
  previous: Question
  next: Question
  requiresConfirmation: boolean
  requiresUnusedQuestion: boolean
  impact: RegradingImpact
  claims: RegradingConfirmation
  changes: Target[]
}

const PAGE = 500
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Normalize the same grading fields the existing question action writes. */
export function nextQuestionForRegrading(previous: Question, data: QuestionFormData): Question {
  const { regrade_confirmation: _receipt, ...content } = data
  const options = data.question_type === 'matching' ? data.matching_pairs ?? []
    : data.question_type === 'essay' ? data.essay_rubric ?? []
    : data.question_type === 'mcq' ? data.mcq_options : null
  return { ...previous, ...content, answer_parts: data.question_type === 'written' ? data.answer_parts : null,
    mcq_options: options as Question['mcq_options'], extra_data: data.extra_data ?? {} } as Question
}

async function readQuestion(questionId: string, actorId: string): Promise<Question> {
  if (!UUID.test(questionId)) throw new Error('รหัสโจทย์ไม่ถูกต้อง')
  const reader = await createClient()
  const [{ data, error }, bankPermission, superAdmin] = await Promise.all([
    reader.from('questions').select('*').eq('id', questionId).maybeSingle(),
    reader.rpc('current_user_can_manage_question_bank'),
    reader.rpc('is_super_admin'),
  ])
  if (error || !data || data.is_research_snapshot || bankPermission.error || bankPermission.data !== true || superAdmin.error) {
    throw new Error('ไม่พบโจทย์นี้หรือคุณไม่มีสิทธิ์แก้ไข')
  }
  if (data.created_by !== actorId && superAdmin.data !== true) {
    if (!data.team_edit_allowed) throw new Error('ไม่พบโจทย์นี้หรือคุณไม่มีสิทธิ์แก้ไข')
    // Public read permission alone never grants edit permission. Mirror the
    // authenticated question-bank UPDATE policy before any service-role reads.
    const [shared, organizations] = await Promise.all([
      reader.rpc('question_shared_with_my_orgs', { p_question_id: questionId }),
      reader.rpc('get_user_org_ids'),
    ])
    const member = ['organization', 'school'].includes(data.visibility)
      && Array.isArray(organizations.data) && organizations.data.includes(data.org_id)
    if (shared.error || organizations.error || (shared.data !== true && !member)) {
      throw new Error('ไม่พบโจทย์นี้หรือคุณไม่มีสิทธิ์แก้ไข')
    }
  }
  return data as Question
}

async function requiresUnusedQuestion(previous: Question, next: Question): Promise<boolean> {
  try {
    assertCompatibleGradingChange(previous, next)
    return false
  } catch (incompatible) {
    // Used-question shape is global even though re-marking is assignment-scoped.
    // Read existence only; do not load or disclose another teacher's learners.
    const { data, error } = await createAdminClient().from('submission_answers')
      .select('id').eq('question_id', previous.id).limit(1)
    if (error) throw new Error('ตรวจสอบการใช้งานโจทย์ไม่สำเร็จ กรุณาลองใหม่')
    if (data?.length) throw incompatible
    return true
  }
}

/** Paginate every collection; Supabase's default row limit must not drop students. */
async function targetsForQuestion(questionId: string, actorId: string, onlyAssignment?: string) {
  // Bank edit (or exact assignment manage for void) was authorized first.
  // Enumerate only linked IDs here; no learner data is read before the exact
  // per-assignment management checks below.
  const reader = createAdminClient()
  const assignmentIds: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    let query = reader.from('assignments').select('id').contains('question_ids', [questionId]).order('id').range(offset, offset + PAGE - 1)
    if (onlyAssignment) query = query.eq('id', onlyAssignment)
    const { data, error } = await query
    if (error) throw new Error('อ่านงานที่ใช้โจทย์นี้ไม่สำเร็จ')
    const permission = await Promise.all((data ?? []).map(async row => ({ id: row.id as string, allowed: await canManageAssignment(row.id, actorId) })))
    assignmentIds.push(...permission.filter(row => row.allowed).map(row => row.id))
    if ((data?.length ?? 0) < PAGE) break
  }
  if (onlyAssignment && !assignmentIds.includes(onlyAssignment)) throw new Error('ไม่มีสิทธิ์จัดการโจทย์ในงานนี้')
  const admin = createAdminClient()
  const submissions: SubmissionSnapshot[] = []
  const answers: RegradingAnswer[] = []
  for (const assignmentId of assignmentIds) {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin.from('submissions')
        .select('id, assignment_id, answer_revision, status, total_score, max_score')
        .eq('assignment_id', assignmentId).order('id').range(offset, offset + PAGE - 1)
      if (error) throw new Error('อ่านรอบทำงานไม่สำเร็จ')
      submissions.push(...(data ?? []) as SubmissionSnapshot[])
      if ((data?.length ?? 0) < PAGE) break
    }
  }
  for (let i = 0; i < submissions.length; i += 100) {
    const ids = submissions.slice(i, i + 100).map(row => row.id)
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin.from('submission_answers').select('*')
        .eq('question_id', questionId).in('submission_id', ids).order('id').range(offset, offset + PAGE - 1)
      if (error) throw new Error('อ่านคำตอบสำหรับตรวจคะแนนใหม่ไม่สำเร็จ')
      answers.push(...(data ?? []) as RegradingAnswer[])
      if ((data?.length ?? 0) < PAGE) break
    }
  }
  return { assignmentIds, submissions, answers }
}

function signingSecret() {
  const secret = process.env.GRADING_CONFIRMATION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret || secret.length < 32) throw new Error('ยังไม่ได้ตั้งค่าระบบยืนยันการแก้คะแนน')
  return secret
}

export async function planQuestionRegrading(questionId: string, data: QuestionFormData, actorId: string): Promise<Plan> {
  const previous = await readQuestion(questionId, actorId)
  const next = nextQuestionForRegrading(previous, data)
  const changed = isGradingDefinitionChanged(previous, next)
  const mustRemainUnused = changed ? await requiresUnusedQuestion(previous, next) : false
  const targets = changed ? await targetsForQuestion(questionId, actorId) : { assignmentIds: [], submissions: [], answers: [] }
  const impact = { assignmentCount: targets.assignmentIds.length, submissionCount: targets.submissions.length,
    manualCount: targets.answers.filter(row => row.score_edited_by != null).length,
    activeCount: targets.submissions.filter(row => row.status === 'in_progress').length }
  const changes: Target[] = targets.assignmentIds.map(id => ({ assignment_id: id,
    submissions: targets.submissions.filter(row => row.assignment_id === id),
    answers: targets.answers.filter(row => targets.submissions.some(s => s.id === row.submission_id && s.assignment_id === id))
      .map(answer => ({ ...regradeAnswer(previous, next, answer), submission_id: answer.submission_id, expected: expectedAnswer(answer) })),
  }))
  const claims = { actorId, questionId, revision: previous.updated_at,
    change: hash(next), scope: hash({ impact, changes, requiresUnusedQuestion: mustRemainUnused }) }
  return { previous, next, requiresConfirmation: changed, requiresUnusedQuestion: mustRemainUnused, impact, claims, changes }
}

export function questionRegradingReceipt(plan: Plan) {
  return createRegradingConfirmation(plan.claims, signingSecret())
}

export async function commitQuestionRegrading(plan: Plan, token: unknown, patch: Record<string, unknown>) {
  if (!verifyRegradingConfirmation(token, plan.claims, signingSecret())) {
    return { error: 'ข้อมูลเฉลยหรือคะแนนเปลี่ยนแล้ว กรุณากดบันทึกและยืนยันผลกระทบอีกครั้ง' }
  }
  if (plan.impact.activeCount > 0) return { error: 'ยังมีนักเรียนกำลังทำงานที่ใช้โจทย์นี้ กรุณารอให้ส่งงานครบก่อนแก้เฉลย' }
  const { error } = await createAdminClient().rpc('apply_question_grading_change', {
    p_actor_id: plan.claims.actorId, p_question_id: plan.previous.id,
    p_expected_question_updated_at: plan.previous.updated_at, p_question_patch: patch,
    p_changes: plan.changes, p_void_assignment_id: null, p_reason: 'แก้เฉลยในคลังโจทย์และตรวจคะแนนย้อนหลัง',
    p_requires_unused_question: plan.requiresUnusedQuestion,
  })
  if (error) return { error: gradingChangeError(error) }
  return { success: true as const, assignmentIds: plan.changes.map(row => row.assignment_id) }
}

export async function planVoidQuestion(assignmentId: string, questionId: string, actorId: string) {
  if (!UUID.test(assignmentId) || !UUID.test(questionId) || !await canManageAssignment(assignmentId, actorId)) {
    throw new Error('ไม่มีสิทธิ์จัดการโจทย์ในงานนี้')
  }
  // A manager may void a linked owner's question even without bank edit rights.
  const { data: question, error } = await createAdminClient().from('questions').select('*').eq('id', questionId).maybeSingle()
  if (error || !question) throw new Error('ไม่พบโจทย์นี้')
  const targets = await targetsForQuestion(questionId, actorId, assignmentId)
  const impact = { assignmentCount: 1, submissionCount: targets.submissions.length,
    manualCount: targets.answers.filter(row => row.score_edited_by != null).length,
    activeCount: targets.submissions.filter(row => row.status === 'in_progress').length }
  const changes = [{ assignment_id: assignmentId, submissions: targets.submissions,
    answers: targets.answers.map(answer => ({ ...voidAnswer(answer), submission_id: answer.submission_id, expected: expectedAnswer(answer) })) }]
  const claims = { actorId, questionId, revision: question.updated_at as string,
    change: `void:${assignmentId}`, scope: hash({ impact, changes }) }
  return { question: question as Question, impact, changes, claims }
}

export async function commitVoidQuestion(plan: Awaited<ReturnType<typeof planVoidQuestion>>, token: unknown, reason: string) {
  if (!verifyRegradingConfirmation(token, plan.claims, signingSecret())) return { error: 'คะแนนเปลี่ยนแล้ว กรุณาเปิดคำยืนยันใหม่' }
  if (plan.impact.activeCount > 0) return { error: 'ยังมีนักเรียนกำลังทำงานนี้ กรุณารอให้ส่งครบก่อนทำข้อเป็นโมฆะ' }
  if (reason.trim().length < 3 || reason.trim().length > 300) return { error: 'กรุณาระบุเหตุผล 3–300 ตัวอักษร' }
  const { error } = await createAdminClient().rpc('apply_question_grading_change', {
    p_actor_id: plan.claims.actorId, p_question_id: plan.question.id,
    p_expected_question_updated_at: plan.question.updated_at, p_question_patch: {},
    p_changes: plan.changes, p_void_assignment_id: plan.changes[0].assignment_id, p_reason: reason.trim(),
    p_requires_unused_question: false,
  })
  return error ? { error: gradingChangeError(error) } : { success: true as const }
}

export function voidQuestionReceipt(plan: Awaited<ReturnType<typeof planVoidQuestion>>) {
  return createRegradingConfirmation(plan.claims, signingSecret())
}

function gradingChangeError(error: { code?: string; message: string }) {
  if (error.code === 'PT409') return 'ข้อมูลเปลี่ยนระหว่างยืนยัน กรุณาเปิดคำยืนยันและตรวจผลกระทบใหม่'
  if (error.code === '42501') return 'ไม่มีสิทธิ์แก้เฉลยหรือคะแนนของงานนี้แล้ว'
  if (error.code?.startsWith('PGRST') || error.code === '42883' || error.code === '42P01') {
    return 'ฐานข้อมูลนี้ยังไม่ได้ติดตั้งระบบตรวจคะแนนย้อนหลัง กรุณาติดตั้ง migration ก่อนใช้งาน'
  }
  return 'บันทึกการแก้คะแนนไม่สำเร็จ ไม่มีการเปลี่ยนคะแนนบางส่วน กรุณาลองใหม่'
}

function expectedAnswer(answer: RegradingAnswer) {
  return { correct_answer: answer.correct_answer, score: answer.score, is_correct: answer.is_correct,
    max_score: answer.max_score, score_edited_by: answer.score_edited_by ?? null, score_edited_at: answer.score_edited_at ?? null,
    student_answer: answer.student_answer, random_values: answer.random_values ?? {},
    is_void: answer.is_void === true, grading_config: answer.grading_config ?? null }
}
