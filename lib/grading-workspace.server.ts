import type { GradingSavedDraft } from './grading-draft-types'
import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth/server'
import { canManageAssignment } from '@/lib/auth/assignment-access'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllRows, fetchRowsInChunks } from '@/lib/supabase/fetch-all-rows'
import { loadAssignmentQuestionsByProvenance } from '@/lib/assignment-question-access.server'
import { naturalMaxScore, type GradingConfig } from '@/lib/assignment-attempt'
import { scoreParts, sortGradingStudents, type GradingAnswer, type GradingPartsPolicy, type GradingStudent, type GradingStudentSortKey, type GradingWorkspaceData } from '@/lib/grading-workspace'
import { officialSubmissionsByStudent, rescaleToDisplayMax } from '@/lib/scoring'
import { preferPendingAverageReviewAttempts } from '@/lib/grading-review-attempt'
import { loadAssignmentGradingState, withVoidedScoreMetadata } from '@/lib/voided-score-metadata.server'
import { isCurrentAnswerAttachmentPath, isLegacyStudentAttachmentPath, storagePathFromPublicUrl } from '@/lib/exam-attachment'
import { MATH_WORK_BUCKET } from '@/lib/math-work'
import type { Assignment, MathInputMode, Question } from '@/lib/types'
import type { AssignmentSidebarSummary } from '@/app/(app)/assignments/[id]/_components/assignment-context-sidebar'

export interface GradingWorkspaceScope {
  kind: 'overview' | 'question' | 'student'
  questionId?: string
  studentId?: string
  query?: { classroom?: string; sort?: 'classroom' | 'code' | 'number' | 'name'; dir?: 'asc' | 'desc'; page?: number }
}
export interface GradingWorkspaceLoadResult {
  data: GradingWorkspaceData
  sidebarAssignment: AssignmentSidebarSummary
  pendingCount: number
  availableQuestionCount: number
  missingQuestionCount: number
  duplicateQuestionCount: number
}

type AssignmentRecord = Pick<Assignment,
  'id' | 'created_by' | 'org_id' | 'classroom_id' | 'title' | 'status' | 'type' | 'mode' | 'question_ids'
  | 'random_question_count' | 'completion_rule' | 'streak_target' | 'score_strategy' | 'display_max_score'
  | 'question_points' | 'require_work_image'
> & { classrooms: { name: string; description?: string | null } | null }
interface SubmissionRecord {
  id: string; assignment_id: string; student_id: string; status: 'in_progress' | 'submitted' | 'graded'
  closed_at: string | null; total_score: number | null; score_adjustment: number | null; max_score: number
  attempt_number: number; streak_reached?: boolean
  users: { full_name: string | null } | { full_name: string | null }[] | null
  voided_max_score?: number
}
interface AnswerRecord {
  id: string; submission_id: string; question_id: string; is_correct: boolean | null; score: number; max_score: number
  score_edited_by: string | null; score_edited_at: string | null; order_index: number
  grading_config?: GradingConfig | null; is_void?: boolean; void_original_max_score?: number
  answer_score?: number | null; answer_max_score?: number | null; work_score?: number | null; work_max_score?: number | null
  answer_reviewed_at?: string | null; work_reviewed_at?: string | null
  random_values?: Record<string, number>; correct_answer?: string; student_answer?: string | null
  option_order?: number[] | null; work_images?: (string | null)[]; math_input_modes?: Record<string, MathInputMode> | null
}
interface ProfileRecord { student_id: string; grade_level: string | null; section_number: number | null; class_number: number | null; student_code: string | null }
interface PolicyRecord { question_id: string; work_share: number; updated_at: string | null }
interface ArtifactRecord { id: string; submission_answer_id: string; student_id: string; part_key: string; source_type: string; preview_path: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CHUNK_SIZE = 100
const PAGE_SIZE = 30
const missingTable = (error: unknown) => !!error && typeof error === 'object' && 'code' in error && (error.code === '42P01' || error.code === 'PGRST205')
const SUMMARY_COLUMNS = 'id, submission_id, question_id, is_correct, score, max_score, score_edited_by, score_edited_at, order_index'
const REGRADING_COLUMNS = ', grading_config, is_void, void_original_max_score'
const PART_COLUMNS = ', answer_score, answer_max_score, work_score, work_max_score, answer_reviewed_at, work_reviewed_at'
const BODY_COLUMNS = ', random_values, correct_answer, student_answer, option_order, work_images, math_input_modes'

async function pagedChunks<T>(ids: string[], read: (ids: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; offset < ids.length; offset += CHUNK_SIZE) {
    const batch = ids.slice(offset, offset + CHUNK_SIZE)
    const result = await fetchAllRows((from, to) => read(batch, from, to))
    if (result.error) throw new Error('โหลดข้อมูลการตรวจให้คะแนนไม่สำเร็จ กรุณาลองใหม่')
    rows.push(...result.rows)
  }
  return rows
}

/** Only classification flags are needed by summary consumers, never frozen answer keys. */
function summaryConfig(config: GradingConfig | null | undefined): GradingConfig | null {
  if (!config) return null
  const extra = config.extra_data as Record<string, unknown> | null
  const blank = (value: unknown) => {
    const type = value && typeof value === 'object' && 'type' in value ? value.type : undefined
    return { type: type === 'text' || type === 'fixed' || type === 'dropdown' ? type : undefined }
  }
  const safeExtra: Record<string, unknown> = {}
  if (extra?.grading_mode === 'manual') safeExtra.grading_mode = 'manual'
  if (extra?.explanation_mode === 'none') safeExtra.explanation_mode = 'none'
  if (Array.isArray(extra?.blanks)) safeExtra.blanks = extra.blanks.map(blank)
  if (Array.isArray(extra?.parts)) safeExtra.parts = extra.parts.map((part: unknown) => {
    if (!part || typeof part !== 'object') return { type: '' }
    return { type: 'type' in part ? part.type : '', blanks: 'blanks' in part && Array.isArray(part.blanks) ? part.blanks.map(blank) : [] }
  })
  return { question_type: config.question_type, answer_tolerance: 0, answer_parts: null, extra_data: safeExtra }
}

function asAnswer(row: AnswerRecord, submission: SubmissionRecord, full = false): GradingAnswer {
  return {
    id: row.id, submissionId: submission.id, studentId: submission.student_id, questionId: row.question_id,
    randomValues: full ? row.random_values ?? {} : {}, correctAnswer: full ? row.correct_answer ?? '' : '',
    studentAnswer: full ? row.student_answer ?? null : null, isCorrect: row.is_correct, score: Number(row.score), maxScore: Number(row.max_score),
    optionOrder: full ? row.option_order ?? null : null, orderIndex: row.order_index,
    workImages: [], scoreEditedBy: row.score_edited_by, scoreEditedAt: row.score_edited_at,
    gradingConfig: full ? row.grading_config ?? null : summaryConfig(row.grading_config),
    isVoid: row.is_void === true, voidOriginalMaxScore: row.void_original_max_score ?? 0,
    answerScore: row.answer_score, answerMaxScore: row.answer_max_score, workScore: row.work_score, workMaxScore: row.work_max_score,
    answerReviewedAt: row.answer_reviewed_at, workReviewedAt: row.work_reviewed_at,
    ...(full ? { mathInputModes: row.math_input_modes ?? null } : {}),
  }
}

function safeWorkImages(row: AnswerRecord, submission: SubmissionRecord): (string | null)[] {
  let origin: string
  try { origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin } catch { return [] }
  return (Array.isArray(row.work_images) ? row.work_images : []).map(url => {
    const path = storagePathFromPublicUrl(url, 'work-images', origin)
    return path && (isCurrentAnswerAttachmentPath(path, { studentId: submission.student_id, submissionId: submission.id, submissionAnswerId: row.id })
      || isLegacyStudentAttachmentPath(path, submission.student_id)) ? url : null
  })
}

async function attachArtifacts(reader: SupabaseClient, answers: GradingAnswer[]) {
  if (answers.length === 0) return
  const byId = new Map(answers.map(answer => [answer.id, answer]))
  const rows = await pagedChunks([...byId.keys()], (ids, from, to) => reader.from('student_work_artifacts')
    .select('id, submission_answer_id, student_id, part_key, source_type, preview_path')
    .in('submission_answer_id', ids).order('id').range(from, to).returns<ArtifactRecord[]>())
  const allowed = rows.filter(row => {
    const answer = byId.get(row.submission_answer_id)
    if (!answer || row.student_id !== answer.studentId) return false
    const prefix = `students/${answer.studentId}/${answer.submissionId}/${answer.id}/`
    if (!row.preview_path.startsWith(prefix)) return false
    const suffix = row.preview_path.slice(prefix.length)
    const [uploadId, file, ...extra] = suffix.split('/')
    return UUID.test(uploadId ?? '') && /^preview\.(webp|png)$/.test(file ?? '') && extra.length === 0
  })
  const signed = new Map<string, string>()
  const paths = [...new Set(allowed.map(row => row.preview_path))]
  for (let offset = 0; offset < paths.length; offset += CHUNK_SIZE) {
    const batch = paths.slice(offset, offset + CHUNK_SIZE)
    try {
      const { data, error } = await reader.storage.from(MATH_WORK_BUCKET).createSignedUrls(batch, 300)
      if (!error) for (const entry of data ?? []) {
        if (entry.path && batch.includes(entry.path) && entry.signedUrl && !entry.error) signed.set(entry.path, entry.signedUrl)
      }
    } catch { /* A failed preview link remains unavailable; grading metadata is still valid. */ }
  }
  for (const row of allowed) {
    const answer = byId.get(row.submission_answer_id)!
    ;(answer.workArtifacts ??= []).push({ id: row.id, partKey: row.part_key, sourceType: row.source_type, previewUrl: signed.get(row.preview_path) ?? null })
  }
}

/** No service-role learner read happens before active-account and exact-assignment authorization. */
export async function loadGradingWorkspace(assignmentId: string, scope: GradingWorkspaceScope = { kind: 'overview' }): Promise<GradingWorkspaceLoadResult | null> {
  if (!UUID.test(assignmentId) || !['overview', 'question', 'student'].includes(scope.kind)
    || (scope.kind === 'question' && !UUID.test(scope.questionId ?? ''))
    || (scope.kind === 'student' && !UUID.test(scope.studentId ?? ''))) return null
  const user = await getAuthUser()
  if (!user) return null
  const session = await createClient()
  const profile = await session.from('users').select('role, status').eq('id', user.id).maybeSingle()
  if (profile.error || profile.data?.status !== 'active') return null
  if (profile.data.role !== 'teacher' && profile.data.role !== 'admin') {
    const trusted = await session.rpc('is_super_admin')
    if (trusted.error || trusted.data !== true) return null
  }
  if (!await canManageAssignment(assignmentId, user.id)) return null

  const assignmentResult = await session.from('assignments')
    .select('id, created_by, org_id, classroom_id, title, status, type, mode, question_ids, random_question_count, completion_rule, streak_target, score_strategy, display_max_score, question_points, require_work_image, classrooms(name, description)')
    .eq('id', assignmentId).maybeSingle()
  if (assignmentResult.error) throw new Error('โหลดงานที่มอบหมายไม่สำเร็จ')
  if (!assignmentResult.data) return null
  const assignment = assignmentResult.data as unknown as AssignmentRecord
  const loadedQuestions = await loadAssignmentQuestionsByProvenance(assignment)
  if ('error' in loadedQuestions) throw new Error(loadedQuestions.error)
  const questions = loadedQuestions.questions.map(question => ({ ...question,
    requires_work_image: question.question_type === 'written' ? question.requires_work_image || assignment.require_work_image : question.requires_work_image,
  }))
  const questionById = new Map(questions.map(question => [question.id, question]))
  if (scope.kind === 'question' && !questionById.has(scope.questionId!)) return null

  const reader = createAdminClient()
  const [allSubmissions, gradingState, policyResult] = await Promise.all([
    fetchAllRows((from, to) => reader.from('submissions')
      .select('id, assignment_id, student_id, status, closed_at, total_score, score_adjustment, max_score, attempt_number, streak_reached, users!submissions_student_id_fkey(full_name)')
      .eq('assignment_id', assignmentId).order('id').range(from, to).returns<SubmissionRecord[]>()),
    loadAssignmentGradingState(reader, assignmentId),
    fetchAllRows((from, to) => reader.from('assignment_question_grading_parts').select('question_id, work_share, updated_at')
      .eq('assignment_id', assignmentId).order('question_id').range(from, to).returns<PolicyRecord[]>()),
  ])
  if (allSubmissions.error) throw new Error('โหลดรอบที่ส่งงานไม่สำเร็จ')
  if (policyResult.error && !missingTable(policyResult.error)) throw new Error('โหลดสัดส่วนคะแนนไม่สำเร็จ')
  const reviewAvailable = !policyResult.error
  const gradingParts: Record<string, GradingPartsPolicy> = Object.fromEntries(policyResult.rows
    .filter(row => questionById.has(row.question_id)).map(row => [row.question_id, { workShare: Number(row.work_share), updatedAt: row.updated_at }]))
  const submissions = allSubmissions.rows.filter(row => row.assignment_id === assignmentId)
  const finished = submissions.filter(row => row.status === 'submitted' || row.status === 'graded')
  if (scope.kind === 'student' && !finished.some(row => row.student_id === scope.studentId)) return null
  const submissionById = new Map(finished.map(row => [row.id, row]))
  const columns = SUMMARY_COLUMNS + (gradingState.available ? REGRADING_COLUMNS : '') + (reviewAvailable ? PART_COLUMNS : '')
  const summaryRows = await pagedChunks(finished.map(row => row.id), (ids, from, to) => reader.from('submission_answers').select(columns)
    .in('submission_id', ids).order('id').range(from, to).returns<AnswerRecord[]>())
  const assignedIds = new Set(assignment.question_ids)
  const safeRows = summaryRows.filter(row => submissionById.has(row.submission_id) && assignedIds.has(row.question_id))
  const summaryAnswers = safeRows.map(row => ({
    ...asAnswer(row, submissionById.get(row.submission_id)!),
    gradingPartsConfigured: Object.hasOwn(gradingParts, row.question_id),
  }))
  const bySubmission = new Map<string, GradingAnswer[]>()
  for (const answer of summaryAnswers) { const list = bySubmission.get(answer.submissionId) ?? []; list.push(answer); bySubmission.set(answer.submissionId, list) }
  const pendingSubmissionIds = new Set<string>()
  const projected = (await withVoidedScoreMetadata(reader, finished)).map(row => {
    const answers = bySubmission.get(row.id)
    if (!answers?.length) return row
    let total = 0
    let max = 0
    for (const answer of answers) {
      const question = questionById.get(answer.questionId)
      const parts = question ? scoreParts(answer, question) : null
      if (parts?.pending) pendingSubmissionIds.add(row.id)
      total += parts?.total ?? answer.score
      max += parts?.maxScore ?? answer.maxScore
    }
    return { ...row, total_score: Math.round(total * 100) / 100, max_score: Math.round(max * 100) / 100 }
  })
  const scaled = rescaleToDisplayMax(projected, () => assignment.display_max_score)
  const officialScores = officialSubmissionsByStudent(scaled, assignment.score_strategy)
  const official = assignment.score_strategy === 'average'
    ? preferPendingAverageReviewAttempts(officialScores, scaled, pendingSubmissionIds)
    : officialScores
  const studentIds = [...official.keys()]
  const profiles = await fetchRowsInChunks(studentIds, ids => reader.from('student_profiles')
    .select('student_id, grade_level, section_number, class_number, student_code').in('student_id', ids).returns<ProfileRecord[]>(), CHUNK_SIZE)
  if (profiles.error) throw new Error('โหลดข้อมูลสรุปการตรวจไม่สำเร็จ')
  const profileById = new Map(profiles.rows.filter(row => studentIds.includes(row.student_id)).map(row => [row.student_id, row]))
  const students: GradingStudent[] = [...official].map(([studentId, result]) => {
    const row = result.representative
    const profileRow = profileById.get(studentId)
    const name = Array.isArray(row.users) ? row.users[0]?.full_name : row.users?.full_name
    return { id: studentId, name: name || 'ไม่ระบุชื่อ', gradeLevel: profileRow?.grade_level ?? null,
      sectionNumber: profileRow?.section_number ?? null, classNumber: profileRow?.class_number ?? null, studentCode: profileRow?.student_code ?? null,
      classroom: profileRow?.grade_level ? `${profileRow.grade_level}${profileRow.section_number == null ? '' : `/${profileRow.section_number}`}` : null,
      submissionId: row.id, attemptNumber: row.attempt_number, status: row.status === 'graded' ? 'graded' : 'submitted',
      score: result.total_score, maxScore: result.max_score, streakReached: row.streak_reached,
    }
  })
  const officialIds = new Set(students.map(student => student.submissionId!))
  const officialAnswers = summaryAnswers.filter(answer => officialIds.has(answer.submissionId) && questionById.has(answer.questionId))
  const pendingCount = new Set(officialAnswers.filter(answer => scoreParts(answer, questionById.get(answer.questionId)!).pending).map(answer => answer.submissionId)).size

  let selectedSubmissionIds: string[] = []
  if (scope.kind === 'question') {
    const query = scope.query
    const sortKey: Record<NonNullable<NonNullable<GradingWorkspaceScope['query']>['sort']>, GradingStudentSortKey> = { classroom: 'classroom', code: 'studentCode', number: 'classNumber', name: 'name' }
    const filtered = students.filter(student => !query?.classroom || query.classroom === 'all' || student.classroom === query.classroom)
    const ordered = sortGradingStudents(filtered, sortKey[query?.sort ?? 'classroom'], query?.dir === 'desc' ? 'desc' : 'asc')
    const page = Number.isSafeInteger(query?.page) && query!.page! > 0 ? Math.min(query!.page!, Math.max(1, Math.ceil(ordered.length / PAGE_SIZE))) : 1
    selectedSubmissionIds = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(student => student.submissionId!)
  } else if (scope.kind === 'student') selectedSubmissionIds = students.filter(student => student.id === scope.studentId).map(student => student.submissionId!)
  if (selectedSubmissionIds.length > 0) {
    const selected = new Set(selectedSubmissionIds)
    const fullRows = await pagedChunks(selectedSubmissionIds, (ids, from, to) => {
      let query = reader.from('submission_answers').select(columns + BODY_COLUMNS).in('submission_id', ids)
      if (scope.kind === 'question') query = query.eq('question_id', scope.questionId!)
      return query.order('id').range(from, to).returns<AnswerRecord[]>()
    })
    const fullAnswers = fullRows.filter(row => selected.has(row.submission_id) && questionById.has(row.question_id)
      && (scope.kind !== 'question' || row.question_id === scope.questionId)).map(row => {
      const submission = submissionById.get(row.submission_id)!
      return { ...asAnswer(row, submission, true), workImages: safeWorkImages(row, submission),
        gradingPartsConfigured: Object.hasOwn(gradingParts, row.question_id) }
    })
    await attachArtifacts(reader, fullAnswers)
    const fullById = new Map(fullAnswers.map(answer => [answer.id, answer]))
    for (let index = 0; index < officialAnswers.length; index++) officialAnswers[index] = fullById.get(officialAnswers[index].id) ?? officialAnswers[index]
  }

  const questionMaxScores = Object.fromEntries(questions.map(question => [question.id,
    assignment.question_points?.[question.id] ?? naturalMaxScore(question.question_type, question.extra_data, question.answer_parts, question.question_type === 'matching' ? question.mcq_options?.length ?? 0 : 0),
  ]))
  // Service-only RPC repeats actor and exact-assignment authorization and has
  // no PostgREST row cap. Keep only official answer IDs selected by this reader.
  const draftResult = await reader.rpc('read_grading_drafts', { p_actor_id: user.id, p_assignment_id: assignmentId })
  if (draftResult.error?.code === '42501') return null
  const draftsAvailable = !draftResult.error && Array.isArray(draftResult.data)
  const officialAnswerIds = new Set(officialAnswers.map(answer => answer.id))
  const savedDrafts: GradingSavedDraft[] = draftsAvailable ? (draftResult.data as GradingSavedDraft[]).filter(draft => officialAnswerIds.has(draft.answerId)) : []
  return {
    data: { assignment: { id: assignment.id, title: assignment.title, classroomName: assignment.classrooms?.name ?? null, type: assignment.type,
      displayMaxScore: assignment.display_max_score, completionRule: assignment.completion_rule === 'streak' ? 'streak' : 'fixed', streakTarget: assignment.streak_target },
    students, questions, answers: officialAnswers, inProgressCount: submissions.filter(row => row.status === 'in_progress' && !row.closed_at).length,
    pendingFinalizationCount: submissions.filter(row => row.status === 'in_progress' && !!row.closed_at).length,
    voidedQuestionIds: [...gradingState.voidedIds].filter(id => assignedIds.has(id)), baseHref: `/assignments/${assignmentId}/results`, gradingParts, questionMaxScores, reviewAvailable, viewerId: user.id, draftsAvailable, savedDrafts },
    sidebarAssignment: { id: assignment.id, classroom_id: assignment.classroom_id, status: assignment.status, title: assignment.title, type: assignment.type, mode: assignment.mode,
      question_ids: assignment.question_ids, random_question_count: assignment.random_question_count, completion_rule: assignment.completion_rule, streak_target: assignment.streak_target, classrooms: assignment.classrooms },
    pendingCount, availableQuestionCount: questions.length, missingQuestionCount: loadedQuestions.missingQuestionIds.length, duplicateQuestionCount: loadedQuestions.duplicateQuestionCount,
  }
}
