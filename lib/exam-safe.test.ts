import { describe, expect, it } from 'vitest'
import { toSafeExamAnswer } from './exam-safe'

function rawAnswer(questionType: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'answer-1',
    question_id: 'question-1',
    random_values: { x: 4 },
    correct_answer: 'TOP_LEVEL_SECRET',
    is_correct: true,
    score: 99,
    max_score: 99,
    student_answer: 'saved answer',
    work_images: null,
    option_order: null,
    questions: {
      title: 'โจทย์ทดสอบ',
      question_text: 'ข้อความโจทย์',
      question_type: questionType,
      answer_unit: 'm',
      answer_formula: 'QUESTION_FORMULA_SECRET',
      solution_text: 'SOLUTION_SECRET',
      mcq_options: null,
      variables: [{
        name: 'x', unit: 'm', type: 'value', min: 1, max: 10,
        formula: 'VARIABLE_FORMULA_SECRET', values: [4],
      }],
      answer_parts: [{
        id: 'part-1', sub_text: 'หาค่า', unit: 'm', tolerance: 0.01,
        formula: 'PART_FORMULA_SECRET', equation_text: 'EQUATION_SECRET',
      }],
      extra_data: {},
      image_urls: null,
      ...overrides,
    },
  } as unknown as Parameters<typeof toSafeExamAnswer>[0]
}

function serializedSafe(questionType: string, overrides: Record<string, unknown> = {}) {
  const safe = toSafeExamAnswer(rawAnswer(questionType, overrides), () => 0)
  expect(safe).not.toBeNull()
  return { safe: safe!, json: JSON.stringify(safe) }
}

describe('toSafeExamAnswer', () => {
  it('uses an explicit allowlist for answer rows, variables and numeric answer parts', () => {
    const { safe, json } = serializedSafe('written')

    expect(safe).toMatchObject({
      id: 'answer-1',
      question_id: 'question-1',
      student_answer: 'saved answer',
      questions: {
        variables: [{ name: 'x', unit: 'm', type: 'value' }],
        answer_parts: [{ id: 'part-1', sub_text: 'หาค่า', unit: 'm' }],
      },
    })
    for (const secret of [
      'TOP_LEVEL_SECRET', 'QUESTION_FORMULA_SECRET', 'SOLUTION_SECRET',
      'VARIABLE_FORMULA_SECRET', 'PART_FORMULA_SECRET', 'EQUATION_SECRET',
    ]) {
      expect(json).not.toContain(secret)
    }
    expect(json).not.toContain('correct_answer')
    expect(json).not.toContain('is_correct')
    expect(json).not.toContain('max_score')
  })

  it('strips correct flags from MCQ and splits matching pairs into separate columns', () => {
    const mcq = serializedSafe('mcq', {
      mcq_options: [
        { text: 'ตัวลวง', is_correct: false },
        { text: 'MCQ_SECRET', is_correct: true },
      ],
    }).safe
    expect(mcq.questions.mcq_options).toEqual([
      { text: 'ตัวลวง', image_url: undefined, index: 0 },
      { text: 'MCQ_SECRET', image_url: undefined, index: 1 },
    ])
    expect(JSON.stringify(mcq)).not.toContain('is_correct')

    const matching = serializedSafe('matching', {
      mcq_options: [
        { left_text: 'แรง', right_text: 'นิวตัน' },
        { left_text: 'งาน', right_text: 'จูล' },
      ],
      answer_parts: null,
    }).safe
    expect(matching.questions.mcq_options).toEqual([
      { left_text: 'แรง', left_image: undefined },
      { left_text: 'งาน', left_image: undefined },
    ])
    expect(matching.questions.matching_options).toEqual([
      { right_text: 'นิวตัน', right_image: undefined },
      { right_text: 'จูล', right_image: undefined },
    ])
  })

  it('removes nested true/false and fill-blank answer keys', () => {
    const tf = serializedSafe('true_false', {
      extra_data: {
        correct_answer: true,
        explanation_mode: 'always',
        score_answer: 1,
        score_explanation: 1,
        statements: [{ id: 's1', text: 'ข้อความ', correct_answer: false }],
      },
    })
    expect(tf.safe.questions.extra_data).toMatchObject({
      statements: [{ id: 's1', text: 'ข้อความ' }],
    })
    expect(tf.json).not.toContain('correct_answer')

    const fill = serializedSafe('fill_blank', {
      extra_data: {
        blanks: [{
          id: 1,
          type: 'dropdown',
          answer: 'BLANK_SECRET',
          answers: ['BLANK_SECRET'],
          case_sensitive: false,
          options: ['ก', 'ข'],
        }],
      },
    })
    expect(fill.safe.questions.extra_data).toMatchObject({
      blanks: [{ id: 1, type: 'dropdown', case_sensitive: false, options: ['ก', 'ข'] }],
    })
    expect(fill.json).not.toContain('BLANK_SECRET')
  })

  it('shuffles ordering prompts and strips every composite answer key', () => {
    const ordering = serializedSafe('ordering', {
      extra_data: {
        items: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
          { id: 'c', text: 'C' },
        ],
      },
    }).safe
    expect(ordering.questions.extra_data).toMatchObject({
      items: [{ id: 'b' }, { id: 'c' }, { id: 'a' }],
    })

    const composite = serializedSafe('composite', {
      extra_data: {
        parts: [
          { id: 'tf', type: 'true_false', text: 'TF', score: 1, correct_answer: true },
          {
            id: 'group', type: 'true_false', text: 'Group', score: 1,
            choices: [{ id: 'choice', text: 'Choice', correct_answer: true }],
          },
          {
            id: 'blank', type: 'fill_blank', text: '[คำตอบ]', score: 1,
            blanks: [{ id: 1, type: 'fixed', answer: 'COMP_BLANK_SECRET', answers: ['COMP_BLANK_SECRET'] }],
          },
          {
            id: 'mcq', type: 'mcq', text: 'MCQ', score: 1,
            options: [{ text: 'Option', is_correct: true }],
          },
        ],
      },
    })
    expect(composite.json).not.toContain('correct_answer')
    expect(composite.json).not.toContain('is_correct')
    expect(composite.json).not.toContain('COMP_BLANK_SECRET')
  })
})
