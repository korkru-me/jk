import { describe, expect, it } from 'vitest'
import type { AnswerFeedback } from './answer-feedback'
import { practiceMatchingChoiceToken } from './practice-matching'
import type { Question } from './types'
import {
  isPracticeLibraryEnabled,
  practiceQuestionSupport,
  toPracticeFeedback,
  validatedPracticeAnswer,
} from './practice-question'

function question(patch: Partial<Question> = {}): Question {
  return {
    question_type: 'mcq',
    answer_formula: '',
    answer_parts: null,
    mcq_options: [
      { text: 'ก', is_correct: true },
      { text: 'ข', is_correct: false },
    ],
    extra_data: {},
    ...patch,
  } as Question
}

describe('practice question allowlist', () => {
  it('is disabled unless the deployment opts in exactly', () => {
    expect(isPracticeLibraryEnabled({})).toBe(false)
    expect(isPracticeLibraryEnabled({ PRACTICE_LIBRARY_ENABLED: 'TRUE' })).toBe(false)
    expect(isPracticeLibraryEnabled({ PRACTICE_LIBRARY_ENABLED: 'true' })).toBe(true)
  })

  it('accepts auto-graded questions and rejects manual answer paths', () => {
    expect(practiceQuestionSupport(question()).supported).toBe(true)
    expect(practiceQuestionSupport(question({ question_type: 'essay' })).supported).toBe(false)
    expect(practiceQuestionSupport(question({ question_type: 'file_upload' })).supported).toBe(false)
    expect(practiceQuestionSupport(question({
      question_type: 'fill_blank',
      extra_data: {
        blanks: [{ id: 1, type: 'text', answer: '', case_sensitive: false }],
      },
    })).supported).toBe(false)
  })

  it('requires every composite part to be auto-gradable', () => {
    const auto = question({
      question_type: 'composite',
      extra_data: {
        parts: [{
          id: 'p1', type: 'mcq', text: 'เลือก', score: 1,
          options: [{ text: 'ก', is_correct: true }, { text: 'ข', is_correct: false }],
        }],
      },
    })
    const manual = question({
      question_type: 'composite',
      extra_data: {
        parts: [{
          id: 'p1', type: 'fill_blank', text: 'ตอบ', score: 1,
          blanks: [{ id: 1, type: 'text', answer: '', case_sensitive: false }],
        }],
      },
    })
    expect(practiceQuestionSupport(auto).supported).toBe(true)
    expect(practiceQuestionSupport(manual).supported).toBe(false)
  })

  it('rejects malformed or non-finite numeric formulas, including chained parts', () => {
    const base = {
      question_type: 'written' as const,
      variables: [],
      logic_rules: [],
      mcq_options: null,
    }
    expect(practiceQuestionSupport(question({
      ...base,
      answer_formula: '2 +',
    })).supported).toBe(false)
    expect(practiceQuestionSupport(question({
      ...base,
      answer_formula: '1 / 0',
    })).supported).toBe(false)
    expect(practiceQuestionSupport(question({
      ...base,
      answer_parts: [
        { id: 'a', sub_text: '', formula: '2', unit: '', tolerance: 0.1 },
        { id: 'b', sub_text: '', formula: 'ans0 + 3', unit: '', tolerance: 0.1 },
      ],
    })).supported).toBe(true)
    expect(practiceQuestionSupport(question({
      ...base,
      answer_parts: [
        { id: 'a', sub_text: '', formula: 'broken(', unit: '', tolerance: 0.1 },
        { id: 'b', sub_text: '', formula: 'ans0 + 3', unit: '', tolerance: 0.1 },
      ],
    })).supported).toBe(false)
  })

  it('rejects true/false shapes whose automatic key is missing', () => {
    expect(practiceQuestionSupport(question({
      question_type: 'true_false',
      extra_data: {
        explanation_mode: 'none', score_answer: 1, score_explanation: 0,
      } as unknown as Question['extra_data'],
    })).supported).toBe(false)
    expect(practiceQuestionSupport(question({
      question_type: 'true_false',
      extra_data: {
        correct_answer: true,
        explanation_mode: 'none',
        score_answer: 1,
        score_explanation: 0,
      },
    })).supported).toBe(true)
  })

  it('requires every visible classify cell and image marker to have a key', () => {
    const classify = question({
      question_type: 'classify',
      extra_data: {
        columns: [{ id: 'kind', title: 'ชนิด', options: ['ตัวนำ', 'ฉนวน'] }],
        rows: [
          { id: 'r1', text: 'ทองแดง', answers: { kind: 0 } },
          { id: 'r2', text: 'ยาง', answers: {} },
        ],
      } as unknown as Question['extra_data'],
    })
    expect(practiceQuestionSupport(classify).supported).toBe(false)
    ;(classify.extra_data as { rows: Array<{ answers: Record<string, number> }> })
      .rows[1].answers.kind = 1
    expect(practiceQuestionSupport(classify).supported).toBe(true)

    const imageLabel = question({
      question_type: 'image_label',
      extra_data: {
        image_url: 'https://example.com/circuit.png',
        answer_mode: 'typed',
        markers: [
          { id: 'm1', point: { x: 10, y: 10 }, answers: ['แบตเตอรี่'], case_sensitive: false },
          { id: 'm2', point: { x: 30, y: 20 }, answers: [], case_sensitive: false },
        ],
      },
    })
    expect(practiceQuestionSupport(imageLabel).supported).toBe(false)
    ;(imageLabel.extra_data as { markers: Array<{ answers: string[] }> })
      .markers[1].answers = ['สวิตช์']
    expect(practiceQuestionSupport(imageLabel).supported).toBe(true)
  })

  it('accepts a matching key whose right-hand choices are images without text', () => {
    const matching = question({
      question_type: 'matching',
      mcq_options: [
        { left_text: 'แมว', right_text: '', right_image: 'https://example.test/cat.png' },
        { left_text: 'สุนัข', right_text: '', right_image: 'https://example.test/dog.png' },
      ] as unknown as Question['mcq_options'],
    })
    expect(practiceQuestionSupport(matching).supported).toBe(true)

    ;(matching.mcq_options as unknown as Array<{ right_image?: string }>)[1].right_image = ''
    expect(practiceQuestionSupport(matching).supported).toBe(false)
  })
})

describe('practice answer validation', () => {
  it('rejects blank and malformed values before an event may be recorded', () => {
    expect(validatedPracticeAnswer(question(), '')).toBeNull()
    expect(validatedPracticeAnswer(question(), 'MCQ:99')).toBeNull()
    expect(validatedPracticeAnswer(question(), 'MCQ:1')).toBe('MCQ:1')
  })

  it('looks inside encoded arrays instead of counting JSON punctuation as an answer', () => {
    const fill = question({
      question_type: 'fill_blank',
      extra_data: {
        blanks: [
          { id: 1, type: 'fixed', answer: 'แรง', case_sensitive: false },
          { id: 2, type: 'fixed', answer: 'มวล', case_sensitive: false },
        ],
      },
    })
    expect(validatedPracticeAnswer(fill, '["",""]')).toBeNull()
    expect(validatedPracticeAnswer(fill, '["แรง",""]')).toBe('["แรง",""]')
  })

  it('requires ordering answers to be one exact permutation', () => {
    const ordering = question({
      question_type: 'ordering',
      extra_data: { items: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] },
    })
    expect(validatedPracticeAnswer(ordering, '["a","a"]')).toBeNull()
    expect(validatedPracticeAnswer(ordering, '["b","a"]')).toBe('["b","a"]')
  })

  it('accepts an explicit zero-selection answer for select-matching true/false', () => {
    const selectMatching = question({
      question_type: 'true_false',
      extra_data: {
        answer_mode: 'select_matching',
        select_target: 'correct',
        correct_answer: false,
        statements: [{ id: 's2', text: 'ข้อความที่สอง', correct_answer: false }],
        explanation_mode: 'none',
        score_answer: 1,
        score_explanation: 0,
      },
    })
    const noneSelected = '{"answers":["false","false"]}'
    expect(validatedPracticeAnswer(selectMatching, noneSelected)).toBe(noneSelected)
  })

  it('allows a meaningful composite response while untouched complex parts stay blank', () => {
    const composite = question({
      question_type: 'composite',
      extra_data: {
        parts: [
          {
            id: 'mcq', type: 'mcq', text: 'เลือก', score: 1,
            options: [{ text: 'ก', is_correct: true }, { text: 'ข', is_correct: false }],
          },
          {
            id: 'order', type: 'ordering', text: 'เรียง', score: 1,
            items: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
          },
          {
            id: 'ticks', type: 'true_false', text: 'เลือกข้อความ', score: 1,
            choices: [
              { id: 't1', text: 'หนึ่ง', is_correct: true },
              { id: 't2', text: 'สอง', is_correct: false },
            ],
          },
        ],
      } as unknown as Question['extra_data'],
    })
    const partial = '["MCQ:0","",""]'
    expect(validatedPracticeAnswer(composite, partial)).toBe(partial)
    expect(validatedPracticeAnswer(composite, '["","",""]')).toBeNull()
  })

  it('validates image-only matching tokens against visible choices', () => {
    const pairs = [
      { left_text: 'แมว', right_text: '', right_image: 'https://example.test/cat.png' },
      { left_text: 'สุนัข', right_text: '', right_image: 'https://example.test/dog.png' },
    ]
    const matching = question({
      question_type: 'matching',
      mcq_options: pairs as unknown as Question['mcq_options'],
      extra_data: { distractors: [{ text: '', image: 'https://example.test/bird.png' }] },
    })
    const cat = practiceMatchingChoiceToken(pairs[0])
    const dog = practiceMatchingChoiceToken(pairs[1])
    const partial = JSON.stringify([cat, ''])

    expect(validatedPracticeAnswer(matching, partial)).toBe(partial)
    expect(validatedPracticeAnswer(matching, JSON.stringify([cat, dog])))
      .toBe(JSON.stringify([cat, dog]))
    expect(validatedPracticeAnswer(matching, JSON.stringify([cat, cat]))).toBeNull()
    expect(validatedPracticeAnswer(matching, JSON.stringify(['not-a-visible-choice', '']))).toBeNull()
    expect(validatedPracticeAnswer(matching, '["",""]')).toBeNull()
  })
})

describe('student feedback DTO', () => {
  it('cannot serialize score fields', () => {
    const source: AnswerFeedback = {
      verdict: 'partial',
      score: 1,
      maxScore: 2,
      revealed: false,
      rows: [{ student: 'ก', status: 'wrong' }],
    }
    const feedback = toPracticeFeedback(source)
    const json = JSON.stringify(feedback)

    expect(feedback).toEqual({
      verdict: 'partial',
      revealed: false,
      rows: [{ student: 'ก', status: 'wrong' }],
    })
    expect(json).not.toContain('score')
    expect(json).not.toContain('maxScore')
  })

  it('turns practice matching tokens into readable image-choice labels', () => {
    const cat = { right_text: '', right_image: 'https://example.test/cat.png' }
    const dog = { right_text: '', right_image: 'https://example.test/dog.png' }
    const feedback = toPracticeFeedback({
      verdict: 'wrong',
      score: 0,
      maxScore: 1,
      revealed: true,
      rows: [{
        label: '',
        student: practiceMatchingChoiceToken(cat),
        correct: practiceMatchingChoiceToken(dog),
        status: 'wrong',
      }],
    }, {
      question_type: 'matching',
      mcq_options: [{ left_text: '', left_image: 'https://example.test/prompt.png' }],
      matching_options: [cat, dog],
    })

    expect(feedback.rows[0]).toMatchObject({
      label: 'รูปโจทย์ที่ 1',
      student: 'รูปตัวเลือกที่ 1',
      correct: 'รูปตัวเลือกที่ 2',
    })
    expect(JSON.stringify(feedback)).not.toContain('practice-match:v1:')
  })
})
