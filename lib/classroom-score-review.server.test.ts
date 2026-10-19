import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClassroomScoreReviewAssignment, ClassroomScoreReviewSubmission } from './classroom-score-review'
vi.mock('server-only', () => ({}))
import { loadClassroomScoreReview } from './classroom-score-review.server'

type Row = Record<string, unknown>
interface Log { table: string; columns: string; filters: [string, string[]][]; from: number; to: number }
function reader(tables: Record<string, Row[]>, failures: Record<string, string> = {}) {
  const logs: Log[] = []
  return { logs, value: {
    from(table: string) {
      const log: Log = { table, columns: '', filters: [], from: 0, to: Infinity }
      logs.push(log)
      const query = {
        select(columns: string) { log.columns = columns; return query },
        in(column: string, values: string[]) { log.filters.push([column, values]); return query },
        order() { return query },
        range(from: number, to: number) { log.from = from; log.to = to; return query },
        returns() { return query },
        then(resolve: (value: { data: Row[] | null; error: { code: string } | null }) => unknown, reject?: (reason: unknown) => unknown) {
          const rows = (tables[table] ?? []).filter(row => log.filters.every(([key, values]) => values.includes(String(row[key]))))
          return Promise.resolve({ data: failures[table] ? null : rows.slice(log.from, log.to + 1),
            error: failures[table] ? { code: failures[table] } : null }).then(resolve, reject)
        },
      }
      return query
    },
  } as unknown as SupabaseClient }
}
const assignment: ClassroomScoreReviewAssignment = { id: 'assignment', question_ids: ['q'], score_strategy: 'best' }
const submission: ClassroomScoreReviewSubmission = { id: 'submission', assignment_id: 'assignment', student_id: 'student',
  status: 'submitted', total_score: 0, max_score: 1, attempt_number: 1 }
const answer = (overrides: Row = {}): Row => ({ id: 'answer', submission_id: 'submission', question_id: 'q', is_correct: null,
  score: 0, max_score: 1, score_edited_by: null, ...overrides })

describe('authorized classroom score review metadata reader', () => {
  it('does no reads without contributing completed attempts in the exact roster/assignment scope', async () => {
    const db = reader({})
    expect(await loadClassroomScoreReview(db.value, [assignment], [submission], [])).toEqual({})
    expect(await loadClassroomScoreReview(db.value, [assignment], [{ ...submission, assignment_id: 'foreign' }], ['student'])).toEqual({})
    expect(await loadClassroomScoreReview(db.value, [assignment], [{ ...submission, status: 'in_progress' }], ['student'])).toEqual({})
    expect(db.logs).toEqual([])
  })
  it('returns only true flags, queries no learner body or private draft table, and survives a missing bank row with frozen rules', async () => {
    const db = reader({ submission_answers: [answer({ is_correct: true, grading_config: {
      question_type: 'essay', answer_tolerance: 0, answer_parts: [{ formula: 'SECRET_KEY' }], extra_data: {},
    } })] })
    expect(await loadClassroomScoreReview(db.value, [assignment], [submission], ['student'])).toEqual({ assignment: { student: true } })
    expect(db.logs.every(log => !/student_answer|correct_answer|work_images|random_values|answer_parts/.test(log.columns))).toBe(true)
    expect(new Set(db.logs.map(log => log.table))).toEqual(new Set(['questions', 'submission_answers', 'assignment_void_questions', 'assignment_question_grading_parts']))
    expect(db.logs.find(log => log.table === 'submission_answers')?.filters).toEqual([['submission_id', ['submission']]])
  })
  it('paginates more than 1000 occurrences within a single submission', async () => {
    const rows = Array.from({ length: 1005 }, (_, index) => answer({ id: `answer-${index}`, is_correct: index < 1004 ? true : null }))
    const db = reader({ submission_answers: rows })
    expect(await loadClassroomScoreReview(db.value, [assignment], [submission], ['student'])).toEqual({ assignment: { student: true } })
    expect(db.logs.filter(log => log.table === 'submission_answers').map(log => [log.from, log.to])).toEqual([[0, 999], [1000, 1999]])
  })
  it('chunks large IN filters and returns learners past the first thousand', async () => {
    const submissions = Array.from({ length: 1005 }, (_, index) => ({ ...submission, id: `sub-${index}`, student_id: `student-${index}` }))
    const db = reader({ submission_answers: submissions.map((row, index) => answer({ id: `answer-${index}`, submission_id: row.id })) })
    const result = await loadClassroomScoreReview(db.value, [assignment], submissions, submissions.map(row => row.student_id))
    expect(Object.keys(result.assignment)).toHaveLength(1005)
    expect(result.assignment['student-1004']).toBe(true)
    expect(db.logs.every(log => log.filters.every(([, ids]) => ids.length <= 100))).toBe(true)
  })
  it('paginates more than 1000 policy/void rows and honors the final void row', async () => {
    const question_ids = Array.from({ length: 1005 }, (_, index) => `q-${index}`)
    const refs = question_ids.map(question_id => ({ assignment_id: 'assignment', question_id }))
    const db = reader({ assignment_void_questions: refs, assignment_question_grading_parts: refs,
      submission_answers: [answer({ question_id: 'q-1004' })] })
    expect(await loadClassroomScoreReview(db.value, [{ ...assignment, question_ids }], [submission], ['student'])).toEqual({})
    for (const table of ['assignment_void_questions', 'assignment_question_grading_parts']) {
      expect(db.logs.filter(log => log.table === table).map(log => log.from)).toEqual([0, 1000])
    }
  })
  it('allows only the established missing-table compatibility and omits unavailable columns', async () => {
    const db = reader({ submission_answers: [answer()] }, {
      assignment_void_questions: 'PGRST205', assignment_question_grading_parts: '42P01',
    })
    expect(await loadClassroomScoreReview(db.value, [assignment], [submission], ['student'])).toEqual({ assignment: { student: true } })
    expect(db.logs.find(log => log.table === 'submission_answers')?.columns).not.toMatch(/grading_config|is_void|answer_score|work_score|reviewed_at/)
  })
  it.each(['questions', 'assignment_void_questions', 'assignment_question_grading_parts', 'submission_answers'])('throws on %s failures instead of returning a completed state', async table => {
    const db = reader({}, { [table]: '42501' })
    await expect(loadClassroomScoreReview(db.value, [assignment], [submission], ['student'])).rejects.toThrow('โหลดสถานะรอตรวจคะแนนไม่สำเร็จ')
  })
})
