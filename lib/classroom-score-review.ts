import type { GradingConfig } from './assignment-attempt'
import { scoreParts, type GradingAnswer } from './grading-workspace'
import { selectOfficialAttempt } from './scoring'
import type { Question, ScoreStrategy } from './types'

export interface ClassroomScoreReviewAssignment {
  id: string
  question_ids: string[]
  score_strategy: ScoreStrategy
  require_work_image?: boolean
}

/** Supply the same rescaled rows used by the classroom score matrix. */
export interface ClassroomScoreReviewSubmission {
  id: string
  assignment_id: string
  student_id: string
  status: string
  total_score: number | null
  max_score: number
  attempt_number: number
}

export type ClassroomScoreReviewQuestion = Pick<Question,
  'id' | 'question_type' | 'extra_data' | 'requires_work_image'>

/** Metadata only: answer bodies, keys, work images and private drafts are absent. */
export interface ClassroomScoreReviewAnswer {
  id: string
  submission_id: string
  question_id: string
  is_correct: boolean | null
  score: number
  max_score: number
  score_edited_by: string | null
  grading_config?: GradingConfig | null
  is_void?: boolean
  answer_score?: number | null
  answer_max_score?: number | null
  work_score?: number | null
  work_max_score?: number | null
  answer_reviewed_at?: string | null
  work_reviewed_at?: string | null
}

export interface ClassroomScoreReviewQuestionRef { assignment_id: string; question_id: string }
export type ClassroomScoreReviewMap = Record<string, Record<string, true>>

const finished = (row: ClassroomScoreReviewSubmission) => row.status === 'submitted' || row.status === 'graded'

/** Match the matrix's official selection, including every contributor to an average. */
export function selectClassroomReviewSubmissions(
  assignments: readonly ClassroomScoreReviewAssignment[],
  submissions: readonly ClassroomScoreReviewSubmission[],
  rosterStudentIds: readonly string[],
): ClassroomScoreReviewSubmission[] {
  const assignmentById = new Map(assignments.map(row => [row.id, row]))
  const roster = new Set(rosterStudentIds)
  const groups = new Map<string, Map<string, ClassroomScoreReviewSubmission[]>>()
  for (const row of submissions) {
    if (!assignmentById.has(row.assignment_id) || !roster.has(row.student_id)) continue
    const students = groups.get(row.assignment_id) ?? new Map<string, ClassroomScoreReviewSubmission[]>()
    const attempts = students.get(row.student_id) ?? []
    attempts.push(row)
    students.set(row.student_id, attempts)
    groups.set(row.assignment_id, students)
  }
  const selected: ClassroomScoreReviewSubmission[] = []
  for (const [assignmentId, students] of groups) {
    const strategy = assignmentById.get(assignmentId)!.score_strategy
    for (const attempts of students.values()) {
      if (strategy === 'average') {
        selected.push(...attempts.filter(row => finished(row) && row.total_score !== null))
      } else {
        const row = selectOfficialAttempt(attempts, strategy)?.representative
        if (row && finished(row)) selected.push(row)
      }
    }
  }
  return selected
}

/** Keep only the flags scoreParts reads, never the frozen answer-bearing data. */
function classificationConfig(config: Pick<GradingConfig, 'question_type' | 'extra_data'>): GradingConfig {
  const extra = config.extra_data as Record<string, unknown> | null
  const blank = (value: unknown) => {
    const type = value && typeof value === 'object' && 'type' in value ? value.type : undefined
    return { type: type === 'text' || type === 'fixed' || type === 'dropdown' ? type : undefined }
  }
  const safe: Record<string, unknown> = {}
  if (extra?.grading_mode === 'manual') safe.grading_mode = 'manual'
  if (extra?.explanation_mode === 'none') safe.explanation_mode = 'none'
  if (Array.isArray(extra?.blanks)) safe.blanks = extra.blanks.map(blank)
  if (Array.isArray(extra?.parts)) safe.parts = extra.parts.map((value: unknown) => {
    if (!value || typeof value !== 'object') return { type: '' }
    return { type: 'type' in value ? value.type : '',
      blanks: 'blanks' in value && Array.isArray(value.blanks) ? value.blanks.map(blank) : [] }
  })
  return { question_type: config.question_type, answer_tolerance: 0, answer_parts: null, extra_data: safe }
}

/** Read-only projection. A saved private draft never settles a published score. */
export function buildClassroomScoreReview(input: {
  assignments: readonly ClassroomScoreReviewAssignment[]
  submissions: readonly ClassroomScoreReviewSubmission[]
  rosterStudentIds: readonly string[]
  questions: readonly ClassroomScoreReviewQuestion[]
  answers: readonly ClassroomScoreReviewAnswer[]
  gradingParts?: readonly ClassroomScoreReviewQuestionRef[]
  voidedQuestions?: readonly ClassroomScoreReviewQuestionRef[]
}): ClassroomScoreReviewMap {
  const selected = selectClassroomReviewSubmissions(input.assignments, input.submissions, input.rosterStudentIds)
  const submissionById = new Map(selected.map(row => [row.id, row]))
  const assignmentById = new Map(input.assignments.map(row => [row.id, row]))
  const questionById = new Map(input.questions.map(row => [row.id, row]))
  const assignedById = new Map(input.assignments.map(row => [row.id, new Set(row.question_ids)]))
  const refKey = (assignmentId: string, questionId: string) => `${assignmentId}:${questionId}`
  const configured = new Set((input.gradingParts ?? []).map(row => refKey(row.assignment_id, row.question_id)))
  const voided = new Set((input.voidedQuestions ?? []).map(row => refKey(row.assignment_id, row.question_id)))
  const result: ClassroomScoreReviewMap = {}
  for (const row of input.answers) {
    const submission = submissionById.get(row.submission_id)
    if (!submission || !assignedById.get(submission.assignment_id)?.has(row.question_id)) continue
    const assignment = assignmentById.get(submission.assignment_id)!
    const bankQuestion = questionById.get(row.question_id)
    const rules = row.grading_config ? classificationConfig(row.grading_config)
      : bankQuestion ? classificationConfig(bankQuestion) : null
    // A removed bank row still has an authoritative frozen configuration; a
    // legacy row without it can still be identified by its ungraded outcome.
    const question = { id: row.question_id, question_type: bankQuestion?.question_type ?? rules?.question_type ?? 'mcq',
      extra_data: rules?.extra_data ?? {},
      requires_work_image: bankQuestion?.requires_work_image === true || assignment.require_work_image === true,
    } as Question
    const answer: GradingAnswer = {
      id: row.id, submissionId: submission.id, studentId: submission.student_id, questionId: row.question_id,
      randomValues: {}, correctAnswer: '', studentAnswer: null, optionOrder: null, orderIndex: 0,
      workImages: [], scoreEditedBy: row.score_edited_by, scoreEditedAt: null,
      score: Number(row.score), maxScore: Number(row.max_score), isCorrect: row.is_correct,
      gradingConfig: rules, isVoid: row.is_void === true || voided.has(refKey(submission.assignment_id, row.question_id)),
      answerScore: row.answer_score, answerMaxScore: row.answer_max_score,
      workScore: row.work_score, workMaxScore: row.work_max_score,
      answerReviewedAt: row.answer_reviewed_at, workReviewedAt: row.work_reviewed_at,
      gradingPartsConfigured: configured.has(refKey(submission.assignment_id, row.question_id)),
    }
    if (scoreParts(answer, question).pending) {
      ;(result[assignment.id] ??= {})[submission.student_id] = true
    }
  }
  return result
}
