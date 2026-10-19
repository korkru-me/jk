import { describe, expect, it } from 'vitest'
import { buildClassroomScoreReview, selectClassroomReviewSubmissions,
  type ClassroomScoreReviewAnswer, type ClassroomScoreReviewAssignment,
  type ClassroomScoreReviewQuestion, type ClassroomScoreReviewSubmission,
} from './classroom-score-review'

const assignment = (overrides: Partial<ClassroomScoreReviewAssignment> = {}): ClassroomScoreReviewAssignment => ({
  id: 'assignment', question_ids: ['q'], score_strategy: 'best', ...overrides,
})
const submission = (overrides: Partial<ClassroomScoreReviewSubmission> = {}): ClassroomScoreReviewSubmission => ({
  id: 'submission', assignment_id: 'assignment', student_id: 'student', status: 'submitted',
  total_score: 0, max_score: 1, attempt_number: 1, ...overrides,
})
const question = (overrides: Partial<ClassroomScoreReviewQuestion> = {}): ClassroomScoreReviewQuestion => ({
  id: 'q', question_type: 'mcq', extra_data: {}, requires_work_image: false, ...overrides,
})
const answer = (overrides: Partial<ClassroomScoreReviewAnswer> = {}): ClassroomScoreReviewAnswer => ({
  id: 'answer', submission_id: 'submission', question_id: 'q', is_correct: true, score: 0, max_score: 1,
  score_edited_by: null, ...overrides,
})
const pending = { assignment: { student: true } }
const review = (overrides: Partial<Parameters<typeof buildClassroomScoreReview>[0]> = {}) => buildClassroomScoreReview({
  assignments: [assignment()], submissions: [submission()], rosterStudentIds: ['student'],
  questions: [question()], answers: [answer()], ...overrides,
})

describe('classroom score review flags', () => {
  it('keeps an automatically awarded zero complete', () => {
    expect(review({ answers: [answer({ is_correct: false })] })).toEqual({})
  })
  it.each(['essay', 'file_upload'] as const)('marks an unreviewed %s even when a legacy row says correct', question_type => {
    expect(review({ questions: [question({ question_type })] })).toEqual(pending)
  })
  it('recognizes legacy unrestricted blanks and preserves per-blank fixed overrides', () => {
    // Historical rows predate the required per-blank type in current TS models.
    expect(review({ questions: [question({ question_type: 'fill_blank', extra_data: {
      grading_mode: 'manual', blanks: [{ id: 1, answer: '', case_sensitive: false }],
    } as ClassroomScoreReviewQuestion['extra_data'] })] })).toEqual(pending)
    expect(review({ questions: [question({ question_type: 'fill_blank', extra_data: {
      grading_mode: 'manual', blanks: [{ id: 1, type: 'fixed', answer: 'A', case_sensitive: false }],
    } })] })).toEqual({})
  })
  it('recognizes mixed/composite free text and true/false explanations', () => {
    expect(review({ questions: [question({ question_type: 'composite', extra_data: {
      parts: [{ id: 'p', type: 'fill_blank', text: '', score: 1, blanks: [] }],
    } })] })).toEqual(pending)
    expect(review({ questions: [question({ question_type: 'true_false', extra_data: {
      correct_answer: true, explanation_mode: 'always', score_answer: 1, score_explanation: 1,
    } })] })).toEqual(pending)
    expect(review({ questions: [question({ question_type: 'true_false', extra_data: {
      correct_answer: true, explanation_mode: 'none', score_answer: 1, score_explanation: 0,
    } })] })).toEqual({})
  })
  it('uses frozen rules rather than a later bank edit, including a missing bank row', () => {
    const row = answer({ grading_config: { question_type: 'essay', answer_tolerance: 0, answer_parts: null,
      extra_data: { secret: 'NEVER_RETURN' } } })
    expect(review({ answers: [row] })).toEqual(pending)
    expect(review({ answers: [row], questions: [] })).toEqual(pending)
    expect(JSON.stringify(review({ answers: [row] }))).not.toContain('NEVER_RETURN')
    expect(review({ questions: [question({ question_type: 'essay' })], answers: [answer({
      grading_config: { question_type: 'mcq', answer_tolerance: 0, answer_parts: null, extra_data: {} },
    })] })).toEqual({})
  })
  it('settles explicit teacher zero only after its review timestamp is present', () => {
    const q = question({ question_type: 'essay' })
    const row = answer({ answer_score: 0, answer_max_score: 1, work_score: 0, work_max_score: 0,
      score_edited_by: 'teacher' })
    expect(review({ questions: [q], answers: [row] })).toEqual(pending)
    expect(review({ questions: [q], answers: [{ ...row, answer_reviewed_at: 'now' }] })).toEqual({})
    expect(review({ questions: [q], answers: [answer({ score_edited_by: 'teacher' })] })).toEqual({})
  })
  it('marks work pending independently of the automatic answer and accepts reviewed work zero', () => {
    const row = answer({ answer_score: 0.5, answer_max_score: 0.5, work_score: 0, work_max_score: 0.5 })
    expect(review({ answers: [row] })).toEqual(pending)
    expect(review({ answers: [{ ...row, work_reviewed_at: 'now' }] })).toEqual({})
  })
  it('marks a required written-work allocation pending, but accepts an explicit zero-work policy', () => {
    const input = { assignments: [assignment({ require_work_image: true })], questions: [question({ question_type: 'written' })] }
    expect(review(input)).toEqual(pending)
    expect(review({ ...input, gradingParts: [{ assignment_id: 'assignment', question_id: 'q' }] })).toEqual({})
  })
  it('does not invent answer review for a full-work allocation', () => {
    expect(review({ questions: [question({ question_type: 'essay' })], answers: [answer({
      is_correct: null, answer_max_score: 0, answer_score: null, work_max_score: 1, work_score: 0, work_reviewed_at: 'now',
    })] })).toEqual({})
  })
  it('ignores void and zero-weight questions, including assignment-level void metadata', () => {
    expect(review({ answers: [answer({ is_correct: null, is_void: true })] })).toEqual({})
    expect(review({ answers: [answer({ is_correct: null, max_score: 0 })] })).toEqual({})
    expect(review({ answers: [answer({ is_correct: null })],
      voidedQuestions: [{ assignment_id: 'assignment', question_id: 'q' }] })).toEqual({})
  })
  it('ignores foreign assignments, off-roster learners, unrelated questions and active attempts', () => {
    expect(review({ submissions: [submission({ student_id: 'outsider' })], answers: [answer({ is_correct: null })] })).toEqual({})
    expect(review({ submissions: [submission({ assignment_id: 'other' })], answers: [answer({ is_correct: null })] })).toEqual({})
    expect(review({ submissions: [submission({ status: 'in_progress' })], answers: [answer({ is_correct: null })] })).toEqual({})
    expect(review({ answers: [answer({ question_id: 'foreign', is_correct: null }), answer({ submission_id: 'foreign', is_correct: null })] })).toEqual({})
  })
  it('deduplicates repeated streak answers and multiple pending questions into one learner marker', () => {
    expect(review({ assignments: [assignment({ question_ids: ['q', 'q2'] })], answers: [
      answer({ is_correct: null }), answer({ id: 'a2', is_correct: null }),
      answer({ id: 'a3', question_id: 'q2', is_correct: null }),
    ] })).toEqual(pending)
  })
})

describe('official score contributors to classroom review', () => {
  const attempts = [submission({ id: 'older', total_score: 8 }), submission({ id: 'latest', attempt_number: 2, total_score: 4 })]
  const answers = [answer({ submission_id: 'older', is_correct: null }), answer({ id: 'a2', submission_id: 'latest' })]
  it('checks the best attempt only, including the later tie breaker', () => {
    expect(review({ submissions: attempts, answers })).toEqual(pending)
    expect(review({ submissions: [attempts[0], { ...attempts[1], total_score: 8 }], answers })).toEqual({})
  })
  it('checks the latest attempt only and leaves an active latest attempt as active', () => {
    expect(review({ assignments: [assignment({ score_strategy: 'latest' })], submissions: attempts, answers })).toEqual({})
    expect(review({ assignments: [assignment({ score_strategy: 'latest' })],
      submissions: [attempts[0], { ...attempts[1], status: 'in_progress', total_score: null }], answers })).toEqual({})
  })
  it('checks every scored completed attempt contributing to an average, even an older pending one', () => {
    expect(review({ assignments: [assignment({ score_strategy: 'average' })], submissions: attempts, answers })).toEqual(pending)
    expect(review({ assignments: [assignment({ score_strategy: 'average' })],
      submissions: [{ ...attempts[0], total_score: null }, attempts[1]], answers })).toEqual({})
  })
  it('does not include active attempts in an average or leak off-roster selections', () => {
    expect(selectClassroomReviewSubmissions([assignment({ score_strategy: 'average' })], [
      ...attempts, submission({ id: 'active', status: 'in_progress', attempt_number: 3, total_score: 100 }),
      submission({ id: 'outside', student_id: 'outside', total_score: 100 }),
    ], ['student']).map(row => row.id)).toEqual(['older', 'latest'])
  })
})
