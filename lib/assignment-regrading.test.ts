import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildQuestionAnswerKeyAtValues, gradeAnswer } from './assignment-attempt'
import {
  assertCompatibleGradingChange, gradingSnapshot, isGradingDefinitionChanged,
  regradeAnswer, voidAnswer, type RegradableAnswer,
} from './assignment-regrading'
import type { AnswerPart, Question, QuestionType } from './types'

const question = (type: QuestionType, overrides: Partial<Question> = {}): Question => ({
  id: 'q', question_type: type, answer_formula: '1', answer_tolerance: 0,
  variables: [], logic_rules: [], answer_parts: null, mcq_options: null,
  extra_data: {}, ...overrides,
} as Question)
const mcqOptions = (correct = 0) => ['A', 'B'].map((text, index) => ({ text, is_correct: index === correct }))
const stored = (previous: Question, overrides: Partial<RegradableAnswer> = {}): RegradableAnswer => ({
  id: 'answer', correct_answer: buildQuestionAnswerKeyAtValues(previous, { x: 7 }).correct_answer,
  student_answer: '', random_values: { x: 7 }, max_score: 4,
  score: 0, is_correct: false, option_order: [1, 0], ...overrides,
})
const item = (id: string) => ({ id, text: id })
const blank = (id: number, answer = 'A', type: 'fixed' | 'text' | 'dropdown' = 'fixed') => ({
  id, type, answer, answers: [answer], case_sensitive: false,
  ...(type === 'dropdown' ? { options: ['A', 'B'] } : {}),
})
const part = (id: string, formula: string): AnswerPart => ({ id, formula, sub_text: '', unit: '', tolerance: 0 })

afterEach(() => vi.restoreAllMocks())

describe('answer-key corrections across the eleven question types', () => {
  const cases: Array<{
    type: QuestionType; previous: Partial<Question>; next: Partial<Question>;
    student: string; expected: number; skipped?: boolean;
  }> = [
    { type: 'mcq', previous: { mcq_options: mcqOptions() }, next: { mcq_options: mcqOptions(1) }, student: 'MCQ:1', expected: 4 },
    {
      type: 'written', previous: { answer_formula: 'x + 1' }, next: { answer_formula: 'x + 2' }, student: '9', expected: 4,
    },
    {
      type: 'matching',
      previous: { mcq_options: [{ left_text: 'one', right_text: 'A' }, { left_text: 'two', right_text: 'B' }] as any },
      next: { mcq_options: [{ left_text: 'one', right_text: 'B' }, { left_text: 'two', right_text: 'A' }] as any },
      student: '["B","A"]', expected: 4,
    },
    { type: 'essay', previous: {}, next: {}, student: 'คำอธิบาย', expected: 0, skipped: true },
    {
      type: 'true_false', previous: { extra_data: { correct_answer: false, explanation_mode: 'none' } as any },
      next: { extra_data: { correct_answer: true, explanation_mode: 'none' } as any }, student: 'true', expected: 4,
    },
    {
      type: 'fill_blank', previous: { extra_data: { blanks: [blank(1, 'A')] } },
      next: { extra_data: { blanks: [blank(1, 'B')] } }, student: '["B"]', expected: 4,
    },
    {
      type: 'ordering', previous: { extra_data: { items: [item('a'), item('b')] } },
      next: { extra_data: { items: [item('b'), item('a')] } }, student: '["b","a"]', expected: 4,
    },
    { type: 'file_upload', previous: {}, next: {}, student: '[{"url":"/stored-file.png"}]', expected: 0, skipped: true },
    {
      type: 'composite',
      previous: { extra_data: { parts: [{ id: 'p', type: 'mcq', score: 3, text: '', options: mcqOptions() }] } },
      next: { extra_data: { parts: [{ id: 'p', type: 'mcq', score: 3, text: '', options: mcqOptions(1) }] } },
      student: '["MCQ:1"]', expected: 4,
    },
    {
      type: 'classify',
      previous: { extra_data: { columns: [{ id: 'c', title: '', options: ['A', 'B'] }], rows: [{ id: 'r', text: '', answers: { c: 0 } }] } },
      next: { extra_data: { columns: [{ id: 'c', title: '', options: ['A', 'B'] }], rows: [{ id: 'r', text: '', answers: { c: 1 } }] } },
      student: '[[1]]', expected: 4,
    },
    {
      type: 'image_label',
      previous: { extra_data: { image_url: '/diagram', answer_mode: 'typed', markers: [{ id: 'm', point: { x: 1, y: 1 }, answers: ['A'], case_sensitive: false }] } },
      next: { extra_data: { image_url: '/diagram', answer_mode: 'typed', markers: [{ id: 'm', point: { x: 1, y: 1 }, answers: ['B'], case_sensitive: false }] } },
      student: '["B"]', expected: 4,
    },
  ]
  for (const test of cases) {
    it(`regrades ${test.type} without changing the assignment ceiling or answer`, () => {
      const previous = question(test.type, test.previous)
      const next = question(test.type, test.next)
      const answer = stored(previous, { student_answer: test.student })
      const untouched = structuredClone(answer)
      const result = regradeAnswer(previous, next, answer)
      expect(result).toMatchObject({ score: test.expected, max_score: 4, is_void: false, skipped: test.skipped ?? false })
      expect(answer).toEqual(untouched)
      if (!result.skipped) expect(result.is_correct).toBe(true)
    })
  }

  it('marks only the corrected questions as a changed grading definition', () => {
    for (const test of cases) {
      expect(isGradingDefinitionChanged(question(test.type, test.previous), question(test.type, test.next)))
        .toBe(!['essay', 'file_upload'].includes(test.type))
    }
  })
})

describe('original numeric values', () => {
  it('never samples or shuffles when calculating a corrected key', () => {
    const previous = question('written', {
      answer_formula: 'x + 1', variables: [{ name: 'x', min: 1, max: 20, step: 1 }],
    })
    const answer = stored(previous, { student_answer: '21', random_values: { x: 7 } })
    const next = { ...previous, answer_formula: 'x * 3', variables: [{ name: 'x', min: 100, max: 200, step: 10 }] }
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('must not sample') })
    expect(buildQuestionAnswerKeyAtValues(next, answer.random_values)).toMatchObject({ random_values: { x: 7 }, correct_answer: '21' })
    expect(regradeAnswer(previous, next, answer)).toMatchObject({ correct_answer: '21', score: 4 })
  })

  it('evaluates corrected chained parts with the same original values', () => {
    const previous = question('written', { answer_parts: [part('a', 'x + 1'), part('b', 'ans0 * 2')] })
    const next = { ...previous, answer_parts: [part('a', 'x + 2'), part('b', 'ans0 * 3')] }
    const result = regradeAnswer(previous, next, stored(previous, { student_answer: '["9","27"]' }))
    expect(result).toMatchObject({ correct_answer: '["9","27"]', score: 4, max_score: 4 })
  })

  it('rejects an invalid single or chained formula before persisting a made-up zero', () => {
    const previous = question('written', { answer_formula: 'x + 1' })
    expect(() => regradeAnswer(previous, { ...previous, answer_formula: 'missing + 1' }, stored(previous))).toThrow('ชุดตัวเลขเดิม')
    const multi = { ...previous, answer_parts: [part('a', 'x + 1'), part('b', 'ans0 + 1')] }
    expect(() => regradeAnswer(multi, { ...multi, answer_parts: [part('a', 'x + 1'), part('b', 'missing')] }, stored(multi))).toThrow('ชุดตัวเลขเดิม')
  })

  it('does not mutate the input numeric map even if a formula assigns a variable', () => {
    const values = { x: 7 }
    buildQuestionAnswerKeyAtValues(question('written', { answer_formula: 'x = 4' }), values)
    expect(values).toEqual({ x: 7 })
  })

  it('uses the corrected tolerance without changing max_score', () => {
    const previous = question('written', { answer_formula: '10', answer_tolerance: 0 })
    const next = { ...previous, answer_tolerance: 0.5 }
    expect(regradeAnswer(previous, next, stored(previous, { student_answer: '10.3' }))).toMatchObject({ score: 4, is_correct: true })
  })
})

describe('teacher and manual scores', () => {
  it('preserves a teacher override unless explicitly requested otherwise', () => {
    const previous = question('mcq', { mcq_options: mcqOptions() })
    const next = { ...previous, mcq_options: mcqOptions(1) }
    const answer = stored(previous, { student_answer: 'MCQ:1', score: 2, score_edited_by: 'teacher' })
    expect(regradeAnswer(previous, next, answer)).toMatchObject({ score: 2, correct_answer: 'MCQ:1', skipped: true, skip_reason: 'teacher_override' })
    expect(regradeAnswer(previous, next, answer, { preserveTeacherOverrides: false })).toMatchObject({ score: 4, skipped: false })
  })

  it('regrades an automatic answer after a teacher graded only its work component', () => {
    const previous = question('mcq', { mcq_options: mcqOptions() })
    const next = { ...previous, mcq_options: mcqOptions(1) }
    const row = stored(previous, { student_answer: 'MCQ:1', score: 1, score_edited_by: 'teacher',
      answer_max_score: 2, work_max_score: 2, answer_reviewed_at: null })
    // The DB apportions this full raw automatic result and preserves work.
    expect(regradeAnswer(previous, next, row)).toMatchObject({ score: 4, skipped: false })
    expect(regradeAnswer(previous, next, { ...row, answer_reviewed_at: '2026-10-18T01:00:00Z' }))
      .toMatchObject({ score: 1, skipped: true, skip_reason: 'teacher_override' })
  })

  it('preserves manually scored essays and wholly manual blanks/parts', () => {
    for (const q of [
      question('essay'),
      question('fill_blank', { extra_data: { blanks: [blank(1, '', 'text')] } }),
      question('fill_blank', { extra_data: { grading_mode: 'manual', blanks: [{ id: 1 }] } as any }),
      question('composite', { extra_data: { parts: [{ id: 'p', type: 'fill_blank', score: 1, text: '', blanks: [blank(1, '', 'text')] }] } }),
    ]) {
      expect(regradeAnswer(q, q, stored(q, { score: 2.5 }))).toMatchObject({ score: 2.5, max_score: 4, skipped: true, skip_reason: 'manual_only' })
    }
  })

  it('keeps mixed automatic/manual blanks pending while correcting the automatic share', () => {
    const previous = question('fill_blank', { extra_data: { blanks: [blank(1, 'A'), blank(2, '', 'text')] } })
    const next = { ...previous, extra_data: { blanks: [blank(1, 'B'), blank(2, '', 'text')] } }
    expect(regradeAnswer(previous, next, stored(previous, { student_answer: '["B","คำอธิบาย"]' })))
      .toMatchObject({ score: 2, max_score: 4, is_correct: null, skipped: false })
  })
})

describe('structural compatibility', () => {
  it('rejects a different question type', () => {
    expect(() => assertCompatibleGradingChange(question('mcq'), question('essay'))).toThrow('ประเภท')
  })

  const incompatibilities: Array<[string, Question, Question]> = [
    ['MCQ option count', question('mcq', { mcq_options: mcqOptions() }), question('mcq', { mcq_options: mcqOptions().slice(0, 1) })],
    ['MCQ option identity/order', question('mcq', { mcq_options: mcqOptions() }), question('mcq', { mcq_options: mcqOptions().reverse() })],
    ['blank identities/order', question('fill_blank', { extra_data: { blanks: [blank(1), blank(2)] } }), question('fill_blank', { extra_data: { blanks: [blank(2), blank(1)] } })],
    ['blank input type', question('fill_blank', { extra_data: { blanks: [blank(1)] } }), question('fill_blank', { extra_data: { blanks: [blank(1, 'A', 'text')] } })],
    ['dropdown option order', question('fill_blank', { extra_data: { blanks: [blank(1, 'A', 'dropdown')] } }), question('fill_blank', { extra_data: { blanks: [{ ...blank(1, 'A', 'dropdown'), options: ['B', 'A'] }] } })],
    ['numeric part identities', question('written', { answer_parts: [part('a', '1')] }), question('written', { answer_parts: [part('b', '1')] })],
    ['numeric variable names', question('written', { variables: [{ name: 'x', min: 1, max: 2, step: 1 }] }), question('written', { variables: [{ name: 'y', min: 1, max: 2, step: 1 }] })],
    ['true/false statement identities', question('true_false', { extra_data: { statements: [item('a'), item('b')] } as any }), question('true_false', { extra_data: { statements: [item('b'), item('a')] } as any })],
    ['true/false answer format', question('true_false'), question('true_false', { extra_data: { answer_mode: 'select_matching' } as any })],
    ['composite part order', question('composite', { extra_data: { parts: [{ ...item('a'), type: 'mcq' }, { ...item('b'), type: 'mcq' }] } as any }), question('composite', { extra_data: { parts: [{ ...item('b'), type: 'mcq' }, { ...item('a'), type: 'mcq' }] } as any })],
    ['composite MCQ option order', question('composite', { extra_data: { parts: [{ ...item('p'), type: 'mcq', options: mcqOptions() }] } as any }), question('composite', { extra_data: { parts: [{ ...item('p'), type: 'mcq', options: mcqOptions().reverse() }] } as any })],
    ['classify column order', question('classify', { extra_data: { columns: [item('a'), item('b')], rows: [] } as any }), question('classify', { extra_data: { columns: [item('b'), item('a')], rows: [] } as any })],
    ['classify option order', question('classify', { extra_data: { columns: [{ id: 'a', options: ['A', 'B'] }], rows: [] } as any }), question('classify', { extra_data: { columns: [{ id: 'a', options: ['B', 'A'] }], rows: [] } as any })],
    ['image marker order', question('image_label', { extra_data: { markers: [item('a'), item('b')] } as any }), question('image_label', { extra_data: { markers: [item('b'), item('a')] } as any })],
    ['ordering item removal', question('ordering', { extra_data: { items: [item('a'), item('b')] } }), question('ordering', { extra_data: { items: [item('a')] } })],
    ['matching prompt order', question('matching', { mcq_options: [{ left_text: 'one', right_text: 'A' }, { left_text: 'two', right_text: 'B' }] as any }), question('matching', { mcq_options: [{ left_text: 'two', right_text: 'B' }, { left_text: 'one', right_text: 'A' }] as any })],
  ]
  for (const [name, previous, next] of incompatibilities) {
    it(`rejects ${name}`, () => {
      expect(() => assertCompatibleGradingChange(previous, next)).toThrow('โจทย์')
      expect(isGradingDefinitionChanged(previous, next)).toBe(true)
    })
  }

  it('permits ordering key corrections through stable item ids', () => {
    const previous = question('ordering', { extra_data: { items: [item('a'), item('b')] } })
    const next = { ...previous, extra_data: { items: [item('b'), item('a')] } }
    expect(() => assertCompatibleGradingChange(previous, next)).not.toThrow()
    expect(isGradingDefinitionChanged(previous, next)).toBe(true)
  })

  it('ignores solution/display text, sampling limits and object key insertion order', () => {
    const previous = question('written', { answer_formula: 'x + 1', variables: [{ name: 'x', min: 1, max: 2, step: 1 }] })
    const next = { ...previous, title: 'new', question_text: 'new', solution_text: 'new solution', solution_image_urls: ['/new.png'], variables: [{ step: 2, max: 100, min: 10, name: 'x' }] }
    expect(isGradingDefinitionChanged(previous, next)).toBe(false)
    expect(() => assertCompatibleGradingChange(previous, next)).not.toThrow()
  })

  it('detects removal of legacy explanation points as a grading rule change', () => {
    const previous = question('true_false', { extra_data: { correct_answer: true } as any })
    const next = { ...previous, extra_data: { correct_answer: true, explanation_mode: 'none' } as any }
    expect(isGradingDefinitionChanged(previous, next)).toBe(true)
  })
})

describe('frozen grading rules and void questions', () => {
  it('takes a detached snapshot and grades from it instead of live question rules', () => {
    const q = question('fill_blank', { extra_data: { blanks: [blank(1)] } })
    const snapshot = gradingSnapshot(q)
    ;(q.extra_data as any).blanks[0].type = 'text'
    expect((snapshot.extra_data as any).blanks[0].type).toBe('fixed')
    expect(gradeAnswer({
      id: 'a', correct_answer: 'FILL:[["A"]]', student_answer: '["A"]', max_score: 4,
      grading_config: snapshot, questions: gradingSnapshot(q),
    })).toMatchObject({ score: 4, is_correct: true })
  })

  it('uses frozen numeric tolerances even when the live question no longer matches', () => {
    const config = gradingSnapshot(question('written', { answer_tolerance: 0.5 }))
    expect(gradeAnswer({ id: 'a', correct_answer: '10', student_answer: '10.3', max_score: 4, grading_config: config, questions: null }))
      .toMatchObject({ score: 4, is_correct: true })
  })

  it('voids any question including manual/teacher-overridden work, removing earned and possible points', () => {
    for (const type of ['mcq', 'written', 'matching', 'essay', 'true_false', 'fill_blank', 'ordering', 'file_upload', 'composite', 'classify', 'image_label'] as QuestionType[]) {
      const q = question(type)
      const answer = stored(q, { score: 3, score_edited_by: 'teacher' })
      expect(voidAnswer(answer)).toMatchObject({ score: 0, max_score: 0, is_correct: true, is_void: true, skipped: false })
    }
  })

  it('never parses a malformed answer key when the row is void', () => {
    expect(gradeAnswer({ id: 'a', correct_answer: 'FILL:bad-json', student_answer: '', max_score: 0, is_void: true, questions: null }))
      .toEqual({ id: 'a', score: 0, is_correct: true })
  })

  it('keeps an already-void row void during subsequent key corrections', () => {
    const previous = question('mcq', { mcq_options: mcqOptions() })
    expect(regradeAnswer(previous, { ...previous, mcq_options: mcqOptions(1) }, stored(previous, { is_void: true, max_score: 0 })))
      .toMatchObject({ score: 0, max_score: 0, is_correct: true, is_void: true, skipped: true, skip_reason: 'void' })
  })
})
