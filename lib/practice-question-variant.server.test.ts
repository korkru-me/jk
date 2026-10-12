import { beforeAll, describe, expect, it, vi } from 'vitest'
import { practiceMatchingChoiceToken } from './practice-matching'
import type { Question } from './types'
import { questionRandom } from './math/shared-random'

vi.mock('server-only', () => ({}))

let buildPracticeQuestionVariant: typeof import('./practice-question-variant.server').buildPracticeQuestionVariant
let practiceQuestionRevision: typeof import('./practice-question-variant.server').practiceQuestionRevision

beforeAll(async () => {
  ;({ buildPracticeQuestionVariant, practiceQuestionRevision } = await import('./practice-question-variant.server'))
})

function mcq(): Question {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    title: 'แรงลัพธ์',
    question_text: '<p>ข้อใดถูก</p>',
    question_type: 'mcq',
    answer_unit: null,
    answer_tolerance: 0,
    answer_formula: '',
    answer_parts: null,
    mcq_options: [
      { text: 'หนึ่ง', is_correct: true },
      { text: 'สอง', is_correct: false },
      { text: 'สาม', is_correct: false },
    ],
    variables: [],
    logic_rules: [],
    extra_data: {},
    image_urls: null,
    tags: ['นิวตัน'],
  } as unknown as Question
}

function imageMatching(): Question {
  return {
    ...mcq(),
    title: 'จับคู่สัตว์กับภาพ',
    question_text: '<p>ลากภาพให้ตรงกับชื่อ</p>',
    question_type: 'matching',
    mcq_options: [
      { left_text: 'แมว', right_text: '', right_image: 'https://example.test/cat.png' },
      { left_text: 'สุนัข', right_text: '', right_image: 'https://example.test/dog.png' },
    ],
    extra_data: {
      answer_mode: 'slots',
      distractors: [{ text: '', image: 'https://example.test/bird.png' }],
    },
  } as unknown as Question
}

describe('practice question variant', () => {
  it('is deterministic for one signed seed', () => {
    const first = buildPracticeQuestionVariant(mcq(), 9001)
    const second = buildPracticeQuestionVariant(mcq(), 9001)
    expect(first).toEqual(second)
  })

  it('exposes only the safe student DTO', () => {
    const { safeQuestion } = buildPracticeQuestionVariant(mcq(), 42)
    const json = JSON.stringify(safeQuestion)
    expect(json).not.toMatch(/is_correct|correct_answer|answer_formula|logic_rules|solution/i)
    expect(safeQuestion.questions.mcq_options).toHaveLength(3)
    expect(safeQuestion.questions.mcq_options?.every(option => Number.isInteger(option.index))).toBe(true)
  })

  it('uses content tokens for an image-only matching key without exposing the mapping', () => {
    const question = imageMatching()
    const variant = buildPracticeQuestionVariant(question, 42)
    const pairs = question.mcq_options as unknown as Array<{
      right_text: string
      right_image?: string
    }>

    expect(variant.correctAnswer).toBe(
      `MATCH:${JSON.stringify(pairs.map(practiceMatchingChoiceToken))}`,
    )
    expect(variant.safeQuestion.questions.matching_options).toHaveLength(3)
    expect(JSON.stringify(variant.safeQuestion)).not.toContain('practice-match:v1:')
    expect(variant.safeQuestion.questions.mcq_options?.every(pair => (
      !('right_text' in pair) && !('right_image' in pair)
    ))).toBe(true)
  })

  it('changes the signed revision when grading content changes', () => {
    const original = mcq()
    const edited = {
      ...original,
      mcq_options: original.mcq_options?.map((option, index) => ({
        ...option,
        is_correct: index === 1,
      })) ?? null,
    }
    expect(practiceQuestionRevision(edited)).not.toBe(practiceQuestionRevision(original))
  })

  it('keeps exact case and response-token ids in the signed revision', () => {
    const original = {
      ...mcq(),
      question_type: 'ordering',
      mcq_options: null,
      extra_data: { items: [{ id: 'first-id', text: 'Alpha' }, { id: 'second-id', text: 'Beta' }] },
    } as Question
    const regeneratedIds = {
      ...original,
      extra_data: { items: [{ id: 'new-first', text: 'Alpha' }, { id: 'new-second', text: 'Beta' }] },
    }
    const changedCase = {
      ...original,
      extra_data: { items: [{ id: 'first-id', text: 'alpha' }, { id: 'second-id', text: 'Beta' }] },
    }

    expect(practiceQuestionRevision(regeneratedIds)).not.toBe(practiceQuestionRevision(original))
    expect(practiceQuestionRevision(changedCase)).not.toBe(practiceQuestionRevision(original))
  })

  it('rejects a real random draw whose otherwise valid formula is non-finite', () => {
    const risky = {
      ...mcq(),
      question_type: 'written',
      answer_formula: '1 / (x - 2)',
      mcq_options: null,
      variables: [{ name: 'x', min: 1, max: 101, step: 1, type: 'value' }],
    } as Question
    let seed = 1
    while (seed < 50_000) {
      const draw = questionRandom(seed, risky.id)()
      if (Math.floor(draw * 101) === 1) break
      seed += 1
    }

    expect(seed).toBeLessThan(50_000)
    expect(() => buildPracticeQuestionVariant(risky, seed))
      .toThrow('non-finite answer')
  })

  it('does not accept the multipart evaluator zero fallback as a real answer', () => {
    const risky = {
      ...mcq(),
      question_type: 'written',
      answer_formula: '',
      answer_parts: [
        { id: 'a', sub_text: '[คำตอบ]', formula: 'sqrt((x-1.5)*(x-2.5))', unit: '', tolerance: 0.1 },
        { id: 'b', sub_text: '[คำตอบ]', formula: 'ans0 + 1', unit: '', tolerance: 0.1 },
      ],
      mcq_options: null,
      variables: [{ name: 'x', min: 1, max: 101, step: 1, type: 'value' }],
    } as Question
    let seed = 1
    while (seed < 50_000) {
      const draw = questionRandom(seed, risky.id)()
      if (Math.floor(draw * 101) === 1) break
      seed += 1
    }

    expect(seed).toBeLessThan(50_000)
    expect(() => buildPracticeQuestionVariant(risky, seed))
      .toThrow('non-finite answer')
  })
})
