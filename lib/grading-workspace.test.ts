import { describe, expect, it } from 'vitest'
import { isFullyManualQuestion, questionReviewCounts, reviewStatus, scoreParts, sortGradingStudents, type GradingAnswer, type GradingStudent } from './grading-workspace'
import type { Question, QuestionType } from './types'

const question = (type: QuestionType = 'mcq', extra_data: Question['extra_data'] = {}): Question => ({
  id: 'q', question_type: type, extra_data,
} as Question)
const answer = (overrides: Partial<GradingAnswer> = {}): GradingAnswer => ({
  id: 'a', submissionId: 'sub', studentId: 's', questionId: 'q', randomValues: {},
  correctAnswer: 'MCQ:0', studentAnswer: 'MCQ:0', isCorrect: true, score: 8, maxScore: 8,
  optionOrder: null, orderIndex: 0, workImages: [], scoreEditedBy: null, scoreEditedAt: null,
  ...overrides,
})
const student = (id: string, overrides: Partial<GradingStudent> = {}): GradingStudent => ({
  id, name: `นักเรียน ${id}`, gradeLevel: null, sectionNumber: null, classNumber: null,
  studentCode: null, classroom: null, submissionId: null, attemptNumber: null, score: null,
  maxScore: 0, ...overrides,
})

describe('fully manual questions have no automatic answer key to correct', () => {
  const textBlank = { id: 1, type: 'text' as const, answer: '', case_sensitive: false }
  const fixedBlank = { ...textBlank, id: 2, type: 'fixed' as const, answer: 'A' }
  const manualPart = { id: 'manual', type: 'fill_blank' as const, text: '[___1]', score: 1, blanks: [textBlank] }

  it.each(['essay', 'file_upload'] as const)('recognizes %s regardless of old leftover answer fields', type => {
    const q = question(type)
    q.answer_formula = '5'
    expect(isFullyManualQuestion(q)).toBe(true)
  })

  it('recognizes every unrestricted blank and legacy question-level manual mode', () => {
    expect(isFullyManualQuestion(question('fill_blank', { blanks: [textBlank, { ...textBlank, id: 2 }] }))).toBe(true)
    const { type: _type, ...legacyBlank } = textBlank
    expect(isFullyManualQuestion(question('fill_blank', { grading_mode: 'manual', blanks: [legacyBlank] } as Question['extra_data']))).toBe(true)
  })

  it('keeps fixed/dropdown keys in mixed blanks, including per-blank overrides of legacy mode', () => {
    for (const type of ['fixed', 'dropdown'] as const) {
      expect(isFullyManualQuestion(question('fill_blank', {
        grading_mode: 'manual', blanks: [textBlank, { ...fixedBlank, type, options: ['A', 'B'] }],
      }))).toBe(false)
    }
  })

  it('recognizes a composite made entirely of unrestricted blanks', () => {
    expect(isFullyManualQuestion(question('composite', { parts: [manualPart, { ...manualPart, id: 'second', blanks: [] }] }))).toBe(true)
  })

  it('keeps a composite key when any part is automatic', () => {
    expect(isFullyManualQuestion(question('composite', { parts: [manualPart, { ...manualPart, id: 'fixed', blanks: [fixedBlank] }] }))).toBe(false)
    expect(isFullyManualQuestion(question('composite', { parts: [manualPart, { id: 'tf', type: 'true_false', text: 'ข้อความ', score: 1, correct_answer: true }] }))).toBe(false)
  })

  it('keeps the true/false key while a teacher reviews the explanation', () => {
    expect(isFullyManualQuestion(question('true_false', { correct_answer: true, explanation_mode: 'always', score_answer: 1, score_explanation: 1 }))).toBe(false)
  })

  it('keeps the numeric answer key when a work image requires teacher review', () => {
    const q = question('written')
    q.requires_work_image = true
    expect(isFullyManualQuestion(q)).toBe(false)
  })

  it.each(['mcq', 'written', 'matching', 'true_false', 'ordering', 'classify', 'image_label'] as const)('keeps the automatic %s key', type => {
    expect(isFullyManualQuestion(question(type))).toBe(false)
  })

  it.each(['fill_blank', 'composite'] as const)('does not infer manual grading from missing/empty %s metadata', type => {
    expect(isFullyManualQuestion(question(type))).toBe(false)
    expect(isFullyManualQuestion(question(type, { blanks: [], parts: [] }))).toBe(false)
    expect(isFullyManualQuestion({ question_type: type, extra_data: null })).toBe(false)
  })
})

describe('grading workspace review and point components', () => {
  it('uses the stored attempt weight rather than the current question structure', () => {
    const parts = scoreParts(answer(), question('fill_blank', { blanks: [] }))
    expect(parts).toMatchObject({ maxScore: 8, rawMaxScore: 8, total: 8, hasWork: false })
    expect(parts.answer).toMatchObject({ maxScore: 8, score: 8, source: 'automatic' })
  })

  it('does not invent a work split just because a method image exists', () => {
    const parts = scoreParts(answer({ workImages: ['/method.png'] }), question('written'))
    expect(parts.work).toEqual({ score: 0, maxScore: 0, pending: false, enabled: false, source: 'none' })
    expect(parts.total).toBe(8)
  })

  it('keeps automatic answer points while the configured work component awaits a teacher', () => {
    const row = answer({ score: 3, answerScore: 3, answerMaxScore: 3, workScore: null, workMaxScore: 5 })
    const parts = scoreParts(row, question('written'))
    expect(parts).toMatchObject({ total: 3, maxScore: 8, pending: true, hasWork: true })
    expect(parts.answer).toMatchObject({ score: 3, source: 'automatic', pending: false })
    expect(parts.work).toMatchObject({ score: 0, pending: true, source: 'none' })
    expect(reviewStatus(row, question('written'))).toBe('pending')
  })

  it('distinguishes a zero awarded by the teacher from an unreviewed zero', () => {
    const row = answer({ score: 3, answerScore: 3, answerMaxScore: 3, workScore: 0, workMaxScore: 5, workReviewedAt: '2026-10-18T01:00:00Z', scoreEditedBy: 'teacher' })
    expect(scoreParts(row, question('written')).work).toMatchObject({ score: 0, pending: false, source: 'teacher' })
    expect(reviewStatus(row, question('written'))).toBe('teacher')
  })

  it('preserves a system answer source after a teacher grades only work', () => {
    const row = answer({ answerScore: 3, answerMaxScore: 3, workScore: 2, workMaxScore: 5, workReviewedAt: 'now', scoreEditedBy: 'teacher' })
    expect(scoreParts(row, question('written')).answer.source).toBe('automatic')
    expect(scoreParts(row, question('written')).total).toBe(5)
  })

  it('keeps a mixed automatic/manual answer’s earned portion while the rest is pending', () => {
    const q = question('fill_blank', { blanks: [
      { id: 1, type: 'fixed', answer: 'A', case_sensitive: false },
      { id: 2, type: 'text', answer: '', case_sensitive: false },
    ] })
    expect(scoreParts(answer({ score: 4, isCorrect: null }), q)).toMatchObject({ total: 4, pending: true })
  })

  it('recognizes an ungraded true/false explanation without losing automatic choice points', () => {
    const q = question('true_false', { correct_answer: true, explanation_mode: 'always', score_answer: 1, score_explanation: 1 })
    expect(scoreParts(answer({ score: 4 }), q)).toMatchObject({ total: 4, pending: true })
  })

  it.each(['essay', 'file_upload'] as const)('does not award legacy automatic credit to unreviewed %s', type => {
    const row = answer({ score: 8, isCorrect: true })
    expect(scoreParts(row, question(type))).toMatchObject({ total: 0, pending: true })
    expect(reviewStatus(row, question(type))).toBe('pending')
    expect(scoreParts({ ...row, scoreEditedBy: 'teacher', scoreEditedAt: 'now' }, question(type))).toMatchObject({ total: 8, pending: false })
  })

  it('uses frozen rules to classify a row when a shared bank question changes later', () => {
    const row = answer({ gradingConfig: { question_type: 'essay', answer_parts: null, answer_tolerance: 0, extra_data: {} } })
    expect(reviewStatus(row, question('mcq'))).toBe('pending')
  })

  it('represents an explicitly zero-answer/full-work allocation without a fake pending answer', () => {
    const parts = scoreParts(answer({ answerScore: 0, answerMaxScore: 0, workScore: null, workMaxScore: 8 }), question('essay'))
    expect(parts.answer).toMatchObject({ enabled: false, pending: false })
    expect(parts.work).toMatchObject({ maxScore: 8, pending: true })
  })

  it('rejects malformed allocation weights by falling back to the original raw total', () => {
    const parts = scoreParts(answer({ answerMaxScore: 6, workMaxScore: 6, answerScore: 6, workScore: 6 }), question())
    expect(parts).toMatchObject({ maxScore: 8, total: 8, hasWork: false })
  })

  it('caps invalid scores instead of displaying more than the frozen weight', () => {
    const parts = scoreParts(answer({ score: 40, answerScore: 40, answerMaxScore: 3, workScore: 40, workMaxScore: 5, workReviewedAt: 'now' }), question())
    expect(parts).toMatchObject({ total: 8, maxScore: 8 })
  })

  it('keeps void questions at 0/0 and retains their removed raw weight', () => {
    const row = answer({ isVoid: true, score: 0, maxScore: 0, voidOriginalMaxScore: 8, scoreEditedBy: 'teacher' })
    expect(scoreParts(row, question('essay'))).toMatchObject({ total: 0, maxScore: 0, rawMaxScore: 8, pending: false })
    expect(reviewStatus(row, question('essay'))).toBe('void')
  })

  it('counts individual answers without relabelling a whole question after one teacher edit', () => {
    const rows = [answer({ id: 'automatic' }), answer({ id: 'teacher', scoreEditedBy: 'teacher' }), answer({ id: 'pending', isCorrect: null }), answer({ id: 'void', isVoid: true, maxScore: 0 })]
    expect(questionReviewCounts(question(), rows)).toEqual({ total: 4, pending: 1, teacher: 1, automatic: 1, void: 1 })
  })
})

describe('grading roster sorting', () => {
  it('sorts numbers naturally and leaves unknown class numbers last in either direction', () => {
    const rows = [student('unknown'), student('ten', { classNumber: 10 }), student('two', { classNumber: 2 })]
    expect(sortGradingStudents(rows).map(row => row.id)).toEqual(['two', 'ten', 'unknown'])
    expect(sortGradingStudents(rows, 'classNumber', 'desc').map(row => row.id)).toEqual(['ten', 'two', 'unknown'])
    expect(rows.map(row => row.id)).toEqual(['unknown', 'ten', 'two'])
  })
  it('sorts Thai grade and student-code strings numerically', () => {
    const rows = [student('ten', { gradeLevel: 'ม.10', studentCode: 'ST10' }), student('two', { gradeLevel: 'ม.2', studentCode: 'ST2' })]
    expect(sortGradingStudents(rows, 'gradeLevel').map(row => row.id)).toEqual(['two', 'ten'])
    expect(sortGradingStudents(rows, 'studentCode').map(row => row.id)).toEqual(['two', 'ten'])
  })
  it('retains stable source ordering for ties, including unset metadata', () => {
    const rows = [student('first', { score: 0 }), student('second', { score: 0 }), student('third')]
    expect(sortGradingStudents(rows, 'score', 'desc').map(row => row.id)).toEqual(['first', 'second', 'third'])
  })
})
