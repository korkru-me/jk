import { describe, it, expect } from 'vitest'
import { subQuestionCount, subQuestionLabel } from './question-parts'
import { naturalMaxScore } from './assignment-attempt'

const q = (question_type: string, rest: Record<string, unknown> = {}) =>
  ({ question_type, ...rest }) as any

describe('subQuestionCount', () => {
  it('counts a plain question as one', () => {
    expect(subQuestionCount(q('mcq', { mcq_options: [{}, {}, {}, {}] }))).toBe(1)
    expect(subQuestionCount(q('written'))).toBe(1)
    expect(subQuestionCount(q('essay', { answer_parts: null }))).toBe(1)
    expect(subQuestionCount(q('file_upload', { extra_data: { attachment_urls: ['a', 'b'] } }))).toBe(1)
  })

  it('counts an อัตนัย question by its answer parts', () => {
    expect(subQuestionCount(q('written', { answer_parts: [{}, {}, {}] }))).toBe(3)
  })

  it('counts the ถูก-ผิด stem alongside its extra statements', () => {
    expect(subQuestionCount(q('true_false', { extra_data: { statements: [{}, {}] } }))).toBe(3)
    expect(subQuestionCount(q('true_false', { extra_data: { statements: [] } }))).toBe(1)
  })

  it('counts blanks, items, pairs and composite parts', () => {
    expect(subQuestionCount(q('fill_blank', { extra_data: { blanks: [{}, {}, {}, {}] } }))).toBe(4)
    expect(subQuestionCount(q('ordering', { extra_data: { items: [{}, {}, {}] } }))).toBe(3)
    expect(subQuestionCount(q('matching', { mcq_options: [{}, {}] }))).toBe(2)
    expect(subQuestionCount(q('composite', { extra_data: { parts: [{}, {}, {}] } }))).toBe(3)
  })

  it('never goes below one, however empty the row is', () => {
    expect(subQuestionCount(q('fill_blank', { extra_data: {} }))).toBe(1)
    expect(subQuestionCount(q('composite', { extra_data: { parts: [] } }))).toBe(1)
    expect(subQuestionCount(q('matching'))).toBe(1)
  })

  it('takes a group parent count over the parent row own (empty) shape', () => {
    expect(subQuestionCount(q('written'), 5)).toBe(5)
    // A group that somehow lost its sub-questions still reads as one question.
    expect(subQuestionCount(q('written'), 0)).toBe(1)
  })

  it('agrees with the points a งาน gives the same question by default', () => {
    // The two are allowed to differ only where a teacher weighted the parts;
    // with the weights left alone they must not drift apart.
    const cases = [
      q('fill_blank', { extra_data: { blanks: [{}, {}, {}] } }),
      q('ordering', { extra_data: { items: [{}, {}] } }),
      q('composite', { extra_data: { parts: [{}, {}, {}, {}] } }),
      q('written', { answer_parts: [{}, {}] }),
      q('mcq'),
      q('true_false', { extra_data: { statements: [{}, {}], explanation_mode: 'none' } }),
    ]
    for (const question of cases) {
      expect(naturalMaxScore(
        question.question_type,
        question.extra_data,
        question.answer_parts ?? null,
        question.mcq_options?.length ?? 0,
      )).toBe(subQuestionCount(question))
    }
  })
})

describe('subQuestionLabel', () => {
  it('names the parts after what the type actually holds', () => {
    expect(subQuestionLabel(q('written', { answer_parts: [{}, {}] }))).toBe('2 ข้อย่อย')
    expect(subQuestionLabel(q('fill_blank', { extra_data: { blanks: [{}, {}, {}] } }))).toBe('3 ช่องเติม')
    expect(subQuestionLabel(q('matching', { mcq_options: [{}, {}] }))).toBe('2 คู่จับคู่')
    expect(subQuestionLabel(q('ordering', { extra_data: { items: [{}, {}] } }))).toBe('2 รายการเรียง')
  })

  it('calls a group parts ข้อย่อย whatever type its rows are', () => {
    expect(subQuestionLabel(q('written'), 4)).toBe('4 ข้อย่อย')
  })
})
