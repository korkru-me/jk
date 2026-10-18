import type { GradingSavedDraft } from './grading-draft-types'
import { getBlankType } from './fill-blank'
import type { GradingConfig } from './assignment-attempt'
import type { SubmissionTiming } from './late-submission'
import type { MathInputMode, Question } from './types'

export type GradingReviewStatus = 'void' | 'teacher' | 'pending' | 'automatic'
export type GradingScoreSource = 'automatic' | 'teacher' | 'none'
export interface GradingStudent {
  id: string
  name: string
  gradeLevel: string | null
  sectionNumber: number | null
  classNumber: number | null
  studentCode: string | null
  classroom: string | null
  submissionId: string | null
  attemptNumber: number | null
  score: number | null
  maxScore: number
  timing?: SubmissionTiming
  status?: 'not_submitted' | 'in_progress' | 'submitted' | 'graded'
  streakReached?: boolean
  bestStreak?: number
}
export interface GradingWorkArtifact { id: string; partKey: string; previewUrl: string | null; sourceType?: string | null }
export interface GradingAnswer {
  id: string
  submissionId: string
  studentId: string
  questionId: string
  randomValues: Record<string, number>
  correctAnswer: string
  studentAnswer: string | null
  isCorrect: boolean | null
  score: number
  maxScore: number
  optionOrder: number[] | null
  orderIndex: number
  workImages: (string | null)[]
  scoreEditedBy: string | null
  scoreEditedAt: string | null
  gradingConfig?: GradingConfig | null
  isVoid?: boolean
  voidOriginalMaxScore?: number
  answerScore?: number | null
  answerMaxScore?: number | null
  workScore?: number | null
  workMaxScore?: number | null
  answerReviewedAt?: string | null
  workReviewedAt?: string | null
  gradingPartsConfigured?: boolean
  mathInputModes?: Record<string, MathInputMode> | null
  workArtifacts?: GradingWorkArtifact[]
}
export interface GradingPartsPolicy { workShare: number; updatedAt: string | null }
export interface GradingWorkspaceData {
  assignment: {
    id: string; title: string; classroomName: string | null; type: 'exercise' | 'exam'
    displayMaxScore: number | null; completionRule: 'fixed' | 'streak'; streakTarget?: number | null
  }
  students: GradingStudent[]
  questions: Question[]
  answers: GradingAnswer[]
  inProgressCount: number
  pendingFinalizationCount: number
  voidedQuestionIds: string[]
  baseHref: string
  /** Older local schemas remain readable, while score mutations need the RPC migration. */
  reviewAvailable?: boolean
  /** Private to this verified grader; never part of the student result DTO. */
  savedDrafts?: GradingSavedDraft[]
  draftsAvailable?: boolean
  viewerId?: string
  gradingParts?: Record<string, GradingPartsPolicy>
  questionMaxScores?: Record<string, number>
}
export interface GradingScorePart {
  score: number; maxScore: number; pending: boolean; enabled: boolean; source: GradingScoreSource
}
export interface GradingScoreParts {
  answer: GradingScorePart; work: GradingScorePart
  total: number; maxScore: number; rawMaxScore: number; pending: boolean; hasWork: boolean; needsAllocation: boolean
}

type ManualShape = { question_type: string; extra_data?: unknown }
export function requiresTeacherAnswer(question: ManualShape): boolean {
  if (question.question_type === 'essay' || question.question_type === 'file_upload') return true
  const extra = question.extra_data as Question['extra_data']
  if (question.question_type === 'true_false') {
    return !extra || !('explanation_mode' in extra) || extra.explanation_mode !== 'none'
  }
  if (question.question_type === 'fill_blank' && extra && 'blanks' in extra) {
    return extra.blanks.some(blank => getBlankType(extra, blank) === 'text')
  }
  if (question.question_type === 'composite' && extra && 'parts' in extra) {
    return extra.parts.some(part => part.type === 'fill_blank'
      && (!part.blanks?.[0] || getBlankType(undefined, part.blanks[0]) === 'text'))
  }
  return false
}

/** Mixed questions still have an automatic answer key even when a part needs teacher review. */
export function isFullyManualQuestion(question: ManualShape): boolean {
  if (question.question_type === 'essay' || question.question_type === 'file_upload') return true
  const extra = question.extra_data as Question['extra_data']
  if (question.question_type === 'fill_blank' && extra && 'blanks' in extra) {
    return extra.blanks.length > 0 && extra.blanks.every(blank => getBlankType(extra, blank) === 'text')
  }
  if (question.question_type === 'composite' && extra && 'parts' in extra) {
    return extra.parts.length > 0 && extra.parts.every(part => part.type === 'fill_blank'
      && (!part.blanks?.[0] || getBlankType(undefined, part.blanks[0]) === 'text'))
  }
  return false
}

const nonnegative = (value: number | null | undefined) => Number.isFinite(value) ? Math.max(0, value!) : 0
const bounded = (value: number | null | undefined, max: number) => Math.min(max, nonnegative(value))
const disabledPart = (): GradingScorePart => ({ score: 0, maxScore: 0, pending: false, enabled: false, source: 'none' })

/** Stored attempt weights are authoritative; a later bank edit must not enlarge them. */
export function scoreParts(answer: GradingAnswer, question: Question): GradingScoreParts {
  const rawMaxScore = nonnegative(answer.maxScore) + nonnegative(answer.voidOriginalMaxScore)
  if (answer.isVoid || answer.maxScore <= 0) return {
    answer: disabledPart(), work: disabledPart(), total: 0, maxScore: 0, rawMaxScore, pending: false, hasWork: false, needsAllocation: false,
  }
  const maxScore = nonnegative(answer.maxScore)
  const explicit = Number.isFinite(answer.answerMaxScore) && Number.isFinite(answer.workMaxScore)
    && answer.answerMaxScore! >= 0 && answer.workMaxScore! >= 0
    && Math.abs(answer.answerMaxScore! + answer.workMaxScore! - maxScore) < 0.000001
  const answerMax = explicit ? answer.answerMaxScore! : maxScore
  const workMax = explicit ? answer.workMaxScore! : 0
  const rules = answer.gradingConfig ?? question
  const needsAllocation = question.question_type === 'written' && question.requires_work_image
    && answer.gradingPartsConfigured === false
  const teacherAnswer = !!answer.answerReviewedAt || (!explicit && !!answer.scoreEditedBy)
  const pendingAnswer = answerMax > 0 && !teacherAnswer && (requiresTeacherAnswer(rules) || answer.isCorrect === null)
  const onlyManual = isFullyManualQuestion(rules)
  const answerScore = pendingAnswer && onlyManual ? 0
    : bounded(explicit ? answer.answerScore : answer.score, answerMax)
  const teacherWork = !!answer.workReviewedAt
  const pendingWork = workMax > 0 && !teacherWork
  const workScore = pendingWork ? 0 : bounded(answer.workScore, workMax)
  return {
    answer: answerMax > 0 ? { score: answerScore, maxScore: answerMax, pending: pendingAnswer, enabled: true,
      source: teacherAnswer ? 'teacher' : onlyManual ? 'none' : 'automatic' } : disabledPart(),
    work: workMax > 0 ? { score: workScore, maxScore: workMax, pending: pendingWork, enabled: true,
      source: teacherWork ? 'teacher' : 'none' } : disabledPart(),
    total: Math.min(maxScore, Math.round((answerScore + workScore) * 100) / 100),
    maxScore, rawMaxScore, pending: pendingAnswer || pendingWork || needsAllocation, hasWork: workMax > 0, needsAllocation,
  }
}

export function reviewStatus(answer: GradingAnswer, question: Question): GradingReviewStatus {
  if (answer.isVoid || answer.maxScore <= 0) return 'void'
  const parts = scoreParts(answer, question)
  if (parts.pending) return 'pending'
  return parts.answer.source === 'teacher' || parts.work.source === 'teacher' ? 'teacher' : 'automatic'
}

export interface GradingReviewCounts { total: number; pending: number; teacher: number; automatic: number; void: number }
export function questionReviewCounts(question: Question, answers: readonly GradingAnswer[]): GradingReviewCounts {
  const result: GradingReviewCounts = { total: 0, pending: 0, teacher: 0, automatic: 0, void: 0 }
  for (const answer of answers) if (answer.questionId === question.id) {
    result.total++; result[reviewStatus(answer, question)]++
  }
  return result
}

export type GradingStudentSortKey = 'name' | 'gradeLevel' | 'sectionNumber' | 'classNumber' | 'studentCode' | 'classroom' | 'score'
const collator = new Intl.Collator('th', { numeric: true, sensitivity: 'base' })
export function sortGradingStudents(students: readonly GradingStudent[], key: GradingStudentSortKey = 'classNumber', direction: 'asc' | 'desc' = 'asc'): GradingStudent[] {
  return students.map((student, index) => ({ student, index })).sort((a, b) => {
    const left = a.student[key], right = b.student[key]
    const leftMissing = left == null || left === '', rightMissing = right == null || right === ''
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1
    if (!leftMissing && !rightMissing) {
      const comparison = typeof left === 'number' && typeof right === 'number' ? left - right : collator.compare(String(left), String(right))
      if (comparison) return direction === 'desc' ? -comparison : comparison
    }
    return a.index - b.index
  }).map(row => row.student)
}
