import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows, fetchRowsInChunks } from './supabase/fetch-all-rows'
import { buildSubmissionScoreReview, selectClassroomReviewSubmissions,
  type ClassroomScoreReviewAnswer, type ClassroomScoreReviewAssignment, type ClassroomScoreReviewMap,
  type SubmissionScoreReviewInput, type ClassroomScoreReviewQuestion, type ClassroomScoreReviewQuestionRef, type ClassroomScoreReviewSubmission,
} from './classroom-score-review'

const CHUNK_SIZE = 100
const missingTable = (error: unknown) => !!error && typeof error === 'object' && 'code' in error
  && (error.code === '42P01' || error.code === 'PGRST205')

async function pagedChunks<T>(ids: string[], read: (ids: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  return fetchRowsInChunks<T, string>(ids, async batch => {
    const result = await fetchAllRows((from, to) => read(batch, from, to))
    return { data: result.rows, error: result.error }
  }, CHUNK_SIZE)
}

/** Caller must verify the active teaching relationship before supplying this
 * reader, linked assignments and the exact classroom roster. No auth fallback,
 * learner bodies, private drafts, writes or storage access occur here. */
async function loadSubmissionReviewIds(
  reader: SupabaseClient,
  assignments: readonly ClassroomScoreReviewAssignment[],
  selected: SubmissionScoreReviewInput['submissions'],
): Promise<Set<string>> {
  if (selected.length === 0) return new Set()
  const sources = await pagedChunks([...new Set(selected.map(row => row.id))],
    (ids, from, to) => reader.from('submissions').select('id, group_source_submission_id')
      .in('id', ids).order('id').range(from, to).returns<{ id: string; group_source_submission_id?: string | null }[]>())
  if (sources.error) throw new Error('โหลดแหล่งคะแนนงานกลุ่มไม่สำเร็จ')
  const sourceById = new Map(sources.rows.map(row => [row.id, row.group_source_submission_id ?? row.id]))
  const canonical = selected.map(row => ({ ...row, id: sourceById.get(row.id) ?? row.id }))
  const relevantIds = new Set(selected.map(row => row.assignment_id))
  const relevant = assignments.filter(row => relevantIds.has(row.id))
  const assignmentIds = [...relevantIds]
  const questionIds = [...new Set(relevant.flatMap(row => row.question_ids))]
  const [questions, voids, policies] = await Promise.all([
    pagedChunks(questionIds, (ids, from, to) => reader.from('questions')
      .select('id, question_type, extra_data, requires_work_image').in('id', ids)
      .order('id').range(from, to).returns<ClassroomScoreReviewQuestion[]>()),
    pagedChunks(assignmentIds, (ids, from, to) => reader.from('assignment_void_questions')
      .select('assignment_id, question_id').in('assignment_id', ids)
      .order('assignment_id').order('question_id').range(from, to).returns<ClassroomScoreReviewQuestionRef[]>()),
    pagedChunks(assignmentIds, (ids, from, to) => reader.from('assignment_question_grading_parts')
      .select('assignment_id, question_id').in('assignment_id', ids)
      .order('assignment_id').order('question_id').range(from, to).returns<ClassroomScoreReviewQuestionRef[]>()),
  ])
  if (questions.error || (voids.error && !missingTable(voids.error)) || (policies.error && !missingTable(policies.error))) {
    throw new Error('โหลดสถานะรอตรวจคะแนนไม่สำเร็จ กรุณาลองใหม่')
  }
  // Match the grading workspace's narrow compatibility with old installations.
  // A failed read is never interpreted as a completed/green score.
  const columns = 'id, submission_id, question_id, is_correct, score, max_score, score_edited_by'
    + (voids.error ? '' : ', grading_config, is_void')
    + (policies.error ? '' : ', answer_score, answer_max_score, work_score, work_max_score, answer_reviewed_at, work_reviewed_at')
  const answers = await pagedChunks([...new Set(canonical.map(row => row.id))], (ids, from, to) => reader.from('submission_answers')
    .select(columns).in('submission_id', ids).order('id').range(from, to).returns<ClassroomScoreReviewAnswer[]>())
  if (answers.error) throw new Error('โหลดสถานะรอตรวจคะแนนไม่สำเร็จ กรุณาลองใหม่')
  const pending = buildSubmissionScoreReview({ assignments: relevant, submissions: canonical,
    questions: questions.rows, answers: answers.rows,
    gradingParts: policies.rows, voidedQuestions: voids.rows,
  })
  return new Set(selected.filter(row => pending.has(sourceById.get(row.id) ?? row.id)).map(row => row.id))
}

export async function loadClassroomScoreReview(
  reader: SupabaseClient,
  assignments: readonly ClassroomScoreReviewAssignment[],
  submissions: readonly ClassroomScoreReviewSubmission[],
  rosterStudentIds: readonly string[],
): Promise<ClassroomScoreReviewMap> {
  const selected = selectClassroomReviewSubmissions(assignments, submissions, rosterStudentIds)
  const pending = await loadSubmissionReviewIds(reader, assignments, selected)
  const result: ClassroomScoreReviewMap = {}
  for (const submission of selected) {
    if (pending.has(submission.id)) {
      ;(result[submission.assignment_id] ??= {})[submission.student_id] = true
    }
  }
  return result
}

/** Supply only attempts already authorized by the caller. Read metadata, with
 * no answer bodies, private drafts or writes. Status "submitted" also covers
 * automatically graded attempts, so review must be resolved from score parts. */
export async function withSubmissionReviewStatus<T extends {
  id: string
  assignment_id: string
  status: string
}>(reader: SupabaseClient, rows: readonly T[]): Promise<Array<T & { pendingReview: boolean }>> {
  const finished = rows.filter(row => row.status === 'submitted' || row.status === 'graded')
  if (finished.length === 0) return rows.map(row => ({ ...row, pendingReview: false }))
  const assignments = await pagedChunks([...new Set(finished.map(row => row.assignment_id))],
    (ids, from, to) => reader.from('assignments')
      .select('id, question_ids, score_strategy, require_work_image').in('id', ids)
      .order('id').range(from, to).returns<ClassroomScoreReviewAssignment[]>())
  if (assignments.error || assignments.rows.length !== new Set(finished.map(row => row.assignment_id)).size) {
    throw new Error('โหลดสถานะรอตรวจคะแนนไม่สำเร็จ กรุณาลองใหม่')
  }
  const pending = await loadSubmissionReviewIds(reader, assignments.rows, finished)
  return rows.map(row => ({ ...row, pendingReview: pending.has(row.id) }))
}
