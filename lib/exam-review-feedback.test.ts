import { describe, it, expect } from 'vitest'
import { buildExamReviewFeedback, type ExamReviewAnswerRow, type ExamReviewQuestion } from './exam-review-feedback'

const mcq: ExamReviewQuestion = {
  question_type: 'mcq',
  answer_unit: null,
  answer_parts: null,
  answer_tolerance: null,
  extra_data: {},
  mcq_options: [
    { text: 'ศูนย์', is_correct: false },
    { text: 'เท่าเดิม', is_correct: true },
    { text: 'มากขึ้น', is_correct: false },
  ],
}

function row(over: Partial<ExamReviewAnswerRow>): ExamReviewAnswerRow {
  return {
    correct_answer: 'MCQ:1', student_answer: 'MCQ:0', option_order: [2, 0, 1],
    is_correct: false, score: 0, max_score: 1, ...over,
  }
}

describe('buildExamReviewFeedback', () => {
  it('shows the banked verdict with the เฉลย, options in the order the student read them', () => {
    const feedback = buildExamReviewFeedback(row({}), mcq)
    expect(feedback.verdict).toBe('wrong')
    expect(feedback.revealed).toBe(true)
    expect(feedback.choices?.map(choice => choice.text)).toEqual(['มากขึ้น', 'ศูนย์', 'เท่าเดิม'])
    expect(feedback.choices?.find(choice => choice.picked)?.text).toBe('ศูนย์')
    expect(feedback.choices?.find(choice => choice.correct)?.text).toBe('เท่าเดิม')
  })

  it('never re-grades: a teacher re-mark is what the panel reports', () => {
    const feedback = buildExamReviewFeedback(row({ is_correct: true, score: '1' }), mcq)
    expect(feedback.verdict).toBe('correct')
    expect(feedback.score).toBe(1)
  })

  it('marks a voided ข้อ instead of judging it', () => {
    const feedback = buildExamReviewFeedback(row({ max_score: 0 }), mcq)
    expect(feedback.voided).toBe(true)
    expect(feedback.maxScore).toBe(0)
    expect(feedback.choices).toBeUndefined()
  })

  it('reports only the teacher mark for an essay', () => {
    const essay: ExamReviewQuestion = { ...mcq, question_type: 'essay', mcq_options: null }
    expect(buildExamReviewFeedback(row({ correct_answer: '', student_answer: 'ตอบยาว', is_correct: null }), essay))
      .toMatchObject({ verdict: 'pending', rows: [] })
    expect(buildExamReviewFeedback(row({ correct_answer: '', student_answer: 'ตอบยาว', is_correct: false, score: 3, max_score: 5 }), essay))
      .toMatchObject({ verdict: 'partial', score: 3, maxScore: 5, rows: [] })
  })
})
